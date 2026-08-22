#!/usr/bin/env node
/* eslint-disable no-console */

const { runMigrations } = require('./migrate');
const { pool } = require('../db');

runMigrations()
  .then(() => console.log('Database schema is ready.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
