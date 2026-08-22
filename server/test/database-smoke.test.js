const test = require('node:test');
const assert = require('node:assert/strict');

if (process.env.RUN_DB_TESTS !== 'true') {
  test('database smoke tests require RUN_DB_TESTS=true', { skip: true }, () => {});
} else {
  const { pool } = require('../src/db');
  const { runMigrations } = require('../src/sql/migrate');

  test('migrations create the complete schema and are idempotent', async (t) => {
    t.after(() => pool.end());
    await runMigrations();
    await runMigrations();

    const migrations = await pool.query('SELECT id FROM schema_migrations ORDER BY id');
    assert.deepEqual(migrations.rows.map((row) => row.id), [
      '001_initial',
      '002_legacy_alignment',
      '003_integrity'
    ]);

    const relations = await pool.query(
      `SELECT to_regclass('public.users') AS users,
              to_regclass('public.password_reset_tokens') AS reset_tokens,
              to_regclass('public.vehicle_fuel_logs') AS vehicle_logs`
    );
    assert.ok(relations.rows[0].users);
    assert.ok(relations.rows[0].reset_tokens);
    assert.ok(relations.rows[0].vehicle_logs);

    const manualColumns = await pool.query(
      `SELECT column_name, is_nullable
       FROM information_schema.columns
       WHERE table_name='vehicle_fuel_logs'
         AND column_name IN ('import_batch_id','import_file_id')
       ORDER BY column_name`
    );
    assert.equal(manualColumns.rows.every((column) => column.is_nullable === 'YES'), true);
  });
}
