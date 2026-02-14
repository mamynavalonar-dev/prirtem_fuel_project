const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');

async function auditLog({ actorId, action, targetUserId = null, meta = null }) {
  try {
    await pool.query(
      `INSERT INTO admin_audit_logs (id, actor_id, action, target_user_id, meta)
       VALUES ($1,$2,$3,$4,$5)`,
      [uuidv4(), actorId, action, targetUserId, meta]
    );
  } catch (e) {
    // on ne casse pas la requête principale si audit fail
    console.error('auditLog error:', e.message);
  }
}

module.exports = { auditLog };
