const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');

// SEUIL pour considérer un ajout comme un "PLEIN" (en Ariary)
// Idéalement, à mettre dans une table 'settings' en base de données.
const REFILL_THRESHOLD = 200000;

function buildWhereVehicle({ vehicle_id, from, to, only_refill }) {
  const clauses = [];
  const params = [];
  // Toujours exclure les éléments supprimés
  clauses.push('vfl.deleted_at IS NULL');
  
  if (vehicle_id) {
    params.push(vehicle_id);
    clauses.push(`vehicle_id=$${params.length}`);
  }
  if (from) {
    params.push(from);
    clauses.push(`log_date >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    clauses.push(`log_date <= $${params.length}`);
  }
  if (only_refill === 'true') {
    clauses.push(`is_refill=true`);
  }
  return { where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', params };
}

function buildWhereDate({ from, to }) {
  const clauses = [];
  const params = [];
  // Toujours exclure les éléments supprimés
  clauses.push('deleted_at IS NULL');
  
  if (from) {
    params.push(from);
    clauses.push(`log_date >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    clauses.push(`log_date <= $${params.length}`);
  }
  return { where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', params };
}

// ========== LIST ==========
async function listVehicleFuel(req, res) {
  const { vehicle_id, from, to, only_refill } = req.query;
  const { where, params } = buildWhereVehicle({ vehicle_id, from, to, only_refill });
  const { rows } = await pool.query(
    `SELECT vfl.*, v.plate
     FROM vehicle_fuel_logs vfl
     JOIN vehicles v ON v.id=vfl.vehicle_id
     ${where}
     ORDER BY log_date ASC NULLS LAST, sheet_name ASC, row_in_sheet ASC
     LIMIT 5000`,
    params
  );
  res.json({ logs: rows });
}

async function listGeneratorFuel(req, res) {
  const { from, to } = req.query;
  const { where, params } = buildWhereDate({ from, to });
  const { rows } = await pool.query(
    `SELECT * FROM generator_fuel_logs ${where} ORDER BY log_date ASC NULLS LAST LIMIT 5000`,
    params
  );
  res.json({ logs: rows });
}

async function listOtherFuel(req, res) {
  const { from, to } = req.query;
  const { where, params } = buildWhereDate({ from, to });
  const { rows } = await pool.query(
    `SELECT * FROM other_fuel_logs ${where} ORDER BY log_date ASC NULLS LAST LIMIT 5000`,
    params
  );
  res.json({ logs: rows });
}

// ========== UPDATE VEHICLE FUEL (avec logique métier) ==========
const updateVehicleSchema = z.object({
  log_date: z.string().min(4).optional(),
  km_depart: z.number().int().optional().nullable(),
  km_arrivee: z.number().int().optional().nullable(),
  km_jour: z.number().int().optional().nullable(),
  compteur: z.number().int().optional().nullable(),
  liters: z.number().optional().nullable(),
  montant_ar: z.number().int().optional().nullable(),
  lien: z.string().optional().nullable(),
  chauffeur: z.string().optional().nullable(),
  frns: z.string().optional().nullable()
});

async function updateVehicleFuel(req, res) {
  if (!['LOGISTIQUE', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const { id } = req.params;
  const parsed = updateVehicleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const data = parsed.data;
  
  // ========== LOGIQUE MÉTIER : Calcul automatique ==========
  // Si km_depart ou km_arrivee change, recalculer km_jour
  if (data.km_depart !== undefined || data.km_arrivee !== undefined) {
    const current = await pool.query('SELECT km_depart, km_arrivee FROM vehicle_fuel_logs WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (current.rows[0]) {
      const kmDep = data.km_depart ?? current.rows[0].km_depart;
      const kmArr = data.km_arrivee ?? current.rows[0].km_arrivee;
      if (kmDep !== null && kmArr !== null) {
        data.km_jour = kmArr - kmDep;
      }
    }
  }

  // Si montant_ar change, recalculer is_refill
  if (data.montant_ar !== undefined) {
    data.is_refill = data.montant_ar !== null && data.montant_ar >= REFILL_THRESHOLD;
  }

  const fields = [];
  const values = [];
  let idx = 1;
  for (const [key, val] of Object.entries(data)) {
    fields.push(`${key}=$${idx++}`);
    values.push(val);
  }

  if (fields.length === 0) {
    return res.json({ ok: true });
  }

  values.push(id);
  const sql = `UPDATE vehicle_fuel_logs SET ${fields.join(', ')} WHERE id=$${idx} AND deleted_at IS NULL RETURNING *`;
  const { rows } = await pool.query(sql, values);
  if (!rows[0]) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  res.json({ log: rows[0] });
}

// ========== SOFT DELETE VEHICLE FUEL ==========
async function softDeleteVehicleFuel(req, res) {
  if (!['LOGISTIQUE', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const { id } = req.params;
  
  const { rows } = await pool.query(
    'UPDATE vehicle_fuel_logs SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id',
    [id]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  res.json({ ok: true, message: 'Déplacé dans la corbeille' });
}

// ========== UPDATE GENERATOR FUEL ==========
const updateGeneratorSchema = z.object({
  log_date: z.string().min(4).optional(),
  liters: z.number().optional().nullable(),
  montant_ar: z.number().int().optional().nullable()
});

async function updateGeneratorFuel(req, res) {
  if (!['LOGISTIQUE', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const { id } = req.params;
  const parsed = updateGeneratorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const data = parsed.data;
  const fields = [];
  const values = [];
  let idx = 1;
  for (const [key, val] of Object.entries(data)) {
    fields.push(`${key}=$${idx++}`);
    values.push(val);
  }

  if (fields.length === 0) {
    return res.json({ ok: true });
  }

  values.push(id);
  const sql = `UPDATE generator_fuel_logs SET ${fields.join(', ')} WHERE id=$${idx} AND deleted_at IS NULL RETURNING *`;
  const { rows } = await pool.query(sql, values);
  if (!rows[0]) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  res.json({ log: rows[0] });
}

// ========== SOFT DELETE GENERATOR FUEL ==========
async function softDeleteGeneratorFuel(req, res) {
  if (!['LOGISTIQUE', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const { id } = req.params;
  
  const { rows } = await pool.query(
    'UPDATE generator_fuel_logs SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id',
    [id]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  res.json({ ok: true, message: 'Déplacé dans la corbeille' });
}

// ========== UPDATE OTHER FUEL ==========
const updateOtherSchema = z.object({
  log_date: z.string().min(4).optional(),
  liters: z.number().optional().nullable(),
  montant_ar: z.number().int().optional().nullable(),
  lien: z.string().optional().nullable()
});

async function updateOtherFuel(req, res) {
  if (!['LOGISTIQUE', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const { id } = req.params;
  const parsed = updateOtherSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const data = parsed.data;
  const fields = [];
  const values = [];
  let idx = 1;
  for (const [key, val] of Object.entries(data)) {
    fields.push(`${key}=$${idx++}`);
    values.push(val);
  }

  if (fields.length === 0) {
    return res.json({ ok: true });
  }

  values.push(id);
  const sql = `UPDATE other_fuel_logs SET ${fields.join(', ')} WHERE id=$${idx} AND deleted_at IS NULL RETURNING *`;
  const { rows } = await pool.query(sql, values);
  if (!rows[0]) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  res.json({ log: rows[0] });
}

// ========== SOFT DELETE OTHER FUEL ==========
async function softDeleteOtherFuel(req, res) {
  if (!['LOGISTIQUE', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const { id } = req.params;
  
  const { rows } = await pool.query(
    'UPDATE other_fuel_logs SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id',
    [id]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  res.json({ ok: true, message: 'Déplacé dans la corbeille' });
}

// ========== REPORTS & KPIs ==========
async function reportSummary(req, res) {
  const { from, to, vehicle_id } = req.query;
  const v = buildWhereVehicle({ vehicle_id, from, to, only_refill: 'false' });
  const d = buildWhereDate({ from, to });

  const vehicleRes = await pool.query(
    `SELECT COALESCE(SUM(montant_ar),0) AS montant_ar,
            COALESCE(SUM(liters),0) AS liters,
            COUNT(*) FILTER (WHERE is_refill) AS refills
     FROM vehicle_fuel_logs vfl
     ${v.where}`,
    v.params
  );
  const genRes = await pool.query(
    `SELECT COALESCE(SUM(montant_ar),0) AS montant_ar,
            COALESCE(SUM(liters),0) AS liters,
            COUNT(*) AS count
     FROM generator_fuel_logs
     ${d.where}`,
    d.params
  );
  const otherRes = await pool.query(
    `SELECT COALESCE(SUM(montant_ar),0) AS montant_ar,
            COALESCE(SUM(liters),0) AS liters,
            COUNT(*) AS count
     FROM other_fuel_logs
     ${d.where}`,
    d.params
  );

  res.json({
    vehicle: vehicleRes.rows[0],
    generator: genRes.rows[0],
    other: otherRes.rows[0]
  });
}

async function kpiDaily(req, res) {
  const { from, to, vehicle_id } = req.query;
  const v = buildWhereVehicle({ vehicle_id, from, to, only_refill: 'false' });
  const { rows } = await pool.query(
    `SELECT log_date,
            COALESCE(SUM(liters),0) AS liters,
            COALESCE(SUM(montant_ar),0) AS montant_ar,
            COUNT(*) FILTER (WHERE is_refill) AS refills
     FROM vehicle_fuel_logs vfl
     ${v.where}
     GROUP BY log_date
     ORDER BY log_date ASC NULLS LAST`,
    v.params
  );
  res.json({ points: rows });
}


async function kpiDailyBulk(req, res) {
  const { from, to, vehicle_ids } = req.query;

  // vehicle_ids attendu: "uuid1,uuid2,uuid3"
  const raw = String(vehicle_ids || '');
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const parsed = z.array(z.string().uuid()).max(50).safeParse(ids);
  if (!parsed.success || parsed.data.length === 0) {
    return res.status(400).json({ error: 'vehicle_ids invalide' });
  }

  const clauses = ['vfl.deleted_at IS NULL'];
  const params = [];

  if (from) {
    params.push(from);
    clauses.push(`vfl.log_date >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    clauses.push(`vfl.log_date <= $${params.length}`);
  }

  params.push(parsed.data);
  clauses.push(`vfl.vehicle_id = ANY($${params.length}::uuid[])`);

  const where = 'WHERE ' + clauses.join(' AND ');

  const { rows } = await pool.query(
    `SELECT vfl.vehicle_id,
            vfl.log_date,
            COALESCE(SUM(vfl.liters),0) AS liters,
            COALESCE(SUM(vfl.montant_ar),0) AS montant_ar,
            COUNT(*) FILTER (WHERE vfl.is_refill) AS refills
     FROM vehicle_fuel_logs vfl
     ${where}
     GROUP BY vfl.vehicle_id, vfl.log_date
     ORDER BY vfl.vehicle_id ASC, vfl.log_date ASC NULLS LAST`,
    params
  );

  // { [vehicle_id]: points[] } (toujours inclure les ids demandés)
  const series = {};
  for (const id of parsed.data) series[id] = [];
  for (const r of rows) {
    if (!series[r.vehicle_id]) series[r.vehicle_id] = [];
    series[r.vehicle_id].push({
      log_date: r.log_date,
      liters: r.liters,
      montant_ar: r.montant_ar,
      refills: r.refills,
    });
  }

  res.json({ series });
}

async function kpiByVehicle(req, res) {
  const { from, to } = req.query;
  const v = buildWhereVehicle({ vehicle_id: null, from, to, only_refill: 'false' });
  const { rows } = await pool.query(
    `SELECT v.plate,
            COALESCE(SUM(vfl.liters),0) AS liters,
            COALESCE(SUM(vfl.montant_ar),0) AS montant_ar,
            COUNT(*) FILTER (WHERE vfl.is_refill) AS refills
     FROM vehicle_fuel_logs vfl
     JOIN vehicles v ON v.id=vfl.vehicle_id
     ${v.where}
     GROUP BY v.plate
     ORDER BY montant_ar DESC`,
    v.params
  );
  res.json({ rows });
}

// ========== MANUAL ADD ==========
const manualVehicleSchema = z.object({
  vehicle_id: z.string().uuid(),
  log_date: z.string().min(4),
  km_depart: z.number().int().optional().nullable(),
  km_arrivee: z.number().int().optional().nullable(),
  km_jour: z.number().int().optional().nullable(),
  compteur: z.number().int().optional().nullable(),
  liters: z.number().optional().nullable(),
  montant_ar: z.number().int().optional().nullable(),
  lien: z.string().optional().nullable(),
  chauffeur: z.string().optional().nullable(),
  frns: z.string().optional().nullable()
});

async function manualAddVehicle(req, res) {
  if (!['LOGISTIQUE', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });
  const parsed = manualVehicleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });

  const d = parsed.data;
  const is_refill = d.montant_ar !== null && d.montant_ar !== undefined && d.montant_ar >= REFILL_THRESHOLD;

  const id = uuidv4();
  await pool.query(
    `INSERT INTO vehicle_fuel_logs (
      id, vehicle_id, log_date,
      km_depart, km_arrivee, km_jour,
      compteur, liters, montant_ar,
      lien, chauffeur, frns,
      is_refill,
      source_file_name, sheet_name, row_in_sheet,
      import_batch_id, import_file_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'MANUAL','MANUAL',0,NULL,NULL)`,
    [
      id,
      d.vehicle_id,
      d.log_date,
      d.km_depart ?? null,
      d.km_arrivee ?? null,
      d.km_jour ?? null,
      d.compteur ?? null,
      d.liters ?? null,
      d.montant_ar ?? null,
      d.lien ?? null,
      d.chauffeur ?? null,
      d.frns ?? null,
      is_refill
    ]
  );
  const { rows } = await pool.query(
    `SELECT vfl.*, v.plate
     FROM vehicle_fuel_logs vfl JOIN vehicles v ON v.id=vfl.vehicle_id
     WHERE vfl.id=$1`,
    [id]
  );
  res.json({ log: rows[0] });
}

const manualSimpleSchema = z.object({
  log_date: z.string().min(4),
  liters: z.number().optional().nullable(),
  montant_ar: z.number().int().optional().nullable(),
  lien: z.string().optional().nullable()
});

async function manualAddGenerator(req, res) {
  if (!['LOGISTIQUE', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });
  const parsed = manualSimpleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  const d = parsed.data;
  const id = uuidv4();
  await pool.query(
    `INSERT INTO generator_fuel_logs (id, log_date, liters, montant_ar, source_file_name, sheet_name, row_in_sheet)
     VALUES ($1,$2,$3,$4,'MANUAL','MANUAL',0)`,
    [id, d.log_date, d.liters ?? null, d.montant_ar ?? null]
  );
  const { rows } = await pool.query('SELECT * FROM generator_fuel_logs WHERE id=$1', [id]);
  res.json({ log: rows[0] });
}

async function manualAddOther(req, res) {
  if (!['LOGISTIQUE', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });
  const parsed = manualSimpleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  const d = parsed.data;
  const id = uuidv4();
  await pool.query(
    `INSERT INTO other_fuel_logs (id, log_date, liters, montant_ar, lien, source_file_name, sheet_name, row_in_sheet)
     VALUES ($1,$2,$3,$4,$5,'MANUAL','MANUAL',0)`,
    [id, d.log_date, d.liters ?? null, d.montant_ar ?? null, d.lien ?? null]
  );
  const { rows } = await pool.query('SELECT * FROM other_fuel_logs WHERE id=$1', [id]);
  res.json({ log: rows[0] });
}

// ========== EXPORT CSV ==========
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function exportCsv(req, res) {
  if (!['LOGISTIQUE', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });

  const { type } = req.params;
  const { from, to, vehicle_id } = req.query;

  let rows = [];
  let header = [];

  if (type === 'vehicle') {
    const v = buildWhereVehicle({ vehicle_id, from, to, only_refill: 'false' });
    const q = await pool.query(
      `SELECT v.plate, vfl.*
       FROM vehicle_fuel_logs vfl
       JOIN vehicles v ON v.id=vfl.vehicle_id
       ${v.where}
       ORDER BY log_date ASC NULLS LAST, sheet_name ASC, row_in_sheet ASC`,
      v.params
    );
    rows = q.rows;
    header = [
      'plate','log_date','day_name','day_no','km_depart','km_arrivee','km_jour','km_between_refill','consumption',
      'interval_days','compteur','liters','montant_ar','lien','chauffeur','frns','is_refill','is_mission','mission_label',
      'source_file_name','sheet_name','row_in_sheet'
    ];
  } else if (type === 'generator') {
    const d = buildWhereDate({ from, to });
    const q = await pool.query(
      `SELECT * FROM generator_fuel_logs ${d.where} ORDER BY log_date ASC NULLS LAST`,
      d.params
    );
    rows = q.rows;
    header = ['log_date','liters','montant_ar','source_file_name','sheet_name','row_in_sheet'];
  } else if (type === 'other') {
    const d = buildWhereDate({ from, to });
    const q = await pool.query(
      `SELECT * FROM other_fuel_logs ${d.where} ORDER BY log_date ASC NULLS LAST`,
      d.params
    );
    rows = q.rows;
    header = ['log_date','liters','montant_ar','lien','source_file_name','sheet_name','row_in_sheet'];
  } else {
    return res.status(400).json({ error: 'BAD_TYPE' });
  }

  const lines = [];
  lines.push(header.join(','));
  for (const r of rows) {
    lines.push(header.map((h) => csvEscape(r[h])).join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${type}_export.csv"`);
  res.send(lines.join('\n'));
}

module.exports = {
  listVehicleFuel,
  listGeneratorFuel,
  listOtherFuel,
  reportSummary,
  kpiDaily,
  kpiDailyBulk,
  kpiByVehicle,
  manualAddVehicle,
  manualAddGenerator,
  manualAddOther,
  exportCsv,
  updateVehicleFuel,
  softDeleteVehicleFuel,
  updateGeneratorFuel,
  softDeleteGeneratorFuel,
  updateOtherFuel,
  softDeleteOtherFuel
};