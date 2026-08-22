// server/src/index.js
require("dotenv").config({
  path: process.env.PRIRTEM_ENV_FILE || undefined,
});

// Validate required environment variables
const requiredEnvVars = ["DATABASE_URL", "JWT_SECRET"];
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.error(
      `FATAL ERROR: ${varName} is not defined in environment variables`,
    );
    process.exit(1);
  }
}
if (process.env.JWT_SECRET.length < 32) {
  console.error("FATAL ERROR: JWT_SECRET must contain at least 32 characters");
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  for (const varName of ["CLIENT_URL", "APP_CLIENT_URL", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"]) {
    if (!process.env[varName]) {
      console.error(`FATAL ERROR: ${varName} is required in production`);
      process.exit(1);
    }
  }
}

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const compression = require("compression");
const path = require("path");
const fs = require("fs");

const { runMigrations } = require("./sql/migrate");
const { pool } = require("./db");
const { apiLimiter } = require("./middleware/rateLimit");
const { ensureCsrfCookie, verifyCsrf } = require("./middleware/csrf");

// ✅ pour l’alias /api/vehicles
const { authRequired } = require("./middleware/auth");
const metaController = require("./controllers/metaController");

// Routes
const authRoutes = require("./routes/auth");
const metaRoutes = require("./routes/meta");
const fuelRoutes = require("./routes/fuel");
const importRoutes = require("./routes/import");
const fuelRequestsRoutes = require("./routes/fuelRequests");
const carRequestsRoutes = require("./routes/carRequests");
const logbooksRoutes = require("./routes/logbooks");
const trashRoutes = require("./routes/trash");
const notificationsRoutes = require("./routes/notifications");
const usersRoutes = require("./routes/users");

const app = express();

app.disable("x-powered-by");
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

const allowedOrigins = String(process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(Object.assign(new Error('Origin not allowed by CORS'), { statusCode: 403 }));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
};

app.use(cors(corsOptions));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      "default-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:"],
      "connect-src": ["'self'", ...allowedOrigins],
      "object-src": ["'none'"],
      "frame-ancestors": ["'none'"]
    }
  },
  crossOriginResourcePolicy: { policy: "same-origin" }
}));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(ensureCsrfCookie);
app.use("/api", apiLimiter, verifyCsrf);

// Health Check
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.json({ status: "ok", database: "ok", uptime: process.uptime() });
  } catch {
    return res.status(503).json({ status: "degraded", database: "unavailable" });
  }
});

// ✅ Alias legacy: /api/vehicles (évite 404 si le client appelle encore l’ancienne route)
app.get("/api/vehicles", authRequired, (req, res, next) => {
  Promise.resolve(metaController.listVehicles(req, res)).catch(next);
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/meta", metaRoutes);
app.use("/api/fuel", fuelRoutes);
app.use("/api/import", importRoutes);
app.use("/api/requests/fuel", fuelRequestsRoutes);
app.use("/api/requests/car", carRequestsRoutes);
app.use("/api/logbooks", logbooksRoutes);
app.use("/api/trash", trashRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/users", usersRoutes);

// Serve Static Files (Production / Docker)
const publicDir = path.join(__dirname, "..", "public");
const publicIndex = path.join(publicDir, "index.html");
if (fs.existsSync(publicIndex)) {
  app.use(express.static(publicDir));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(publicIndex));
}

// 404 Handler
app.use("/api/*", (req, res) => {
  res.status(404).json({ error: "NOT_FOUND", message: "Endpoint not found" });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("[SERVER ERROR]", err);

  if (res.headersSent) return next(err);

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      error: "FILE_TOO_LARGE",
      message: "Fichier trop volumineux (max 10MB)",
    });
  }

  const status = err.statusCode || 500;
  const message = status >= 500 && process.env.NODE_ENV === "production"
    ? "Internal Server Error"
    : (err.message || "Internal Server Error");

  res.status(status).json({
    error: err.name || "SERVER_ERROR",
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

async function start() {
  const port = Number(process.env.PORT || 3001);
  // ✅ CORRECTIF : on attend que les migrations soient terminées AVANT
  // d'ouvrir le port. Avant ce correctif, app.listen() démarrait en
  // parallèle des migrations : le serveur acceptait déjà des requêtes
  // (ex: /api/auth/login) alors que la base n'était pas encore prête,
  // ce qui provoquait des 500 aléatoires juste après le démarrage.
  try {
    await runMigrations();
    console.log("✅ Migrations terminées, serveur prêt");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  }

  const server = app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`❌ Port ${port} déjà utilisé. Orphelin probable.`);
      console.error(`   Repère-le: netstat -ano | grep :${port}`);
      console.error(`   Tue-le:    taskkill //PID <pid> //F`);
    } else {
      console.error("❌ Server error:", err);
    }
    shutdown(1);
  });

  // ✅ Arrêt propre: ferme le serveur HTTP + le pool pg, puis exit.
  //    Évite les orphelins node.exe et les ports verrouillés au redémarrage --watch.
  let shuttingDown = false;
  function shutdown(exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("👋 Shutting down gracefully...");
    server.close(() => {
      pool
        .end()
        .catch(() => {})
        .finally(() => process.exit(exitCode));
    });
    // Filet de sécurité: on ne reste jamais bloqué sur une connexion keep-alive
    setTimeout(() => process.exit(exitCode), 5000).unref();
  }

  process.on("SIGTERM", () => shutdown(0));
  process.on("SIGINT", () => shutdown(0));
  // node --watch / nodemon peuvent envoyer SIGUSR2 lors d'un restart
  process.on("SIGUSR2", () => shutdown(0));
}

start().catch((e) => {
  console.error("❌ Startup failed:", e);
  process.exit(1);
});
// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Don't exit immediately - let the error handler deal with it if possible
  // But if it's truly unhandled, we should exit to prevent inconsistent state
  process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  // Exit immediately to prevent inconsistent state
  process.exit(1);
});
