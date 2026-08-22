const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired, requireRole } = require('../middleware/auth');
const { blockDemoSensitiveMutation } = require('../middleware/demo');
const ctrl = require('../controllers/trashController');

const router = express.Router();
router.use(authRequired);
router.use(requireRole('ADMIN', 'LOGISTIQUE'));

router.get('/meta', asyncHandler(ctrl.meta));
router.get('/:entity', asyncHandler(ctrl.list));

router.post('/:entity/:id/restore', blockDemoSensitiveMutation, asyncHandler(ctrl.restore));
router.delete('/:entity/:id/hard', blockDemoSensitiveMutation, asyncHandler(ctrl.hardDelete));

router.post('/:entity/restore-many', blockDemoSensitiveMutation, asyncHandler(ctrl.restoreMany));
router.post('/:entity/hard-many', blockDemoSensitiveMutation, asyncHandler(ctrl.hardDeleteMany));
router.post('/:entity/restore-all', blockDemoSensitiveMutation, asyncHandler(ctrl.restoreAll));
router.delete('/:entity/purge-all', blockDemoSensitiveMutation, asyncHandler(ctrl.purgeAll));

module.exports = router;
