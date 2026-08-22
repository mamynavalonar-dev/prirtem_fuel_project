const { z } = require('zod');
const { randomUUID: uuidv4 } = require('crypto');
const { pool } = require('../db');
const { auditLog } = require('../utils/audit');
const { auditedMutation } = require('../utils/auditedMutation');

function fmtNo(seq, year) {
  return `N° ${String(seq).padStart(3, '0')}/${year}`;
}

async function nextRequestNo(client) {
  const year = new Date().getFullYear();
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`fuel_request:${year}`]);
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
  const pagination = z.object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  }).safeParse({ page: req.query.page ?? 1, limit: req.query.limit ?? 50 });
  if (!pagination.success) {
    return res.status(400).json({ error: 'VALIDATION', details: pagination.error.flatten() });
  }
  const { page, limit } = pagination.data;
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

  const result = await pool.query(sql, params);
  const requestRows = Array.isArray(result?.rows) ? result.rows : [];

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
  const countResult = await pool.query(countSql, countParams);
  const count = Number(countResult?.rows?.[0]?.count || 0);

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
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const { year, seq, request_no } = await nextRequestNo(client);

    const d = parsed.data;
    const start = d.request_date;
    const end = d.end_date || d.request_date;

    if (!ymdGte(end, start)) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(400).json({ error: 'VALIDATION', details: { end_date: ['end_date doit être >= request_date'] } });
    }

    const id = uuidv4();
    const inserted = await client.query(
      `INSERT INTO fuel_requests (
        id, year, seq, request_no,
        request_type, objet, amount_estimated_ar, amount_estimated_words,
        request_date, end_date,
        status, requester_id, submitted_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'SUBMITTED',$11, now())
      RETURNING *`,
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

    await auditLog({
      actorId: req.user.id,
      action: 'CREATE_FUEL_REQUEST',
      targetUserId: req.user.id,
      meta: { requestId: id },
      db: client,
      required: true
    });

    await client.query('COMMIT');
    transactionOpen = false;
    return res.json({ request: inserted.rows[0] });
  } catch (e) {
    if (transactionOpen) await client.query('ROLLBACK');
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
  const row = await auditedMutation({
    sql: `UPDATE fuel_requests
          SET status='SUBMITTED', submitted_at=now(), updated_at=now()
          WHERE id=$1 AND requester_id=$2 AND status IN ('DRAFT','REJECTED')
          RETURNING *`,
    params: [id, req.user.id],
    actorId: req.user.id,
    action: 'SUBMIT_FUEL_REQUEST',
    targetUserId: (request) => request.requester_id,
    meta: { requestId: id, newStatus: 'SUBMITTED' }
  });

  if (!row) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });
  return res.json({ request: row });
}

/**
 * Verify a request (LOGISTIQUE only).
 */
async function verify(req, res) {
  if (req.user.role !== 'LOGISTIQUE') return res.status(403).json({ error: 'FORBIDDEN' });

  const { id } = req.params;
  const row = await auditedMutation({
    sql: `UPDATE fuel_requests
          SET status='VERIFIED', verified_at=now(), verified_by=$2, updated_at=now()
          WHERE id=$1 AND status='SUBMITTED' AND requester_id<>$2
          RETURNING *`,
    params: [id, req.user.id],
    actorId: req.user.id,
    action: 'VERIFY_FUEL_REQUEST',
    targetUserId: (request) => request.requester_id,
    meta: { requestId: id, newStatus: 'VERIFIED' }
  });

  if (!row) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });
  return res.json({ request: row });
}

/**
 * Approve a request (RAF only, different from the verifier/requester).
 */
async function approve(req, res) {
  if (req.user.role !== 'RAF') return res.status(403).json({ error: 'FORBIDDEN' });

  const { id } = req.params;
  const row = await auditedMutation({
    sql: `UPDATE fuel_requests
          SET status='APPROVED', approved_at=now(), approved_by=$2, updated_at=now()
          WHERE id=$1 AND status='VERIFIED' AND requester_id<>$2 AND verified_by<>$2
          RETURNING *`,
    params: [id, req.user.id],
    actorId: req.user.id,
    action: 'APPROVE_FUEL_REQUEST',
    targetUserId: (request) => request.requester_id,
    meta: { requestId: id, newStatus: 'APPROVED' }
  });

  if (!row) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });
  return res.json({ request: row });
}

/**
 * Reject a request (LOGISTIQUE, RAF, ADMIN can reject SUBMITTED/VERIFIED requests).
 */
async function reject(req, res) {
  const allowedRoles = ['LOGISTIQUE', 'RAF', 'ADMIN'];
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });

  const { id } = req.params;
  const { reason } = req.body;
  const allowedStatuses = req.user.role === 'LOGISTIQUE'
    ? ['SUBMITTED']
    : (req.user.role === 'RAF' ? ['VERIFIED'] : ['SUBMITTED', 'VERIFIED']);

  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ error: 'VALIDATION', details: { reason: ['Rejection reason is required'] } });
  }

  const cleanReason = reason.trim();
  const row = await auditedMutation({
    sql: `UPDATE fuel_requests
          SET status='REJECTED', rejected_at=now(), rejected_by=$2, reject_reason=$3, updated_at=now()
          WHERE id=$1 AND status = ANY($4::fuel_request_status[]) AND requester_id<>$2
          RETURNING *`,
    params: [id, req.user.id, cleanReason, allowedStatuses],
    actorId: req.user.id,
    action: 'REJECT_FUEL_REQUEST',
    targetUserId: (request) => request.requester_id,
    meta: { requestId: id, reason: cleanReason, newStatus: 'REJECTED' }
  });

  if (!row) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });
  return res.json({ request: row });
}

