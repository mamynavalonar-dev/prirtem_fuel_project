function neutralizeCsvFormula(value) {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  const afterLeadingSpaces = raw.replace(/^ +/, '');
  if (/^[=+\-@\t\r\n]/.test(afterLeadingSpaces)) return `'${raw}`;
  return raw;
}

function csvEscape(value) {
  const safe = neutralizeCsvFormula(value);
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

function normalizeHttpUrl(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

module.exports = { neutralizeCsvFormula, csvEscape, normalizeHttpUrl };
