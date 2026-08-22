#!/usr/bin/env node
/* eslint-disable no-console */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { pool } = require('../db');
const { runMigrations } = require('./migrate');
const { seed } = require('./seed');

async function reset() {
  if (process.env.CONFIRM_DATABASE_RESET !== 'RESET_PRIRTEM_FUEL') {
    throw new Error('Destructive reset blocked. Set CONFIRM_DATABASE_RESET=RESET_PRIRTEM_FUEL.');
  }
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_RESET_IN_PROD !== 'true') {
    throw new Error('Database reset blocked in production.');
  }

  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await runMigrations();
  await seed();
}

reset()
  .then(() => console.log('Database reset completed.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
