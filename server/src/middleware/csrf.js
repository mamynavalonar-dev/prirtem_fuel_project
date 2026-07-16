// ────────────────── server/src/middleware/csrf.js ──────────────────
/**
 * Protection CSRF par "double submit cookie" :
 * 1) Un cookie CSRF non-httpOnly (donc lisible par le JS du frontend) est
 *    posé à chaque réponse.
 * 2) Le frontend doit renvoyer sa valeur dans le header X-CSRF-Token sur
 *    toute requête mutante (POST/PUT/PATCH/DELETE).
 * 3) Le serveur vérifie que cookie === header. Un attaquant CSRF peut
 *    faire partir une requête avec le cookie (envoyé automatiquement par
 *    le navigateur), mais ne peut PAS lire le cookie depuis un autre
 *    domaine pour le recopier dans le header (Same-Origin Policy) ->
 *    la requête forgée échoue.
 */
const crypto = require('crypto');

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function genCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Pose (ou renouvelle) le cookie CSRF si absent. À monter tôt dans la
 * chaîne de middlewares, avant les routes.
 */
function ensureCsrfCookie(req, res, next) {
  const existing = req.cookies?.[CSRF_COOKIE_NAME];
  if (!existing) {
    const token = genCsrfToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // 📨 doit rester lisible par le JS frontend
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 12 // 12h, aligné sur la durée du JWT
    });
    req.csrfToken = token;
  } else {
    req.csrfToken = existing;
  }
  next();
}

/**
 * Vérifie la correspondance cookie/header sur les méthodes mutantes.
 * À monter sur les routes /api/* qui modifient de l'état.
 */
function verifyCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'CSRF_TOKEN_INVALID' });
  }
  next();
}

module.exports = { ensureCsrfCookie, verifyCsrf, CSRF_COOKIE_NAME, CSRF_HEADER_NAME };