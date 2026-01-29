-- PRIRTEM Fuel WebApp - Database schema (PostgreSQL)
-- NOTE: Designed to match the server controllers/routes in /server/src

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- TYPES ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('DEMANDEUR', 'LOGISTIQUE', 'RAF', 'ADMIN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fuel_request_status') THEN
    CREATE TYPE fuel_request_status AS ENUM ('DRAFT','SUBMITTED','VERIFIED','APPROVED','REJECTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'car_request_status') THEN
    CREATE TYPE car_request_status AS ENUM ('SUBMITTED','LOGISTICS_APPROVED','RAF_APPROVED','REJECTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'logbook_status') THEN
    CREATE TYPE logbook_status AS ENUM ('DRAFT','SUBMITTED','LOCKED');
  END IF;
END $$;

-- ---------- DROP (safe re-run) ----------
DROP TABLE IF EXISTS car_logbook_fuel_supplies CASCADE;
DROP TABLE IF EXISTS car_logbook_trips CASCADE;
DROP TABLE IF EXISTS car_logbooks CASCADE;

DROP TABLE IF EXISTS car_requests CASCADE;
DROP TABLE IF EXISTS fuel_requests CASCADE;

DROP TABLE IF EXISTS vehicle_fuel_logs CASCADE;
DROP TABLE IF EXISTS generator_fuel_logs CASCADE;
DROP TABLE IF EXISTS other_fuel_logs CASCADE;

DROP TABLE IF EXISTS import_files CASCADE;
DROP TABLE IF EXISTS import_batches CASCADE;

DROP TABLE IF EXISTS drivers CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;

DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ---------- COMMON ----------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------- USERS ----------
CREATE TABLE users (
  id UUID PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  role user_role NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trig_users_updated
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prt_user_id ON password_reset_tokens(user_id);

-- ---------- META ----------
CREATE TABLE vehicles (
  id UUID PRIMARY KEY,
  plate TEXT NOT NULL UNIQUE,
  label TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_vehicles_deleted_at ON vehicles(deleted_at);

CREATE TRIGGER trig_vehicles_updated
BEFORE UPDATE ON vehicles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE drivers (
  id UUID PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_drivers_deleted_at ON drivers(deleted_at);

CREATE TRIGGER trig_drivers_updated
BEFORE UPDATE ON drivers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- IMPORT HISTORY ----------
CREATE TABLE import_batches (
  id UUID PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE import_files (
  id UUID PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  mime_type TEXT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  detected_type TEXT NULL,
  inserted_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_import_files_batch ON import_files(batch_id);

-- ---------- FUEL LOGS ----------
CREATE TABLE vehicle_fuel_logs (
  id UUID PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,

  log_date DATE NULL,
  day_name TEXT NULL,
  day_no INTEGER NULL,

  km_depart INTEGER NULL,
  km_arrivee INTEGER NULL,
  km_jour INTEGER NULL,

  km_between_refill INTEGER NULL,
  consumption DOUBLE PRECISION NULL,
  interval_days INTEGER NULL,

  compteur INTEGER NULL,
  liters DOUBLE PRECISION NULL,
  montant_ar INTEGER NULL,

  lien TEXT NULL,
  chauffeur TEXT NULL,
  frns TEXT NULL,

  is_refill BOOLEAN NOT NULL DEFAULT FALSE,
  is_mission BOOLEAN NOT NULL DEFAULT FALSE,
  mission_label TEXT NULL,

  source_file_name TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  row_in_sheet INTEGER NOT NULL,

  import_batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  import_file_id UUID NOT NULL REFERENCES import_files(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vfl_vehicle_date ON vehicle_fuel_logs(vehicle_id, log_date);
CREATE INDEX idx_vfl_batch ON vehicle_fuel_logs(import_batch_id);
CREATE INDEX idx_vfl_is_refill ON vehicle_fuel_logs(is_refill);

CREATE TABLE generator_fuel_logs (
  id UUID PRIMARY KEY,
  log_date DATE NOT NULL,
  liters DOUBLE PRECISION NULL,
  montant_ar INTEGER NULL,

  source_file_name TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  row_in_sheet INTEGER NOT NULL,

  import_batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  import_file_id UUID NOT NULL REFERENCES import_files(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gfl_date ON generator_fuel_logs(log_date);

CREATE TABLE other_fuel_logs (
  id UUID PRIMARY KEY,
  log_date DATE NOT NULL,
  liters DOUBLE PRECISION NULL,
  montant_ar INTEGER NULL,
  lien TEXT NULL,

  source_file_name TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  row_in_sheet INTEGER NOT NULL,

  import_batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  import_file_id UUID NOT NULL REFERENCES import_files(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ofl_date ON other_fuel_logs(log_date);

-- ---------- REQUESTS ----------
CREATE TABLE fuel_requests (
  id UUID PRIMARY KEY,
  year INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  request_no TEXT NOT NULL UNIQUE,

  request_type TEXT NOT NULL CHECK (request_type IN ('SERVICE','MISSION')),
  objet TEXT NOT NULL,
  amount_estimated_ar INTEGER NOT NULL,
  amount_estimated_words TEXT NOT NULL,
  request_date DATE NOT NULL,

  status fuel_request_status NOT NULL DEFAULT 'DRAFT',

  requester_id UUID NOT NULL REFERENCES users(id),

  submitted_at TIMESTAMPTZ NULL,

  verified_by UUID NULL REFERENCES users(id),
  verified_at TIMESTAMPTZ NULL,

  approved_by UUID NULL REFERENCES users(id),
  approved_at TIMESTAMPTZ NULL,

  rejected_by UUID NULL REFERENCES users(id),
  rejected_at TIMESTAMPTZ NULL,
  reject_reason TEXT NULL,

  deleted_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fr_status ON fuel_requests(status);
CREATE INDEX idx_fr_requester ON fuel_requests(requester_id);
CREATE INDEX idx_fr_deleted_at ON fuel_requests(deleted_at);

CREATE TRIGGER trig_fuel_requests_updated
BEFORE UPDATE ON fuel_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE car_requests (
  id UUID PRIMARY KEY,
  year INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  request_no TEXT NOT NULL UNIQUE,

  proposed_date DATE NOT NULL,
  objet TEXT NOT NULL,
  itinerary TEXT NOT NULL,
  people TEXT NOT NULL,

  depart_time_wanted TIME NULL,
  return_time_expected TIME NULL,

  vehicle_hint TEXT NULL,
  driver_hint TEXT NULL,

  -- Optional assignments done by Logistique
  vehicle_id UUID NULL REFERENCES vehicles(id),
  driver_id UUID NULL REFERENCES drivers(id),

  -- Auto filled when RAF validates (Visa RAF)
  authorization_date DATE NULL,
  authorization_time TIME NULL,

  status car_request_status NOT NULL DEFAULT 'SUBMITTED',

  requester_id UUID NOT NULL REFERENCES users(id),

  logistics_by UUID NULL REFERENCES users(id),
  logistics_at TIMESTAMPTZ NULL,

  raf_by UUID NULL REFERENCES users(id),
  raf_at TIMESTAMPTZ NULL,

  rejected_by UUID NULL REFERENCES users(id),
  rejected_at TIMESTAMPTZ NULL,
  reject_reason TEXT NULL,

  deleted_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cr_status ON car_requests(status);
CREATE INDEX idx_cr_requester ON car_requests(requester_id);
CREATE INDEX idx_cr_deleted_at ON car_requests(deleted_at);

CREATE TRIGGER trig_car_requests_updated
BEFORE UPDATE ON car_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- JOURNAL DE BORD VOITURE ----------
CREATE TABLE car_logbooks (
  id UUID PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  objet TEXT NULL,

  service_km INTEGER NOT NULL DEFAULT 0,
  mission_km INTEGER NOT NULL DEFAULT 0,

  chauffeur_signature TEXT NULL,

  status logbook_status NOT NULL DEFAULT 'DRAFT',

  created_by UUID NOT NULL REFERENCES users(id),
  submitted_at TIMESTAMPTZ NULL,
  locked_at TIMESTAMPTZ NULL,
  locked_by UUID NULL REFERENCES users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cl_vehicle_period ON car_logbooks(vehicle_id, period_start, period_end);
CREATE INDEX idx_cl_status ON car_logbooks(status);

CREATE TRIGGER trig_car_logbooks_updated
BEFORE UPDATE ON car_logbooks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE car_logbook_trips (
  id UUID PRIMARY KEY,
  logbook_id UUID NOT NULL REFERENCES car_logbooks(id) ON DELETE CASCADE,

  trip_date DATE NOT NULL,

  depart_time TIME NULL,
  depart_km INTEGER NULL,

  route_start TEXT NULL,
  route_end TEXT NULL,

  parking_place TEXT NULL,
  parking_duration_min INTEGER NULL,

  arrival_time TIME NULL,
  arrival_km INTEGER NULL,

  passengers TEXT NULL,
  emargement TEXT NULL,

  is_mission BOOLEAN NOT NULL DEFAULT FALSE,
  mission_label TEXT NULL,

  row_order INTEGER NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clt_logbook ON car_logbook_trips(logbook_id, row_order);

CREATE TABLE car_logbook_fuel_supplies (
  id UUID PRIMARY KEY,
  logbook_id UUID NOT NULL REFERENCES car_logbooks(id) ON DELETE CASCADE,
  supply_date DATE NOT NULL,
  compteur_km INTEGER NOT NULL,
  liters DOUBLE PRECISION NOT NULL,
  montant_ar INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cls_logbook ON car_logbook_fuel_supplies(logbook_id, supply_date);

COMMIT;