/**
 * Cancel a request (DEMANDEUR only, only SUBMITTED/VERIFIED can be cancelled to CANCELLED).
 */
async function cancel(req, res) {
  if (req.user.role !== 'DEMANDEUR') return res.status(403).json({ error: 'FORBIDDEN' });

  const { id } = req.params;
  const row = await auditedMutation({
    sql: `UPDATE fuel_requests
          SET status='CANCELLED', cancelled_at=now(), cancelled_by=$2, updated_at=now()
          WHERE id=$1 AND requester_id=$2 AND status IN ('SUBMITTED','VERIFIED')
          RETURNING *`,
    params: [id, req.user.id],
    actorId: req.user.id,
    action: 'CANCEL_FUEL_REQUEST',
    targetUserId: (request) => request.requester_id,
    meta: { requestId: id, newStatus: 'CANCELLED' }
  });

  if (!row) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });
  return res.json({ request: row });
}

/**
 * Soft delete a request (ADMIN only).
 */
async function softDelete(req, res) {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'FORBIDDEN' });

  const { id } = req.params;
  const row = await auditedMutation({
    sql: `UPDATE fuel_requests
          SET deleted_at=now(), deleted_by=$2, updated_at=now()
          WHERE id=$1 AND deleted_at IS NULL
          RETURNING *`,
    params: [id, req.user.id],
    actorId: req.user.id,
    action: 'SOFT_DELETE_FUEL_REQUEST',
    targetUserId: (request) => request.requester_id,
    meta: { requestId: id }
  });

  if (!row) return res.status(404).json({ error: 'NOT_FOUND_OR_ALREADY_DELETED' });
  return res.json({ request: row });
}

/**
 * Update a request (DEMANDEUR only, only DRAFT status).
 * Allows updating most fields except system ones.
 */
async function update(req, res) {
  if (req.user.role !== 'DEMANDEUR') return res.status(403).json({ error: 'FORBIDDEN' });

  const { id } = req.params;
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
  if (!Object.keys(parsed.data).length) return res.status(400).json({ error: 'NO_FIELDS_TO_UPDATE' });

  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;

    const currentResult = await client.query(
      `SELECT status, requester_id, request_date, end_date
       FROM fuel_requests
       WHERE id=$1 AND requester_id=$2 AND deleted_at IS NULL
       FOR UPDATE`,
      [id, req.user.id]
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(404).json({ error: 'NOT_FOUND_OR_NOT_OWNER' });
    }
    if (!['DRAFT', 'SUBMITTED'].includes(current.status)) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(400).json({ error: 'INVALID_STATUS', details: { status: ['Request can no longer be updated'] } });
    }

    const updates = [];
    const values = [];
    let index = 1;
    const data = parsed.data;
    const nextStart = data.request_date || String(current.request_date).slice(0, 10);
    const nextEnd = data.end_date || String(current.end_date).slice(0, 10);
    if (!ymdGte(nextEnd, nextStart)) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(400).json({ error: 'VALIDATION', details: { end_date: ['end_date doit être >= request_date'] } });
    }

    if (data.request_type !== undefined) { updates.push(`request_type=$${index++}`); values.push(data.request_type); }
    if (data.objet !== undefined) { updates.push(`objet=$${index++}`); values.push(data.objet); }
    if (data.amount_estimated_ar !== undefined) { updates.push(`amount_estimated_ar=$${index++}`); values.push(Number(data.amount_estimated_ar)); }
    if (data.amount_estimated_words !== undefined) { updates.push(`amount_estimated_words=$${index++}`); values.push(data.amount_estimated_words); }
    if (data.request_date !== undefined) { updates.push(`request_date=$${index++}`); values.push(data.request_date); }
    if (data.end_date !== undefined) { updates.push(`end_date=$${index++}`); values.push(data.end_date); }

    updates.push('updated_at=now()');
    const idParam = values.length + 1;
    values.push(id);
    const userParam = values.length + 1;
    values.push(req.user.id);

    const result = await client.query(
      `UPDATE fuel_requests
       SET ${updates.join(', ')}
       WHERE id=$${idParam} AND requester_id=$${userParam}
         AND status IN ('DRAFT','SUBMITTED') AND deleted_at IS NULL
       RETURNING *`,
      values
    );
    const row = result.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(404).json({ error: 'UPDATE_FAILED' });
    }

    await auditLog({
      actorId: req.user.id,
      action: 'UPDATE_FUEL_REQUEST',
      targetUserId: row.requester_id,
      meta: { requestId: id, changes: data },
      db: client,
      required: true
    });

    await client.query('COMMIT');
    transactionOpen = false;
    return res.json({ request: row });
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
