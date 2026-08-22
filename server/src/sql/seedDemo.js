#!/usr/bin/env node
/* eslint-disable no-console */

const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

require('dotenv').config({
  path: path.join(__dirname, '..', '..', '.env')
});

// The seed is an administrative operation: prefer the session/direct URL.
if (process.env.MIGRATION_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;
}

const { pool } = require('../db');
const { DEMO_USERNAMES, isDemoMode } = require('../utils/demoMode');

function isoDate(offsetDays) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function upsertDemoUser({ username, role, firstName, lastName }) {
  // Nobody receives this password. Demo authentication is role-based via /demo-login.
  const unusablePassword = crypto.randomBytes(48).toString('base64url');
  const passwordHash = await bcrypt.hash(unusablePassword, 12);

  const { rows } = await pool.query(
    `INSERT INTO users
      (id, first_name, last_name, username, email, role, password_hash,
       is_active, is_blocked, permissions)
     VALUES ($1,$2,$3,$4,$5,$6,$7,true,false,ARRAY[]::TEXT[])
     ON CONFLICT (username) DO UPDATE SET
       first_name=EXCLUDED.first_name,
       last_name=EXCLUDED.last_name,
       email=EXCLUDED.email,
       role=EXCLUDED.role,
       password_hash=EXCLUDED.password_hash,
       is_active=true,
       is_blocked=false,
       permissions=ARRAY[]::TEXT[],
       token_version=users.token_version+1,
       updated_at=NOW()
     RETURNING id`,
    [
      uuidv4(),
      firstName,
      lastName,
      username,
      `${username}@example.invalid`,
      role,
      passwordHash
    ]
  );

  return rows[0].id;
}

async function upsertVehicle(plate, label) {
  const { rows } = await pool.query(
    `INSERT INTO vehicles (id, plate, label, is_active)
     VALUES ($1,$2,$3,true)
     ON CONFLICT (plate) DO UPDATE SET
       label=EXCLUDED.label,
       is_active=true,
       deleted_at=NULL,
       deleted_by=NULL
     RETURNING id`,
    [uuidv4(), plate, label]
  );
  return rows[0].id;
}

async function upsertDriver(id, fullName, phone) {
  const { rows } = await pool.query(
    `INSERT INTO drivers (id, full_name, phone, is_active)
     VALUES ($1,$2,$3,true)
     ON CONFLICT (id) DO UPDATE SET
       full_name=EXCLUDED.full_name,
       phone=EXCLUDED.phone,
       is_active=true,
       deleted_at=NULL,
       deleted_by=NULL
     RETURNING id`,
    [id, fullName, phone]
  );
  return rows[0].id;
}

