/**
 * ────────────────── server/src/controllers/db.js ──────────────────
 * CORRECTIF APPLIQUÉ :
 * 1) Gestion des erreurs inattendues sur le pool (anti-crash).
 * 2) IMPORTANT : Forcer PostgreSQL DATE (OID 1082) à rester une string "YYYY-MM-DD"
 *    (évite les décalages et le format ...T21:00:00.000Z dans le JSON).
 */
const { Pool, types } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required in .env');
}

/**
 * ✅ Fix DATE Postgres :
 * OID 1082 = DATE
 * On force la sortie en STRING "YYYY-MM-DD" (pas de Date JS).
 */
types.setTypeParser(1082, (val) => val);

const sslEnabled = process.env.DB_SSL === 'true';
const ssl = sslEnabled
  ? {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n') } : {})
    }
  : false;

function envNumber(name, fallback, min, max) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

const pool = new Pool({
  connectionString,
  max: envNumber('DB_POOL_MAX', 20, 1, 50),
  idleTimeoutMillis: envNumber('DB_IDLE_TIMEOUT_MS', 30000, 1000, 300000),
  connectionTimeoutMillis: envNumber('DB_CONNECTION_TIMEOUT_MS', 5000, 500, 60000),
  statement_timeout: envNumber('DB_STATEMENT_TIMEOUT_MS', 30000, 1000, 300000),
  ssl
});

// IMPORTANT : Capture les erreurs sur les clients inactifs pour éviter le crash du serveur
pool.on('error', (err, client) => {
  console.error('❌ Unexpected error on idle client', err);
  // Ne pas exit(-1) ici, on laisse le pool essayer de se reconnecter
});

module.exports = { pool };
