const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { pool } = require('../db');
const { sendResetEmail } = require('../utils/mailer');

const ROLES = ['DEMANDEUR', 'LOGISTIQUE', 'RAF', 'ADMIN'];

function signToken(user) {
  // tv = token_version (permet révocation sessions)
  const tv = Number.isFinite(user.token_version) ? user.token_version : 0;

  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
      tv
    },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

const registerSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  username: z.string().min(3),
  email: z.string().email(),
  role: z.enum(ROLES),
  password: z.string().min(6)
});

async function register(req, res) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const { first_name, last_name, username, email, role, password } = parsed.data;
  const password_hash = await bcrypt.hash(password, 10);

  const id = uuidv4();
  try {
    await pool.query(
      `INSERT INTO users (id, first_name, last_name, username, email, role, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, first_name, last_name, username, email, role, password_hash]
    );
  } catch (e) {
    if (String(e.message).includes('users_username_key') || String(e.message).includes('users_email_key')) {
      return res.status(409).json({ error: 'DUPLICATE_USER' });
    }
    throw e;
  }

  const { rows } = await pool.query(
    'SELECT id, first_name, last_name, username, email, role, token_version, permissions FROM users WHERE id=$1',
    [id]
  );
  const user = rows[0];
  const token = signToken(user);

  return res.json({
    token,
    user: {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      email: user.email,
      role: user.role,
      permissions: user.permissions || []
    }
  });
}

/**
 * ✅ Login:
 * - refuse si is_active=false ou is_blocked=true
 * - met à jour last_login_at
 */
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  role: z.enum(ROLES).optional()
});

async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const username = String(parsed.data.username || '').trim();
  const password = String(parsed.data.password || '');

  const { rows } = await pool.query(
    'SELECT id, first_name, last_name, username, email, role, password_hash, is_active, is_blocked, token_version, permissions FROM users WHERE username=$1',
    [username]
  );

  const user = rows[0];
  if (!user || !user.is_active || user.is_blocked) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }

  // Update last login
  await pool.query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]);

  const token = signToken(user);

  return res.json({
    token,
    user: {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      email: user.email,
      role: user.role,
      permissions: user.permissions || []
    }
  });
}

const forgotSchema = z.object({ email: z.string().email() });

async function forgotPassword(req, res) {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const { email } = parsed.data;
  const { rows } = await pool.query(
    'SELECT id, email FROM users WHERE email=$1 AND is_active=true AND is_blocked=false',
    [email]
  );
  const user = rows[0];
  if (!user) {
    return res.json({ ok: true });
  }

  const tokenPlain = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
  const tokenHash = await bcrypt.hash(tokenPlain, 10);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

  await pool.query(
    `INSERT INTO password_resets (id, user_id, token_hash, expires_at)
     VALUES ($1,$2,$3,$4)`,
    [uuidv4(), user.id, tokenHash, expiresAt]
  );

  await sendResetEmail(user.email, tokenPlain);
  return res.json({ ok: true });
}

const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(6)
});

async function resetPassword(req, res) {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const { token, password } = parsed.data;
  const { rows } = await pool.query(
    `SELECT pr.id, pr.user_id, pr.token_hash, pr.expires_at, u.email
     FROM password_resets pr
     JOIN users u ON u.id = pr.user_id
     WHERE pr.used_at IS NULL
     ORDER BY pr.created_at DESC
     LIMIT 20`
  );

  let found = null;
  for (const r of rows) {
    const ok = await bcrypt.compare(token, r.token_hash);
    if (ok) {
      found = r;
      break;
    }
  }

  if (!found) return res.status(400).json({ error: 'INVALID_TOKEN' });
  if (new Date(found.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'TOKEN_EXPIRED' });

  const password_hash = await bcrypt.hash(password, 10);

  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [password_hash, found.user_id]);
  await pool.query('UPDATE password_resets SET used_at=NOW() WHERE id=$1', [found.id]);

  return res.json({ ok: true });
}

async function me(req, res) {
  const { rows } = await pool.query(
    'SELECT id, first_name, last_name, username, email, role, permissions FROM users WHERE id=$1',
    [req.user.id]
  );
  return res.json({ user: rows[0] });
}

module.exports = { ROLES, register, login, forgotPassword, resetPassword, me };
