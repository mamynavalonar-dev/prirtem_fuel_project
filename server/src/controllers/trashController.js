const asyncHandler = require('../utils/asyncHandler');
const { pool } = require('../db');

const ENTITIES = {
  vehicles: {
    table: 'vehicles',
    deletedAtCol: 'deleted_at',
    select: 'id, plate, label, deleted_at'
  },
  drivers: {
    table: 'drivers',
    deletedAtCol: 'deleted_at',
    select: 'id, full_name, phone, deleted_at'
  },
  fuel_requests: {
    table: 'fuel_requests',
    deletedAtCol: 'deleted_at',
    select: 'id, request_no, request_date, request_type, amount_estimated_ar, status, deleted_at'
  },
  car_requests: {
    table: 'car_requests',
    deletedAtCol: 'deleted_at',
    select: 'id, request_no, proposed_date, objet, status, deleted_at'
  },
  vehicle_fuel_logs: {
    table: 'vehicle_fuel_logs',
    deletedAtCol: 'deleted_at',
    select: 'id, log_date, km_depart, km_arrivee, montant_ar, deleted_at'
  },
  generator_fuel_logs: {
    table: 'generator_fuel_logs',
    deletedAtCol: 'deleted_at',
    select: 'id, log_date, liters, montant_ar, deleted_at'
  },
  other_fuel_logs: {
    table: 'other_fuel_logs',
    deletedAtCol: 'deleted_at',
    select: 'id, log_date, liters, montant_ar, lien, deleted_at'
  },

  /** ✅ Journaux de bord voiture */
  car_logbooks: {
    table: 'car_logbooks',
    deletedAtCol: 'deleted_at',
    select: `
      id,
      vehicle_id,
      (SELECT plate FROM vehicles v WHERE v.id = car_logbooks.vehicle_id) AS plate,
      period_start,
      period_end,
      objet,
      logbook_type,
      status,
      deleted_at
    `
  }
};

function mustBeAdminOrLogistique(req, res) {
  const role = req.user?.role;
  if (!['ADMIN', 'LOGISTIQUE'].includes(role)) {
    res.status(403).json({ error: 'Accès refusé' });
    return false;
  }
  return true;
}

exports.list = asyncHandler(async (req, res) => {
  if (!mustBeAdminOrLogistique(req, res)) return;

  const { entity } = req.params;
  const ent = ENTITIES[entity];
  if (!ent) return res.status(404).json({ error: 'Type inconnu' });

  const sql = `
    SELECT ${ent.select}
    FROM ${ent.table}
    WHERE ${ent.deletedAtCol} IS NOT NULL
    ORDER BY ${ent.deletedAtCol} DESC
    LIMIT 500
  `;

  const { rows } = await pool.query(sql);
  res.json({ items: rows });
});

exports.restore = asyncHandler(async (req, res) => {
  if (!mustBeAdminOrLogistique(req, res)) return;

  const { entity, id } = req.params;
  const ent = ENTITIES[entity];
  if (!ent) return res.status(404).json({ error: 'Type inconnu' });

  const { rowCount } = await pool.query(
    `UPDATE ${ent.table} SET ${ent.deletedAtCol}=NULL WHERE id=$1`,
    [id]
  );

  if (!rowCount) return res.status(404).json({ error: 'Introuvable' });
  res.json({ ok: true });
});

exports.hardDelete = asyncHandler(async (req, res) => {
  if (!mustBeAdminOrLogistique(req, res)) return;

  const { entity, id } = req.params;
  const ent = ENTITIES[entity];
  if (!ent) return res.status(404).json({ error: 'Type inconnu' });

  const { rowCount } = await pool.query(`DELETE FROM ${ent.table} WHERE id=$1`, [id]);
  if (!rowCount) return res.status(404).json({ error: 'Introuvable' });

  res.json({ ok: true });
});
