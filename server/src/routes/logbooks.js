const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired } = require('../middleware/auth');
const ctrl = require('../controllers/logbooksController');

const router = express.Router();
router.use(authRequired);

router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.getOne));
router.put('/:id', asyncHandler(ctrl.update));
router.put('/:id/trips', asyncHandler(ctrl.replaceTrips));
router.put('/:id/supplies', asyncHandler(ctrl.replaceSupplies));
router.patch('/:id/submit', asyncHandler(ctrl.submit));
router.patch('/:id/lock', asyncHandler(ctrl.lock));

module.exports = router;
