const { parseDate, toFloat, toInt, sheetTo2D, norm } = require('./parseUtils');

function parseOtherWorkbook(workbook, originalName) {
  const fileName = originalName || 'other.xlsx';
  const out = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const grid = sheetTo2D(sheet);

    // header row typically: Date | Litre | Montant | Lien
    let hRow = -1;
    for (let r=0;r<Math.min(grid.length,25);r++) {
      const row = (grid[r]||[]).map(norm);
      if (row.includes('date') && row.some(v=>v.includes('litre')) && row.some(v=>v.includes('montant'))) { hRow=r; break; }
    }
    if (hRow < 0) continue;

    const headers = (grid[hRow] || []).map(norm);
    const dateCol = headers.indexOf('date');
    const litreCol = headers.findIndex(v => v.includes('litre'));
    const montantCol = headers.findIndex(v => v.includes('montant'));
    const lienCol = headers.findIndex(v => v === 'lien');

    for (let r = hRow + 1; r < grid.length; r++) {
      const row = grid[r] || [];
      const log_date = parseDate(row[dateCol]);
      const liters = toFloat(row[litreCol]);
      const montant_ar = toInt(row[montantCol]);
      const lien = lienCol >= 0 && row[lienCol] ? String(row[lienCol]).trim() : null;

      if (!log_date && liters === null && montant_ar === null && !lien) continue;
      if (!log_date) continue;
      out.push({
        log_date,
        liters,
        montant_ar,
        lien,
        source_file_name: fileName,
        sheet_name: sheetName,
        row_in_sheet: r + 1
      });
    }
  }

  return { records: out };
}

module.exports = { parseOtherWorkbook };
