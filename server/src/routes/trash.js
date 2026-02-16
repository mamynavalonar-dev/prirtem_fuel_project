const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/trashController');

const router = express.Router();
router.use(authRequired);
router.use(requireRole('ADMIN', 'LOGISTIQUE'));

// (Optionnel) infos: compteur par type
router.get('/meta', asyncHandler(ctrl.meta));

// LIST
router.get('/:entity', asyncHandler(ctrl.list));

// RESTORE / HARD DELETE (1)
router.post('/:entity/:id/restore', asyncHandler(ctrl.restore));
router.delete('/:entity/:id/hard', asyncHandler(ctrl.hardDelete));

// BULK ACTIONS
router.post('/:entity/restore-many', asyncHandler(ctrl.restoreMany));
router.post('/:entity/hard-many', asyncHandler(ctrl.hardDeleteMany));
router.post('/:entity/restore-all', asyncHandler(ctrl.restoreAll));
router.delete('/:entity/purge-all', asyncHandler(ctrl.purgeAll));

module.exports = router;
