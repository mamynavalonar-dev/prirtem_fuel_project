const test = require('node:test');
const assert = require('node:assert/strict');

if (process.env.RUN_DB_TESTS !== 'true') {
  test('database smoke tests require RUN_DB_TESTS=true', { skip: true }, () => {});
} else {
  // Migrations and fixtures must never run against a deployed application.
  const databaseUrl = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(databaseUrl.hostname), 'DB tests require local PostgreSQL');
  assert.match(databaseUrl.pathname, /test/i, 'DB tests require a dedicated test database');
  assert.ok(!process.env.MIGRATION_DATABASE_URL || process.env.MIGRATION_DATABASE_URL === process.env.DATABASE_URL,
    'DB tests must use the same isolated migration database');
  const { pool } = require('../src/db');
  const { runMigrations } = require('../src/sql/migrate');
  const securityMigration = require('../src/sql/migrations/004_security_and_history');

  test('migrations create the complete schema and are idempotent', async (t) => {
    t.after(() => pool.end());
    await runMigrations();
    await runMigrations();

    const migrations = await pool.query('SELECT id FROM schema_migrations ORDER BY id');
    assert.deepEqual(migrations.rows.map((row) => row.id), [
      '001_initial',
      '002_legacy_alignment',
      '003_integrity',
      '004_security_and_history'
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

    // Emulate Supabase's default grants, then exercise the migration itself
    // twice (rather than merely skipping an already-recorded migration).
    await pool.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END $$`);
    await pool.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated');
    const migrationClient = await pool.connect();
    try {
      await securityMigration.up(migrationClient);
      await securityMigration.up(migrationClient);
    } finally {
      migrationClient.release();
    }
    const protectedState = await pool.query(`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
             has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS anon_access,
             has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS authenticated_access
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[])
    `, [securityMigration.protectedTables]);
    assert.equal(protectedState.rows.length, securityMigration.protectedTables.length);
    for (const row of protectedState.rows) {
      assert.equal(row.relrowsecurity, true, row.relname);
      assert.equal(row.relforcerowsecurity, false, row.relname);
      assert.equal(row.anon_access, false, row.relname);
      assert.equal(row.authenticated_access, false, row.relname);
    }
    const trigger = await pool.query("SELECT proconfig FROM pg_proc WHERE oid='public.set_updated_at()'::regprocedure");
    assert.ok(trigger.rows[0].proconfig.includes('search_path=pg_catalog'));
    const vehicleForeignKey = await pool.query(`SELECT confdeltype FROM pg_constraint
      WHERE conrelid='public.vehicle_fuel_logs'::regclass AND confrelid='public.vehicles'::regclass AND contype='f'`);
    assert.deepEqual(vehicleForeignKey.rows.map((row) => row.confdeltype), ['r']);
    const duplicateIndexes = await pool.query(`SELECT to_regclass('public.idx_car_logbooks_deleted_at') AS duplicate_at,
      to_regclass('public.idx_car_logbooks_deleted_by') AS duplicate_by,
      to_regclass('public.idx_cl_deleted_at') AS kept_at, to_regclass('public.idx_cl_deleted_by') AS kept_by`);
    assert.equal(duplicateIndexes.rows[0].duplicate_at, null);
    assert.equal(duplicateIndexes.rows[0].duplicate_by, null);
    assert.ok(duplicateIndexes.rows[0].kept_at);
    assert.ok(duplicateIndexes.rows[0].kept_by);

    const { runIntegrityScenarios } = require('./helpers/database-integrity');
    await runIntegrityScenarios(t, pool);
  });
}
