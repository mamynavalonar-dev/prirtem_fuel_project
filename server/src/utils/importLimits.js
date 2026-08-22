function readPositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function getImportLimits(env = process.env) {
  const isVercel = String(env.VERCEL || '') === '1';
  const isDemo = String(env.DEMO_MODE || '').toLowerCase() === 'true';

  const defaultMb = isVercel || isDemo ? 3 : 5;
  const requestedMb = readPositiveInteger(env.IMPORT_MAX_FILE_SIZE_MB, defaultMb);
  // Vercel Functions limit the complete request payload to 4.5 MB.
  // Keep multipart uploads comfortably below that ceiling.
  const maxFileSizeMb = isVercel ? Math.min(requestedMb, 3) : requestedMb;

  const defaultFiles = isVercel || isDemo ? 1 : 5;
  const requestedFiles = readPositiveInteger(env.IMPORT_MAX_FILES, defaultFiles);
  const maxFiles = isVercel || isDemo ? Math.min(requestedFiles, 1) : Math.min(requestedFiles, 10);

  return {
    maxFileSizeMb,
    maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
    maxFiles
  };
}

module.exports = { getImportLimits };
