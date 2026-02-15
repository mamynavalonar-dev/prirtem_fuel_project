-- Hotfix PRIRTEM: colonnes manquantes attendues par les controllers (soft delete sur les logs)

BEGIN;

ALTER TABLE vehicle_fuel_logs
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

ALTER TABLE generator_fuel_logs
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

ALTER TABLE other_fuel_logs
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_vfl_deleted_at ON vehicle_fuel_logs(deleted_at);
CREATE INDEX IF NOT EXISTS idx_gfl_deleted_at ON generator_fuel_logs(deleted_at);
CREATE INDEX IF NOT EXISTS idx_ofl_deleted_at ON other_fuel_logs(deleted_at);

COMMIT;
