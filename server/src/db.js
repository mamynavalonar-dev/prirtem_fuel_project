const { Pool, types } = require('pg');

types.setTypeParser(1082, (val) => val);

function envNumber(name, fallback, min, max) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function buildSslConfig() {
  if (process.env.DB_SSL !== 'true') return false;
  return {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    ...(process.env.DB_SSL_CA
      ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n') }
      : {})
  };
}

function createPool(connectionString, overrides = {}) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required in .env');
  }

  const serverless = process.env.VERCEL === '1' || process.env.SERVERLESS === 'true';
  const pool = new Pool({
    connectionString,
    max: envNumber('DB_POOL_MAX', serverless ? 2 : 20, 1, 50),
    idleTimeoutMillis: envNumber('DB_IDLE_TIMEOUT_MS', serverless ? 10000 : 30000, 1000, 300000),
    connectionTimeoutMillis: envNumber('DB_CONNECTION_TIMEOUT_MS', 5000, 500, 60000),
    statement_timeout: envNumber('DB_STATEMENT_TIMEOUT_MS', 30000, 1000, 300000),
    ssl: buildSslConfig(),
    ...overrides
  });

  pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle client', err);
  });

  return pool;
}

const pool = createPool(process.env.DATABASE_URL);

module.exports = { pool, createPool };
