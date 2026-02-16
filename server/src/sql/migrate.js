// server/src/sql/migrate.js
const { pool } = require('../db');

async function runMigrations() {
  // ====== VEHICLES: colonnes supplémentaires ======
  await pool.query(`
    ALTER TABLE vehicles
      ADD COLUMN IF NOT EXISTS brand TEXT NULL,
      ADD COLUMN IF NOT EXISTS model TEXT NULL,
      ADD COLUMN IF NOT EXISTS energy_type TEXT NULL,
      ADD COLUMN IF NOT EXISTS seats INTEGER NULL,
      ADD COLUMN IF NOT EXISTS vehicle_type TEXT NULL,
      ADD COLUMN IF NOT EXISTS tank_capacity_l NUMERIC NULL,
      ADD COLUMN IF NOT EXISTS ref_consumption_l_100 NUMERIC NULL,
      ADD COLUMN IF NOT EXISTS last_service_at DATE NULL,
      ADD COLUMN IF NOT EXISTS next_service_at DATE NULL,
      ADD COLUMN IF NOT EXISTS notes TEXT NULL;
  `);

  // ====== DRIVERS: colonnes supplémentaires ======
  await pool.query(`
    ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS first_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS last_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS matricule TEXT NULL,
      ADD COLUMN IF NOT EXISTS license_no TEXT NULL,
      ADD COLUMN IF NOT EXISTS license_expiry DATE NULL,
      ADD COLUMN IF NOT EXISTS cin TEXT NULL,
      ADD COLUMN IF NOT EXISTS address TEXT NULL;
  `);

  // ====== AFFECTATIONS CHAUFFEUR <-> VEHICULE (HISTORIQUE) ======
  await pool.query(`
    CREATE TABLE IF NOT EXISTS driver_vehicle_assignments (
      id UUID PRIMARY KEY,
      vehicle_id UUID NOT NULL REFERENCES vehicles(id),
      driver_id UUID NOT NULL REFERENCES drivers(id),
      start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      end_at TIMESTAMPTZ NULL,
      notes TEXT NULL,
      created_by UUID NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ NULL
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dva_vehicle ON driver_vehicle_assignments(vehicle_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dva_driver ON driver_vehicle_assignments(driver_id);`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dva_active_vehicle ON driver_vehicle_assignments(vehicle_id)
    WHERE end_at IS NULL AND deleted_at IS NULL;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dva_active_driver ON driver_vehicle_assignments(driver_id)
    WHERE end_at IS NULL AND deleted_at IS NULL;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_dva_one_active_vehicle
    ON driver_vehicle_assignments(vehicle_id)
    WHERE end_at IS NULL AND deleted_at IS NULL;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_dva_one_active_driver
    ON driver_vehicle_assignments(driver_id)
    WHERE end_at IS NULL AND deleted_at IS NULL;
  `);

  // ====== CAR REQUESTS: end_date + annulation + status CANCELLED ======
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'car_request_status' AND e.enumlabel = 'CANCELLED'
      ) THEN
        ALTER TYPE car_request_status ADD VALUE 'CANCELLED';
      END IF;
    END $$;
  `);

  await pool.query(`
    ALTER TABLE car_requests
      ADD COLUMN IF NOT EXISTS end_date DATE NULL,
      ADD COLUMN IF NOT EXISTS cancelled_by UUID NULL REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS cancel_reason TEXT NULL;
  `);

  await pool.query(`
    UPDATE car_requests
    SET end_date = proposed_date
    WHERE end_date IS NULL;
  `);

  await pool.query(`ALTER TABLE car_requests ALTER COLUMN end_date SET NOT NULL;`);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_type = 'CHECK'
          AND table_name = 'car_requests'
          AND constraint_name = 'chk_car_requests_end_date'
      ) THEN
        ALTER TABLE car_requests
          ADD CONSTRAINT chk_car_requests_end_date CHECK (end_date >= proposed_date);
      END IF;
    END $$;
  `);

  // ====== FUEL REQUESTS: end_date + annulation + status CANCELLED ======
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'fuel_request_status' AND e.enumlabel = 'CANCELLED'
      ) THEN
        ALTER TYPE fuel_request_status ADD VALUE 'CANCELLED';
      END IF;
    END $$;
  `);

  await pool.query(`
    ALTER TABLE fuel_requests
      ADD COLUMN IF NOT EXISTS end_date DATE NULL,
      ADD COLUMN IF NOT EXISTS cancelled_by UUID NULL REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS cancel_reason TEXT NULL;
  `);

  await pool.query(`
    UPDATE fuel_requests
    SET end_date = request_date
    WHERE end_date IS NULL;
  `);

  await pool.query(`ALTER TABLE fuel_requests ALTER COLUMN end_date SET NOT NULL;`);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_type = 'CHECK'
          AND table_name = 'fuel_requests'
          AND constraint_name = 'chk_fuel_requests_end_date'
      ) THEN
        ALTER TABLE fuel_requests
          ADD CONSTRAINT chk_fuel_requests_end_date CHECK (end_date >= request_date);
      END IF;
    END $$;
  `);


  // =====================================================================
  // ✅ TRASH AUDIT: deleted_at + deleted_by (qui a supprimé ?)
  // =====================================================================

  // META
  await pool.query(`
    ALTER TABLE vehicles
      ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES users(id);
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_vehicles_deleted_by ON vehicles(deleted_by);`);

  await pool.query(`
    ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES users(id);
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_drivers_deleted_by ON drivers(deleted_by);`);

  // REQUESTS
  await pool.query(`
    ALTER TABLE fuel_requests
      ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES users(id);
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fr_deleted_by ON fuel_requests(deleted_by);`);

  await pool.query(`
    ALTER TABLE car_requests
      ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES users(id);
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cr_deleted_by ON car_requests(deleted_by);`);

  // FUEL LOGS (certains anciens schémas n'avaient pas la corbeille)
  await pool.query(`
    ALTER TABLE vehicle_fuel_logs
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES users(id);
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_vfl_deleted_at ON vehicle_fuel_logs(deleted_at);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_vfl_deleted_by ON vehicle_fuel_logs(deleted_by);`);

  await pool.query(`
    ALTER TABLE generator_fuel_logs
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES users(id);
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_gfl_deleted_at ON generator_fuel_logs(deleted_at);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_gfl_deleted_by ON generator_fuel_logs(deleted_by);`);

  await pool.query(`
    ALTER TABLE other_fuel_logs
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES users(id);
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ofl_deleted_at ON other_fuel_logs(deleted_at);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ofl_deleted_by ON other_fuel_logs(deleted_by);`);


  // =====================================================================
  // ✅ LOGBOOKS: logbook_type + deleted_at (corbeille)
  // =====================================================================
  await pool.query(`
    ALTER TABLE car_logbooks
      ADD COLUMN IF NOT EXISTS logbook_type TEXT NULL,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES users(id);
  `);

  await pool.query(`
    UPDATE car_logbooks
    SET logbook_type = 'SERVICE'
    WHERE logbook_type IS NULL;
  `);

  await pool.query(`
    ALTER TABLE car_logbooks
      ALTER COLUMN logbook_type SET NOT NULL;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_type = 'CHECK'
          AND table_name = 'car_logbooks'
          AND constraint_name = 'chk_car_logbooks_type'
      ) THEN
        ALTER TABLE car_logbooks
          ADD CONSTRAINT chk_car_logbooks_type CHECK (logbook_type IN ('SERVICE','MISSION'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_car_logbooks_deleted_at ON car_logbooks(deleted_at);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_car_logbooks_deleted_by ON car_logbooks(deleted_by);
  `);
}

module.exports = { runMigrations };


