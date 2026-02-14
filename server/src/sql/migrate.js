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

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dva_vehicle ON driver_vehicle_assignments(vehicle_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dva_driver ON driver_vehicle_assignments(driver_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dva_active_vehicle ON driver_vehicle_assignments(vehicle_id)
    WHERE end_at IS NULL AND deleted_at IS NULL;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dva_active_driver ON driver_vehicle_assignments(driver_id)
    WHERE end_at IS NULL AND deleted_at IS NULL;
  `);

  // Un seul actif à la fois par véhicule / par chauffeur (historique OK)
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
}

module.exports = { runMigrations };
