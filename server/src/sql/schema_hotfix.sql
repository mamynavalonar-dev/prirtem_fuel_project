-- pour reparer db et se qui ne va pas/server/src/sql/schema_hotfix.sql
-- Hotfix PRIRTEM: colonnes manquantes attendues par les controllers + ajout vehicle_id sur fuel_requests

BEGIN;

-- Soft delete logs
ALTER TABLE vehicle_fuel_logs
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

ALTER TABLE generator_fuel_logs
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

ALTER TABLE other_fuel_logs
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_vfl_deleted_at ON vehicle_fuel_logs(deleted_at);
CREATE INDEX IF NOT EXISTS idx_gfl_deleted_at ON generator_fuel_logs(deleted_at);
CREATE INDEX IF NOT EXISTS idx_ofl_deleted_at ON other_fuel_logs(deleted_at);

-- ✅ Fuel requests: véhicule concerné
ALTER TABLE fuel_requests
  ADD COLUMN IF NOT EXISTS vehicle_id UUID NULL REFERENCES vehicles(id);

CREATE INDEX IF NOT EXISTS idx_fuel_requests_vehicle_id ON fuel_requests(vehicle_id);

COMMIT;
