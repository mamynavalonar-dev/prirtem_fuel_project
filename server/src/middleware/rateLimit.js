// ────────────────── server/src/middleware/rateLimit.js ──────────────────
/**
 * Rate-limiting dédié aux endpoints sensibles (anti brute-force).
 * Utilise express-rate-limit, déjà présent dans les dépendances du projet.
 */
const rateLimit = require("express-rate-limit");
const { PostgresRateLimitStore, usePostgresRateLimits } = require('../utils/postgresRateLimitStore');

function sharedStore(prefix) {
  return usePostgresRateLimits()
    ? new PostgresRateLimitStore(require('../db').pool, prefix)
    : undefined;
}

const jsonHandler = (req, res) => {
  res.status(429).json({
    error: "TOO_MANY_REQUESTS",
    message: "Trop de tentatives. Réessayez dans quelques minutes.",
  });
};

const apiLimiter = rateLimit({
  store: sharedStore('api'),
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler,
});

// Login: 10 tentatives / 10 min / IP (protège contre le brute-force de mot de passe)
const loginLimiter = rateLimit({
  store: sharedStore('login'),
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler,
  skipSuccessfulRequests: true,
});

// Forgot password: 5 / 15 min / IP (évite le spam d'emails + enumeration)
const forgotLimiter = rateLimit({
  store: sharedStore('forgot'),
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler,
});

// Reset password: 10 / 15 min / IP (évite le brute-force sur le token de reset)
const resetLimiter = rateLimit({
  store: sharedStore('reset'),
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler,
});

module.exports = { apiLimiter, loginLimiter, forgotLimiter, resetLimiter };
