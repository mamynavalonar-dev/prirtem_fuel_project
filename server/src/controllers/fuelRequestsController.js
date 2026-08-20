const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');
const { auditLog } = require('../utils/audit');

function fmtNo(seq, year) {
  return `N° ${String(seq).padStart(3, '0')}/${year}`;
}

async function nextRequestNo(client) {
  const year = new Date().getFullYear();
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(seq),0) AS max_seq
     FROM fuel_requests
     WHERE year=$1`,
    [year]
  );
  const nextSeq = Number(rows[0].max_seq) + 1;
  return { year, seq: nextSeq, request_no: fmtNo(nextSeq, year) };
}

function isYmd(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function ymdGte(a, b) {
  if (!isYmd(a) || !isYmd(b)) return false;
  return a >= b;
}

/**
 * List fuel requests with filtering and pagination.
 * Supports: ?status=SUBMITTED,VERIFIED&page=1&limit=20
 */
async function list(req, res) {
  const role = req.user.role;
  const userId = req.user.id;
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 100); // Max 100 per page
  const offset = (page - 1) * limit;

  // Optional: ?status=SUBMITTED or ?status=SUBMITTED,VERIFIED
  const statusParam = String(req.query.status || '').trim();
  const statuses = statusParam
    ? statusParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    : [];

  let sql = `SELECT fr.*,
                    u.username AS requester_username,
                    u2.username AS verifier_username,
                    u3.username AS approver_username,
                    u4.username AS rejecter_username
             FROM fuel_requests fr
             JOIN users u ON u.id=fr.requester_id
             LEFT JOIN users u2 ON u2.id=fr.verified_by
             LEFT JOIN users u3 ON u3.id=fr.approved_by
             LEFT JOIN users u4 ON u4.id=fr.rejected_by
             WHERE fr.deleted_at IS NULL`;
  const params = [];

  if (role === 'DEMANDEUR') {
    params.push(userId);
    sql += ` AND fr.requester_id=$${params.length}`;
  }

  if (statuses.length) {
    params.push(statuses);
    sql += ` AND fr.status = ANY($${params.length})`;
  }

  sql += ` ORDER BY fr.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
	  params.push(limit, offset);

	  // Main query execution with defensive error handling
	  let requestRows = [];
	  try {
	    const result = await pool.query(sql, params);
	    if (result && result.rows && Array.isArray(result.rows)) {
	      requestRows = result.rows;
	    }
	  } catch (error) {
	    console.error('Error in main query in fuelRequestsController.list:', error);
	    // Continue with empty requestRows to allow partial functionality
	  }

  // Get total count for pagination
  let countSql = `SELECT COUNT(*) FROM fuel_requests fr WHERE fr.deleted_at IS NULL`;
  const countParams = [];
  if (role === 'DEMANDEUR') {
    countSql += ` AND fr.requester_id=$1`;
    countParams.push(userId);
  }
  if (statuses.length) {
    const idx = countParams.length + 1;
    countSql += ` AND fr.status = ANY($${idx})`;
    countParams.push(statuses);
  }
  // Get total count for pagination with defensive error handling
  let count = 0;
  try {
    const result = await pool.query(countSql, countParams);
    // Defensive validation of query result
    if (result && result.rows && Array.isArray(result.rows)) {
      if (result.rows.length > 0) {
        const firstRow = result.rows[0];
        if (firstRow && typeof firstRow === 'object' && 'count' in firstRow) {
          count = Number(firstRow.count) || 0;
        }
      }
    }
  } catch (error) {
    console.error('Error executing count query in fuelRequestsController.list:', error);
    // Continue with count=0 to allow partial functionality - better than crashing
  }

  res.json({
    requests: requestRows,
    pagination: { page, limit, total: count, pages: Math.ceil(count / limit) }
  });
}

/**
 * Get a single fuel request by ID with related user details.
 */
