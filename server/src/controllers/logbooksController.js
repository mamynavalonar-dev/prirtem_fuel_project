const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');

const createSchema = z.object({
  vehicle_id: z.string().uuid(),
  period_start: z.string().min(4),
  period_end: z.string().min(4),
  objet: z.string().optional().nullable()
});

async function list(req, res) {
  const role = req.user.role;
  const params = [];
  let sql = `SELECT cl.*, v.plate, v.label
             FROM car_logbooks cl
             JOIN vehicles v ON v.id=cl.vehicle_id`;
  // RAF can read; Demandeur can read none by default
  if (role === 'DEMANDEUR') {
    return res.json({ logbooks: [] });
  }
  sql += ' ORDER BY cl.period_start DESC, v.plate ASC LIMIT 500';
  const { rows } = await pool.query(sql, params);
  res.json({ logbooks: rows });
}

async function create(req, res) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  if (!['LOGISTIQUE', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });

  const id = uuidv4();
  const d = parsed.data;
  await pool.query(
    `INSERT INTO car_logbooks (id, vehicle_id, period_start, period_end, objet, status, created_by)
     VALUES ($1,$2,$3,$4,$5,'DRAFT',$6)`,
    [id, d.vehicle_id, d.period_start, d.period_end, d.objet || null, req.user.id]
  );
  const { rows } = await pool.query(
    `SELECT cl.*, v.plate, v.label
     FROM car_logbooks cl JOIN vehicles v ON v.id=cl.vehicle_id
     WHERE cl.id=$1`,
    [id]
  );
  res.json({ logbook: rows[0] });
}

async function getOne(req, res) {
  const { id } = req.params;
  const role = req.user.role;
  if (role === 'DEMANDEUR') return res.status(403).json({ error: 'FORBIDDEN' });

  const bookRes = await pool.query(
    `SELECT cl.*, v.plate, v.label
     FROM car_logbooks cl JOIN vehicles v ON v.id=cl.vehicle_id
     WHERE cl.id=$1`,
    [id]
  );
  const book = bookRes.rows[0];
  if (!book) return res.status(404).json({ error: 'NOT_FOUND' });

  const tripsRes = await pool.query(
    `SELECT * FROM car_logbook_trips WHERE logbook_id=$1 ORDER BY row_order ASC, created_at ASC`,
    [id]
  );
  const supRes = await pool.query(
    `SELECT * FROM car_logbook_fuel_supplies WHERE logbook_id=$1 ORDER BY supply_date ASC, created_at ASC`,
    [id]
  );

  res.json({ logbook: book, trips: tripsRes.rows, supplies: supRes.rows });
}

const updateSchema = z.object({
  objet: z.string().optional().nullable(),
  service_km: z.number().int().nonnegative().optional(),
  mission_km: z.number().int().nonnegative().optional(),
  chauffeur_signature: z.string().optional().nullable()
});

async function update(req, res) {
  const { id } = req.params;
  if (!['LOGISTIQUE', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });

  const d = parsed.data;
  const { rows } = await pool.query(
    `UPDATE car_logbooks
     SET objet=COALESCE($2, objet),
         service_km=COALESCE($3, service_km),
         mission_km=COALESCE($4, mission_km),
         chauffeur_signature=COALESCE($5, chauffeur_signature),
         updated_at=now()
     WHERE id=$1 AND status IN ('DRAFT','SUBMITTED')
     RETURNING *`,
    [id, d.objet ?? null, d.service_km ?? null, d.mission_km ?? null, d.chauffeur_signature ?? null]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_LOCKED' });
  res.json({ logbook: rows[0] });
}

const tripSchema = z.object({
  trip_date: z.string().min(4),
  depart_time: z.string().optional().nullable(),
  depart_km: z.number().int().optional().nullable(),
  route_start: z.string().optional().nullable(),
  route_end: z.string().optional().nullable(),
  parking_place: z.string().optional().nullable(),
  parking_duration_min: z.number().int().optional().nullable(),
  arrival_time: z.string().optional().nullable(),
  arrival_km: z.number().int().optional().nullable(),
  passengers: z.string().optional().nullable(),
  emargement: z.string().optional().nullable(),
  is_mission: z.boolean().optional(),
  mission_label: z.string().optional().nullable(),
  row_order: z.number().int()
});

async function replaceTrips(req, res) {
  const { id } = req.params;
  if (!['LOGISTIQUE', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });

  const trips = Array.isArray(req.body?.trips) ? req.body.trips : [];
  const parsed = z.array(tripSchema).safeParse(trips);
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const statusRes = await client.query('SELECT status FROM car_logbooks WHERE id=$1', [id]);
    if (!statusRes.rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
    if (statusRes.rows[0].status === 'LOCKED') return res.status(409).json({ error: 'LOCKED' });

    await client.query('DELETE FROM car_logbook_trips WHERE logbook_id=$1', [id]);
    for (const t of parsed.data) {
      await client.query(
        `INSERT INTO car_logbook_trips (
          id, logbook_id, trip_date, depart_time, depart_km, route_start, route_end,
          parking_place, parking_duration_min, arrival_time, arrival_km,
          passengers, emargement, is_mission, mission_label, row_order
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          uuidv4(),
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
          t.row_order
        ]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

const supplySchema = z.object({
  supply_date: z.string().min(4),
  compteur_km: z.number().int(),
  liters: z.number(),
  montant_ar: z.number().int().nonnegative()
});

async function replaceSupplies(req, res) {
  const { id } = req.params;
  if (!['LOGISTIQUE', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });

  const supplies = Array.isArray(req.body?.supplies) ? req.body.supplies : [];
  const parsed = z.array(supplySchema).safeParse(supplies);
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const statusRes = await client.query('SELECT status FROM car_logbooks WHERE id=$1', [id]);
    if (!statusRes.rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
    if (statusRes.rows[0].status === 'LOCKED') return res.status(409).json({ error: 'LOCKED' });

    await client.query('DELETE FROM car_logbook_fuel_supplies WHERE logbook_id=$1', [id]);
    for (const s of parsed.data) {
      await client.query(
        `INSERT INTO car_logbook_fuel_supplies (id, logbook_id, supply_date, compteur_km, liters, montant_ar)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [uuidv4(), id, s.supply_date, s.compteur_km, s.liters, s.montant_ar]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function submit(req, res) {
  const { id } = req.params;
  if (!['LOGISTIQUE', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });
  const { rows } = await pool.query(
    `UPDATE car_logbooks
     SET status='SUBMITTED', submitted_at=now(), updated_at=now()
     WHERE id=$1 AND status='DRAFT'
     RETURNING *`,
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });
  res.json({ logbook: rows[0] });
}

async function lock(req, res) {
  const { id } = req.params;
  if (!['LOGISTIQUE', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });
  const { rows } = await pool.query(
    `UPDATE car_logbooks
     SET status='LOCKED', locked_at=now(), locked_by=$2, updated_at=now()
     WHERE id=$1 AND status IN ('DRAFT','SUBMITTED')
     RETURNING *`,
    [id, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND_OR_BAD_STATUS' });
  res.json({ logbook: rows[0] });
}

module.exports = { list, create, getOne, update, replaceTrips, replaceSupplies, submit, lock };
