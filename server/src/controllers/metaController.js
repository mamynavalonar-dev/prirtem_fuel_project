// server/src/controllers/metaController.js
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');

function toNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function normalizePlate(p) {
  if (!p) return '';
  return String(p).replace(/\s+/g, '').toUpperCase();
}

function safeNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = obj?.[k];
  return out;
}

// ===================== VEHICLES =====================
const vehicleSchema = z.object({
  plate: z.string().min(3),
  label: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  energy_type: z.string().optional().nullable(),
  seats: z.coerce.number().int().min(1).max(200).optional().nullable(),
  is_active: z.coerce.boolean().optional(),

  vehicle_type: z.string().optional().nullable(),
  tank_capacity_l: z.coerce.number().nonnegative().optional().nullable(),
  ref_consumption_l_100: z.coerce.number().nonnegative().optional().nullable(),
  last_service_at: z.string().optional().nullable(),
  next_service_at: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

const VEHICLE_KEYS = [
  'plate',
  'label',
  'brand',
  'model',
  'energy_type',
  'seats',
  'is_active',
  'vehicle_type',
  'tank_capacity_l',
  'ref_consumption_l_100',
  'last_service_at',
  'next_service_at',
  'notes'
];

async function listVehicles(req, res) {
  const { rows } = await pool.query(
    `
    SELECT
      v.id, v.plate, v.label, v.brand, v.model, v.energy_type, v.seats,
      v.vehicle_type, v.tank_capacity_l, v.ref_consumption_l_100,
      v.last_service_at, v.next_service_at, v.notes,
      v.is_active, v.created_at, v.updated_at,

      d.id AS driver_id,
      d.full_name AS driver_name

    FROM vehicles v
    LEFT JOIN driver_vehicle_assignments a
      ON a.vehicle_id = v.id
     AND a.end_at IS NULL
     AND a.deleted_at IS NULL
    LEFT JOIN drivers d
      ON d.id = a.driver_id
     AND d.deleted_at IS NULL

    WHERE v.deleted_at IS NULL
    ORDER BY v.plate ASC
    `
  );
  res.json({ vehicles: rows });
}

async function createVehicle(req, res) {
  const parsed = vehicleSchema.safeParse({
    ...pick(req.body, VEHICLE_KEYS),
    plate: normalizePlate(req.body?.plate),
    label: toNull(req.body?.label),
    brand: toNull(req.body?.brand),
    model: toNull(req.body?.model),
    energy_type: toNull(req.body?.energy_type),
    vehicle_type: toNull(req.body?.vehicle_type),
    notes: toNull(req.body?.notes),
    seats: req.body?.seats === '' ? null : req.body?.seats,
    tank_capacity_l: req.body?.tank_capacity_l === '' ? null : req.body?.tank_capacity_l,
    ref_consumption_l_100: req.body?.ref_consumption_l_100 === '' ? null : req.body?.ref_consumption_l_100,
    last_service_at: toNull(req.body?.last_service_at),
    next_service_at: toNull(req.body?.next_service_at),
    is_active: req.body?.is_active ?? true
  });

  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const v = parsed.data;
  const id = uuidv4();

  const seats = v.seats ?? 5;

  const { rows } = await pool.query(
    `
    INSERT INTO vehicles (
      id, plate, label, brand, model, energy_type, seats, is_active,
      vehicle_type, tank_capacity_l, ref_consumption_l_100, last_service_at, next_service_at, notes
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING *
    `,
    [
      id,
      normalizePlate(v.plate),
      toNull(v.label),
      toNull(v.brand),
      toNull(v.model),
      toNull(v.energy_type),
      seats,
      v.is_active ?? true,
      toNull(v.vehicle_type),
      safeNum(v.tank_capacity_l),
      safeNum(v.ref_consumption_l_100),
      toNull(v.last_service_at),
      toNull(v.next_service_at),
      toNull(v.notes)
    ]
  );

  res.json({ vehicle: rows[0] });
}

async function updateVehicle(req, res) {
  const { id } = req.params;

  const current = await pool.query(
    `SELECT * FROM vehicles WHERE id=$1 AND deleted_at IS NULL`,
    [id]
  );
  if (!current.rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });

  const merged = {
    ...current.rows[0],
    ...pick(req.body, VEHICLE_KEYS)
  };

  // Nettoyage
  merged.plate = normalizePlate(merged.plate);
  merged.label = toNull(merged.label);
  merged.brand = toNull(merged.brand);
  merged.model = toNull(merged.model);
  merged.energy_type = toNull(merged.energy_type);
  merged.vehicle_type = toNull(merged.vehicle_type);
  merged.notes = toNull(merged.notes);
  merged.last_service_at = toNull(merged.last_service_at);
  merged.next_service_at = toNull(merged.next_service_at);
  merged.seats = merged.seats === '' ? null : merged.seats;
  merged.tank_capacity_l = merged.tank_capacity_l === '' ? null : merged.tank_capacity_l;
  merged.ref_consumption_l_100 = merged.ref_consumption_l_100 === '' ? null : merged.ref_consumption_l_100;

  const parsed = vehicleSchema.safeParse(merged);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const v = parsed.data;
  const seats = v.seats ?? current.rows[0].seats ?? 5;

  const { rows } = await pool.query(
    `
    UPDATE vehicles
    SET
      plate=$2,
      label=$3,
      brand=$4,
      model=$5,
      energy_type=$6,
      seats=$7,
      is_active=$8,
      vehicle_type=$9,
      tank_capacity_l=$10,
      ref_consumption_l_100=$11,
      last_service_at=$12,
      next_service_at=$13,
      notes=$14,
      updated_at=now()
    WHERE id=$1 AND deleted_at IS NULL
    RETURNING *
    `,
    [
      id,
      normalizePlate(v.plate),
      toNull(v.label),
      toNull(v.brand),
      toNull(v.model),
      toNull(v.energy_type),
      seats,
      v.is_active ?? current.rows[0].is_active ?? true,
      toNull(v.vehicle_type),
      safeNum(v.tank_capacity_l),
      safeNum(v.ref_consumption_l_100),
      toNull(v.last_service_at),
      toNull(v.next_service_at),
      toNull(v.notes)
    ]
  );

  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ vehicle: rows[0] });
}

