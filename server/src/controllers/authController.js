const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { pool } = require('../db');
const { sendResetEmail } = require('../utils/mailer');

const ROLES = ['DEMANDEUR', 'LOGISTIQUE', 'RAF', 'ADMIN'];

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name
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

  const { rows } = await pool.query('SELECT id, first_name, last_name, username, email, role FROM users WHERE id=$1', [id]);
  const user = rows[0];
  const token = signToken(user);
  return res.json({ token, user });
}

const loginSchema = z.object({
  username: z.string().min(1),
  role: z.enum(ROLES),
  password: z.string().min(1)
});

async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  // Trim to avoid common UX issues (copy/paste spaces)
  const username = String(parsed.data.username || '').trim();
  const role = parsed.data.role;
  const password = String(parsed.data.password || '');
  const { rows } = await pool.query(
    'SELECT id, first_name, last_name, username, email, role, password_hash, is_active FROM users WHERE username=$1',
    [username]
  );
  const user = rows[0];
  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }
  if (user.role !== role) {
    return res.status(401).json({ error: 'ROLE_MISMATCH', expectedRole: user.role });
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }

  const token = signToken(user);
  const safeUser = {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
    email: user.email,
    role: user.role
  };
  return res.json({ token, user: safeUser });
}

const forgotSchema = z.object({ email: z.string().email() });

async function forgotPassword(req, res) {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const { email } = parsed.data;
  const { rows } = await pool.query('SELECT id, email FROM users WHERE email=$1 AND is_active=true', [email]);
  const user = rows[0];
  // Always return OK to avoid user enumeration
  if (!user) {
    return res.json({ ok: true });
  }

  const tokenPlain = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
  const tokenHash = await bcrypt.hash(tokenPlain, 10);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 min

  await pool.query(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
     VALUES ($1,$2,$3,$4)`,
    [uuidv4(), user.id, tokenHash, expiresAt]
  );

  await sendResetEmail(email, tokenPlain);
  return res.json({ ok: true });
}

const resetSchema = z.object({
  email: z.string().email(),
  token: z.string().min(10),
  new_password: z.string().min(6)
});

async function resetPassword(req, res) {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const { email, token, new_password } = parsed.data;
  const userRes = await pool.query('SELECT id FROM users WHERE email=$1 AND is_active=true', [email]);
  const user = userRes.rows[0];
  if (!user) {
    return res.status(400).json({ error: 'INVALID_TOKEN' });
  }

  const resetRes = await pool.query(
    `SELECT id, token_hash, expires_at, used_at
     FROM password_reset_tokens
     WHERE user_id=$1
     ORDER BY created_at DESC
     LIMIT 10`,
    [user.id]
  );

  const now = new Date();
  const resetRow = resetRes.rows.find(r => !r.used_at && new Date(r.expires_at) > now);
  if (!resetRow) {
    return res.status(400).json({ error: 'INVALID_TOKEN' });
  }

  const ok = await bcrypt.compare(token, resetRow.token_hash);
  if (!ok) {
    return res.status(400).json({ error: 'INVALID_TOKEN' });
  }

  const password_hash = await bcrypt.hash(new_password, 10);
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [password_hash, user.id]);
  await pool.query('UPDATE password_reset_tokens SET used_at=now() WHERE id=$1', [resetRow.id]);

  return res.json({ ok: true });
}

async function me(req, res) {
  const { rows } = await pool.query(
    'SELECT id, first_name, last_name, username, email, role FROM users WHERE id=$1',
    [req.user.id]
  );
  return res.json({ user: rows[0] });
}

module.exports = { ROLES, register, login, forgotPassword, resetPassword, me };
