const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired } = require('../middleware/auth');
const ctrl = require('../controllers/fuelRequestsController');

const router = express.Router();
router.use(authRequired);

router.get('/', asyncHandler(ctrl.list));
router.get('/:id', asyncHandler(ctrl.getOne));
router.post('/', asyncHandler(ctrl.create));
router.put('/:id', asyncHandler(ctrl.update));
router.patch('/:id/submit', asyncHandler(ctrl.submit));
router.patch('/:id/verify', asyncHandler(ctrl.verify));
router.patch('/:id/approve', asyncHandler(ctrl.approve));
router.patch('/:id/reject', asyncHandler(ctrl.reject));

// Corbeille (soft delete)
router.delete('/:id', asyncHandler(ctrl.softDelete));

module.exports = router;
