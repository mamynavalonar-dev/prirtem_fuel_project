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

function isYmd(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function ymdGte(a, b) {
  if (!isYmd(a) || !isYmd(b)) return false;
  return a >= b;
}

async function list(req, res) {
  const role = req.user.role;
  const userId = req.user.id;

  // optional: ?status=SUBMITTED or ?status=SUBMITTED,VERIFIED
  const statusParam = String(req.query.status || '').trim();
  const statuses = statusParam
    ? statusParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    : [];

  let sql = `SELECT fr.*,
                    u.username AS requester_username
             FROM fuel_requests fr
             JOIN users u ON u.id=fr.requester_id
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
    `SELECT fr.*,
            u.username AS requester_username
     FROM fuel_requests fr
     JOIN users u ON u.id=fr.requester_id
     WHERE ${where}`,
    params
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ request: rows[0] });
}

const createSchema = z.object({
  request_type: z.enum(['SERVICE', 'MISSION']),
  objet: z.string().min(1),
  amount_estimated_ar: z.number().int().nonnegative(),
  amount_estimated_words: z.string().min(1),
  request_date: z.string().min(4), // YYYY-MM-DD
  end_date: z.string().min(4).optional() // YYYY-MM-DD
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

    const start = String(d.request_date || '').slice(0, 10);
    const end = String(d.end_date || d.request_date || '').slice(0, 10);

    if (!isYmd(start) || !isYmd(end) || !ymdGte(end, start)) {
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
        year,
        seq,
        request_no,
        d.request_type,
        d.objet,
        d.amount_estimated_ar,
        d.amount_estimated_words,
        start,
        end,
        req.user.id
      ]
    );
    await client.query('COMMIT');

    const { rows } = await pool.query('SELECT * FROM fuel_requests WHERE id=$1', [id]);
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
  if (req.user.role !== 'DEMANDEUR') return res.status(403).json({ error: 'FORBIDDEN' });

  const { rows } = await pool.query(
    `UPDATE fuel_requests
     SET status='SUBMITTED', submitted_at=now(), updated_at=now()
     WHERE id=$1 AND requester_id=$2 AND status IN ('DRAFT','REJECTED')
     RETURNING *`,
    [id, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });
  res.json({ request: rows[0] });
}

async function verify(req, res) {
  const { id } = req.params;
  if (!['LOGISTIQUE', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });

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
  if (!['RAF', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });

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
  if (!['LOGISTIQUE', 'RAF', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });

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

async function cancel(req, res) {
  const { id } = req.params;
  const role = req.user.role;
  const { reason } = req.body || {};

  // Demandeur: annule sa demande tant que ce n'est pas APPROVED
  // Admin/Logistique/RAF: annule tant que ce n'est pas APPROVED
  const params = [id, req.user.id, reason || null];

  let where = `id=$1 AND deleted_at IS NULL AND status IN ('DRAFT','SUBMITTED','VERIFIED','REJECTED')`;
  if (role === 'DEMANDEUR') {
    where += ` AND requester_id=$2`;
  } else if (!['ADMIN', 'LOGISTIQUE', 'RAF'].includes(role)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const { rows } = await pool.query(
    `UPDATE fuel_requests
     SET status='CANCELLED',
         cancelled_at=now(),
         cancelled_by=$2,
         cancel_reason=$3,
         updated_at=now()
     WHERE ${where}
     RETURNING *`,
    params
  );

  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });
  res.json({ request: rows[0] });
}

async function softDelete(req, res) {
  const { id } = req.params;
  if (!['ADMIN', 'LOGISTIQUE'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });

  const { rows } = await pool.query(
    `UPDATE fuel_requests
     SET deleted_at=now(), deleted_by=$2, updated_at=now()
     WHERE id=$1 AND deleted_at IS NULL
     RETURNING id`,
    [id, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ ok: true });
}

const updateSchema = z.object({
  request_type: z.enum(['SERVICE', 'MISSION']).optional(),
  objet: z.string().min(1).optional(),
  amount_estimated_ar: z.number().int().nonnegative().optional(),
  amount_estimated_words: z.string().min(1).optional(),
  request_date: z.string().min(4).optional(), // YYYY-MM-DD
  end_date: z.string().min(4).optional() // YYYY-MM-DD
});

async function update(req, res) {
  const { id } = req.params;
  const role = req.user.role;

  const parsed = updateSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  const data = parsed.data;

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

  // Range validation (request_date/end_date)
  const current = await pool.query(`SELECT request_date, end_date FROM fuel_requests WHERE ${where}`, params);
  if (!current.rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_FORBIDDEN_OR_BAD_STATUS' });

  const currentStart = String(current.rows[0].request_date || '').slice(0, 10);
  const currentEnd = String(current.rows[0].end_date || currentStart || '').slice(0, 10);

  const nextStart = isYmd(data.request_date) ? data.request_date : currentStart;
  const nextEnd = isYmd(data.end_date) ? data.end_date : currentEnd;

  if (!isYmd(nextStart) || !isYmd(nextEnd) || !ymdGte(nextEnd, nextStart)) {
    return res.status(400).json({ error: 'VALIDATION', details: { end_date: ['end_date doit être >= request_date'] } });
  }

  const set = [];
  const values = [];
  let idx = params.length + 1;

  if (data.request_date || data.end_date) {
    set.push(`request_date=$${idx++}`);
    values.push(nextStart);
    set.push(`end_date=$${idx++}`);
    values.push(nextEnd);

    delete data.request_date;
    delete data.end_date;
  }

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

module.exports = { list, getOne, create, submit, verify, approve, reject, cancel, softDelete, update };