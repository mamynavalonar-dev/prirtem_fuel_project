const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/usersController');

const router = express.Router();

router.use(authRequired);
router.use(requireRole('ADMIN')); // Seul l'admin accède ici

router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.put('/:id', asyncHandler(ctrl.update));

module.exports = router;