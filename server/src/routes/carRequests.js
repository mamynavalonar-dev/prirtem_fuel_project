const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired } = require('../middleware/auth');
const ctrl = require('../controllers/carRequestsController');

const router = express.Router();
router.use(authRequired);

router.get('/', asyncHandler(ctrl.list));
router.get('/:id', asyncHandler(ctrl.getOne));
router.post('/', asyncHandler(ctrl.create));
router.put('/:id', asyncHandler(ctrl.update));

// Preferred endpoints (used by client)
router.post('/:id/visa', asyncHandler(ctrl.logisticsApprove));
router.post('/:id/approve', asyncHandler(ctrl.rafApprove));
router.post('/:id/reject', asyncHandler(ctrl.reject));

// Legacy/alt endpoints
router.patch('/:id/logistics-approve', asyncHandler(ctrl.logisticsApprove));
router.patch('/:id/raf-approve', asyncHandler(ctrl.rafApprove));
router.patch('/:id/reject', asyncHandler(ctrl.reject));

// Corbeille (soft delete)
router.delete('/:id', asyncHandler(ctrl.softDelete));

module.exports = router;
