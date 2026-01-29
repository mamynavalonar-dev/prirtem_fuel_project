#!/usr/bin/env node
/* eslint-disable no-console */

// Seeds ONLY (does NOT drop tables). Safe to run on an existing DB.

const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// Load server/.env automatically
require('dotenv').config({
  path: path.join(__dirname, '..', '..', '.env')
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function run() {
  console.log('Seeding users + vehicles (no drop) ...');

  const users = [
    { username: 'admin', role: 'ADMIN', password: 'admin123', first_name: 'Admin', last_name: 'PRIRTEM' },
    { username: 'logistique', role: 'LOGISTIQUE', password: 'logistique123', first_name: 'A', last_name: 'Logistique' },
    { username: 'raf', role: 'RAF', password: 'raf123', first_name: 'R', last_name: 'AF' },
    { username: 'demandeur', role: 'DEMANDEUR', password: 'demandeur123', first_name: 'Un', last_name: 'Demandeur' }
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await pool.query(
      `INSERT INTO users (id, first_name, last_name, username, email, role, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (username) DO UPDATE SET
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         email = EXCLUDED.email,
         role = EXCLUDED.role,
         password_hash = EXCLUDED.password_hash,
         is_active = TRUE`,
      [uuidv4(), u.first_name, u.last_name, u.username, `${u.username}@local`, u.role, hash]
    );
  }

  const plates = ['39111WWT', '39112WWT', '39114WWT', '39961WWT', '39962WWT', '39963WWT'];
  for (const p of plates) {
    await pool.query(
      `INSERT INTO vehicles (id, plate, label)
       VALUES ($1,$2,$3)
       ON CONFLICT (plate) DO NOTHING`,
      [uuidv4(), p, null]
    );
  }

  console.log('Seed done.');
}

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
