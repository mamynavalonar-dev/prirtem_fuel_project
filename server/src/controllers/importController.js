const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { pool } = require('../db');
const { detectExcelType } = require('../utils/excel/detectType');
const { parseVehicleFuelWorkbook } = require('../utils/excel/parseVehicleFuel');
const { parseGeneratorWorkbook } = require('../utils/excel/parseGenerator');
const { parseOtherWorkbook } = require('../utils/excel/parseOther');

const EXCEL_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
  'application/zip'
]);
const batchIdSchema = z.string().uuid();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5, parts: 10 },
  fileFilter(_req, file, callback) {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (extension !== '.xlsx' || !EXCEL_MIME_TYPES.has(file.mimetype)) {
      return callback(Object.assign(new Error('XLSX_FILE_REQUIRED'), { statusCode: 400 }));
    }
    return callback(null, true);
  }
});

async function ensureVehicle(client, plate) {
  if (!plate) throw new Error('VEHICLE_PLATE_REQUIRED');
  const normalized = plate.replace(/\s+/g, '').toUpperCase();
  const { rows } = await client.query(
    `INSERT INTO vehicles (id, plate)
     VALUES ($1,$2)
     ON CONFLICT (plate) DO UPDATE SET plate=EXCLUDED.plate
     RETURNING id`,
    [uuidv4(), normalized]
  );
  return rows[0].id;
}