async function deleteVehicle(req, res) {
  const { id } = req.params;
  await pool.query(`UPDATE vehicles SET deleted_at=now(), deleted_by=$2 WHERE id=$1`, [id, req.user?.id || null]);

  // (Optionnel) Marque aussi les affectations liées comme supprimées logiquement
  await pool.query(
    `UPDATE driver_vehicle_assignments SET deleted_at=now() WHERE vehicle_id=$1 AND deleted_at IS NULL`,
    [id]
  );

  res.json({ ok: true });
}

// ===================== DRIVERS =====================
const driverSchema = z.object({
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  full_name: z.string().optional().nullable(),

  phone: z.string().optional().nullable(),
  matricule: z.string().optional().nullable(),
  license_no: z.string().optional().nullable(),
  license_expiry: z.string().optional().nullable(),
  cin: z.string().optional().nullable(),
  address: z.string().optional().nullable(),

  is_active: z.coerce.boolean().optional()
}).superRefine((val, ctx) => {
  const fn = toNull(val.first_name);
  const ln = toNull(val.last_name);
  const full = toNull(val.full_name);

  if (!full && !(fn && ln)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Nom/Prénom ou Nom complet requis'
    });
  }
});

const DRIVER_KEYS = [
  'first_name',
  'last_name',
  'full_name',
  'phone',
  'matricule',
  'license_no',
  'license_expiry',
  'cin',
  'address',
  'is_active'
];

function buildFullName(d) {
  const full = toNull(d.full_name);
  const fn = toNull(d.first_name);
  const ln = toNull(d.last_name);

  if (fn && ln) return `${fn} ${ln}`.trim();
  if (full) return full.trim();
  return '';
}

