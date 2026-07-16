const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authRequired } = require("../middleware/auth");
const {
  register,
  login,
  forgotPassword,
  resetPassword,
  me,
  ROLES,
} = require("../controllers/authController");
const {
  loginLimiter,
  registerLimiter,
  forgotLimiter,
  resetLimiter,
} = require("../middleware/rateLimit");
const router = express.Router();
router.get("/roles", (req, res) => res.json({ roles: ROLES }));
router.post("/register", registerLimiter, asyncHandler(register));
router.post("/login", loginLimiter, asyncHandler(login));
router.post("/forgot", forgotLimiter, asyncHandler(forgotPassword));
router.post("/reset", resetLimiter, asyncHandler(resetPassword));
router.get("/me", authRequired, asyncHandler(me));
module.exports = router;
