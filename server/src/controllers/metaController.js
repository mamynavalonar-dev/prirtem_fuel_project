const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');

const vehicleSchema = z.object({
  plate: z.string().min(3),
  label: z.string().optional().nullable()
});

async function listVehicles(req, res) {
  const { rows } = await pool.query(
    'SELECT id, plate, label, is_active, created_at, updated_at FROM vehicles WHERE deleted_at IS NULL ORDER BY plate'
  );
  res.json({ vehicles: rows });
}

async function createVehicle(req, res) {
  const parsed = vehicleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }
  const id = uuidv4();
  const { plate, label } = parsed.data;
  try {
    await pool.query('INSERT INTO vehicles (id, plate, label, is_active) VALUES ($1,$2,$3,TRUE)', [id, plate, label || null]);
  } catch (e) {
    if (String(e.message).includes('vehicles_plate_key')) return res.status(409).json({ error: 'DUPLICATE_PLATE' });
    throw e;
  }
  const { rows } = await pool.query('SELECT id, plate, label, is_active, created_at, updated_at FROM vehicles WHERE id=$1', [id]);
  res.json({ vehicle: rows[0] });
}

async function updateVehicle(req, res) {
  const { id } = req.params;
  const parsed = vehicleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }
  const { plate, label } = parsed.data;
  const { rows } = await pool.query(
    `UPDATE vehicles
     SET plate=$2, label=$3, updated_at=now()
     WHERE id=$1 AND deleted_at IS NULL
     RETURNING id, plate, label, is_active, created_at, updated_at`,
    [id, plate, label || null]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ vehicle: rows[0] });
}

async function deleteVehicle(req, res) {
  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE vehicles SET deleted_at=now(), updated_at=now()
     WHERE id=$1 AND deleted_at IS NULL
     RETURNING id`,
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ ok: true });
}

const driverSchema = z.object({
  full_name: z.string().min(3),
  phone: z.string().optional().nullable(),
  is_active: z.boolean().optional()
});

async function listDrivers(req, res) {
  const { rows } = await pool.query(
    'SELECT id, full_name, phone, is_active, created_at, updated_at FROM drivers WHERE deleted_at IS NULL ORDER BY full_name'
  );
  res.json({ drivers: rows });
}

async function createDriver(req, res) {
  const parsed = driverSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }
  const id = uuidv4();
  const { full_name, phone, is_active } = parsed.data;
  await pool.query(
    'INSERT INTO drivers (id, full_name, phone, is_active) VALUES ($1,$2,$3,$4)',
    [id, full_name, phone || null, is_active ?? true]
  );
  const { rows } = await pool.query('SELECT id, full_name, phone, is_active, created_at, updated_at FROM drivers WHERE id=$1', [id]);
  res.json({ driver: rows[0] });
}

async function updateDriver(req, res) {
  const { id } = req.params;
  const parsed = driverSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }
  const { full_name, phone, is_active } = parsed.data;
  const { rows } = await pool.query(
    `UPDATE drivers
     SET full_name=$2, phone=$3, is_active=$4, updated_at=now()
     WHERE id=$1 AND deleted_at IS NULL
     RETURNING id, full_name, phone, is_active, created_at, updated_at`,
    [id, full_name, phone || null, is_active ?? true]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ driver: rows[0] });
}

async function deleteDriver(req, res) {
  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE drivers SET deleted_at=now(), updated_at=now()
     WHERE id=$1 AND deleted_at IS NULL
     RETURNING id`,
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ ok: true });
}

module.exports = {
  listVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  listDrivers,
  createDriver,
  updateDriver,
  deleteDriver
};
