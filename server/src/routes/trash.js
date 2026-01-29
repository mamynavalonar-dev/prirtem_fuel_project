const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/trashController');

const router = express.Router();
router.use(authRequired);
router.use(requireRole('ADMIN', 'LOGISTIQUE'));

router.get('/:entity', asyncHandler(ctrl.list));
router.post('/:entity/:id/restore', asyncHandler(ctrl.restore));
router.delete('/:entity/:id/hard', asyncHandler(ctrl.hardDelete));

module.exports = router;
