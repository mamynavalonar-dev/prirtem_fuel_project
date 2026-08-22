const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { pool } = require('../db');
const { sendResetEmail } = require('../utils/mailer');
const { passwordSchema } = require('../utils/passwordPolicy');

const AUTH_COOKIE_NAME = 'prirtem_session';
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
      tv: Number.isFinite(user.token_version) ? user.token_version : 0
    },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_MS
  };
}

function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
}

function publicUser(user) {
  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
    email: user.email,
    role: user.role,
    permissions: user.permissions || []
  };
}

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});

async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, username, email, role, password_hash,
            is_active, is_blocked, token_version, permissions
     FROM users WHERE lower(username)=lower($1)`,
    [parsed.data.username]
  );

  const user = rows[0];
  if (!user || !user.is_active || user.is_blocked || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }

  await pool.query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]);
  setAuthCookie(res, signToken(user));
  return res.json({ user: publicUser(user) });
}

async function logout(req, res) {
  const options = authCookieOptions();
  delete options.maxAge;
  res.clearCookie(AUTH_COOKIE_NAME, options);
  return res.json({ ok: true });
}

const forgotSchema = z.object({ email: z.string().trim().email() });

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function forgotPassword(req, res) {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const { rows } = await pool.query(
    'SELECT id, email FROM users WHERE lower(email)=lower($1) AND is_active=true AND is_blocked=false',
    [parsed.data.email]
  );
  const user = rows[0];
  if (!user) return res.json({ ok: true });

  const tokenPlain = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(tokenPlain);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',
      [user.id]
    );
    await client.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1,$2,$3,$4)`,
      [uuidv4(), user.id, tokenHash, expiresAt]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  try {
    await sendResetEmail(user.email, tokenPlain);
  } catch (error) {
    // Preserve the anti-enumeration response; operational logs contain no token.
    console.error('[RESET_EMAIL_ERROR]', error.message);
  }
  return res.json({ ok: true });
}

const resetSchema = z.object({
  token: z.string().length(64),
  password: passwordSchema
});

async function resetPassword(req, res) {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT pr.id, pr.user_id, pr.expires_at
       FROM password_reset_tokens pr
       JOIN users u ON u.id=pr.user_id
       WHERE pr.token_hash=$1 AND pr.used_at IS NULL
         AND u.is_active=true AND u.is_blocked=false
       FOR UPDATE`,
      [hashResetToken(parsed.data.token)]
    );
    const reset = rows[0];

    if (!reset || new Date(reset.expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'INVALID_OR_EXPIRED_TOKEN' });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await client.query(
      `UPDATE users
       SET password_hash=$1, token_version=token_version+1, updated_at=NOW()
       WHERE id=$2`,
      [passwordHash, reset.user_id]
    );
    await client.query(
      'UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',
      [reset.user_id]
    );
    await client.query('COMMIT');
    return res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function me(req, res) {
  const { rows } = await pool.query(
    'SELECT id, first_name, last_name, username, email, role, permissions FROM users WHERE id=$1',
    [req.user.id]
  );
  return res.json({ user: publicUser(rows[0]) });
}

module.exports = {
  AUTH_COOKIE_NAME,
  passwordSchema,
  login,
  logout,
  forgotPassword,
  resetPassword,
  me
};
