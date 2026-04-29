// ============================================================
// server.js  — THE ENTRY POINT
// ============================================================
// This is the first file Node.js runs.
// Its job:
//   1. Create the Express app
//   2. Set up middleware (tools every request goes through)
//   3. Mount routes (connect URLs to their handlers)
//   4. Start listening for requests
// ============================================================

// Load .env file into process.env BEFORE anything else
// dotenv reads your .env file and makes each line available as process.env.KEY
// require("dotenv").config() must be the FIRST thing in your entry point
try { require("dotenv").config(); } catch (e) { /* dotenv optional in prod */ }

const express = require("express"); // import the Express framework
const path    = require("path");
const fs      = require("fs");

const app  = express(); // create the app
const PORT = process.env.PORT || 3000; // use environment variable or default to 3000

// ── MIDDLEWARE ─────────────────────────────────────────────
// Middleware = functions that run on EVERY request before it reaches a route.
// Think of them as a pipeline every request passes through.

// express.json() parses incoming requests with JSON bodies.
// Without this, req.body would be undefined when clients send JSON.
app.use(express.json());

// A simple logger middleware — logs every incoming request to the console.
// This helps you debug: you can see what's hitting your server in real-time.
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next(); // IMPORTANT: call next() to pass control to the next middleware/route
});

// ── ROUTES ─────────────────────────────────────────────────
// "Mounting" a router means: any URL starting with /prices
// will be handled by the prices router.
//
// Example:
//   GET /prices        → handled by prices.js router's GET "/"
//   GET /prices/available → handled by prices.js router's GET "/available"
//   POST /orders       → handled by orders.js router's POST "/"

const pricesRouter    = require("./routes/prices");
const ordersRouter    = require("./routes/orders");
const whatsappRoute = require("./routes/whatsapp");
app.use("/webhook", whatsappRoute.router);

// ── HEALTH CHECK ───────────────────────────────────────────
// A health check endpoint is standard practice.
// WhatsApp, monitoring tools, or you manually can call this
// to confirm "is the server alive?"
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(), // seconds server has been running
    timestamp: new Date().toISOString(),
  });
});

// ── BUSINESS INFO ──────────────────────────────────────────
// Quick endpoint for the bot to get business details
app.get("/info", (req, res) => {
  const dbPath = path.join(__dirname, "data/db.json");
  const db     = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  res.json({ success: true, data: db.business });
});

// ── 404 HANDLER ────────────────────────────────────────────
// If no route matched, this runs.
// It MUST be AFTER all routes (order matters in Express).
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route "${req.method} ${req.url}" not found`,
  });
});

// ── GLOBAL ERROR HANDLER ───────────────────────────────────
// If any route/middleware throws an unhandled error,
// Express passes it here (4-parameter middleware = error handler).
// This prevents the server from crashing completely.
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    message: "Something went wrong on the server",
  });
});

// ── START SERVER ───────────────────────────────────────────
// .listen() starts the HTTP server on the given port.
// The callback runs once the server is ready.
app.listen(PORT, () => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  🥩 Butchery Backend running on port ${PORT}`);
  console.log(`  → http://localhost:${PORT}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Available endpoints:");
  console.log("  GET  /health");
  console.log("  GET  /info");
  console.log("  GET  /prices");
  console.log("  GET  /prices/available");
  console.log("  GET  /orders");
  console.log("  POST /orders");
  console.log("  PATCH /orders/:id/status");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});