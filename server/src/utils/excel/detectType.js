const XLSX = require('xlsx');
const { norm, sheetTo2D } = require('./parseUtils');

const MAX_WORKBOOK_SHEETS = 64;
const MAX_WORKBOOK_CELLS = 1_000_000;

function assertWorkbookLimits(workbook) {
  if (workbook.SheetNames.length > MAX_WORKBOOK_SHEETS) {
    throw new Error('WORKBOOK_SHEET_LIMIT_EXCEEDED');
  }

  let totalCells = 0;
  for (const sheetName of workbook.SheetNames) {
    const ref = workbook.Sheets[sheetName]?.['!ref'] || 'A1';
    const range = XLSX.utils.decode_range(ref);
    const rows = range.e.r - range.s.r + 1;
    const columns = range.e.c - range.s.c + 1;
    totalCells += rows * columns;

    if (totalCells > MAX_WORKBOOK_CELLS) {
      throw new Error('WORKBOOK_CELL_LIMIT_EXCEEDED');
    }
  }
}

function detectFromName(name) {
  const n = norm(name);
  if (n.includes('groupe') && n.includes('elect')) return 'GENERATOR';
  if (n.includes('autres') && n.includes('carburant')) return 'OTHER';
  if (n.includes('suivi') && n.includes('carburant')) return 'VEHICLE';
  return null;
}

function detectFromWorkbook(workbook) {
  // quick scan of a few top cells across sheets
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const grid = sheetTo2D(sheet);
    for (let r = 0; r < Math.min(grid.length, 25); r++) {
      for (let c = 0; c < Math.min((grid[r] || []).length, 20); c++) {
        const v = grid[r][c];
        const s = norm(v);
        if (!s) continue;
        if (s.includes('suivi') && s.includes('carburant')) return 'VEHICLE';
        if (s.includes('groupe') && s.includes('electrogene')) return 'GENERATOR';
        if (s.includes('autres') && s.includes('carburants')) return 'OTHER';
        if (s.includes('demande de carburant')) return 'FUEL_REQUEST_FORM';
      }
    }
  }
  return 'UNKNOWN';
}

function detectExcelType(buffer, originalName) {
  const nameGuess = detectFromName(originalName || '');

  /**
   * ✅ Correctif : cellDates = false
   * On évite que XLSX transforme les dates en objets Date (sensibles au timezone).
   * Les dates restent des nombres Excel (serial), traités en UTC par parseDate().
  */
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  assertWorkbookLimits(workbook);

  const wbGuess = nameGuess ? null : detectFromWorkbook(workbook);
  return { type: nameGuess || wbGuess, workbook };
}

module.exports = { detectExcelType, MAX_WORKBOOK_SHEETS, MAX_WORKBOOK_CELLS };
