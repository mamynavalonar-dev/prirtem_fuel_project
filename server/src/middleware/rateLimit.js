// ────────────────── server/src/middleware/rateLimit.js ──────────────────
/**
 * Rate-limiting dédié aux endpoints sensibles (anti brute-force).
 * Utilise express-rate-limit, déjà présent dans les dépendances du projet.
 */
const rateLimit = require("express-rate-limit");

const jsonHandler = (req, res) => {
  res.status(429).json({
    error: "TOO_MANY_REQUESTS",
    message: "Trop de tentatives. Réessayez dans quelques minutes.",
  });
};

// Login: 10 tentatives / 10 min / IP (protège contre le brute-force de mot de passe)
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler,
  skipSuccessfulRequests: true,
});

// Forgot password: 5 / 15 min / IP (évite le spam d'emails + enumeration)
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler,
});

// Reset password: 10 / 15 min / IP (évite le brute-force sur le token de reset)
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler,
});

// Register: 5 / heure / IP
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler,
});

module.exports = { loginLimiter, forgotLimiter, resetLimiter, registerLimiter };
