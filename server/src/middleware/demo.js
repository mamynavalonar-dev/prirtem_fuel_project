const { isDemoMode, isDemoUser } = require('../utils/demoMode');

function blockDemoSensitiveMutation(req, res, next) {
  if (isDemoMode() && isDemoUser(req.user)) {
    return res.status(403).json({
      error: 'DEMO_SENSITIVE_ACTION_DISABLED',
      message: 'Cette action sensible est désactivée sur la démonstration publique.'
    });
  }
  return next();
}

module.exports = { blockDemoSensitiveMutation };
