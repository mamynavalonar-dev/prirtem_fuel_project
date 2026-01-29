const { pool } = require('../db');

// ========== ENTITÉS AVEC fuel_logs ==========
const ENTITIES = {
  vehicles: {
    table: 'vehicles',
    select: 'id, plate, label, is_active, deleted_at'
  },
  drivers: {
    table: 'drivers',
    select: 'id, full_name, phone, is_active, deleted_at'
  },
  fuel_requests: {
    table: 'fuel_requests',
    select: 'id, request_no, request_date, request_type, objet, amount_estimated_ar, status, deleted_at'
  },
  car_requests: {
    table: 'car_requests',
    select: 'id, request_no, proposed_date, objet, status, deleted_at'
  },
  // ========== NOUVEAUX: FUEL LOGS ==========
  vehicle_fuel_logs: {
    table: 'vehicle_fuel_logs',
    select: 'id, log_date, km_depart, km_arrivee, montant_ar, deleted_at'
  },
  generator_fuel_logs: {
    table: 'generator_fuel_logs',
    select: 'id, log_date, liters, montant_ar, deleted_at'
  },
  other_fuel_logs: {
    table: 'other_fuel_logs',
    select: 'id, log_date, liters, montant_ar, lien, deleted_at'
  }
};

function getEntity(name) {
  const ent = ENTITIES[name];
  if (!ent) {
    const err = new Error('UNKNOWN_ENTITY');
    err.statusCode = 400;
    throw err;
  }
  return ent;
}

async function list(req, res) {
  const { entity } = req.params;
  const ent = getEntity(entity);

  const { rows } = await pool.query(
    `SELECT ${ent.select}
     FROM ${ent.table}
     WHERE deleted_at IS NOT NULL
     ORDER BY deleted_at DESC
     LIMIT 500`
  );

  res.json({ items: rows });
}

async function restore(req, res) {
  const { entity, id } = req.params;
  const ent = getEntity(entity);

  const { rows } = await pool.query(
    `UPDATE ${ent.table}
     SET deleted_at=NULL
     WHERE id=$1 AND deleted_at IS NOT NULL
     RETURNING id`,
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ ok: true });
}

async function hardDelete(req, res) {
  const { entity, id } = req.params;
  const ent = getEntity(entity);

  const { rows } = await pool.query(
    `DELETE FROM ${ent.table}
     WHERE id=$1 AND deleted_at IS NOT NULL
     RETURNING id`,
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ ok: true });
}

module.exports = { list, restore, hardDelete };