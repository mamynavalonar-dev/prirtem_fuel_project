const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const { pool } = require('../db');
const crypto = require('crypto');
const { auditLog } = require('../utils/audit');
const { auditedMutation } = require('../utils/auditedMutation');

const createSchema = z.object({
  vehicle_id: z.string().uuid(),
  period_start: z.string().min(1),
  period_end: z.string().min(1),
  objet: z.string().optional().nullable(),
  logbook_type: z.enum(['SERVICE', 'MISSION']).optional().default('SERVICE'),
});

// ✅ update partiel (match client)
const updateSchema = z.object({
  period_start: z.string().min(1).optional(),
  period_end: z.string().min(1).optional(),
  objet: z.string().optional().nullable(),
  chauffeur_signature: z.string().optional().nullable(),
  service_km: z.coerce.number().int().nonnegative().optional(),
  mission_km: z.coerce.number().int().nonnegative().optional(),
  logbook_type: z.enum(['SERVICE', 'MISSION']).optional(),
});

const tripsSchema = z.array(z.object({
  trip_date: z.string().min(4),
  depart_time: z.string().optional().nullable(),
  depart_km: z.coerce.number().int().nonnegative().optional().nullable(),
  route_start: z.string().optional().nullable(),
  route_end: z.string().optional().nullable(),
  parking_place: z.string().optional().nullable(),
  parking_duration_min: z.coerce.number().int().nonnegative().optional().nullable(),
  arrival_time: z.string().optional().nullable(),
  arrival_km: z.coerce.number().int().nonnegative().optional().nullable(),
  passengers: z.string().optional().nullable(),
  emargement: z.string().optional().nullable(),
  is_mission: z.boolean().optional(),
  mission_label: z.string().optional().nullable(),
  row_order: z.coerce.number().int().nonnegative()
}).strict()).max(500);

const suppliesSchema = z.array(z.object({
  supply_date: z.string().min(4),
  compteur_km: z.coerce.number().int().nonnegative(),
  liters: z.coerce.number().positive(),
  montant_ar: z.coerce.number().int().nonnegative()
}).strict()).max(200);

function requireManageRole(req, res) {
  const role = req.user?.role;
  if (!['ADMIN', 'LOGISTIQUE'].includes(role)) {
    res.status(403).json({ error: 'Accès refusé' });
    return false;
  }
  return true;
}

function ymd(s) {
  return String(s).slice(0, 10);
}

function toNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v);
  return s.trim() === '' ? null : s;
}

exports.list = asyncHandler(async (req, res) => {
  // roles allowed: LOGISTIQUE/ADMIN (manage) + RAF (read)
  const role = req.user?.role;
  if (!['ADMIN', 'LOGISTIQUE', 'RAF'].includes(role)) {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  const { vehicle_id, status, type, from, to, q } = req.query;

  const params = [];
  let where = `WHERE cl.deleted_at IS NULL`;

  if (vehicle_id) {
    params.push(vehicle_id);
    where += ` AND cl.vehicle_id = $${params.length}`;
  }

  if (status) {
    params.push(status);
    where += ` AND cl.status = $${params.length}`;
  }

  if (type) {
    params.push(type);
    where += ` AND cl.logbook_type = $${params.length}`;
  }

  if (from) {
    params.push(from);
    where += ` AND cl.period_start >= $${params.length}`;
  }

  if (to) {
    params.push(to);
    where += ` AND cl.period_end <= $${params.length}`;
  }

  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    where += ` AND (
      v.plate ILIKE ${p}
      OR COALESCE(cl.objet,'') ILIKE ${p}
      OR cl.status::text ILIKE ${p}
      OR cl.logbook_type::text ILIKE ${p}
    )`;
  }

  const sql = `
    SELECT
      cl.*,
      v.plate
    FROM car_logbooks cl
    JOIN vehicles v ON v.id = cl.vehicle_id
    ${where}
    ORDER BY cl.period_start DESC, cl.created_at DESC
    LIMIT 500
  `;

  const { rows } = await pool.query(sql, params);
  res.json({ items: rows });
});

