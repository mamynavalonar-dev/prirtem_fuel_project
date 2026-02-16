const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired } = require('../middleware/auth');
const ctrl = require('../controllers/notificationsController');

const router = express.Router();
router.use(authRequired);

router.get('/', asyncHandler(ctrl.getNotifications));
router.post('/read-all', asyncHandler(ctrl.markAllAsRead));
router.post('/:id/read', asyncHandler(ctrl.markAsRead));

module.exports = router;
