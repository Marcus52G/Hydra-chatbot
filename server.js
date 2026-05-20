// ============================================================
// server.js  — FINAL VERSION (All 4 Phases + Onboarding)
// ============================================================

try { require("dotenv").config(); } catch (e) {}

const express = require("express");
const path    = require("path");
const fs      = require("fs");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ─────────────────────────────────────────────
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ── ROUTES ─────────────────────────────────────────────────
const pricesRouter   = require("./routes/prices");
const ordersRouter   = require("./routes/orders");
const whatsappRoute  = require("./routes/whatsapp");
const mpesaRoute     = require("./routes/mpesa");
const broadcastRoute = require("./routes/broadcast");
const onboardRoute   = require("./routes/onboard");

app.use("/webhook",   whatsappRoute);
app.use("/prices",    pricesRouter);
app.use("/orders",    ordersRouter);
app.use("/mpesa",     mpesaRoute);
app.use("/broadcast", broadcastRoute);
app.use("/onboard",   onboardRoute);

// ── STATIC FILES ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public/dashboard.html"));
});

// ── HEALTH CHECK ───────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status:    "ok",
    uptime:    process.uptime(),
    timestamp: new Date().toISOString(),
    version:   "Hydra Bot v1.0 — All Phases + Onboarding",
  });
});

// ── 404 ────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.url}`,
  });
});

// ── ERROR HANDLER ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, message: "Server error" });
});

// ── START ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Hydra Bot v1.0 — Port ${PORT}`);
  console.log(`  → http://localhost:${PORT}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  GET/POST  /webhook");
  console.log("  POST      /onboard/submit");
  console.log("  GET       /onboard/check/:number");
  console.log("  GET       /onboard/clients");
  console.log("  POST      /broadcast/send");
  console.log("  GET       /broadcast/stats");
  console.log("  GET       /broadcast/history");
  console.log("  GET/POST  /mpesa/callback");
  console.log("  GET       /mpesa/pending");
  console.log("  GET       /prices");
  console.log("  GET/POST  /orders");
  console.log("  GET       /dashboard");
  console.log("  GET       /health");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});