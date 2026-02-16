// server/src/controllers/carRequestsController.js
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

function isYmd(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function ymdGte(a, b) {
  if (!isYmd(a) || !isYmd(b)) return false;
  return a >= b;
}

const tripTypeEnum = z.enum(['SERVICE', 'MISSION', 'URGENCE']);

// helpers numeric
const asInt = z.preprocess((v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}, z.number().int().nullable().optional());

const asTime = z.preprocess((v) => {
  if (v === '' || v === null || v === undefined) return null;
  return String(v);
}, z.string().nullable().optional());

const createSchema = z.object({
  proposed_date: z.string().min(4),
  end_date: z.string().min(4).optional(),

  objet: z.string().min(1),

  // ✅ nouveaux champs essentiels
  requester_service: z.string().min(1),
  requester_name: z.string().min(1),
  requester_contact: z.string().min(1),
  trip_type: tripTypeEnum,

  passenger_count: asInt,
  departure_place: z.string().min(1),
  destination_place: z.string().min(1),

  itinerary: z.string().min(1),
  people: z.string().min(1),
  observations: z.string().optional().nullable(),

  depart_time_wanted: asTime,
  return_time_expected: asTime,

  vehicle_hint: z.string().optional().nullable(),
  driver_hint: z.string().optional().nullable(),

  // ✅ contrôle (optionnel à la création)
  actual_out_time: asTime,
  actual_return_time: asTime,
  odometer_start: asInt,
  odometer_end: asInt,
  fuel_level_start: asInt,
  fuel_level_end: asInt
});

async function list(req, res) {
  const role = req.user.role;
  const userId = req.user.id;

  const statusParam = String(req.query.status || '').trim();
  const statuses = statusParam
    ? statusParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    : [];

  let sql = `SELECT cr.*,
                    u.username AS requester_username,
                    v.plate AS vehicle_plate,
                    d.full_name AS driver_name
             FROM car_requests cr
             JOIN users u ON u.id=cr.requester_id
             LEFT JOIN vehicles v ON v.id=cr.vehicle_id
             LEFT JOIN drivers d ON d.id=cr.driver_id
             WHERE cr.deleted_at IS NULL`;
  const params = [];

  if (role === 'DEMANDEUR') {
    params.push(userId);
    sql += ` AND cr.requester_id=$${params.length}`;
  }

  if (statuses.length) {
    params.push(statuses);
    sql += ` AND cr.status = ANY($${params.length})`;
  }

  sql += ' ORDER BY cr.created_at DESC LIMIT 500';

  const { rows } = await pool.query(sql, params);
  res.json({ requests: rows });
}

async function getOne(req, res) {
  const { id } = req.params;
  const role = req.user.role;

  const params = [id];
  let where = 'cr.id=$1';
  if (role === 'DEMANDEUR') {
    params.push(req.user.id);
    where += ' AND cr.requester_id=$2';
  }

  where = `cr.deleted_at IS NULL AND ${where}`;

  const { rows } = await pool.query(
    `SELECT cr.*,
            u.username AS requester_username,
            v.plate AS vehicle_plate,
            d.full_name AS driver_name
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

    const start = String(d.proposed_date || '').slice(0, 10);
    const end = String(d.end_date || d.proposed_date || '').slice(0, 10);

    if (!isYmd(start) || !isYmd(end) || !ymdGte(end, start)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'VALIDATION', details: { end_date: ['end_date doit être >= proposed_date'] } });
    }

    await client.query(
      `INSERT INTO car_requests (
        id, year, seq, request_no,
        proposed_date, end_date,
        objet,
        requester_service, requester_name, requester_contact,
        trip_type, passenger_count,
        departure_place, destination_place,
        itinerary, people, observations,
        depart_time_wanted, return_time_expected,
        vehicle_hint, driver_hint,
        actual_out_time, actual_return_time,
        odometer_start, odometer_end,
        fuel_level_start, fuel_level_end,
        status, requester_id
      ) VALUES (
        $1,$2,$3,$4,
        $5,$6,
        $7,
        $8,$9,$10,
        $11,$12,
        $13,$14,
        $15,$16,$17,
        $18,$19,
        $20,$21,
        $22,$23,
        $24,$25,
        $26,$27,
        'SUBMITTED',$28
      )`,
      [
        id, year, seq, request_no,
        start, end,
        d.objet,

        d.requester_service,
        d.requester_name,
        d.requester_contact,

        d.trip_type,
        d.passenger_count || null,

        d.departure_place,
        d.destination_place,

        d.itinerary,
        d.people,
        d.observations || null,

        d.depart_time_wanted || null,
        d.return_time_expected || null,

        d.vehicle_hint || null,
        d.driver_hint || null,

        d.actual_out_time || null,
        d.actual_return_time || null,

        d.odometer_start || null,
        d.odometer_end || null,

        d.fuel_level_start || null,
        d.fuel_level_end || null,

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

async function cancel(req, res) {
  const { id } = req.params;
  const role = req.user.role;
  const { reason } = req.body || {};

  const params = [id, req.user.id, reason || null];

  let where = `id=$1 AND deleted_at IS NULL AND status IN ('SUBMITTED','LOGISTICS_APPROVED')`;
  if (role === 'DEMANDEUR') {
    where += ` AND requester_id=$2`;
  } else if (!['ADMIN', 'LOGISTIQUE', 'RAF'].includes(role)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const { rows } = await pool.query(
    `UPDATE car_requests
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
    `UPDATE car_requests
     SET deleted_at=now(), deleted_by=$2, updated_at=now()
     WHERE id=$1 AND deleted_at IS NULL
     RETURNING id`,
    [id, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ ok: true });
}

// ✅ Update : Demande (SUBMITTED) + Contrôle (RAF_APPROVED par LOGISTIQUE/ADMIN)
const updateSchema = z.object({
  proposed_date: z.string().min(4).optional(),
  end_date: z.string().min(4).optional(),
  objet: z.string().min(1).optional(),

  requester_service: z.string().min(1).optional(),
  requester_name: z.string().min(1).optional(),
  requester_contact: z.string().min(1).optional(),
  trip_type: tripTypeEnum.optional(),
  passenger_count: asInt,

  departure_place: z.string().min(1).optional(),
  destination_place: z.string().min(1).optional(),

  itinerary: z.string().min(1).optional(),
  people: z.string().min(1).optional(),
  observations: z.string().optional().nullable(),

  depart_time_wanted: asTime,
  return_time_expected: asTime,

  vehicle_hint: z.string().optional().nullable(),
  driver_hint: z.string().optional().nullable(),

  // contrôle
  actual_out_time: asTime,
  actual_return_time: asTime,
  odometer_start: asInt,
  odometer_end: asInt,
  fuel_level_start: asInt,
  fuel_level_end: asInt
});

async function update(req, res) {
  const { id } = req.params;
  const role = req.user.role;

  const parsed = updateSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  const data = parsed.data;
  if (!Object.keys(data).length) return res.json({ ok: true });

  // charge statut + dates + ownership
  const cur = await pool.query(
    `SELECT id, status, requester_id, proposed_date, end_date
     FROM car_requests
     WHERE id=$1 AND deleted_at IS NULL`,
    [id]
  );
  const row = cur.rows[0];
  if (!row) return res.status(404).json({ error: 'NOT_FOUND' });

  // permissions
  if (role === 'DEMANDEUR') {
    if (row.requester_id !== req.user.id) return res.status(403).json({ error: 'FORBIDDEN' });
    if (row.status !== 'SUBMITTED') return res.status(403).json({ error: 'BAD_STATUS' });
  } else if (['ADMIN', 'LOGISTIQUE'].includes(role)) {
    // SUBMITTED: ok (tout)
    // RAF_APPROVED: ok uniquement contrôle
    if (!['SUBMITTED', 'RAF_APPROVED'].includes(row.status)) {
      return res.status(403).json({ error: 'BAD_STATUS' });
    }
  } else {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  // si RAF_APPROVED => only control fields
  if (row.status === 'RAF_APPROVED') {
    const allowed = new Set([
      'actual_out_time', 'actual_return_time',
      'odometer_start', 'odometer_end',
      'fuel_level_start', 'fuel_level_end'
    ]);

    for (const k of Object.keys(data)) {
      if (!allowed.has(k)) {
        return res.status(403).json({ error: 'FORBIDDEN_FIELD', field: k });
      }
    }
  }

  // validation range dates si modifiées
  const currentStart = String(row.proposed_date || '').slice(0, 10);
  const currentEnd = String(row.end_date || currentStart || '').slice(0, 10);

  const nextStart = isYmd(data.proposed_date) ? data.proposed_date : currentStart;
  const nextEnd = isYmd(data.end_date) ? data.end_date : currentEnd;

  if ((data.proposed_date || data.end_date) && (!isYmd(nextStart) || !isYmd(nextEnd) || !ymdGte(nextEnd, nextStart))) {
    return res.status(400).json({ error: 'VALIDATION', details: { end_date: ['end_date doit être >= proposed_date'] } });
  }

  const set = [];
  const values = [];
  let idx = 2;

  if (data.proposed_date || data.end_date) {
    set.push(`proposed_date=$${idx++}`); values.push(nextStart);
    set.push(`end_date=$${idx++}`); values.push(nextEnd);
    delete data.proposed_date;
    delete data.end_date;
  }

  for (const [k, v] of Object.entries(data)) {
    set.push(`${k}=$${idx++}`);
    values.push(v === '' ? null : v);
  }

  set.push('updated_at=now()');

  const { rows } = await pool.query(
    `UPDATE car_requests SET ${set.join(', ')} WHERE id=$1 AND deleted_at IS NULL RETURNING *`,
    [id, ...values]
  );

  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ request: rows[0] });
}

module.exports = { list, getOne, create, update, logisticsApprove, rafApprove, reject, cancel, softDelete };
