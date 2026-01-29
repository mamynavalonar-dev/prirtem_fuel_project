#!/usr/bin/env node
/* eslint-disable no-console */

const { Pool } = require('pg');
const path = require('path');
const { execFileSync } = require('child_process');

// Load server/.env when running locally
require('dotenv').config({
  path: path.join(__dirname, '..', '..', '.env')
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function tableExists(name) {
  const { rows } = await pool.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema='public' AND table_name=$1
     LIMIT 1`,
    [name]
  );
  return !!rows[0];
}

async function run() {
  const hasUsers = await tableExists('users');
  if (hasUsers) {
    console.log('DB already initialized ✅');
    return;
  }

  console.log('DB not initialized, running db:reset ...');
  execFileSync(process.execPath, [path.join(__dirname, 'reset.js')], {
    stdio: 'inherit',
    env: process.env
  });
}

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