async function getOne(req, res) {
  const { id } = req.params;
  const role = req.user.role;
  const userId = req.user.id;

  let sql = `SELECT fr.*,
                    u.username AS requester_username,
                    u2.username AS verifier_username,
                    u3.username AS approver_username,
                    u4.username AS rejecter_username,
                    u5.username AS canceller_username
             FROM fuel_requests fr
             JOIN users u ON u.id=fr.requester_id
             LEFT JOIN users u2 ON u2.id=fr.verified_by
             LEFT JOIN users u3 ON u3.id=fr.approved_by
             LEFT JOIN users u4 ON u4.id=fr.rejected_by
             LEFT JOIN users u5 ON u5.id=fr.cancelled_by
             WHERE fr.id=$1 AND fr.deleted_at IS NULL`;
  const params = [id];

  if (role === 'DEMANDEUR') {
    params.push(userId);
    sql += ' AND fr.requester_id=$2';
  }

  const result = await pool.query(sql, params);
  let rows = [];
  if (result && result.rows && Array.isArray(result.rows)) {
    rows = result.rows;
  }
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });

  const request = rows[0];

  // Additional business logic: prevent DEMANDEUR from viewing others' requests (already handled by SQL)
  return res.json({ request });
}

/**
 * Create a new fuel request (DEMANDEUR only).
 */
const createSchema = z.object({
  request_type: z.enum(['SERVICE', 'MISSION']),
  objet: z.string().min(1),
  amount_estimated_ar: z.number().int().nonnegative(),
  amount_estimated_words: z.string().min(1),
  request_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() // YYYY-MM-DD
});

async function create(req, res) {
  if (req.user.role !== 'DEMANDEUR') return res.status(403).json({ error: 'FORBIDDEN' });

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { year, seq, request_no } = await nextRequestNo(client);

    const d = parsed.data;
    const start = d.request_date;
    const end = d.end_date || d.request_date; // default to request_date if not provided

    if (!ymdGte(end, start)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'VALIDATION', details: { end_date: ['end_date doit être >= request_date'] } });
    }

    const id = uuidv4();
    await client.query(
      `INSERT INTO fuel_requests (
        id, year, seq, request_no,
        request_type, objet, amount_estimated_ar, amount_estimated_words,
        request_date, end_date,
        status, requester_id, submitted_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'SUBMITTED',$11, now())`,
      [
        id,
        Number(year),
        Number(seq),
        request_no,
        d.request_type,
        d.objet,
        Number(d.amount_estimated_ar),
        d.amount_estimated_words,
        start,
        end,
        req.user.id
      ]
    );

    await client.query('COMMIT');

    // Log audit
    await auditLog({
      actorId: req.user.id,
      action: 'CREATE_FUEL_REQUEST',
      targetUserId: req.user.id,
      meta: { requestId: id }
    });

    const { rows } = await pool.query('SELECT * FROM fuel_requests WHERE id=$1', [id]);
    res.json({ request: rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Submit a draft request for validation (DEMANDEUR only, only DRAFT/REJECTED).
 */
async function submit(req, res) {
  if (req.user.role !== 'DEMANDEUR') return res.status(403).json({ error: 'FORBIDDEN' });

  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE fuel_requests
     SET status='SUBMITTED', submitted_at=now(), updated_at=now()
     WHERE id=$1 AND requester_id=$2 AND status IN ('DRAFT','REJECTED')
     RETURNING *`,
    [id, req.user.id]
  );

  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });

  // Log audit
  await auditLog({
    actorId: req.user.id,
    action: 'SUBMIT_FUEL_REQUEST',
    targetUserId: req.user.id,
    meta: { requestId: id }
  });

  res.json({ request: rows[0] });
}

/**
 * Verify a request (LOGISTIQUE, RAF, ADMIN can verify SUBMITTED requests).
 */
async function verify(req, res) {
  const allowedRoles = ['LOGISTIQUE', 'RAF', 'ADMIN'];
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });

  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE fuel_requests
     SET status='VERIFIED', verified_at=now(), verified_by=$2, updated_at=now()
     WHERE id=$1 AND status='SUBMITTED'
     RETURNING *`,
    [id, req.user.id]
  );

  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });

  // Prevent self-verification
  if (rows[0].requester_id === req.user.id) {
    // Revert the change
    await pool.query(
      `UPDATE fuel_requests
       SET status='SUBMITTED', verified_at=NULL, verified_by=NULL, updated_at=now()
       WHERE id=$1`,
      [id]
    );
    return res.status(403).json({ error: 'SELF_VERIFICATION_FORBIDDEN' });
  }

  // Log audit
  await auditLog({
    actorId: req.user.id,
    action: 'VERIFY_FUEL_REQUEST',
    targetUserId: req.user.id,
    meta: { requestId: id, newStatus: 'VERIFIED' }
  });

  res.json({ request: rows[0] });
}

