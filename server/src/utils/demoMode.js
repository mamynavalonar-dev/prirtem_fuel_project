const DEMO_ROLES = Object.freeze(['DEMANDEUR', 'LOGISTIQUE', 'RAF']);

const DEMO_USERNAMES = Object.freeze({
  DEMANDEUR: 'demo.demandeur',
  LOGISTIQUE: 'demo.logistique',
  RAF: 'demo.raf'
});

function isDemoMode() {
  return String(process.env.DEMO_MODE || '').toLowerCase() === 'true';
}

function getDemoUsername(role) {
  return DEMO_USERNAMES[String(role || '').toUpperCase()] || null;
}

function isDemoUsername(username) {
  const normalized = String(username || '').trim().toLowerCase();
  return Object.values(DEMO_USERNAMES).includes(normalized);
}

function isDemoUser(user) {
  return isDemoUsername(user?.username);
}

module.exports = {
  DEMO_ROLES,
  DEMO_USERNAMES,
  isDemoMode,
  getDemoUsername,
  isDemoUsername,
  isDemoUser
};
