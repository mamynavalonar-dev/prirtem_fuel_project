const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired } = require('../middleware/auth');
const { register, login, forgotPassword, resetPassword, me, ROLES } = require('../controllers/authController');

const router = express.Router();

router.get('/roles', (req, res) => res.json({ roles: ROLES }));
router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));
router.post('/forgot', asyncHandler(forgotPassword));
router.post('/reset', asyncHandler(resetPassword));
router.get('/me', authRequired, asyncHandler(me));

module.exports = router;
