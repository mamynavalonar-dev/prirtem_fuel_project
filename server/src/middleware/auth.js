const jwt = require('jsonwebtoken');
const { pool } = require('../db');

/**
 * Permissions "de base" par rôle (tu peux ajuster)
 * + permissions supplémentaires stockées dans users.permissions (TEXT[])
 */
const ROLE_PERMS = {
  DEMANDEUR: [],
  LOGISTIQUE: ['FLEET_MANAGE'],
  RAF: ['IMPORT_EXCEL'],
  ADMIN: ['*'] // wildcard = tout
};

function computeEffectivePerms(role, extra = []) {
  const base = ROLE_PERMS[role] || [];
  if (base.includes('*')) return ['*'];
  const set = new Set([...(base || []), ...(extra || [])]);
  return Array.from(set);
}

async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'INVALID_TOKEN' });
  }

  // Backward compatible: anciens tokens n’ont pas tv
  const tv = Number.isFinite(payload?.tv) ? payload.tv : 0;

  try {
    const { rows } = await pool.query(
      'SELECT id, role, is_active, is_blocked, token_version, permissions FROM users WHERE id=$1',
      [payload.id]
    );
    const u = rows[0];
    if (!u || !u.is_active || u.is_blocked) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    if ((u.token_version || 0) !== tv) {
      return res.status(401).json({ error: 'REVOKED' });
    }

    req.user = {
      ...payload,
      role: u.role,
      permissions: computeEffectivePerms(u.role, u.permissions || [])
    };

    return next();
  } catch (e) {
    return res.status(500).json({ error: 'AUTH_DB_ERROR' });
  }
}

function requireRole(...allowed) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    return next();
  };
}

function requirePermission(...perms) {
  return (req, res, next) => {
    const userPerms = req.user?.permissions || [];
    if (userPerms.includes('*')) return next();

    const ok = perms.every((p) => userPerms.includes(p));
    if (!ok) return res.status(403).json({ error: 'FORBIDDEN_PERM', required: perms });
    return next();
  };
}

module.exports = { authRequired, requireRole, requirePermission };
