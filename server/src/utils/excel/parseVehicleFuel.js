const { norm, toInt, toFloat, parseDate, sheetTo2D } = require('./parseUtils');

function extractPlateFromFileName(name) {
  const m = String(name || '').toUpperCase().match(/(\d{5}\s*WWT)/);
  if (m) return m[1].replace(/\s+/g, '');
  return null;
}

function extractPlateFromGrid(grid) {
  for (let r = 0; r < Math.min(grid.length, 12); r++) {
    for (let c = 0; c < Math.min((grid[r] || []).length, 12); c++) {
      const v = grid[r][c];
      const s = String(v || '').toUpperCase();
      const m = s.match(/(\d{5}WWT)/);
      if (m) return m[1];
    }
  }
  return null;
}

function findHeaderRow(grid) {
  for (let r = 0; r < Math.min(grid.length, 60); r++) {
    const row = (grid[r] || []).map(norm);
    const hasDate = row.some(x => x === 'date');
    const hasKm = row.some(x => x.includes('kilometrage'));
    const hasKmJour = row.some(x => x.includes('kmjourn') || (x.includes('km') && x.includes('journal')));
    if (hasDate && hasKm && hasKmJour) return r;
  }
  return -1;
}

function indexOfHeader(rowNorm, predicate) {
  for (let i = 0; i < rowNorm.length; i++) {
    if (predicate(rowNorm[i])) return i;
  }
  return -1;
}

function isMissionRow(row) {
  return row.some(v => norm(v) === 'mission');
}

// ✅ safe get cell
function getCell(row, idx) {
  if (!row || idx === null || idx === undefined || idx < 0) return null;
  return row[idx];
}

