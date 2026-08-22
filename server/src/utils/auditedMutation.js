const { pool } = require('../db');
const { auditLog } = require('./audit');

async function safeRollback(client) {
  try {
    await client.query('ROLLBACK');
  } catch (rollbackError) {
    console.error('transaction rollback error:', rollbackError?.message || rollbackError);
  }
}

/**
 * Execute a single-row mutation and its mandatory audit record atomically.
 * Returns the mutated row, or null when the mutation matched no row.
 */
async function auditedMutation({
  dbPool = pool,
  sql,
  params = [],
  actorId,
  action,
  targetUserId = null,
  meta = null,
  writeAudit = auditLog,
}) {
  const client = await dbPool.connect();
  let transactionOpen = false;

  try {
    await client.query('BEGIN');
    transactionOpen = true;

    const result = await client.query(sql, params);
    const row = Array.isArray(result?.rows) ? (result.rows[0] || null) : null;

    if (!row) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return null;
    }

    const resolvedTargetUserId = typeof targetUserId === 'function'
      ? targetUserId(row)
      : targetUserId;
    const resolvedMeta = typeof meta === 'function'
      ? meta(row)
      : meta;

    await writeAudit({
      actorId,
      action,
      targetUserId: resolvedTargetUserId,
      meta: resolvedMeta,
      db: client,
      required: true,
    });

    await client.query('COMMIT');
    transactionOpen = false;
    return row;
  } catch (error) {
    if (transactionOpen) await safeRollback(client);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { auditedMutation };
