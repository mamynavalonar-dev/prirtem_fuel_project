const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');

async function auditLog({ actorId, action, targetUserId = null, meta = null, db = pool, required = false }) {
  try {
    await db.query(
      `INSERT INTO admin_audit_logs (id, actor_id, action, target_user_id, meta)
       VALUES ($1,$2,$3,$4,$5)`,
      [uuidv4(), actorId, action, targetUserId, meta]
    );
  } catch (e) {
    if (required) throw e;
    console.error('auditLog error:', e.message);
  }
}

module.exports = { auditLog };
