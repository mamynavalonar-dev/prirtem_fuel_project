const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');
const { detectExcelType } = require('../utils/excel/detectType');
const { parseVehicleFuelWorkbook } = require('../utils/excel/parseVehicleFuel');
const { parseGeneratorWorkbook } = require('../utils/excel/parseGenerator');
const { parseOtherWorkbook } = require('../utils/excel/parseOther');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

async function ensureVehicle(plate) {
  if (!plate) return null;
  const p = plate.replace(/\s+/g,'').toUpperCase();
  const existing = await pool.query('SELECT id FROM vehicles WHERE plate=$1', [p]);
  if (existing.rows[0]) return existing.rows[0].id;
  const id = uuidv4();
  await pool.query('INSERT INTO vehicles (id, plate) VALUES ($1,$2)', [id, p]);
  return id;
}

async function createBatch(req, res) {
  const id = uuidv4();
  await pool.query('INSERT INTO import_batches (id, created_by) VALUES ($1,$2)', [id, req.user.id]);
  res.json({ batch_id: id });
}

async function uploadAndImport(req, res) {
  // Role: ADMIN or LOGISTIQUE only
  if (!['ADMIN', 'LOGISTIQUE'].includes(req.user.role)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const batch_id = req.body.batch_id || uuidv4();
  await pool.query(
    'INSERT INTO import_batches (id, created_by) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING',
    [batch_id, req.user.id]
  );

  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'NO_FILES' });

  const results = [];

  for (const f of files) {
    const file_id = uuidv4();
    await pool.query(
      `INSERT INTO import_files (id, batch_id, original_name, mime_type, size_bytes, status)
       VALUES ($1,$2,$3,$4,$5,'PROCESSING')`,
      [file_id, batch_id, f.originalname, f.mimetype, f.size]
    );

    try {
      // ✅ IMPORTANT : TON detectExcelType retourne { type, workbook }
      const { type, workbook } = detectExcelType(f.buffer, f.originalname);
      let inserted = 0;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        if (type === 'VEHICLE') {
          const { plate, records } = parseVehicleFuelWorkbook(workbook, f.originalname);
          const vehicle_id = await ensureVehicle(plate);

          // allow re-import of the same file: delete previous rows from this source
          await client.query(
            'DELETE FROM vehicle_fuel_logs WHERE source_file_name=$1',
            [f.originalname]
          );

          for (const r of records) {
            await client.query(
              `INSERT INTO vehicle_fuel_logs (
                id, vehicle_id, log_date, day_name, day_no,
                km_depart, km_arrivee, km_jour,
                km_between_refill, consumption, interval_days,
                compteur, liters, montant_ar,
                lien, chauffeur, frns,
                is_refill, is_mission, mission_label,
                source_file_name, sheet_name, row_in_sheet,
                import_batch_id, import_file_id
              ) VALUES (
                $1,$2,$3,$4,$5,
                $6,$7,$8,
                $9,$10,$11,
                $12,$13,$14,
                $15,$16,$17,
                $18,$19,$20,
                $21,$22,$23,
                $24,$25
              )`,
              [
                uuidv4(),
                vehicle_id,
                r.log_date || null,
                r.day_name || null,
                r.day_no || null,
                r.km_depart,
                r.km_arrivee,
                r.km_jour,
                r.km_between_refill,
                r.consumption,
                r.interval_days,
                r.compteur,
                r.liters,
                r.montant_ar,
                r.lien,
                r.chauffeur,
                r.frns,
                !!r.is_refill,
                !!r.is_mission,
                r.mission_label || null,
                r.source_file_name,
                r.sheet_name,
                r.row_in_sheet,
                batch_id,
                file_id
              ]
            );
            inserted += 1;
          }
        } else if (type === 'GENERATOR') {
          const { records } = parseGeneratorWorkbook(workbook, f.originalname);
          await client.query('DELETE FROM generator_fuel_logs WHERE source_file_name=$1', [f.originalname]);
          for (const r of records) {
            await client.query(
              `INSERT INTO generator_fuel_logs (
                id, log_date, liters, montant_ar,
                source_file_name, sheet_name, row_in_sheet,
                import_batch_id, import_file_id
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [uuidv4(), r.log_date, r.liters, r.montant_ar, r.source_file_name, r.sheet_name, r.row_in_sheet, batch_id, file_id]
            );
            inserted += 1;
          }
        } else if (type === 'OTHER') {
          const { records } = parseOtherWorkbook(workbook, f.originalname);
          await client.query('DELETE FROM other_fuel_logs WHERE source_file_name=$1', [f.originalname]);
          for (const r of records) {
            await client.query(
              `INSERT INTO other_fuel_logs (
                id, log_date, liters, montant_ar, lien,
                source_file_name, sheet_name, row_in_sheet,
                import_batch_id, import_file_id
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
              [uuidv4(), r.log_date, r.liters, r.montant_ar, r.lien, r.source_file_name, r.sheet_name, r.row_in_sheet, batch_id, file_id]
            );
            inserted += 1;
          }
        } else {
          throw new Error(`TYPE_NOT_SUPPORTED:${type}`);
        }

        await client.query(
          'UPDATE import_files SET status=$2, detected_type=$3, inserted_rows=$4, processed_at=now() WHERE id=$1',
          [file_id, 'DONE', type, inserted]
        );

        await client.query('COMMIT');
        results.push({ file: f.originalname, type, inserted });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

    } catch (e) {
      await pool.query(
        'UPDATE import_files SET status=$2, error_message=$3, processed_at=now() WHERE id=$1',
        [file_id, 'ERROR', String(e.message || e)]
      );
      results.push({ file: f.originalname, error: String(e.message || e) });
    }
  }

  res.json({ batch_id, results });
}

async function listBatches(req, res) {
  if (!['ADMIN', 'LOGISTIQUE', 'RAF'].includes(req.user.role)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const { rows } = await pool.query(
    `SELECT
        ib.id,
        ib.created_at,

        u.username  AS created_by,
        u.first_name AS created_first_name,
        u.last_name  AS created_last_name,
        u.role       AS created_role,

        COUNT(if2.id) AS files,
        COALESCE(SUM(if2.inserted_rows), 0) AS inserted_rows,
        MIN(if2.original_name) AS first_file,

        CASE
          WHEN SUM(CASE WHEN if2.status = 'ERROR' THEN 1 ELSE 0 END) > 0 THEN 'ERROR'
          WHEN SUM(CASE WHEN if2.status IN ('PENDING','PROCESSING') THEN 1 ELSE 0 END) > 0 THEN 'PROCESSING'
          WHEN COUNT(if2.id) = 0 THEN 'PENDING'
          ELSE 'DONE'
        END AS status
     FROM import_batches ib
     JOIN users u ON u.id = ib.created_by
     LEFT JOIN import_files if2 ON if2.batch_id = ib.id
     GROUP BY ib.id, ib.created_at, u.username, u.first_name, u.last_name, u.role
     ORDER BY ib.created_at DESC
     LIMIT 200`
  );

  res.json({ batches: rows });
}

async function listFiles(req, res) {
  if (!['ADMIN', 'LOGISTIQUE', 'RAF'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });
  const { batch_id } = req.params;
  const { rows } = await pool.query(
    `SELECT * FROM import_files WHERE batch_id=$1 ORDER BY created_at ASC`,
    [batch_id]
  );
  res.json({ files: rows });
}

module.exports = { upload, createBatch, uploadAndImport, listBatches, listFiles };
