async function up(client) {
  await client.query(`
    ALTER TABLE import_files
      ADD COLUMN IF NOT EXISTS content_sha256 TEXT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_import_files_done_hash
      ON import_files(content_sha256)
      WHERE status='DONE' AND content_sha256 IS NOT NULL;

    ALTER TABLE vehicle_fuel_logs ALTER COLUMN import_batch_id DROP NOT NULL;
    ALTER TABLE vehicle_fuel_logs ALTER COLUMN import_file_id DROP NOT NULL;
    ALTER TABLE generator_fuel_logs ALTER COLUMN import_batch_id DROP NOT NULL;
    ALTER TABLE generator_fuel_logs ALTER COLUMN import_file_id DROP NOT NULL;
    ALTER TABLE other_fuel_logs ALTER COLUMN import_batch_id DROP NOT NULL;
    ALTER TABLE other_fuel_logs ALTER COLUMN import_file_id DROP NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_fuel_requests_year_seq ON fuel_requests(year, seq);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_car_requests_year_seq ON car_requests(year, seq);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_password_reset_token_hash
      ON password_reset_tokens(token_hash);

    DROP INDEX IF EXISTS uniq_one_admin_active;
    DROP INDEX IF EXISTS uniq_one_logistique_active;
    DROP INDEX IF EXISTS uniq_one_raf_active;
  `);
}

module.exports = { id: '003_integrity', up };
