const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authRequired } = require("../middleware/auth");
const {
  login,
  logout,
  forgotPassword,
  resetPassword,
  me,
} = require("../controllers/authController");
const {
  loginLimiter,
  forgotLimiter,
  resetLimiter,
} = require("../middleware/rateLimit");
const router = express.Router();
router.post("/login", loginLimiter, asyncHandler(login));
router.post("/logout", asyncHandler(logout));
router.post("/forgot", forgotLimiter, asyncHandler(forgotPassword));
router.post("/reset", resetLimiter, asyncHandler(resetPassword));
router.get("/me", authRequired, asyncHandler(me));
module.exports = router;
