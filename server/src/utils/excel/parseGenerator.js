const { parseDate, toFloat, toInt, sheetTo2D, norm } = require('./parseUtils');

function parseGeneratorWorkbook(workbook, originalName) {
  const fileName = originalName || 'generator.xlsx';
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const grid = sheetTo2D(sheet);

  // Trouver la ligne d'en-tête "Groupe électrogène"
  let titleRow = -1;
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const row = (grid[r] || []).map(v => norm(v));
    if (row.some(v => v.includes('groupe') && v.includes('electrogene'))) {
      titleRow = r;
      break;
    }
  }

  if (titleRow < 0) {
    console.log('[GENERATOR] Titre "Groupe électrogène" non trouvé, recherche headers classiques...');
    // Fallback: recherche headers classiques
    for (let r = 0; r < Math.min(grid.length, 20); r++) {
      const row = (grid[r] || []).map(norm);
      if (row.includes('date') && row.some(v => v.includes('litre')) && row.some(v => v.includes('montant'))) {
        titleRow = r - 1; // Assume title is row before
        break;
      }
    }
  }

  if (titleRow < 0) return { records: [] };

  // La ligne des headers est juste après le titre
  const hRow = titleRow + 1;
  if (hRow >= grid.length) return { records: [] };

  const headers = (grid[hRow] || []).map(norm);
  
  // Colonnes: Date, Litres, Montant, Lien
  const dateCol = headers.findIndex(v => v === 'date');
  const litreCol = headers.findIndex(v => v.includes('litre'));
  const montantCol = headers.findIndex(v => v.includes('montant'));
  const lienCol = headers.findIndex(v => v === 'lien');

  if (dateCol < 0 || litreCol < 0 || montantCol < 0) {
    console.error('[GENERATOR] Colonnes essentielles manquantes:', { dateCol, litreCol, montantCol });
    return { records: [] };
  }

  const out = [];
  let emptyStreak = 0;

  for (let r = hRow + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    
    // Check si ligne vide
    const hasAny = row.some(v => v !== null && v !== undefined && String(v).trim() !== '');
    if (!hasAny) {
      emptyStreak += 1;
      if (emptyStreak >= 10) break;
      continue;
    }
    emptyStreak = 0;

    const log_date = parseDate(row[dateCol]);
    const liters = toFloat(row[litreCol]);
    const montant_ar = toInt(row[montantCol]);

    // Skip si pas de date ET pas de données
    if (!log_date && liters === null && montant_ar === null) continue;
    
    // Skip si date invalide
    if (!log_date) continue;

    out.push({
      log_date,
      liters,
      montant_ar,
      source_file_name: fileName,
      sheet_name: sheetName,
      row_in_sheet: r + 1
    });
  }

  console.log(`[GENERATOR] Parsed ${out.length} lignes depuis ${fileName}`);
  return { records: out };
}

module.exports = { parseGeneratorWorkbook };