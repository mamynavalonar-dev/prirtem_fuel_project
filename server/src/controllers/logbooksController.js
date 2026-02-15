const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const { pool } = require('../db');
const crypto = require('crypto');


const createSchema = z.object({
  vehicle_id: z.string().uuid(),
  period_start: z.string().min(1),
  period_end: z.string().min(1),
  objet: z.string().optional().nullable(),
  logbook_type: z.enum(['SERVICE', 'MISSION']).optional().default('SERVICE'),
});

const updateSchema = z.object({
  period_start: z.string().min(1),
  period_end: z.string().min(1),
  objet: z.string().optional().nullable(),
  logbook_type: z.enum(['SERVICE', 'MISSION']).optional(),
});

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

  // basic check
  if (ymd(body.period_end) < ymd(body.period_start)) {
    return res.status(400).json({ error: 'La date de fin doit être >= la date de début' });
  }

  const id = crypto.randomUUID ? crypto.randomUUID() : require('uuid').v4();
  const createdBy = req.user.id;

  const insert = `
    INSERT INTO car_logbooks (
      id, vehicle_id, period_start, period_end, objet,
      service_km, mission_km, chauffeur_signature,
      status, created_by, submitted_at, locked_at, locked_by,
      logbook_type
    )
    VALUES (
      $1,$2,$3,$4,$5,
      0,0,NULL,
      'DRAFT',$6,NULL,NULL,NULL,
      $7
    )
    RETURNING *
  `;

  const { rows } = await pool.query(insert, [
    id,
    body.vehicle_id,
    body.period_start,
    body.period_end,
    body.objet || null,
    createdBy,
    body.logbook_type || 'SERVICE',
  ]);

  res.json({ item: rows[0] });
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

  res.json({ item, trips: trips.rows, supplies: supplies.rows });
});

exports.update = asyncHandler(async (req, res) => {
  if (!requireManageRole(req, res)) return;

  const { id } = req.params;
  const body = updateSchema.parse(req.body);

  const check = await pool.query(`SELECT id, status FROM car_logbooks WHERE id=$1 AND deleted_at IS NULL`, [id]);
  const current = check.rows[0];
  if (!current) return res.status(404).json({ error: 'Introuvable' });
  if (current.status === 'LOCKED') return res.status(400).json({ error: 'Journal verrouillé' });

  await pool.query(
    `
    UPDATE car_logbooks
    SET period_start=$2, period_end=$3, objet=$4,
        logbook_type = COALESCE($5, logbook_type)
    WHERE id=$1
    `,
    [id, body.period_start, body.period_end, body.objet || null, body.logbook_type || null]
  );

  res.json({ ok: true });
});

exports.replaceTrips = asyncHandler(async (req, res) => {
  if (!requireManageRole(req, res)) return;

  const { id } = req.params;

  const check = await pool.query(`SELECT id, status FROM car_logbooks WHERE id=$1 AND deleted_at IS NULL`, [id]);
  const current = check.rows[0];
  if (!current) return res.status(404).json({ error: 'Introuvable' });
  if (current.status === 'LOCKED') return res.status(400).json({ error: 'Journal verrouillé' });

  const trips = Array.isArray(req.body?.trips) ? req.body.trips : [];

  await pool.query('BEGIN');
  try {
    await pool.query(`DELETE FROM car_logbook_trips WHERE logbook_id=$1`, [id]);

    for (const t of trips) {
      const rowId = crypto.randomUUID ? crypto.randomUUID() : require('uuid').v4();
      await pool.query(
        `
        INSERT INTO car_logbook_trips(
          id, logbook_id, trip_date,
          depart_time, depart_km,
          route_start, route_end,
          parking_place, parking_duration_min,
          arrival_time, arrival_km,
          passengers, emargement,
          is_mission, mission_label,
          row_order
        )
        VALUES (
          $1,$2,$3,
          $4,$5,
          $6,$7,
          $8,$9,
          $10,$11,
          $12,$13,
          $14,$15,
          $16
        )
        `,
        [
          rowId,
          id,
          t.trip_date,
          t.depart_time || null,
          t.depart_km ?? null,
          t.route_start || null,
          t.route_end || null,
          t.parking_place || null,
          t.parking_duration_min ?? null,
          t.arrival_time || null,
          t.arrival_km ?? null,
          t.passengers || null,
          t.emargement || null,
          !!t.is_mission,
          t.mission_label || null,
          Number(t.row_order || 0),
        ]
      );
    }

    await pool.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
});

exports.replaceSupplies = asyncHandler(async (req, res) => {
  if (!requireManageRole(req, res)) return;

  const { id } = req.params;

  const check = await pool.query(`SELECT id, status FROM car_logbooks WHERE id=$1 AND deleted_at IS NULL`, [id]);
  const current = check.rows[0];
  if (!current) return res.status(404).json({ error: 'Introuvable' });
  if (current.status === 'LOCKED') return res.status(400).json({ error: 'Journal verrouillé' });

  const supplies = Array.isArray(req.body?.supplies) ? req.body.supplies : [];

  await pool.query('BEGIN');
  try {
    await pool.query(`DELETE FROM car_logbook_fuel_supplies WHERE logbook_id=$1`, [id]);

    for (const s of supplies) {
      const rowId = crypto.randomUUID ? crypto.randomUUID() : require('uuid').v4();
      await pool.query(
        `
        INSERT INTO car_logbook_fuel_supplies(
          id, logbook_id, supply_date, compteur_km, liters, montant_ar
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [
          rowId,
          id,
          s.supply_date,
          Number(s.compteur_km || 0),
          Number(s.liters || 0),
          Number(s.montant_ar || 0),
        ]
      );
    }

    await pool.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
});

exports.submit = asyncHandler(async (req, res) => {
  if (!requireManageRole(req, res)) return;

  const { id } = req.params;

  const { rows } = await pool.query(
    `UPDATE car_logbooks
     SET status='SUBMITTED', submitted_at=NOW()
     WHERE id=$1 AND deleted_at IS NULL AND status='DRAFT'
     RETURNING id`,
    [id]
  );

  if (!rows[0]) return res.status(400).json({ error: 'Transition impossible' });
  res.json({ ok: true });
});

exports.lock = asyncHandler(async (req, res) => {
  if (!requireManageRole(req, res)) return;

  const { id } = req.params;

  const { rows } = await pool.query(
    `UPDATE car_logbooks
     SET status='LOCKED', locked_at=NOW(), locked_by=$2
     WHERE id=$1 AND deleted_at IS NULL AND status='SUBMITTED'
     RETURNING id`,
    [id, req.user.id]
  );

  if (!rows[0]) return res.status(400).json({ error: 'Transition impossible' });
  res.json({ ok: true });
});

/** ✅ Soft delete (corbeille) */
exports.softDelete = asyncHandler(async (req, res) => {
  if (!requireManageRole(req, res)) return;

  const { id } = req.params;

  const { rows } = await pool.query(
    `
    UPDATE car_logbooks
    SET deleted_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id
    `,
    [id]
  );

  if (!rows[0]) return res.status(404).json({ error: 'Introuvable' });
  res.json({ ok: true });
});
