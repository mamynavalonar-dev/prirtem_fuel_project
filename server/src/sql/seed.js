#!/usr/bin/env node
/* eslint-disable no-console */

// Seeds ONLY (does NOT drop tables). Existing users are never overwritten.

const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { passwordSchema } = require('../utils/passwordPolicy');

// Load server/.env automatically
require('dotenv').config({
  path: path.join(__dirname, '..', '..', '.env')
});

async function run() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_IN_PROD !== 'true') {
    throw new Error('Seed blocked in production. Set ALLOW_SEED_IN_PROD=true for this one operation.');
  }

  console.log('Seeding users + vehicles (no drop) ...');

  const users = [
    { username: 'admin', role: 'ADMIN', password: process.env.SEED_ADMIN_PASSWORD, first_name: 'Admin', last_name: 'PRIRTEM' },
    { username: 'logistique', role: 'LOGISTIQUE', password: process.env.SEED_LOGISTIQUE_PASSWORD, first_name: 'Equipe', last_name: 'Logistique' },
    { username: 'raf', role: 'RAF', password: process.env.SEED_RAF_PASSWORD, first_name: 'Responsable', last_name: 'AF' },
    { username: 'demandeur', role: 'DEMANDEUR', password: process.env.SEED_DEMANDEUR_PASSWORD, first_name: 'Compte', last_name: 'Demandeur' }
  ].filter((user) => user.password);

  if (!users.some((user) => user.role === 'ADMIN')) {
    throw new Error('SEED_ADMIN_PASSWORD is required (minimum 12 characters).');
  }

  for (const user of users) {
    if (!passwordSchema.safeParse(user.password).success) {
      throw new Error(`Seed password for ${user.username} does not meet the password policy.`);
    }
  }

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 12);
    await pool.query(
      `INSERT INTO users (id, first_name, last_name, username, email, role, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (username) DO NOTHING`,
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

if (require.main === module) {
  run()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { seed: run };
