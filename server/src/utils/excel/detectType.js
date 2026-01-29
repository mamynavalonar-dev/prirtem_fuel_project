const XLSX = require('xlsx');
const { norm, sheetTo2D } = require('./parseUtils');

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

  const wbGuess = detectFromWorkbook(workbook);
  return { type: nameGuess || wbGuess, workbook };
}

module.exports = { detectExcelType };
