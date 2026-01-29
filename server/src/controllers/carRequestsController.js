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
     FROM car_requests
     WHERE year=$1`,
    [year]
  );
  const nextSeq = Number(rows[0].max_seq) + 1;
  return { year, seq: nextSeq, request_no: fmtNo(nextSeq, year) };
}

const createSchema = z.object({
  proposed_date: z.string().min(4),
  objet: z.string().min(1),
  itinerary: z.string().min(1),
  people: z.string().optional().nullable(),
  depart_time_wanted: z.string().optional().nullable(),
  return_time_expected: z.string().optional().nullable(),
  vehicle_hint: z.string().optional().nullable(),
  driver_hint: z.string().optional().nullable()
});

async function list(req, res) {
  const role = req.user.role;
  const userId = req.user.id;

  let sql = `SELECT cr.*, u.username AS requester_username,
                    v.plate AS vehicle_plate, d.full_name AS driver_name
             FROM car_requests cr
             JOIN users u ON u.id=cr.requester_id
             LEFT JOIN vehicles v ON v.id=cr.vehicle_id
             LEFT JOIN drivers d ON d.id=cr.driver_id`;
  const params = [];
  if (role === 'DEMANDEUR') {
    sql += ' WHERE cr.deleted_at IS NULL AND cr.requester_id=$1';
    params.push(userId);
  } else {
    sql += ' WHERE cr.deleted_at IS NULL';
  }
  sql += ' ORDER BY cr.created_at DESC LIMIT 500';
  const { rows } = await pool.query(sql, params);
  res.json({ requests: rows });
}

async function getOne(req, res) {
  const { id } = req.params;
  const role = req.user.role;
  const params = [id];
  let where = 'cr.deleted_at IS NULL AND cr.id=$1';
  if (role === 'DEMANDEUR') {
    params.push(req.user.id);
    where += ' AND cr.requester_id=$2';
  }
  const { rows } = await pool.query(
    `SELECT cr.*, u.username AS requester_username,
            v.plate AS vehicle_plate, d.full_name AS driver_name
     FROM car_requests cr
     JOIN users u ON u.id=cr.requester_id
     LEFT JOIN vehicles v ON v.id=cr.vehicle_id
     LEFT JOIN drivers d ON d.id=cr.driver_id
     WHERE ${where}`,
    params
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ request: rows[0] });
}

async function create(req, res) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { year, seq, request_no } = await nextRequestNo(client);

    const id = uuidv4();
    const d = parsed.data;
    await client.query(
      `INSERT INTO car_requests (
        id, year, seq, request_no,
        proposed_date, objet, itinerary, people,
        depart_time_wanted, return_time_expected,
        vehicle_hint, driver_hint,
        status, requester_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'SUBMITTED',$13)`,
      [
        id,
        year,
        seq,
        request_no,
        d.proposed_date,
        d.objet,
        d.itinerary,
        d.people || null,
        d.depart_time_wanted || null,
        d.return_time_expected || null,
        d.vehicle_hint || null,
        d.driver_hint || null,
        req.user.id
      ]
    );
    await client.query('COMMIT');

    const { rows } = await pool.query('SELECT * FROM car_requests WHERE id=$1', [id]);
    res.json({ request: rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function logisticsApprove(req, res) {
  const { id } = req.params;
  if (!['LOGISTIQUE', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });

  const { vehicle_id, driver_id } = req.body || {};

  const { rows } = await pool.query(
    `UPDATE car_requests
     SET status='LOGISTICS_APPROVED', logistics_at=now(), logistics_by=$2,
         vehicle_id=$3, driver_id=$4, updated_at=now()
     WHERE id=$1 AND status='SUBMITTED'
     RETURNING *`,
    [id, req.user.id, vehicle_id || null, driver_id || null]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });
  res.json({ request: rows[0] });
}

async function rafApprove(req, res) {
  const { id } = req.params;
  if (!['RAF', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });

  const { rows } = await pool.query(
    `UPDATE car_requests
     SET status='RAF_APPROVED', raf_at=now(), raf_by=$2,
         authorization_date=COALESCE(authorization_date, CURRENT_DATE),
         authorization_time=COALESCE(authorization_time, CURRENT_TIME),
         updated_at=now()
     WHERE id=$1 AND status='LOGISTICS_APPROVED'
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
    `UPDATE car_requests
     SET status='REJECTED', rejected_at=now(), rejected_by=$2, reject_reason=$3, updated_at=now()
     WHERE id=$1 AND status IN ('SUBMITTED','LOGISTICS_APPROVED')
     RETURNING *`,
    [id, req.user.id, reason || null]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });
  res.json({ request: rows[0] });
}

async function softDelete(req, res) {
  const { id } = req.params;
  if (!['ADMIN', 'LOGISTIQUE'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });

  const { rows } = await pool.query(
    `UPDATE car_requests
     SET deleted_at=now(), updated_at=now()
     WHERE id=$1 AND deleted_at IS NULL
     RETURNING id`,
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ ok: true });
}



const updateSchema = z.object({
  proposed_date: z.string().min(4).optional(),
  objet: z.string().min(1).optional(),
  itinerary: z.string().min(1).optional(),
  people: z.string().min(1).optional(),
  depart_time_wanted: z.string().optional().nullable(),
  return_time_expected: z.string().optional().nullable(),
  vehicle_hint: z.string().optional().nullable(),
  driver_hint: z.string().optional().nullable()
});

async function update(req, res) {
  const { id } = req.params;
  const role = req.user.role;

  const parsed = updateSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  const data = parsed.data;
  if (!Object.keys(data).length) return res.json({ ok: true });

  const params = [id];
  let where = "id=$1 AND deleted_at IS NULL AND status='SUBMITTED'";

  if (role === 'DEMANDEUR') {
    params.push(req.user.id);
    where += ' AND requester_id=$2';
  } else if (!['ADMIN', 'LOGISTIQUE'].includes(role)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const set = [];
  const values = [];
  let idx = params.length + 1;

  for (const [k, v] of Object.entries(data)) {
    set.push(`${k}=$${idx++}`);
    values.push(v === '' ? null : v);
  }
  set.push('updated_at=now()');

  const sql = `UPDATE car_requests SET ${set.join(', ')} WHERE ${where} RETURNING *`;
  const { rows } = await pool.query(sql, [...params, ...values]);
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_FORBIDDEN_OR_BAD_STATUS' });
  res.json({ request: rows[0] });
}

module.exports = { list, getOne, create, update, logisticsApprove, rafApprove, reject, softDelete };
