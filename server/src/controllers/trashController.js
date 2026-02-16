const asyncHandler = require('../utils/asyncHandler');
const { pool } = require('../db');

/**
 * Corbeille (soft delete)
 * ✅ Ajout: "qui a supprimé ?" => deleted_by + infos user (username/role/nom/email)
 *
 * Convention:
 * - Soft delete : deleted_at = now(), deleted_by = req.user.id
 * - Restore    : deleted_at = NULL, deleted_by = NULL
 */

const ENTITIES = {
  vehicles: {
    label: 'Véhicules',
    table: 'vehicles',
    from: `
      vehicles t
      LEFT JOIN users udel ON udel.id = t.deleted_by
    `,
    deletedAt: 't.deleted_at',
    select: `
      t.id,
      t.plate,
      t.label,
      t.deleted_at,
      t.deleted_by,
      udel.username AS deleted_by_username,
      udel.role::text AS deleted_by_role,
      udel.email AS deleted_by_email,
      (udel.first_name || ' ' || udel.last_name) AS deleted_by_name
    `,
    searchCols: ['t.plate', 't.label', 'udel.username', 'udel.email', "udel.first_name || ' ' || udel.last_name"],
    defaultSort: 't.deleted_at'
  },

  drivers: {
    label: 'Chauffeurs',
    table: 'drivers',
    from: `
      drivers t
      LEFT JOIN users udel ON udel.id = t.deleted_by
    `,
    deletedAt: 't.deleted_at',
    select: `
      t.id,
      t.full_name,
      t.phone,
      t.deleted_at,
      t.deleted_by,
      udel.username AS deleted_by_username,
      udel.role::text AS deleted_by_role,
      udel.email AS deleted_by_email,
      (udel.first_name || ' ' || udel.last_name) AS deleted_by_name
    `,
    searchCols: ['t.full_name', 't.phone', 'udel.username', 'udel.email', "udel.first_name || ' ' || udel.last_name"],
    defaultSort: 't.deleted_at'
  },

  fuel_requests: {
    label: 'Demandes carburant',
    table: 'fuel_requests',
    from: `
      fuel_requests t
      LEFT JOIN users udel ON udel.id = t.deleted_by
    `,
    deletedAt: 't.deleted_at',
    select: `
      t.id,
      t.request_no,
      t.request_date,
      t.request_type,
      t.amount_estimated_ar,
      t.status,
      t.deleted_at,
      t.deleted_by,
      udel.username AS deleted_by_username,
      udel.role::text AS deleted_by_role,
      udel.email AS deleted_by_email,
      (udel.first_name || ' ' || udel.last_name) AS deleted_by_name
    `,
    searchCols: ['t.request_no', 't.objet', 't.request_type', 't.status::text', 'udel.username', 'udel.email'],
    defaultSort: 't.deleted_at'
  },

  car_requests: {
    label: 'Demandes voiture',
    table: 'car_requests',
    from: `
      car_requests t
      LEFT JOIN users udel ON udel.id = t.deleted_by
    `,
    deletedAt: 't.deleted_at',
    select: `
      t.id,
      t.request_no,
      t.proposed_date,
      t.objet,
      t.status,
      t.deleted_at,
      t.deleted_by,
      udel.username AS deleted_by_username,
      udel.role::text AS deleted_by_role,
      udel.email AS deleted_by_email,
      (udel.first_name || ' ' || udel.last_name) AS deleted_by_name
    `,
    searchCols: ['t.request_no', 't.objet', 't.status::text', 'udel.username', 'udel.email'],
    defaultSort: 't.deleted_at'
  },

  car_logbooks: {
    label: 'Journaux de bord',
    table: 'car_logbooks',
    from: `
      car_logbooks t
      LEFT JOIN vehicles v ON v.id = t.vehicle_id
      LEFT JOIN users udel ON udel.id = t.deleted_by
    `,
    deletedAt: 't.deleted_at',
    select: `
      t.id,
      t.vehicle_id,
      v.plate AS plate,
      t.period_start,
      t.period_end,
      t.objet,
      t.logbook_type,
      t.status,
      t.deleted_at,
      t.deleted_by,
      udel.username AS deleted_by_username,
      udel.role::text AS deleted_by_role,
      udel.email AS deleted_by_email,
      (udel.first_name || ' ' || udel.last_name) AS deleted_by_name
    `,
    searchCols: ['v.plate', 't.objet', 't.logbook_type', 't.status::text', 'udel.username', 'udel.email'],
    defaultSort: 't.deleted_at'
  },

  vehicle_fuel_logs: {
    label: 'Suivi carburant (Véhicules)',
    table: 'vehicle_fuel_logs',
    from: `
      vehicle_fuel_logs t
      LEFT JOIN vehicles v ON v.id = t.vehicle_id
      LEFT JOIN users udel ON udel.id = t.deleted_by
    `,
    deletedAt: 't.deleted_at',
    select: `
      t.id,
      t.log_date,
      v.plate AS plate,
      t.km_depart,
      t.km_arrivee,
      t.montant_ar,
      t.deleted_at,
      t.deleted_by,
      udel.username AS deleted_by_username,
      udel.role::text AS deleted_by_role,
      udel.email AS deleted_by_email,
      (udel.first_name || ' ' || udel.last_name) AS deleted_by_name
    `,
    searchCols: ['v.plate', 't.chauffeur', 't.frns', 't.lien', 'udel.username', 'udel.email'],
    defaultSort: 't.deleted_at'
  },

  generator_fuel_logs: {
    label: 'Suivi carburant (Groupe électrogène)',
    table: 'generator_fuel_logs',
    from: `
      generator_fuel_logs t
      LEFT JOIN users udel ON udel.id = t.deleted_by
    `,
    deletedAt: 't.deleted_at',
    select: `
      t.id,
      t.log_date,
      t.liters,
      t.montant_ar,
      t.deleted_at,
      t.deleted_by,
      udel.username AS deleted_by_username,
      udel.role::text AS deleted_by_role,
      udel.email AS deleted_by_email,
      (udel.first_name || ' ' || udel.last_name) AS deleted_by_name
    `,
    searchCols: ['t.log_date::text', 't.montant_ar::text', 'udel.username', 'udel.email'],
    defaultSort: 't.deleted_at'
  },

  other_fuel_logs: {
    label: 'Suivi carburant (Autres)',
    table: 'other_fuel_logs',
    from: `
      other_fuel_logs t
      LEFT JOIN users udel ON udel.id = t.deleted_by
    `,
    deletedAt: 't.deleted_at',
    select: `
      t.id,
      t.log_date,
      t.liters,
      t.montant_ar,
      t.lien,
      t.deleted_at,
      t.deleted_by,
      udel.username AS deleted_by_username,
      udel.role::text AS deleted_by_role,
      udel.email AS deleted_by_email,
      (udel.first_name || ' ' || udel.last_name) AS deleted_by_name
    `,
    searchCols: ['t.lien', 't.log_date::text', 't.montant_ar::text', 'udel.username', 'udel.email'],
    defaultSort: 't.deleted_at'
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

function parseLimit(v, def = 25) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(1, Math.min(500, Math.floor(n)));
}

function parseOffset(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function normalizeDir(v) {
  const s = String(v || '').toUpperCase();
  return s === 'ASC' ? 'ASC' : 'DESC';
}

function buildSearch(ent, q, params) {
  const raw = String(q || '').trim();
  if (!raw) return { sql: '', params };

  const like = `%${raw}%`;
  const conds = [];

  for (const col of ent.searchCols || []) {
    params.push(like);
    conds.push(`COALESCE(${col}::text,'') ILIKE $${params.length}`);
  }

  if (!conds.length) return { sql: '', params };
  return { sql: `AND (${conds.join(' OR ')})`, params };
}

/** (Optionnel) Meta: liste des entités + compteur */
exports.meta = asyncHandler(async (req, res) => {
  if (!mustBeAdminOrLogistique(req, res)) return;

  const out = [];
  for (const [key, ent] of Object.entries(ENTITIES)) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM ${ent.from} WHERE ${ent.deletedAt} IS NOT NULL`
    );
    out.push({ key, label: ent.label, count: rows?.[0]?.c || 0 });
  }
  res.json({ entities: out });
});

/** LIST (pagination + recherche + tri) */
exports.list = asyncHandler(async (req, res) => {
  if (!mustBeAdminOrLogistique(req, res)) return;

  const { entity } = req.params;
  const ent = ENTITIES[entity];
  if (!ent) return res.status(404).json({ error: 'Type inconnu' });

  const limit = parseLimit(req.query.limit, 25);
  const offset = parseOffset(req.query.offset);
  const q = req.query.q || '';

  // whitelist sort
  const allowedSort = new Set([
    ent.deletedAt,
    ent.defaultSort,
    't.deleted_at',
    't.request_no',
    't.proposed_date',
    't.request_date',
    't.log_date',
    'v.plate',
    't.plate',
    't.full_name',
    'udel.username'
  ].filter(Boolean));

  const sortKey = String(req.query.sort || ent.defaultSort || ent.deletedAt || 't.deleted_at');
  const sortCol = allowedSort.has(sortKey) ? sortKey : (ent.deletedAt || 't.deleted_at');
  const dir = normalizeDir(req.query.dir);

  const params = [];
  const whereBase = `WHERE ${ent.deletedAt} IS NOT NULL`;
  const { sql: searchSql } = buildSearch(ent, q, params);
  const where = `${whereBase} ${searchSql}`;

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM ${ent.from} ${where}`,
    params
  );

  const { rows } = await pool.query(
    `
    SELECT ${ent.select}
    FROM ${ent.from}
    ${where}
    ORDER BY ${sortCol} ${dir}
    LIMIT ${limit} OFFSET ${offset}
    `,
    params
  );

  res.json({
    items: rows,
    total: countRows?.[0]?.total || 0,
    limit,
    offset
  });
});

/** RESTORE 1 */
exports.restore = asyncHandler(async (req, res) => {
  if (!mustBeAdminOrLogistique(req, res)) return;

  const { entity, id } = req.params;
  const ent = ENTITIES[entity];
  if (!ent) return res.status(404).json({ error: 'Type inconnu' });

  const { rowCount } = await pool.query(
    `UPDATE ${ent.table} SET deleted_at=NULL, deleted_by=NULL WHERE id=$1`,
    [id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Introuvable' });

  res.json({ ok: true });
});

/** HARD DELETE 1 */
exports.hardDelete = asyncHandler(async (req, res) => {
  if (!mustBeAdminOrLogistique(req, res)) return;

  const { entity, id } = req.params;
  const ent = ENTITIES[entity];
  if (!ent) return res.status(404).json({ error: 'Type inconnu' });

  const { rowCount } = await pool.query(`DELETE FROM ${ent.table} WHERE id=$1`, [id]);
  if (!rowCount) return res.status(404).json({ error: 'Introuvable' });

  res.json({ ok: true });
});

/** RESTORE MANY */
exports.restoreMany = asyncHandler(async (req, res) => {
  if (!mustBeAdminOrLogistique(req, res)) return;

  const { entity } = req.params;
  const ent = ENTITIES[entity];
  if (!ent) return res.status(404).json({ error: 'Type inconnu' });

  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.json({ ok: true, restored: 0 });

  const { rowCount } = await pool.query(
    `UPDATE ${ent.table} SET deleted_at=NULL, deleted_by=NULL WHERE id = ANY($1::uuid[])`,
    [ids]
  );

  res.json({ ok: true, restored: rowCount });
});

/** HARD DELETE MANY */
exports.hardDeleteMany = asyncHandler(async (req, res) => {
  if (!mustBeAdminOrLogistique(req, res)) return;

  const { entity } = req.params;
  const ent = ENTITIES[entity];
  if (!ent) return res.status(404).json({ error: 'Type inconnu' });

  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.json({ ok: true, deleted: 0 });

  const { rowCount } = await pool.query(
    `DELETE FROM ${ent.table} WHERE id = ANY($1::uuid[])`,
    [ids]
  );

  res.json({ ok: true, deleted: rowCount });
});

/** RESTORE ALL (pour ce type) */
exports.restoreAll = asyncHandler(async (req, res) => {
  if (!mustBeAdminOrLogistique(req, res)) return;

  const { entity } = req.params;
  const ent = ENTITIES[entity];
  if (!ent) return res.status(404).json({ error: 'Type inconnu' });

  const { rowCount } = await pool.query(
    `UPDATE ${ent.table} SET deleted_at=NULL, deleted_by=NULL WHERE deleted_at IS NOT NULL`
  );

  res.json({ ok: true, restored: rowCount });
});

/** PURGE ALL (vider la corbeille pour ce type) */
exports.purgeAll = asyncHandler(async (req, res) => {
  if (!mustBeAdminOrLogistique(req, res)) return;

  const { entity } = req.params;
  const ent = ENTITIES[entity];
  if (!ent) return res.status(404).json({ error: 'Type inconnu' });

  const { rowCount } = await pool.query(
    `DELETE FROM ${ent.table} WHERE deleted_at IS NOT NULL`
  );

  res.json({ ok: true, deleted: rowCount });
});
