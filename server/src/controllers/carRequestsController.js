// server/src/controllers/carRequestsController.js
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
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`car_request:${year}`]);
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
  if (req.user.role !== 'DEMANDEUR') return res.status(403).json({ error: 'FORBIDDEN' });
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });

  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const { year, seq, request_no } = await nextRequestNo(client);

    const id = uuidv4();
    const d = parsed.data;
    const start = String(d.proposed_date || '').slice(0, 10);
    const end = String(d.end_date || d.proposed_date || '').slice(0, 10);

    if (!isYmd(start) || !isYmd(end) || !ymdGte(end, start)) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(400).json({ error: 'VALIDATION', details: { end_date: ['end_date doit être >= proposed_date'] } });
    }

    const inserted = await client.query(
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
      )
      RETURNING *`,
      [
        id, year, seq, request_no,
        start, end,
        d.objet,
        d.requester_service,
        d.requester_name,
        d.requester_contact,
        d.trip_type,
        d.passenger_count ?? null,
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
        d.odometer_start ?? null,
        d.odometer_end ?? null,
        d.fuel_level_start ?? null,
        d.fuel_level_end ?? null,
        req.user.id
      ]
    );

    await auditLog({
      actorId: req.user.id,
      action: 'CREATE_CAR_REQUEST',
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

async function logisticsApprove(req, res) {
  const { id } = req.params;
  if (req.user.role !== 'LOGISTIQUE') return res.status(403).json({ error: 'FORBIDDEN' });

  const parsed = z.object({ vehicle_id: z.string().uuid(), driver_id: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  const { vehicle_id, driver_id } = parsed.data;

  const row = await auditedMutation({
    sql: `UPDATE car_requests
          SET status='LOGISTICS_APPROVED', logistics_at=now(), logistics_by=$2,
              vehicle_id=$3, driver_id=$4, updated_at=now()
          WHERE id=$1 AND status='SUBMITTED' AND requester_id<>$2
            AND EXISTS (SELECT 1 FROM vehicles v WHERE v.id=$3 AND v.is_active=true AND v.deleted_at IS NULL)
            AND EXISTS (SELECT 1 FROM drivers d WHERE d.id=$4 AND d.is_active=true AND d.deleted_at IS NULL)
          RETURNING *`,
    params: [id, req.user.id, vehicle_id, driver_id],
    actorId: req.user.id,
    action: 'LOGISTICS_APPROVE_CAR_REQUEST',
    targetUserId: (request) => request.requester_id,
    meta: { requestId: id, vehicleId: vehicle_id, driverId: driver_id, newStatus: 'LOGISTICS_APPROVED' }
  });

  if (!row) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });
  return res.json({ request: row });
}

async function rafApprove(req, res) {
  const { id } = req.params;
  if (req.user.role !== 'RAF') return res.status(403).json({ error: 'FORBIDDEN' });

  const row = await auditedMutation({
    sql: `UPDATE car_requests
          SET status='RAF_APPROVED', raf_at=now(), raf_by=$2,
              authorization_date=COALESCE(authorization_date, CURRENT_DATE),
              authorization_time=COALESCE(authorization_time, CURRENT_TIME),
              updated_at=now()
          WHERE id=$1 AND status='LOGISTICS_APPROVED'
            AND requester_id<>$2 AND logistics_by<>$2
          RETURNING *`,
    params: [id, req.user.id],
    actorId: req.user.id,
    action: 'RAF_APPROVE_CAR_REQUEST',
    targetUserId: (request) => request.requester_id,
    meta: { requestId: id, newStatus: 'RAF_APPROVED' }
  });

  if (!row) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });
  return res.json({ request: row });
}

async function reject(req, res) {
  const { id } = req.params;
  if (!['LOGISTIQUE', 'RAF', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'VALIDATION', details: { reason: ['Motif obligatoire'] } });
  const allowedStatuses = req.user.role === 'LOGISTIQUE'
    ? ['SUBMITTED']
    : (req.user.role === 'RAF' ? ['LOGISTICS_APPROVED'] : ['SUBMITTED', 'LOGISTICS_APPROVED']);

  const row = await auditedMutation({
    sql: `UPDATE car_requests
          SET status='REJECTED', rejected_at=now(), rejected_by=$2, reject_reason=$3, updated_at=now()
          WHERE id=$1 AND status = ANY($4::car_request_status[]) AND requester_id<>$2
          RETURNING *`,
    params: [id, req.user.id, reason, allowedStatuses],
    actorId: req.user.id,
    action: 'REJECT_CAR_REQUEST',
    targetUserId: (request) => request.requester_id,
    meta: { requestId: id, reason, newStatus: 'REJECTED' }
  });

  if (!row) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });
  return res.json({ request: row });
}

async function cancel(req, res) {
  const { id } = req.params;
  const role = req.user.role;
  const reason = req.body?.reason || null;

  let where = `id=$1 AND deleted_at IS NULL AND status IN ('SUBMITTED','LOGISTICS_APPROVED')`;
  if (role === 'DEMANDEUR') {
    where += ` AND requester_id=$2`;
  } else if (!['ADMIN', 'LOGISTIQUE', 'RAF'].includes(role)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const row = await auditedMutation({
    sql: `UPDATE car_requests
          SET status='CANCELLED', cancelled_at=now(), cancelled_by=$2,
              cancel_reason=$3, updated_at=now()
          WHERE ${where}
          RETURNING *`,
    params: [id, req.user.id, reason],
    actorId: req.user.id,
    action: 'CANCEL_CAR_REQUEST',
    targetUserId: (request) => request.requester_id,
    meta: { requestId: id, reason, newStatus: 'CANCELLED' }
  });

  if (!row) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });
  return res.json({ request: row });
}

async function softDelete(req, res) {
  const { id } = req.params;
  if (!['ADMIN', 'LOGISTIQUE'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });

  const row = await auditedMutation({
    sql: `UPDATE car_requests
          SET deleted_at=now(), deleted_by=$2, updated_at=now()
          WHERE id=$1 AND deleted_at IS NULL
          RETURNING *`,
    params: [id, req.user.id],
    actorId: req.user.id,
    action: 'SOFT_DELETE_CAR_REQUEST',
    targetUserId: (request) => request.requester_id,
    meta: { requestId: id }
  });

  if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
  return res.json({ ok: true });
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
  const data = { ...parsed.data };
  if (!Object.keys(data).length) return res.json({ ok: true });

  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;

    const cur = await client.query(
      `SELECT id, status, requester_id, proposed_date, end_date
       FROM car_requests
       WHERE id=$1 AND deleted_at IS NULL
       FOR UPDATE`,
      [id]
    );
    const row = cur.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    if (role === 'DEMANDEUR') {
      if (row.requester_id !== req.user.id) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
      if (row.status !== 'SUBMITTED') {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(403).json({ error: 'BAD_STATUS' });
      }
    } else if (['ADMIN', 'LOGISTIQUE'].includes(role)) {
      if (!['SUBMITTED', 'RAF_APPROVED'].includes(row.status)) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(403).json({ error: 'BAD_STATUS' });
      }
    } else {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    if (row.status === 'RAF_APPROVED') {
      const allowed = new Set([
        'actual_out_time', 'actual_return_time',
        'odometer_start', 'odometer_end',
        'fuel_level_start', 'fuel_level_end'
      ]);
      for (const key of Object.keys(data)) {
        if (!allowed.has(key)) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return res.status(403).json({ error: 'FORBIDDEN_FIELD', field: key });
        }
      }
    }

    const currentStart = String(row.proposed_date || '').slice(0, 10);
    const currentEnd = String(row.end_date || currentStart || '').slice(0, 10);
    const nextStart = isYmd(data.proposed_date) ? data.proposed_date : currentStart;
    const nextEnd = isYmd(data.end_date) ? data.end_date : currentEnd;

    if ((data.proposed_date || data.end_date) && (!isYmd(nextStart) || !isYmd(nextEnd) || !ymdGte(nextEnd, nextStart))) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(400).json({ error: 'VALIDATION', details: { end_date: ['end_date doit être >= proposed_date'] } });
    }

    const set = [];
    const values = [];
    let idx = 2;
    const auditChanges = { ...data };

    if (data.proposed_date || data.end_date) {
      set.push(`proposed_date=$${idx++}`); values.push(nextStart);
      set.push(`end_date=$${idx++}`); values.push(nextEnd);
      delete data.proposed_date;
      delete data.end_date;
    }
    for (const [key, value] of Object.entries(data)) {
      set.push(`${key}=$${idx++}`);
      values.push(value === '' ? null : value);
    }
    set.push('updated_at=now()');

    const updated = await client.query(
      `UPDATE car_requests SET ${set.join(', ')} WHERE id=$1 AND deleted_at IS NULL RETURNING *`,
      [id, ...values]
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    await auditLog({
      actorId: req.user.id,
      action: 'UPDATE_CAR_REQUEST',
      targetUserId: updatedRow.requester_id,
      meta: { requestId: id, changes: auditChanges },
      db: client,
      required: true
    });

    await client.query('COMMIT');
    transactionOpen = false;
    return res.json({ request: updatedRow });
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { list, getOne, create, update, logisticsApprove, rafApprove, reject, cancel, softDelete };