exports.create = asyncHandler(async (req, res) => {
  if (!requireManageRole(req, res)) return;

  const body = createSchema.parse(req.body);
  if (ymd(body.period_end) < ymd(body.period_start)) {
    return res.status(400).json({ error: 'La date de fin doit être >= la date de début' });
  }

  const id = crypto.randomUUID ? crypto.randomUUID() : require('uuid').v4();
  const createdBy = req.user.id;
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const { rows } = await client.query(
      `INSERT INTO car_logbooks (
        id, vehicle_id, period_start, period_end, objet,
        service_km, mission_km, chauffeur_signature,
        status, created_by, submitted_at, locked_at, locked_by,
        logbook_type
      ) VALUES (
        $1,$2,$3,$4,$5,
        0,0,NULL,
        'DRAFT',$6,NULL,NULL,NULL,
        $7
      )
      RETURNING *`,
      [id, body.vehicle_id, body.period_start, body.period_end, toNull(body.objet), createdBy, body.logbook_type || 'SERVICE']
    );

    await auditLog({
      actorId: req.user.id,
      action: 'CREATE_LOGBOOK',
      targetUserId: createdBy,
      meta: { logbookId: id, vehicleId: body.vehicle_id },
      db: client,
      required: true
    });

    await client.query('COMMIT');
    transactionOpen = false;
    return res.json({ item: rows[0] });
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

exports.getOne = asyncHandler(async (req, res) => {
  const role = req.user?.role;
  if (!['ADMIN', 'LOGISTIQUE', 'RAF'].includes(role)) {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  const { id } = req.params;

  const { rows } = await pool.query(
    `
    SELECT cl.*, v.plate
    FROM car_logbooks cl
    JOIN vehicles v ON v.id = cl.vehicle_id
    WHERE cl.id = $1 AND cl.deleted_at IS NULL
    `,
    [id]
  );

  const item = rows[0];
  if (!item) return res.status(404).json({ error: 'Introuvable' });

  const trips = await pool.query(
    `SELECT * FROM car_logbook_trips WHERE logbook_id = $1 ORDER BY row_order ASC`,
    [id]
  );
  const supplies = await pool.query(
    `SELECT * FROM car_logbook_fuel_supplies WHERE logbook_id = $1 ORDER BY supply_date ASC`,
    [id]
  );

  // ✅ compat client: logbook + compat historique: item
  res.json({ logbook: item, item, trips: trips.rows, supplies: supplies.rows });
});

exports.update = asyncHandler(async (req, res) => {
  if (!requireManageRole(req, res)) return;

  const { id } = req.params;
  const body = updateSchema.parse(req.body || {});
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const check = await client.query(
      `SELECT * FROM car_logbooks WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    const current = check.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(404).json({ error: 'Introuvable' });
    }
    if (current.status === 'LOCKED') {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(400).json({ error: 'Journal verrouillé' });
    }

    const nextPeriodStart = body.period_start ?? ymd(current.period_start);
    const nextPeriodEnd = body.period_end ?? ymd(current.period_end);
    if (ymd(nextPeriodEnd) < ymd(nextPeriodStart)) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(400).json({ error: 'La date de fin doit être >= la date de début' });
    }
    if (body.logbook_type && current.status !== 'DRAFT' && body.logbook_type !== current.logbook_type) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(400).json({ error: 'Type modifiable uniquement en DRAFT' });
    }

    const nextType = body.logbook_type ?? current.logbook_type;
    const nextObjet = (body.objet !== undefined) ? toNull(body.objet) : current.objet;
    const nextSign = (body.chauffeur_signature !== undefined) ? toNull(body.chauffeur_signature) : current.chauffeur_signature;
    const nextServiceKm = (body.service_km !== undefined) ? Number(body.service_km) : Number(current.service_km || 0);
    const nextMissionKm = (body.mission_km !== undefined) ? Number(body.mission_km) : Number(current.mission_km || 0);

    const { rows: updated } = await client.query(
      `UPDATE car_logbooks
       SET period_start=$2, period_end=$3, objet=$4, chauffeur_signature=$5,
           service_km=$6, mission_km=$7, logbook_type=$8, updated_at=NOW()
       WHERE id=$1 AND deleted_at IS NULL AND status<>'LOCKED'
       RETURNING *`,
      [id, nextPeriodStart, nextPeriodEnd, nextObjet, nextSign, nextServiceKm, nextMissionKm, nextType]
    );
    if (!updated[0]) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(409).json({ error: 'Journal verrouillé' });
    }

    await auditLog({
      actorId: req.user.id,
      action: 'UPDATE_LOGBOOK',
      targetUserId: current.created_by,
      meta: { logbookId: id, changes: body },
      db: client,
      required: true
    });

    await client.query('COMMIT');
    transactionOpen = false;
    return res.json({ ok: true });
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

exports.replaceTrips = asyncHandler(async (req, res) => {
  if (!requireManageRole(req, res)) return;

  const { id } = req.params;
  const parsedTrips = tripsSchema.safeParse(req.body?.trips || []);
  if (!parsedTrips.success) return res.status(400).json({ error: 'VALIDATION', details: parsedTrips.error.flatten() });
  const trips = parsedTrips.data;
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const check = await client.query(
      `SELECT id, created_by FROM car_logbooks WHERE id=$1 AND deleted_at IS NULL AND status<>'LOCKED' FOR UPDATE`,
      [id]
    );
    if (!check.rows[0]) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(409).json({ error: 'Introuvable ou journal verrouillé' });
    }
    await client.query(`DELETE FROM car_logbook_trips WHERE logbook_id=$1`, [id]);

    for (const t of trips) {
      const rowId = crypto.randomUUID ? crypto.randomUUID() : require('uuid').v4();
      await client.query(
        `INSERT INTO car_logbook_trips(
          id, logbook_id, trip_date, depart_time, depart_km,
          route_start, route_end, parking_place, parking_duration_min,
          arrival_time, arrival_km, passengers, emargement,
          is_mission, mission_label, row_order
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [rowId, id, t.trip_date, t.depart_time || null, t.depart_km ?? null,
         t.route_start || null, t.route_end || null, t.parking_place || null, t.parking_duration_min ?? null,
         t.arrival_time || null, t.arrival_km ?? null, t.passengers || null, t.emargement || null,
         !!t.is_mission, t.mission_label || null, Number(t.row_order || 0)]
      );
    }

    await auditLog({
      actorId: req.user.id,
      action: 'REPLACE_LOGBOOK_TRIPS',
      targetUserId: check.rows[0].created_by,
      meta: { logbookId: id, count: trips.length },
      db: client,
      required: true
    });
    await client.query('COMMIT');
    transactionOpen = false;
    return res.json({ ok: true });
  } catch (e) {
    if (transactionOpen) await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

exports.replaceSupplies = asyncHandler(async (req, res) => {
  if (!requireManageRole(req, res)) return;

  const { id } = req.params;
  const parsedSupplies = suppliesSchema.safeParse(req.body?.supplies || []);
  if (!parsedSupplies.success) return res.status(400).json({ error: 'VALIDATION', details: parsedSupplies.error.flatten() });
  const supplies = parsedSupplies.data;
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const check = await client.query(
      `SELECT id, created_by FROM car_logbooks WHERE id=$1 AND deleted_at IS NULL AND status<>'LOCKED' FOR UPDATE`,
      [id]
    );
    if (!check.rows[0]) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(409).json({ error: 'Introuvable ou journal verrouillé' });
    }
    await client.query(`DELETE FROM car_logbook_fuel_supplies WHERE logbook_id=$1`, [id]);

    for (const supply of supplies) {
      const rowId = crypto.randomUUID ? crypto.randomUUID() : require('uuid').v4();
      await client.query(
        `INSERT INTO car_logbook_fuel_supplies(id, logbook_id, supply_date, compteur_km, liters, montant_ar)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [rowId, id, supply.supply_date, Number(supply.compteur_km || 0), Number(supply.liters || 0), Number(supply.montant_ar || 0)]
      );
    }

    await auditLog({
      actorId: req.user.id,
      action: 'REPLACE_LOGBOOK_SUPPLIES',
      targetUserId: check.rows[0].created_by,
      meta: { logbookId: id, count: supplies.length },
      db: client,
      required: true
    });
    await client.query('COMMIT');
    transactionOpen = false;
    return res.json({ ok: true });
  } catch (e) {
    if (transactionOpen) await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

exports.submit = asyncHandler(async (req, res) => {
  if (!requireManageRole(req, res)) return;
  const { id } = req.params;
  const row = await auditedMutation({
    sql: `UPDATE car_logbooks
          SET status='SUBMITTED', submitted_at=NOW(), updated_at=NOW()
          WHERE id=$1 AND deleted_at IS NULL AND status='DRAFT'
          RETURNING id, created_by`,
    params: [id],
    actorId: req.user.id,
    action: 'SUBMIT_LOGBOOK',
    targetUserId: (item) => item.created_by,
    meta: { logbookId: id, newStatus: 'SUBMITTED' }
  });
  if (!row) return res.status(400).json({ error: 'Transition impossible' });
  return res.json({ ok: true });
});

exports.lock = asyncHandler(async (req, res) => {
  if (!requireManageRole(req, res)) return;
  const { id } = req.params;
  const row = await auditedMutation({
    sql: `UPDATE car_logbooks
          SET status='LOCKED', locked_at=NOW(), locked_by=$2, updated_at=NOW()
          WHERE id=$1 AND deleted_at IS NULL AND status='SUBMITTED'
          RETURNING id, created_by`,
    params: [id, req.user.id],
    actorId: req.user.id,
    action: 'LOCK_LOGBOOK',
    targetUserId: (item) => item.created_by,
    meta: { logbookId: id, newStatus: 'LOCKED' }
  });
  if (!row) return res.status(400).json({ error: 'Transition impossible' });
  return res.json({ ok: true });
});

/** ✅ Soft delete (corbeille) */
exports.softDelete = asyncHandler(async (req, res) => {
  if (!requireManageRole(req, res)) return;
  const { id } = req.params;
  const row = await auditedMutation({
    sql: `UPDATE car_logbooks
          SET deleted_at=NOW(), deleted_by=$2, updated_at=NOW()
          WHERE id=$1 AND deleted_at IS NULL
          RETURNING id, created_by`,
    params: [id, req.user.id],
    actorId: req.user.id,
    action: 'SOFT_DELETE_LOGBOOK',
    targetUserId: (item) => item.created_by,
    meta: { logbookId: id }
  });
  if (!row) return res.status(404).json({ error: 'Introuvable' });
  return res.json({ ok: true });
});