async function listDrivers(req, res) {
  const { rows } = await pool.query(
    `
    SELECT
      d.id,
      d.first_name, d.last_name, d.full_name,
      d.phone, d.matricule,
      d.license_no, d.license_expiry,
      d.cin, d.address,
      d.is_active, d.created_at, d.updated_at,

      v.id AS vehicle_id,
      v.plate AS vehicle_plate

    FROM drivers d
    LEFT JOIN driver_vehicle_assignments a
      ON a.driver_id = d.id
     AND a.end_at IS NULL
     AND a.deleted_at IS NULL
    LEFT JOIN vehicles v
      ON v.id = a.vehicle_id
     AND v.deleted_at IS NULL

    WHERE d.deleted_at IS NULL
    ORDER BY COALESCE(d.full_name, d.last_name, d.first_name) ASC
    `
  );

  res.json({ drivers: rows });
}

async function createDriver(req, res) {
  const parsed = driverSchema.safeParse({
    ...pick(req.body, DRIVER_KEYS),
    first_name: toNull(req.body?.first_name),
    last_name: toNull(req.body?.last_name),
    full_name: toNull(req.body?.full_name),
    phone: toNull(req.body?.phone),
    matricule: toNull(req.body?.matricule),
    license_no: toNull(req.body?.license_no),
    license_expiry: toNull(req.body?.license_expiry),
    cin: toNull(req.body?.cin),
    address: toNull(req.body?.address),
    is_active: req.body?.is_active ?? true
  });

  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const d = parsed.data;
  const id = uuidv4();
  const full_name = buildFullName(d);

  const { rows } = await pool.query(
    `
    INSERT INTO drivers (
      id, first_name, last_name, full_name,
      phone, matricule, license_no, license_expiry, cin, address,
      is_active
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
    `,
    [
      id,
      toNull(d.first_name),
      toNull(d.last_name),
      toNull(full_name),
      toNull(d.phone),
      toNull(d.matricule),
      toNull(d.license_no),
      toNull(d.license_expiry),
      toNull(d.cin),
      toNull(d.address),
      d.is_active ?? true
    ]
  );

  res.json({ driver: rows[0] });
}

async function updateDriver(req, res) {
  const { id } = req.params;

  const current = await pool.query(
    `SELECT * FROM drivers WHERE id=$1 AND deleted_at IS NULL`,
    [id]
  );
  if (!current.rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });

  const merged = { ...current.rows[0], ...pick(req.body, DRIVER_KEYS) };

  merged.first_name = toNull(merged.first_name);
  merged.last_name = toNull(merged.last_name);
  merged.full_name = toNull(merged.full_name);
  merged.phone = toNull(merged.phone);
  merged.matricule = toNull(merged.matricule);
  merged.license_no = toNull(merged.license_no);
  merged.license_expiry = toNull(merged.license_expiry);
  merged.cin = toNull(merged.cin);
  merged.address = toNull(merged.address);

  const parsed = driverSchema.safeParse(merged);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const d = parsed.data;
  const full_name = buildFullName(d);

  const { rows } = await pool.query(
    `
    UPDATE drivers
    SET
      first_name=$2,
      last_name=$3,
      full_name=$4,
      phone=$5,
      matricule=$6,
      license_no=$7,
      license_expiry=$8,
      cin=$9,
      address=$10,
      is_active=$11,
      updated_at=now()
    WHERE id=$1 AND deleted_at IS NULL
    RETURNING *
    `,
    [
      id,
      toNull(d.first_name),
      toNull(d.last_name),
      toNull(full_name),
      toNull(d.phone),
      toNull(d.matricule),
      toNull(d.license_no),
      toNull(d.license_expiry),
      toNull(d.cin),
      toNull(d.address),
      d.is_active ?? current.rows[0].is_active ?? true
    ]
  );

  res.json({ driver: rows[0] });
}

