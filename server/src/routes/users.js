const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/usersController');

const router = express.Router();

router.use(authRequired);
router.use(requireRole('ADMIN')); // Seul l'admin accède ici

router.get('/', asyncHandler(ctrl.list));
router.get('/audit', asyncHandler(ctrl.auditList));

router.post('/', asyncHandler(ctrl.create));

// bulk doit être AVANT "/:id"
router.put('/bulk', asyncHandler(ctrl.bulkUpdate));

router.put('/:id', asyncHandler(ctrl.update));
router.post('/:id/revoke', asyncHandler(ctrl.revokeSessions));

module.exports = router;
