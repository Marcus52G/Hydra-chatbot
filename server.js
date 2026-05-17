// ============================================================
// server.js  — THE ENTRY POINT
// ============================================================

try { require("dotenv").config(); } catch (e) { /* dotenv optional in prod */ }

const express = require("express");
const path    = require("path");
const fs      = require("fs");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ─────────────────────────────────────────────
app.use(express.json());

app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// ── ROUTES ─────────────────────────────────────────────────
const pricesRouter   = require("./routes/prices");
const ordersRouter   = require("./routes/orders");
const whatsappRoute  = require("./routes/whatsapp");
const mpesaRoute     = require("./routes/mpesa");

app.use("/webhook", whatsappRoute);
app.use("/prices",  pricesRouter);
app.use("/orders",  ordersRouter);
app.use("/mpesa",   mpesaRoute);

// ── HEALTH CHECK ───────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status:    "ok",
    uptime:    process.uptime(),
    timestamp: new Date().toISOString(),
    version:   "Phase 2 — M-Pesa STK Push",
  });
});

// ── BUSINESS INFO ──────────────────────────────────────────
app.get("/info", (req, res) => {
  try {
    const dbPath = path.join(__dirname, "data/db.json");
    const db     = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    res.json({ success: true, data: db.business });
  } catch (e) {
    res.json({ success: true, data: {} });
  }
});

// ── 404 HANDLER ────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route "${req.method} ${req.url}" not found`,
  });
});

// ── GLOBAL ERROR HANDLER ───────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, message: "Something went wrong on the server" });
});

// ── START SERVER ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Hydra Bot Backend — Port ${PORT}`);
  console.log(`  → http://localhost:${PORT}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Endpoints:");
  console.log("  GET/POST /webhook");
  console.log("  GET/POST /mpesa/callback");
  console.log("  GET      /mpesa/pending");
  console.log("  GET      /health");
  console.log("  GET      /prices");
  console.log("  GET/POST /orders");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});