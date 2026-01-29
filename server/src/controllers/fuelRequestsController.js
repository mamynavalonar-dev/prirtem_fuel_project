const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');

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

const createSchema = z.object({
  request_type: z.enum(['SERVICE', 'MISSION']),
  objet: z.string().min(1),
  amount_estimated_ar: z.number().int().nonnegative(),
  amount_estimated_words: z.string().min(1),
  request_date: z.string().min(4) // YYYY-MM-DD
});

async function list(req, res) {
  const role = req.user.role;
  const userId = req.user.id;

  let sql = `SELECT fr.*, u.username AS requester_username
             FROM fuel_requests fr
             JOIN users u ON u.id=fr.requester_id`;
  const params = [];
  if (role === 'DEMANDEUR') {
    sql += ' WHERE fr.deleted_at IS NULL AND fr.requester_id=$1';
    params.push(userId);
  } else {
    sql += ' WHERE fr.deleted_at IS NULL';
  }
  sql += ' ORDER BY fr.created_at DESC LIMIT 500';

  const { rows } = await pool.query(sql, params);
  res.json({ requests: rows });
}

async function getOne(req, res) {
  const { id } = req.params;
  const role = req.user.role;

  const params = [id];
  let where = 'fr.id=$1';
  if (role === 'DEMANDEUR') {
    params.push(req.user.id);
    where += ' AND fr.requester_id=$2';
  }

  where = `fr.deleted_at IS NULL AND ${where}`;

  const { rows } = await pool.query(
    `SELECT fr.*, u.username AS requester_username
     FROM fuel_requests fr
     JOIN users u ON u.id=fr.requester_id
     WHERE ${where}`,
    params
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ request: rows[0] });
}

async function softDelete(req, res) {
  const { id } = req.params;
  if (!['ADMIN', 'LOGISTIQUE'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });

  const { rows } = await pool.query(
    `UPDATE fuel_requests
     SET deleted_at=now(), updated_at=now()
     WHERE id=$1 AND deleted_at IS NULL
     RETURNING id`,
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ ok: true });
}

async function create(req, res) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { year, seq, request_no } = await nextRequestNo(client);

    const id = uuidv4();
    const data = parsed.data;
    await client.query(
      `INSERT INTO fuel_requests (
        id, year, seq, request_no, request_type, objet,
        amount_estimated_ar, amount_estimated_words, request_date,
        status, requester_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'DRAFT',$10)`,
      [
        id,
        year,
        seq,
        request_no,
        data.request_type,
        data.objet,
        data.amount_estimated_ar,
        data.amount_estimated_words,
        data.request_date,
        req.user.id
      ]
    );
    await client.query('COMMIT');

    const { rows } = await pool.query(
      `SELECT fr.*, u.username AS requester_username
       FROM fuel_requests fr JOIN users u ON u.id=fr.requester_id
       WHERE fr.id=$1`,
      [id]
    );
    res.json({ request: rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function submit(req, res) {
  const { id } = req.params;
  const role = req.user.role;
  if (role !== 'DEMANDEUR') return res.status(403).json({ error: 'FORBIDDEN' });

  const { rows } = await pool.query(
    `UPDATE fuel_requests
     SET status='SUBMITTED', submitted_at=now(), updated_at=now()
     WHERE id=$1 AND requester_id=$2 AND status IN ('DRAFT','REJECTED')
     RETURNING *`,
    [id, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ request: rows[0] });
}

async function verify(req, res) {
  const { id } = req.params;
  const role = req.user.role;
  if (!['LOGISTIQUE', 'ADMIN'].includes(role)) return res.status(403).json({ error: 'FORBIDDEN' });

  const { rows } = await pool.query(
    `UPDATE fuel_requests
     SET status='VERIFIED', verified_at=now(), verified_by=$2, updated_at=now()
     WHERE id=$1 AND status='SUBMITTED'
     RETURNING *`,
    [id, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });
  res.json({ request: rows[0] });
}

async function approve(req, res) {
  const { id } = req.params;
  const role = req.user.role;
  if (!['RAF', 'ADMIN'].includes(role)) return res.status(403).json({ error: 'FORBIDDEN' });

  const { rows } = await pool.query(
    `UPDATE fuel_requests
     SET status='APPROVED', approved_at=now(), approved_by=$2, updated_at=now()
     WHERE id=$1 AND status='VERIFIED'
     RETURNING *`,
    [id, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });
  res.json({ request: rows[0] });
}

async function reject(req, res) {
  const { id } = req.params;
  const role = req.user.role;
  if (!['LOGISTIQUE', 'RAF', 'ADMIN'].includes(role)) return res.status(403).json({ error: 'FORBIDDEN' });

  const { reason } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE fuel_requests
     SET status='REJECTED', rejected_at=now(), rejected_by=$2, reject_reason=$3, updated_at=now()
     WHERE id=$1 AND status IN ('SUBMITTED','VERIFIED')
     RETURNING *`,
    [id, req.user.id, reason || null]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });
  res.json({ request: rows[0] });
}



const updateSchema = z.object({
  request_type: z.enum(['SERVICE', 'MISSION']).optional(),
  objet: z.string().min(1).optional(),
  amount_estimated_ar: z.number().int().nonnegative().optional(),
  amount_estimated_words: z.string().min(1).optional(),
  request_date: z.string().min(4).optional() // YYYY-MM-DD
});

async function update(req, res) {
  const { id } = req.params;
  const role = req.user.role;

  const parsed = updateSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  const data = parsed.data;

  // Nothing to update
  if (!Object.keys(data).length) return res.json({ ok: true });

  // Permissions:
  // - Demandeur can update own request only when DRAFT or REJECTED
  // - Admin/Logistique can update any non-deleted request (used for corrections)
  const params = [id];
  let where = 'id=$1 AND deleted_at IS NULL';
  if (role === 'DEMANDEUR') {
    params.push(req.user.id);
    where += " AND requester_id=$2 AND status IN ('DRAFT','REJECTED')";
  } else if (!['ADMIN', 'LOGISTIQUE'].includes(role)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const set = [];
  const values = [];
  let idx = params.length + 1

  for (const [k, v] of Object.entries(data)) {
    set.push(`${k}=$${idx++}`);
    values.push(v);
  }
  set.push(`updated_at=now()`);

  const sql = `UPDATE fuel_requests SET ${set.join(', ')} WHERE ${where} RETURNING *`;
  const { rows } = await pool.query(sql, [...params, ...values]);
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_FORBIDDEN_OR_BAD_STATUS' });
  res.json({ request: rows[0] });
}

module.exports = { list, getOne, create, submit, verify, approve, reject, softDelete, update };