/**
 * Approve a request (RAF, ADMIN can approve VERIFIED requests).
 */
async function approve(req, res) {
  const allowedRoles = ['RAF', 'ADMIN'];
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });

  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE fuel_requests
     SET status='APPROVED', approved_at=now(), approved_by=$2, updated_at=now()
     WHERE id=$1 AND status='VERIFIED'
     RETURNING *`,
    [id, req.user.id]
  );

  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });

  // Prevent self-approval
  if (rows[0].requester_id === req.user.id) {
    // Revert
    await pool.query(
      `UPDATE fuel_requests
       SET status='VERIFIED', approved_at=NULL, approved_by=NULL, updated_at=now()
       WHERE id=$1`,
      [id]
    );
    return res.status(403).json({ error: 'SELF_APPROVAL_FORBIDDEN' });
  }

  // Log audit
  await auditLog({
    actorId: req.user.id,
    action: 'APPROVE_FUEL_REQUEST',
    targetUserId: req.user.id,
    meta: { requestId: id, newStatus: 'APPROVED' }
  });

  res.json({ request: rows[0] });
}

/**
 * Reject a request (LOGISTIQUE, RAF, ADMIN can reject SUBMITTED/VERIFIED requests).
 */
async function reject(req, res) {
  const allowedRoles = ['LOGISTIQUE', 'RAF', 'ADMIN'];
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });

  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ error: 'VALIDATION', details: { reason: ['Rejection reason is required'] } });
  }

  const { rows } = await pool.query(
    `UPDATE fuel_requests
     SET status='REJECTED', rejected_at=now(), rejected_by=$2, reject_reason=$3, updated_at=now()
     WHERE id=$1 AND status IN ('SUBMITTED','VERIFIED')
     RETURNING *`,
    [id, req.user.id, reason.trim()]
  );

  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });

  // Prevent self-rejection
  if (rows[0].requester_id === req.user.id) {
    // Revert
    await pool.query(
      `UPDATE fuel_requests
       SET status='SUBMITTED', rejected_at=NULL, rejected_by=NULL, reject_reason=NULL, updated_at=now()
       WHERE id=$1`,
      [id]
    );
    return res.status(403).json({ error: 'SELF_REJECTION_FORBIDDEN' });
  }

  // Log audit
  await auditLog({
    actorId: req.user.id,
    action: 'REJECT_FUEL_REQUEST',
    targetUserId: req.user.id,
    meta: { requestId: id, reason: reason.trim() }
  });

  res.json({ request: rows[0] });
}

/**
 * Cancel a request (DEMANDEUR only, only SUBMITTED/VERIFIED can be cancelled to CANCELLED).
 */
async function cancel(req, res) {
  if (req.user.role !== 'DEMANDEUR') return res.status(403).json({ error: 'FORBIDDEN' });

  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE fuel_requests
     SET status='CANCELLED', cancelled_at=now(), cancelled_by=$2, updated_at=now()
     WHERE id=$1 AND status IN ('SUBMITTED','VERIFIED')
     RETURNING *`,
    [id, req.user.id]
  );

  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });

  // Log audit
  await auditLog({
    actorId: req.user.id,
    action: 'CANCEL_FUEL_REQUEST',
    targetUserId: req.user.id,
    meta: { requestId: id }
  });

  res.json({ request: rows[0] });
}

