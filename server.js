// ============================================================
// server.js  — PHASE 3 VERSION
// ============================================================

try { require("dotenv").config(); } catch (e) {}

const express = require("express");
const path    = require("path");
const fs      = require("fs");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ── ROUTES ─────────────────────────────────────────────────
const pricesRouter    = require("./routes/prices");
const ordersRouter    = require("./routes/orders");
const whatsappRoute   = require("./routes/whatsapp");
const mpesaRoute      = require("./routes/mpesa");
const broadcastRoute  = require("./routes/broadcast");

app.use("/webhook",   whatsappRoute);
app.use("/prices",    pricesRouter);
app.use("/orders",    ordersRouter);
app.use("/mpesa",     mpesaRoute);
app.use("/broadcast", broadcastRoute);

// ── BROADCAST DASHBOARD ────────────────────────────────────
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public/dashboard.html"));
});

// Serve static files from public/
app.use(express.static(path.join(__dirname, "public")));

// ── HEALTH CHECK ───────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status:    "ok",
    uptime:    process.uptime(),
    timestamp: new Date().toISOString(),
    version:   "Phase 3 — Broadcast & Promotions",
  });
});

// ── 404 ────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route "${req.method} ${req.url}" not found` });
});

// ── ERROR HANDLER ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, message: "Something went wrong" });
});

// ── START ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Hydra Bot — Port ${PORT}`);
  console.log(`  → http://localhost:${PORT}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  GET/POST /webhook");
  console.log("  GET/POST /mpesa/callback");
  console.log("  POST     /broadcast/send");
  console.log("  GET      /broadcast/stats");
  console.log("  GET      /broadcast/history");
  console.log("  GET      /dashboard");
  console.log("  GET      /health");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});