function parseSheet(sheetName, grid, fileName) {
  const headerRow = findHeaderRow(grid);
  if (headerRow < 0) return [];

  const h1 = (grid[headerRow] || []).map(norm);
  const h2 = (grid[headerRow + 1] || []).map(norm);
  const hasSub = h2.some(v => v === 'depart') && h2.some(v => v === 'arrivee');

  const dateCol = indexOfHeader(h1, v => v === 'date');
  const kmGroupCol = indexOfHeader(h1, v => v.includes('kilometrage'));
  const kmJourCol = indexOfHeader(h1, v => v.includes('kmjourn') || (v.includes('km') && v.includes('journal')));
  const kmBetweenCol = indexOfHeader(h1, v => v.includes('entre') && v.includes('replein'));
  const consoCol = indexOfHeader(h1, v => v.includes('consomm'));
  const intervalCol = indexOfHeader(h1, v => v.includes('jours') && v.includes('interval'));
  const pleinGroupCol = indexOfHeader(h1, v => v === 'plein');
  const lienCol = indexOfHeader(h1, v => v === 'lien');
  const chauffeurCol = indexOfHeader(h1, v => v === 'chauffeur');
  const frnsCol = indexOfHeader(h1, v => v === 'frns' || v.includes('frns'));

  let kmDepartCol = -1;
  let kmArriveeCol = -1;
  let compteurCol = -1;
  let litreCol = -1;
  let montantCol = -1;

  if (hasSub) {
    kmDepartCol = indexOfHeader(h2, v => v === 'depart');
    kmArriveeCol = indexOfHeader(h2, v => v === 'arrivee');
    compteurCol = indexOfHeader(h2, v => v === 'compteur');
    litreCol = indexOfHeader(h2, v => v === 'litre' || v === 'litres');
    montantCol = indexOfHeader(h2, v => v.includes('montant'));
  } else {
    // common layout where km depart/arrivee are right after the Kilométrage merged cell
    if (kmGroupCol >= 0) {
      kmDepartCol = kmGroupCol;
      kmArriveeCol = kmGroupCol + 1;
    }
    // plein group: 3 columns after 'Plein'
    if (pleinGroupCol >= 0) {
      compteurCol = pleinGroupCol;
      litreCol = pleinGroupCol + 1;
      montantCol = pleinGroupCol + 2;
    }
  }

  // ✅ Guard colonnes critiques : stop avant d'aller lire row[-1]
  const must = [
    ['dateCol', dateCol],
    ['kmDepartCol', kmDepartCol],
    ['kmArriveeCol', kmArriveeCol],
    ['compteurCol', compteurCol],
    ['litreCol', litreCol],
    ['montantCol', montantCol],
  ];
  const missing = must.filter(([_, idx]) => idx === -1).map(([name]) => name);
  if (missing.length) {
    throw new Error(`MISSING_COLUMNS:${missing.join(',')}:sheet=${sheetName}`);
  }

  const startRow = headerRow + (hasSub ? 2 : 1);
  const out = [];
  let emptyStreak = 0;

  for (let r = startRow; r < grid.length; r++) {
    const row = grid[r] || [];
    const hasAny = row.some(v => v !== null && v !== undefined && String(v).trim() !== '');
    if (!hasAny) {
      emptyStreak += 1;
      if (emptyStreak >= 15) break;
      continue;
    }
    emptyStreak = 0;

    if (isMissionRow(row)) {
      const label = row
        .filter(v => typeof v === 'string' && norm(v) !== 'mission')
        .join(' ')
        .trim() || null;

      out.push({
        sheet_name: sheetName,
        source_file_name: fileName,
        row_in_sheet: r + 1,
        is_mission: true,
        mission_label: label
      });
      continue;
    }

    const log_date = parseDate(getCell(row, dateCol));
    const day_name = typeof getCell(row, 0) === 'string' ? String(getCell(row, 0)).trim() : null;
    const day_no = toInt(getCell(row, 1));

    const km_depart = toInt(getCell(row, kmDepartCol));
    const km_arrivee = toInt(getCell(row, kmArriveeCol));
    const km_jour = toInt(getCell(row, kmJourCol));
    const km_between_refill = toInt(getCell(row, kmBetweenCol));
    const consumption = toFloat(getCell(row, consoCol));
    const interval_days = toInt(getCell(row, intervalCol));

    const compteur = toInt(getCell(row, compteurCol));
    const liters = toFloat(getCell(row, litreCol));
    const montant_ar = toInt(getCell(row, montantCol));

    const lien = lienCol >= 0 ? (getCell(row, lienCol) ? String(getCell(row, lienCol)).trim() : null) : null;
    const chauffeur = chauffeurCol >= 0 ? (getCell(row, chauffeurCol) ? String(getCell(row, chauffeurCol)).trim() : null) : null;
    const frns = frnsCol >= 0 ? (getCell(row, frnsCol) ? String(getCell(row, frnsCol)).trim() : null) : null;

    // skip weird rows without date and without km values
    if (!log_date && km_depart === null && km_arrivee === null && km_jour === null && montant_ar === null && liters === null) {
      continue;
    }

    const is_refill = montant_ar !== null && montant_ar >= 200000;

    out.push({
      sheet_name: sheetName,
      source_file_name: fileName,
      row_in_sheet: r + 1,
      log_date,
      day_name,
      day_no,
      km_depart,
      km_arrivee,
      km_jour,
      km_between_refill,
      consumption,
      interval_days,
      compteur,
      liters,
      montant_ar,
      lien,
      chauffeur,
      frns,
      is_refill,
      is_mission: false,
      mission_label: null
    });
  }

  return out;
}

function parseVehicleFuelWorkbook(workbook, originalName) {
  const fileName = originalName || 'upload.xlsx';
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const grid0 = sheetTo2D(firstSheet);
  const plate = extractPlateFromFileName(fileName) || extractPlateFromGrid(grid0) || null;

  const records = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const grid = sheetTo2D(sheet);
    const recs = parseSheet(sheetName, grid, fileName);
    records.push(...recs);
  }

  return { plate, records };
}

module.exports = { parseVehicleFuelWorkbook };
