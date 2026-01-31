const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');

async function list(req, res) {
  const { rows } = await pool.query(
    'SELECT id, username, email, first_name, last_name, role, is_active, created_at FROM users ORDER BY created_at DESC'
  );
  res.json({ users: rows });
}

async function create(req, res) {
  const { first_name, last_name, username, email, role, password, is_active } = req.body;
  
  // Validation basique
  if (!username || !password || !role) {
    return res.status(400).json({ error: "Champs obligatoires manquants" });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const id = uuidv4();

  try {
    await pool.query(
      `INSERT INTO users (id, first_name, last_name, username, email, role, password_hash, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, first_name, last_name, username, email, role, password_hash, is_active ?? true]
    );
    res.json({ ok: true, id });
  } catch (e) {
    if (e.message.includes('unique')) {
      return res.status(409).json({ error: "Utilisateur ou Email déjà existant" });
    }
    throw e;
  }
}

async function update(req, res) {
  const { id } = req.params;
  const { first_name, last_name, username, email, role, is_active, password } = req.body;
  
  let pwdHash = null;
  if (password && password.trim() !== '') {
    pwdHash = await bcrypt.hash(password, 10);
  }

  try {
    await pool.query(
      `UPDATE users SET 
         first_name = COALESCE($2, first_name),
         last_name = COALESCE($3, last_name),
         username = COALESCE($4, username),
         email = COALESCE($5, email),
         role = COALESCE($6, role), 
         is_active = COALESCE($7, is_active),
         password_hash = COALESCE($8, password_hash),
         updated_at = now()
       WHERE id = $1`,
      [id, first_name, last_name, username, email, role, is_active, pwdHash]
    );
    res.json({ ok: true });
  } catch (e) {
    throw e;
  }
}

module.exports = { list, create, update };