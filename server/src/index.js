// server/src/index.js
require("dotenv").config();

// Validate required environment variables
const requiredEnvVars = ["JWT_SECRET"];
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.error(
      `FATAL ERROR: ${varName} is not defined in environment variables`,
    );
    process.exit(1);
  }
}

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const { runMigrations } = require("./sql/migrate");
const { pool } = require("./db");

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

const corsOptions = {
  origin: process.env.CLIENT_URL || true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health Check
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", uptime: process.uptime() }),
);

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
  const message = err.message || "Internal Server Error";

  res.status(status).json({
    error: err.name || "SERVER_ERROR",
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

async function start() {
  const port = Number(process.env.PORT || 3001);
  // Kill any existing process on the port to avoid "Address already in use" errors
  try {
    const kill = require("kill-port");
    await kill(port);
    console.log(`🔥 Killed any existing process on port ${port}`);
    // Laisse le temps à l'OS (surtout Windows) de vraiment libérer le port
    await new Promise((resolve) => setTimeout(resolve, 400));
  } catch (err) {
    // Ignore errors if no process was found on the port
    console.log(`ℹ️  No process found on port ${port} to kill`);
  }

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
