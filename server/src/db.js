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

// Configuration recommandée pour la prod (SSL si besoin)
const pool = new Pool({
  connectionString,
  // max: 20, // (Optionnel) Limite de connexions simultanées
  // idleTimeoutMillis: 30000
});

// IMPORTANT : Capture les erreurs sur les clients inactifs pour éviter le crash du serveur
pool.on('error', (err, client) => {
  console.error('❌ Unexpected error on idle client', err);
  // Ne pas exit(-1) ici, on laisse le pool essayer de se reconnecter
});

module.exports = { pool };