/**
 * Soft delete a request (ADMIN only).
 */
async function softDelete(req, res) {
  // Only ADMIN can soft delete requests
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'FORBIDDEN' });

  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE fuel_requests
     SET deleted_at=now(), deleted_by=$2
     WHERE id=$1 AND deleted_at IS NULL
     RETURNING *`,
    [id, req.user.id]
  );

  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_ALREADY_DELETED' });

  // Log audit
  await auditLog({
    actorId: req.user.id,
    action: 'SOFT_DELETE_FUEL_REQUEST',
    targetUserId: req.user.id,
    meta: { requestId: id }
  });

  res.json({ request: rows[0] });
}

/**
 * Update a request (DEMANDEUR only, only DRAFT status).
 * Allows updating most fields except system ones.
 */
async function update(req, res) {
  if (req.user.role !== 'DEMANDEUR') return res.status(403).json({ error: 'FORBIDDEN' });

  const { id } = req.params;
  // We'll allow updating the same fields as create, except request_type? Actually, request_type can be changed.
  const updateSchema = z.object({
    request_type: z.enum(['SERVICE', 'MISSION']).optional(),
    objet: z.string().min(1).optional(),
    amount_estimated_ar: z.number().int().nonnegative().optional(),
    amount_estimated_words: z.string().min(1).optional(),
    request_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });

  const { rows } = await pool.query(
    `SELECT status FROM fuel_requests WHERE id=$1 AND requester_id=$2 AND deleted_at IS NULL`,
    [id, req.user.id]
  );

  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_NOT_OWNER' });
  if (rows[0].status !== 'DRAFT') return res.status(400).json({ error: 'INVALID_STATUS', details: { status: ['Only draft requests can be updated'] } });

  const updates = [];
  const values = [];
  let index = 1;

  const data = parsed.data;
  if (data.request_type !== undefined) {
    updates.push(`request_type=$${index++}`);
    values.push(data.request_type);
  }
  if (data.objet !== undefined) {
    updates.push(`objet=$${index++}`);
    values.push(data.objet);
  }
  if (data.amount_estimated_ar !== undefined) {
    updates.push(`amount_estimated_ar=$${index++}`);
    values.push(Number(data.amount_estimated_ar));
  }
  if (data.amount_estimated_words !== undefined) {
    updates.push(`amount_estimated_words=$${index++}`);
    values.push(data.amount_estimated_words);
  }
  if (data.request_date !== undefined) {
    updates.push(`request_date=$${index++}`);
    values.push(data.request_date);
  }
  if (data.end_date !== undefined) {
    updates.push(`end_date=$${index++}`);
    values.push(data.end_date);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'NO_FIELDS_TO_UPDATE' });

  // Add updated_at
  updates.push(`updated_at=now()`);
  values.push(id, req.user.id); // for WHERE clause

  const sql = `
    UPDATE fuel_requests
    SET ${updates.join(', ')}
    WHERE id=$${index-2} AND requester_id=$${index-1} AND deleted_at IS NULL
    RETURNING *
  `;

  const result = await pool.query(sql, values);
  let updatedRows = [];
  if (result && result.rows && Array.isArray(result.rows)) {
    updatedRows = result.rows;
  }
  if (!updatedRows[0]) return res.status(404).json({ error: 'UPDATE_FAILED' });

  // Log audit
  await auditLog({
    actorId: req.user.id,
    action: 'UPDATE_FUEL_REQUEST',
    targetUserId: req.user.id,
    meta: { requestId: id, changes: data }
  });

  res.json({ request: updatedRows[0] });
}

module.exports = {
  list,
  getOne,
  create,
  submit,
  verify,
  approve,
  reject,
  cancel,
  softDelete,
  update
};