async function deleteDriver(req, res) {
  const { id } = req.params;
  await pool.query(`UPDATE drivers SET deleted_at=now(), deleted_by=$2 WHERE id=$1`, [id, req.user?.id || null]);

  await pool.query(
    `UPDATE driver_vehicle_assignments SET deleted_at=now() WHERE driver_id=$1 AND deleted_at IS NULL`,
    [id]
  );

  res.json({ ok: true });
}

// ===================== ASSIGNMENTS =====================
const assignmentSchema = z.object({
  vehicle_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  start_at: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

async function listAssignments(req, res) {
  const vehicle_id = req.query.vehicle_id ? String(req.query.vehicle_id) : null;
  const driver_id = req.query.driver_id ? String(req.query.driver_id) : null;
  const activeOnly = String(req.query.active_only || '').toLowerCase();
  const onlyActive = activeOnly === '1' || activeOnly === 'true' || activeOnly === 'yes';

  const params = [];
  let where = `WHERE a.deleted_at IS NULL`;
  if (onlyActive) where += ` AND a.end_at IS NULL`;

  if (vehicle_id) {
    params.push(vehicle_id);
    where += ` AND a.vehicle_id=$${params.length}`;
  }
  if (driver_id) {
    params.push(driver_id);
    where += ` AND a.driver_id=$${params.length}`;
  }

  const { rows } = await pool.query(
    `
    SELECT
      a.id, a.vehicle_id, a.driver_id,
      a.start_at, a.end_at, a.notes, a.created_at,
      v.plate AS vehicle_plate,
      d.full_name AS driver_name
    FROM driver_vehicle_assignments a
    JOIN vehicles v ON v.id=a.vehicle_id
    JOIN drivers d ON d.id=a.driver_id
    ${where}
    ORDER BY a.start_at DESC
    LIMIT 500
    `,
    params
  );

  res.json({ assignments: rows });
}

async function createAssignment(req, res) {
  const parsed = assignmentSchema.safeParse({
    vehicle_id: req.body?.vehicle_id,
    driver_id: req.body?.driver_id,
    start_at: toNull(req.body?.start_at),
    notes: toNull(req.body?.notes)
  });

  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const { vehicle_id, driver_id, start_at, notes } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Vérif existence
    const v = await client.query(`SELECT id FROM vehicles WHERE id=$1 AND deleted_at IS NULL`, [vehicle_id]);
    if (!v.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'VEHICLE_NOT_FOUND' });
    }

    const d = await client.query(`SELECT id FROM drivers WHERE id=$1 AND deleted_at IS NULL`, [driver_id]);
    if (!d.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });
    }

    // Finir affectations actives (1 chauffeur <-> 1 véhicule actif)
    await client.query(
      `UPDATE driver_vehicle_assignments
       SET end_at=now()
       WHERE vehicle_id=$1 AND end_at IS NULL AND deleted_at IS NULL`,
      [vehicle_id]
    );

    await client.query(
      `UPDATE driver_vehicle_assignments
       SET end_at=now()
       WHERE driver_id=$1 AND end_at IS NULL AND deleted_at IS NULL`,
      [driver_id]
    );

    const id = uuidv4();
    const ins = await client.query(
      `
      INSERT INTO driver_vehicle_assignments (
        id, vehicle_id, driver_id, start_at, notes, created_by
      )
      VALUES ($1,$2,$3,COALESCE($4::timestamptz, now()),$5,$6)
      RETURNING *
      `,
      [id, vehicle_id, driver_id, start_at, notes, req.user?.id || null]
    );

    await client.query('COMMIT');

    res.json({ assignment: ins.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function unassignVehicle(req, res) {
  const { id } = req.params; // vehicle_id
  const { rowCount } = await pool.query(
    `
    UPDATE driver_vehicle_assignments
    SET end_at=now()
    WHERE vehicle_id=$1 AND end_at IS NULL AND deleted_at IS NULL
    `,
    [id]
  );
  res.json({ ok: true, ended: rowCount });
}

module.exports = {
  listVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,

  listDrivers,
  createDriver,
  updateDriver,
  deleteDriver,

  listAssignments,
  createAssignment,
  unassignVehicle
};


