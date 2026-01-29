const XLSX = require('xlsx');

function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function parseNumber(v) {
  if (v === null || v === undefined || v === '') return null;

  // ✅ IMPORTANT: une Date ne doit JAMAIS devenir un nombre (timestamp ms)
  // sinon ça finit en 1738529964000 et ça casse l'insert int4.
  if (v instanceof Date) return null;

  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    return v;
  }

  const s = String(v).trim();
  if (!s) return null;

  // remove non-breaking spaces, thin spaces
  const cleaned = s
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ /g, '')
    .replace(/,/g, '.');

  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

function toInt(v) {
  const n = parseNumber(v);
  if (n === null) return null;
  const i = Math.trunc(n);

  // ✅ sécurité PostgreSQL int4
  if (i > 2147483647 || i < -2147483648) return null;

  return i;
}

function toFloat(v) {
  const n = parseNumber(v);
  if (n === null) return null;
  return Number(n);
}

function excelDateToJS(excelSerial) {
  // Excel 1900 system
  const d = XLSX.SSF.parse_date_code(excelSerial);
  if (!d) return null;
  // months are 1-based
  return new Date(Date.UTC(d.y, d.m - 1, d.d));
}

// ✅ vrai check calendrier
function isValidYMD(yyyy, mm, dd) {
  const y = Number(yyyy), m = Number(mm), d = Number(dd);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    (dt.getUTCMonth() + 1) === m &&
    dt.getUTCDate() === d
  );
}

function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;

  /**
   * ✅ Correctif TIMEZONE :
   * Si XLSX (ou autre) nous donne déjà un objet Date, on le lit en UTC
   * pour éviter le décalage qui peut transformer 2024-01-01 en 2023-12-31
   * selon le fuseau horaire du serveur.
   */
  if (v instanceof Date) {
    const yyyy = v.getUTCFullYear();
    const mm = String(v.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(v.getUTCDate()).padStart(2, '0');
    if (!isValidYMD(yyyy, mm, dd)) return null;
    return `${yyyy}-${mm}-${dd}`;
  }

  // Excel serial date (nombre)
  if (typeof v === 'number') {
    const d = excelDateToJS(v);
    if (!d) return null;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    if (!isValidYMD(yyyy, mm, dd)) return null;
    return `${yyyy}-${mm}-${dd}`;
  }

  const s = String(v).trim();
  if (!s) return null;

  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, '0');
    const mm = String(m[2]).padStart(2, '0');
    const yyyy = m[3];
    if (!isValidYMD(yyyy, mm, dd)) return null;
    return `${yyyy}-${mm}-${dd}`;
  }

  // yyyy-mm-dd
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) {
    const [_, yyyy, mm, dd] = m2;
    if (!isValidYMD(yyyy, mm, dd)) return null;
    return s;
  }

  return null;
}

function sheetTo2D(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
}

module.exports = { norm, parseNumber, toInt, toFloat, parseDate, sheetTo2D, excelDateToJS, isValidYMD };