async function insertRows(client, table, columns, rows) {
  const chunkSize = 200;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const values = chunk.flat();
    const placeholders = chunk.map((row, rowIndex) => {
      const base = rowIndex * columns.length;
      return `(${row.map((_value, columnIndex) => `$${base + columnIndex + 1}`).join(',')})`;
    });
    await client.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders.join(',')}`,
      values
    );
  }
}

async function createBatch(req, res) {
  const id = uuidv4();
  await pool.query('INSERT INTO import_batches (id, created_by) VALUES ($1,$2)', [id, req.user.id]);
  res.status(201).json({ batch_id: id });
}

async function resolveBatchId(req) {
  if (!req.body.batch_id) {
    const id = uuidv4();
    await pool.query('INSERT INTO import_batches (id, created_by) VALUES ($1,$2)', [id, req.user.id]);
    return id;
  }

  const parsed = batchIdSchema.safeParse(req.body.batch_id);
  if (!parsed.success) throw Object.assign(new Error('INVALID_BATCH_ID'), { statusCode: 400 });
  const { rows } = await pool.query('SELECT created_by FROM import_batches WHERE id=$1', [parsed.data]);
  if (!rows[0] || rows[0].created_by !== req.user.id) {
    throw Object.assign(new Error('BATCH_NOT_FOUND'), { statusCode: 404 });
  }
  return parsed.data;
}

async function uploadAndImport(req, res) {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'NO_FILES' });

  const batchId = await resolveBatchId(req);
  const results = [];

  for (const file of files) {
    const originalName = path.basename(file.originalname || 'import.xlsx').slice(0, 255);
    const contentSha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await pool.query(
      `SELECT id, batch_id FROM import_files
       WHERE content_sha256=$1 AND status='DONE' LIMIT 1`,
      [contentSha256]
    );
    if (duplicate.rows[0]) {
      results.push({ file: originalName, duplicate: true, previous_file_id: duplicate.rows[0].id });
      continue;
    }

    const fileId = uuidv4();
    await pool.query(
      `INSERT INTO import_files
        (id, batch_id, original_name, mime_type, size_bytes, status, content_sha256)
       VALUES ($1,$2,$3,$4,$5,'PROCESSING',$6)`,
      [fileId, batchId, originalName, file.mimetype, file.size, contentSha256]
    );

    try {
      const { type, workbook } = detectExcelType(file.buffer, originalName);
      const client = await pool.connect();
      let inserted = 0;

      try {
        await client.query('BEGIN');

        if (type === 'VEHICLE') {
          const { plate, records } = parseVehicleFuelWorkbook(workbook, originalName);
          const vehicleId = await ensureVehicle(client, plate);
          const columns = [
            'id', 'vehicle_id', 'log_date', 'day_name', 'day_no',
            'km_depart', 'km_arrivee', 'km_jour', 'km_between_refill', 'consumption', 'interval_days',
            'compteur', 'liters', 'montant_ar', 'lien', 'chauffeur', 'frns',
            'is_refill', 'is_mission', 'mission_label', 'source_file_name', 'sheet_name', 'row_in_sheet',
            'import_batch_id', 'import_file_id'
          ];
          const rows = records.map((record) => [
            uuidv4(), vehicleId, record.log_date || null, record.day_name || null, record.day_no || null,
            record.km_depart, record.km_arrivee, record.km_jour, record.km_between_refill,
            record.consumption, record.interval_days, record.compteur, record.liters, record.montant_ar,
            record.lien, record.chauffeur, record.frns, Boolean(record.is_refill), Boolean(record.is_mission),
            record.mission_label || null, record.source_file_name, record.sheet_name, record.row_in_sheet,
            batchId, fileId
          ]);
          await insertRows(client, 'vehicle_fuel_logs', columns, rows);
          inserted = rows.length;
        } else if (type === 'GENERATOR') {
          const { records } = parseGeneratorWorkbook(workbook, originalName);
          const columns = [
            'id', 'log_date', 'liters', 'montant_ar', 'source_file_name', 'sheet_name', 'row_in_sheet',
            'import_batch_id', 'import_file_id'
          ];
          const rows = records.map((record) => [
            uuidv4(), record.log_date, record.liters, record.montant_ar,
            record.source_file_name, record.sheet_name, record.row_in_sheet, batchId, fileId
          ]);
          await insertRows(client, 'generator_fuel_logs', columns, rows);
          inserted = rows.length;
        } else if (type === 'OTHER') {
          const { records } = parseOtherWorkbook(workbook, originalName);
          const columns = [
            'id', 'log_date', 'liters', 'montant_ar', 'lien', 'source_file_name', 'sheet_name', 'row_in_sheet',
            'import_batch_id', 'import_file_id'
          ];
          const rows = records.map((record) => [
            uuidv4(), record.log_date, record.liters, record.montant_ar, record.lien,
            record.source_file_name, record.sheet_name, record.row_in_sheet, batchId, fileId
          ]);
          await insertRows(client, 'other_fuel_logs', columns, rows);
          inserted = rows.length;
        } else {
          throw new Error(`TYPE_NOT_SUPPORTED:${type}`);
        }

        await client.query(
          `UPDATE import_files
           SET status='DONE', detected_type=$2, inserted_rows=$3, processed_at=NOW()
           WHERE id=$1`,
          [fileId, type, inserted]
        );
        await client.query('COMMIT');
        results.push({ file: originalName, type, inserted });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      const message = String(error.message || error).slice(0, 500);
      await pool.query(
        `UPDATE import_files SET status='ERROR', error_message=$2, processed_at=NOW() WHERE id=$1`,
        [fileId, message]
      );
      results.push({ file: originalName, error: message });
    }
  }

  res.json({ batch_id: batchId, results });
}

async function listBatches(_req, res) {
  const { rows } = await pool.query(
    `SELECT ib.id, ib.created_at,
            u.username AS created_by, u.first_name AS created_first_name,
            u.last_name AS created_last_name, u.role AS created_role,
            COUNT(f.id) AS files, COALESCE(SUM(f.inserted_rows), 0) AS inserted_rows,
            MIN(f.original_name) AS first_file,
            CASE
              WHEN SUM(CASE WHEN f.status='ERROR' THEN 1 ELSE 0 END)>0 THEN 'ERROR'
              WHEN SUM(CASE WHEN f.status IN ('PENDING','PROCESSING') THEN 1 ELSE 0 END)>0 THEN 'PROCESSING'
              WHEN COUNT(f.id)=0 THEN 'PENDING' ELSE 'DONE'
            END AS status
     FROM import_batches ib
     JOIN users u ON u.id=ib.created_by
     LEFT JOIN import_files f ON f.batch_id=ib.id
     GROUP BY ib.id, ib.created_at, u.username, u.first_name, u.last_name, u.role
     ORDER BY ib.created_at DESC LIMIT 200`
  );
  res.json({ batches: rows });
}

async function listFiles(req, res) {
  const parsed = batchIdSchema.safeParse(req.params.batch_id);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_BATCH_ID' });
  const { rows } = await pool.query(
    `SELECT id, batch_id, original_name, mime_type, size_bytes, detected_type,
            inserted_rows, status, error_message, created_at, processed_at
     FROM import_files WHERE batch_id=$1 ORDER BY created_at ASC`,
    [parsed.data]
  );
  res.json({ files: rows });
}

module.exports = { upload, createBatch, uploadAndImport, listBatches, listFiles, insertRows };
