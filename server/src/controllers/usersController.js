const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { auditLog } = require('../utils/audit');

const ROLES = ['DEMANDEUR', 'LOGISTIQUE', 'RAF', 'ADMIN'];

const updateSchema = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  username: z.string().min(3).optional(),
  email: z.string().email().optional(),
  role: z.enum(ROLES).optional(),
  is_active: z.boolean().optional(),
  is_blocked: z.boolean().optional(),
  password: z.string().min(6).optional(),
  permissions: z.array(z.string()).optional() // permissions supplémentaires
}).strict();

const createSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  username: z.string().min(3),
  email: z.string().email(),
  role: z.enum(ROLES),
  password: z.string().min(6),
  is_active: z.boolean().optional(),
  is_blocked: z.boolean().optional(),
  permissions: z.array(z.string()).optional()
}).strict();

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  patch: updateSchema
}).strict();

async function countRemainingLoginableAdmins(excludeIds = []) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM users
     WHERE role='ADMIN'
       AND is_active=true
       AND is_blocked=false
       AND NOT (id = ANY($1::uuid[]))`,
    [excludeIds]
  );
  return rows[0]?.c || 0;
}

async function ensureNotLastAdmin(targetIds = [], patch = {}) {
  // si patch rend les admins ciblés non-loginables (inactive/blocked) ou change leur role
  const { rows } = await pool.query(
    `SELECT id, role, is_active, is_blocked FROM users WHERE id = ANY($1::uuid[])`,
    [targetIds]
  );

  const affectedAdmins = rows.filter((u) => u.role === 'ADMIN');
  if (affectedAdmins.length === 0) return;

  const wouldRemoveLogin = (u) => {
    const nextRole = patch.role ?? u.role;
    const nextActive = typeof patch.is_active === 'boolean' ? patch.is_active : u.is_active;
    const nextBlocked = typeof patch.is_blocked === 'boolean' ? patch.is_blocked : u.is_blocked;

    const roleChangeAway = u.role === 'ADMIN' && nextRole !== 'ADMIN';
    const becomesNonLoginable = (nextRole === 'ADMIN') && (!nextActive || nextBlocked);

    return roleChangeAway || becomesNonLoginable;
  };

  const removing = affectedAdmins.filter(wouldRemoveLogin).map((u) => u.id);
  if (removing.length === 0) return;

  const remaining = await countRemainingLoginableAdmins(removing);
  if (remaining <= 0) {
    const err = new Error('LAST_ADMIN_PROTECT');
    err.status = 400;
    throw err;
  }
}

async function list(req, res) {
  const { rows } = await pool.query(
    `SELECT id, username, email, first_name, last_name, role,
            is_active, is_blocked, permissions,
            last_login_at, created_at
     FROM users
     ORDER BY last_name ASC, first_name ASC`
  );
  res.json({ users: rows });
}

async function create(req, res) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const { first_name, last_name, username, email, role, password, is_active, is_blocked, permissions } = parsed.data;

  const password_hash = await bcrypt.hash(password, 10);
  const id = uuidv4();

  try {
    await pool.query(
      `INSERT INTO users (id, first_name, last_name, username, email, role, password_hash, is_active, is_blocked, permissions)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, first_name, last_name, username, email, role, password_hash, is_active ?? true, is_blocked ?? false, permissions ?? []]
    );

    await auditLog({
      actorId: req.user.id,
      action: 'USER_CREATE',
      targetUserId: id,
      meta: { username, email, role }
    });

    res.json({ ok: true, id });
  } catch (e) {
    if (String(e.message).includes('unique')) {
      return res.status(409).json({ error: "Utilisateur ou Email déjà existant" });
    }
    throw e;
  }
}

async function update(req, res) {
  const { id } = req.params;

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const patch = parsed.data;

  // protect last admin
  await ensureNotLastAdmin([id], patch);

  let pwdHash = null;
  if (patch.password && patch.password.trim() !== '') {
    pwdHash = await bcrypt.hash(patch.password, 10);
  }

  await pool.query(
    `UPDATE users SET
       first_name = COALESCE($2, first_name),
       last_name = COALESCE($3, last_name),
       username = COALESCE($4, username),
       email = COALESCE($5, email),
       role = COALESCE($6, role),
       is_active = COALESCE($7, is_active),
       is_blocked = COALESCE($8, is_blocked),
       password_hash = COALESCE($9, password_hash),
       permissions = COALESCE($10, permissions),
       updated_at = NOW()
     WHERE id = $1`,
    [
      id,
      patch.first_name ?? null,
      patch.last_name ?? null,
      patch.username ?? null,
      patch.email ?? null,
      patch.role ?? null,
      typeof patch.is_active === 'boolean' ? patch.is_active : null,
      typeof patch.is_blocked === 'boolean' ? patch.is_blocked : null,
      pwdHash,
      patch.permissions ?? null
    ]
  );

  await auditLog({
    actorId: req.user.id,
    action: 'USER_UPDATE',
    targetUserId: id,
    meta: { patch: { ...patch, password: patch.password ? '***' : undefined } }
  });

  res.json({ ok: true });
}

async function bulkUpdate(req, res) {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const { ids, patch } = parsed.data;

  await ensureNotLastAdmin(ids, patch);

  await pool.query('BEGIN');
  try {
    // password bulk: non (pas safe) -> interdit
    if (patch.password) {
      const err = new Error('BULK_PASSWORD_NOT_ALLOWED');
      err.status = 400;
      throw err;
    }

    await pool.query(
      `UPDATE users SET
         role = COALESCE($2, role),
         is_active = COALESCE($3, is_active),
         is_blocked = COALESCE($4, is_blocked),
         permissions = COALESCE($5, permissions),
         updated_at = NOW()
       WHERE id = ANY($1::uuid[])`,
      [
        ids,
        patch.role ?? null,
        typeof patch.is_active === 'boolean' ? patch.is_active : null,
        typeof patch.is_blocked === 'boolean' ? patch.is_blocked : null,
        patch.permissions ?? null
      ]
    );

    await auditLog({
      actorId: req.user.id,
      action: 'USER_BULK_UPDATE',
      targetUserId: null,
      meta: { ids, patch }
    });

    await pool.query('COMMIT');
    return res.json({ ok: true });
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
}

async function revokeSessions(req, res) {
  const { id } = req.params;

  // empêcher révocation du dernier admin loginable (si on révoque son token, il peut relogin, donc OK)
  // => pas besoin de last-admin check ici

  await pool.query('UPDATE users SET token_version = token_version + 1, updated_at=NOW() WHERE id=$1', [id]);

  await auditLog({
    actorId: req.user.id,
    action: 'USER_REVOKE_SESSIONS',
    targetUserId: id,
    meta: { note: 'token_version++' }
  });

  return res.json({ ok: true });
}

async function auditList(req, res) {
  const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
  const { rows } = await pool.query(
    `SELECT id, actor_id, action, target_user_id, meta, created_at
     FROM admin_audit_logs
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  res.json({ logs: rows });
}

module.exports = { list, create, update, bulkUpdate, revokeSessions, auditList };