async function run() {
  if (!isDemoMode()) {
    throw new Error('Demo seed blocked: DEMO_MODE=true is required.');
  }
  if (process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Demo seed blocked: set ALLOW_DEMO_SEED=true for this one operation.');
  }

  console.log('Seeding synthetic PRIRTEM demo data...');

  const requesterId = await upsertDemoUser({
    username: DEMO_USERNAMES.DEMANDEUR,
    role: 'DEMANDEUR',
    firstName: 'Aina',
    lastName: 'Démonstration'
  });
  const logisticsId = await upsertDemoUser({
    username: DEMO_USERNAMES.LOGISTIQUE,
    role: 'LOGISTIQUE',
    firstName: 'Tiana',
    lastName: 'Logistique'
  });
  const rafId = await upsertDemoUser({
    username: DEMO_USERNAMES.RAF,
    role: 'RAF',
    firstName: 'Miora',
    lastName: 'RAF'
  });

  const vehicle1 = await upsertVehicle('DEMO-001', 'Toyota Hilux — Démonstration');
  const vehicle2 = await upsertVehicle('DEMO-002', 'Nissan NP300 — Démonstration');
  await upsertVehicle('DEMO-003', 'Mitsubishi L200 — Démonstration');

  const driver1 = await upsertDriver(
    'd0000000-0000-4000-8000-000000000001',
    'Rakoto Démo',
    '+261 00 00 000 01'
  );
  const driver2 = await upsertDriver(
    'd0000000-0000-4000-8000-000000000002',
    'Rasoa Démo',
    '+261 00 00 000 02'
  );

  const year = new Date().getUTCFullYear();
  const fuelRequests = [
    {
      requestNo: `DEMO-${year}-F001`,
      seq: 9901,
      type: 'SERVICE',
      objet: 'Approvisionnement carburant — opérations de démonstration',
      amount: 480000,
      words: 'Quatre cent quatre-vingt mille ariary',
      start: isoDate(-4),
      end: isoDate(2),
      status: 'SUBMITTED',
      verifiedBy: null,
      approvedBy: null
    },
    {
      requestNo: `DEMO-${year}-F002`,
      seq: 9902,
      type: 'MISSION',
      objet: 'Mission terrain — scénario de validation Logistique',
      amount: 725000,
      words: 'Sept cent vingt-cinq mille ariary',
      start: isoDate(-9),
      end: isoDate(-6),
      status: 'VERIFIED',
      verifiedBy: logisticsId,
      approvedBy: null
    },
    {
      requestNo: `DEMO-${year}-F003`,
      seq: 9903,
      type: 'SERVICE',
      objet: 'Suivi mensuel de la flotte — scénario approuvé',
      amount: 350000,
      words: 'Trois cent cinquante mille ariary',
      start: isoDate(-15),
      end: isoDate(-12),
      status: 'APPROVED',
      verifiedBy: logisticsId,
      approvedBy: rafId
    }
  ];

  for (const item of fuelRequests) {
    await pool.query(
      `INSERT INTO fuel_requests
        (id, year, seq, request_no, request_type, objet, amount_estimated_ar,
         amount_estimated_words, request_date, end_date, status, requester_id,
         submitted_at, verified_by, verified_at, approved_by, approved_at)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
         CASE WHEN $11::fuel_request_status <> 'DRAFT'::fuel_request_status THEN NOW() ELSE NULL END,
         $13, CASE WHEN $13::uuid IS NOT NULL THEN NOW() ELSE NULL END,
         $14, CASE WHEN $14::uuid IS NOT NULL THEN NOW() ELSE NULL END)
       ON CONFLICT (request_no) DO UPDATE SET
         request_type=EXCLUDED.request_type,
         objet=EXCLUDED.objet,
         amount_estimated_ar=EXCLUDED.amount_estimated_ar,
         amount_estimated_words=EXCLUDED.amount_estimated_words,
         request_date=EXCLUDED.request_date,
         end_date=EXCLUDED.end_date,
         status=EXCLUDED.status,
         requester_id=EXCLUDED.requester_id,
         submitted_at=EXCLUDED.submitted_at,
         verified_by=EXCLUDED.verified_by,
         verified_at=EXCLUDED.verified_at,
         approved_by=EXCLUDED.approved_by,
         approved_at=EXCLUDED.approved_at,
         deleted_at=NULL,
         deleted_by=NULL,
         updated_at=NOW()`,
      [
        uuidv4(), year, item.seq, item.requestNo, item.type, item.objet,
        item.amount, item.words, item.start, item.end, item.status, requesterId,
        item.verifiedBy, item.approvedBy
      ]
    );
  }

  const carRequests = [
    {
      requestNo: `DEMO-${year}-C001`,
      seq: 9951,
      start: isoDate(1),
      end: isoDate(1),
      objet: 'Déplacement technique — démonstration',
      itinerary: 'Antananarivo → Ambohimanga → Antananarivo',
      people: 'Équipe projet (données fictives)',
      status: 'SUBMITTED',
      vehicleId: null,
      driverId: null,
      logisticsBy: null,
      rafBy: null
    },
    {
      requestNo: `DEMO-${year}-C002`,
      seq: 9952,
      start: isoDate(-3),
      end: isoDate(-2),
      objet: 'Mission de supervision — scénario logistique',
      itinerary: 'Antananarivo → Miarinarivo → Antananarivo',
      people: 'Équipe de démonstration',
      status: 'LOGISTICS_APPROVED',
      vehicleId: vehicle1,
      driverId: driver1,
      logisticsBy: logisticsId,
      rafBy: null
    },
    {
      requestNo: `DEMO-${year}-C003`,
      seq: 9953,
      start: isoDate(-10),
      end: isoDate(-9),
      objet: 'Visite de site — scénario approuvé RAF',
      itinerary: 'Antananarivo → Moramanga → Antananarivo',
      people: 'Équipe de démonstration',
      status: 'RAF_APPROVED',
      vehicleId: vehicle2,
      driverId: driver2,
      logisticsBy: logisticsId,
      rafBy: rafId
    }
  ];

  for (const item of carRequests) {
    await pool.query(
      `INSERT INTO car_requests
        (id, year, seq, request_no, proposed_date, end_date, objet, itinerary,
         people, vehicle_id, driver_id, status, requester_id,
         logistics_by, logistics_at, raf_by, raf_at)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
         $14, CASE WHEN $14::uuid IS NOT NULL THEN NOW() ELSE NULL END,
         $15, CASE WHEN $15::uuid IS NOT NULL THEN NOW() ELSE NULL END)
       ON CONFLICT (request_no) DO UPDATE SET
         proposed_date=EXCLUDED.proposed_date,
         end_date=EXCLUDED.end_date,
         objet=EXCLUDED.objet,
         itinerary=EXCLUDED.itinerary,
         people=EXCLUDED.people,
         vehicle_id=EXCLUDED.vehicle_id,
         driver_id=EXCLUDED.driver_id,
         status=EXCLUDED.status,
         requester_id=EXCLUDED.requester_id,
         logistics_by=EXCLUDED.logistics_by,
         logistics_at=EXCLUDED.logistics_at,
         raf_by=EXCLUDED.raf_by,
         raf_at=EXCLUDED.raf_at,
         deleted_at=NULL,
         deleted_by=NULL,
         updated_at=NOW()`,
      [
        uuidv4(), year, item.seq, item.requestNo, item.start, item.end,
        item.objet, item.itinerary, item.people, item.vehicleId, item.driverId,
        item.status, requesterId, item.logisticsBy, item.rafBy
      ]
    );
  }

  console.log('Synthetic demo seed completed.');
}

if (require.main === module) {
  run()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { seedDemo: run };
