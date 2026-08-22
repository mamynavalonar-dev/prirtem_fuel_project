require('dotenv').config();

const { pool } = require('../db');
const initial = require('./migrations/001_initial');
const legacyAlignment = require('./migrations/002_legacy_alignment');
const integrity = require('./migrations/003_integrity');

const migrations = [initial, legacyAlignment, integrity];
const MIGRATION_LOCK_ID = 1732050807;

async function relationExists(client, relationName) {
  const { rows } = await client.query('SELECT to_regclass($1) AS relation', [`public.${relationName}`]);
  return Boolean(rows[0]?.relation);
}

async function runMigrations() {
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await client.query('SELECT id FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.id));

    // Baseline a pre-migration installation without replaying schema.sql.
    if (!applied.has(initial.id) && await relationExists(client, 'users')) {
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [initial.id]);
      applied.add(initial.id);
    }

    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;

      await client.query('BEGIN');
      try {
        await migration.up(client);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${migration.id} failed`, { cause: error });
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => console.log('Database migrations completed.'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { runMigrations };
