// Express connects as the table owner (or a BYPASSRLS role). Browser clients
// must use Express authorization, never the Supabase Data API for these tables.
const protectedTables = [
  'users', 'password_reset_tokens', 'vehicles', 'drivers', 'import_batches',
  'import_files', 'vehicle_fuel_logs', 'generator_fuel_logs', 'other_fuel_logs',
  'fuel_requests', 'car_requests', 'car_logbooks', 'car_logbook_trips',
  'car_logbook_fuel_supplies', 'driver_vehicle_assignments', 'admin_audit_logs',
  'notification_reads', 'schema_migrations', 'api_rate_limits'
];

async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.api_rate_limits (
      key TEXT PRIMARY KEY,
      hits INTEGER NOT NULL,
      reset_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset_at ON public.api_rate_limits(reset_at);
    ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog;
  `);

  const roles = await client.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')");
  for (const table of protectedTables) {
    // Names are a static application allowlist; no user input is interpolated.
    await client.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    await client.query(`REVOKE ALL PRIVILEGES ON TABLE public.${table} FROM PUBLIC`);
    for (const { rolname } of roles.rows) {
      await client.query(`REVOKE ALL PRIVILEGES ON TABLE public.${table} FROM "${rolname}"`);
    }
  }

  await client.query(`
    DO $$
    DECLARE fk record;
    BEGIN
      FOR fk IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
        WHERE c.contype='f' AND c.conrelid='public.vehicle_fuel_logs'::regclass
          AND c.confrelid='public.vehicles'::regclass
          AND cardinality(c.conkey)=1 AND a.attname='vehicle_id'
          AND c.confdeltype <> 'r'
      LOOP
        EXECUTE format('ALTER TABLE public.vehicle_fuel_logs DROP CONSTRAINT %I', fk.conname);
        EXECUTE format('ALTER TABLE public.vehicle_fuel_logs ADD CONSTRAINT %I FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE RESTRICT', fk.conname);
      END LOOP;
    END $$;
  `);

  // Cover foreign keys that have no valid, non-partial index with these leading
  // columns. Existing useful composite indexes are kept and reused.
  await client.query(`
    DO $$
    DECLARE fk record;
    BEGIN
      FOR fk IN
        SELECT c.conrelid, c.conkey, t.relname,
               string_agg(quote_ident(a.attname), ', ' ORDER BY col.ordinality) AS columns_sql,
               'idx_fk_' || substr(t.relname, 1, 32) || '_' || substr(md5(c.conname), 1, 12) AS index_name
        FROM pg_constraint c
        JOIN pg_class t ON t.oid=c.conrelid
        JOIN pg_namespace n ON n.oid=t.relnamespace
        CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS col(attnum, ordinality)
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=col.attnum
        WHERE c.contype='f' AND n.nspname='public'
          AND t.relname = ANY(ARRAY[${protectedTables.map((table) => `'${table}'`).join(',')}])
          AND NOT EXISTS (
            SELECT 1 FROM pg_index i
            WHERE i.indrelid=c.conrelid AND i.indisvalid AND i.indisready
              AND i.indpred IS NULL AND i.indnkeyatts >= cardinality(c.conkey)
              AND ARRAY(SELECT key FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS keys(key, ord)
                        WHERE ord <= cardinality(c.conkey) ORDER BY ord) = c.conkey
          )
        GROUP BY c.oid, c.conrelid, c.conkey, c.conname, t.relname
      LOOP
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', fk.index_name, fk.relname, fk.columns_sql);
      END LOOP;
    END $$;
  `);

  // These two names were introduced by migration 002 alongside schema.sql's
  // identical indexes. Drop only after verifying equivalence in the catalog.
  await client.query(`
    DO $$
    DECLARE pair record;
    BEGIN
      FOR pair IN SELECT * FROM (VALUES
        ('idx_car_logbooks_deleted_at', 'idx_cl_deleted_at'),
        ('idx_car_logbooks_deleted_by', 'idx_cl_deleted_by')
      ) AS duplicates(drop_name, keep_name)
      LOOP
        IF EXISTS (
          SELECT 1 FROM pg_index d
          JOIN pg_index k ON k.indexrelid=to_regclass('public.' || pair.keep_name)
          JOIN pg_class dc ON dc.oid=d.indexrelid
          JOIN pg_class kc ON kc.oid=k.indexrelid
          WHERE d.indexrelid=to_regclass('public.' || pair.drop_name)
            AND d.indrelid=k.indrelid AND d.indkey=k.indkey
            AND d.indclass=k.indclass AND d.indcollation=k.indcollation AND d.indoption=k.indoption
            AND d.indnkeyatts=k.indnkeyatts AND d.indnatts=k.indnatts
            AND d.indisunique=k.indisunique AND NOT d.indisprimary AND NOT d.indisreplident
            AND k.indisvalid AND k.indisready AND dc.relam=kc.relam
            AND d.indexprs::text IS NOT DISTINCT FROM k.indexprs::text
            AND d.indpred::text IS NOT DISTINCT FROM k.indpred::text
            AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid=d.indexrelid)
        ) THEN
          EXECUTE format('DROP INDEX public.%I', pair.drop_name);
        END IF;
      END LOOP;
    END $$;
  `);
}

module.exports = { id: '004_security_and_history', up, protectedTables };
