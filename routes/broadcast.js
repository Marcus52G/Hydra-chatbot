// ============================================================
// routes/broadcast.js
// ============================================================
// ENDPOINTS:
//   POST /broadcast/send     — send broadcast via API/dashboard
//   GET  /broadcast/stats    — get customer counts per segment
//   GET  /broadcast/history  — past broadcasts
//
// WHATSAPP TRIGGER:
//   Owner sends: BROADCAST ALL: your message here
//   Owner sends: BROADCAST LAST30: your message here
//   Owner sends: BROADCAST REPEAT: your message here
// ============================================================

const express                              = require("express");
const router                               = express.Router();
const { sendBroadcast, getBroadcastStats } = require("../services/broadcastService");
const { getClient }                        = require("../services/clientManager");

// Broadcast history (in-memory, last 50)
const broadcastHistory = [];

// ── POST /broadcast/send ───────────────────────────────────
// Body: { clientNumber, message, filter, apiKey }
router.post("/send", async (req, res) => {
  const { clientNumber, message, filter = "all", apiKey } = req.body;

  // Simple API key auth — must match env variable
  if (apiKey !== process.env.BROADCAST_API_KEY) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  if (!clientNumber || !message) {
    return res.status(400).json({ success: false, message: "clientNumber and message required" });
  }

  const client = getClient(clientNumber);
  if (!client) {
    return res.status(404).json({ success: false, message: `Client not found: ${clientNumber}` });
  }

  // Respond immediately — broadcast runs in background
  res.json({ success: true, message: "Broadcast started", filter, clientNumber });

  // Run broadcast
  try {
    const { sendWhatsAppMessage } = require("./whatsapp");
    const result = await sendBroadcast(clientNumber, message, filter, client, sendWhatsAppMessage);

    // Save to history
    broadcastHistory.unshift({
      id:          Date.now(),
      clientNumber,
      businessName: client.business.name,
      message,
      filter,
      result,
      sentAt:      new Date().toISOString(),
    });
    if (broadcastHistory.length > 50) broadcastHistory.pop();

    console.log(`📢 Broadcast complete:`, result);
  } catch (e) {
    console.error("Broadcast error:", e.message);
  }
});

// ── GET /broadcast/stats ───────────────────────────────────
router.get("/stats", (req, res) => {
  const { clientNumber, apiKey } = req.query;

  if (apiKey !== process.env.BROADCAST_API_KEY) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  if (!clientNumber) {
    return res.status(400).json({ success: false, message: "clientNumber required" });
  }

  const client = getClient(clientNumber);
  if (!client) {
    return res.status(404).json({ success: false, message: "Client not found" });
  }

  const stats = getBroadcastStats(clientNumber);
  res.json({ success: true, business: client.business.name, stats });
});

// ── GET /broadcast/history ─────────────────────────────────
router.get("/history", (req, res) => {
  const { apiKey } = req.query;
  if (apiKey !== process.env.BROADCAST_API_KEY) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  res.json({ success: true, count: broadcastHistory.length, history: broadcastHistory });
});

// ── handleBroadcastCommand ─────────────────────────────────
// Called from whatsapp.js when owner sends BROADCAST: message
// Format: BROADCAST ALL: message
//         BROADCAST LAST30: message
//         BROADCAST REPEAT: message
//         BROADCAST NEW: message
async function handleBroadcastCommand(text, client, sendFn) {
  const upper = text.toUpperCase();

  // Parse filter and message
  let filter  = "all";
  let message = "";

  const patterns = [
    { prefix: "BROADCAST ALL:",    filter: "all"    },
    { prefix: "BROADCAST LAST30:", filter: "last30" },
    { prefix: "BROADCAST REPEAT:", filter: "repeat" },
    { prefix: "BROADCAST NEW:",    filter: "new"    },
    { prefix: "BROADCAST:",        filter: "all"    },
  ];

  for (const p of patterns) {
    if (upper.startsWith(p.prefix)) {
      filter  = p.filter;
      message = text.slice(p.prefix.length).trim();
      break;
    }
  }

  if (!message) {
    return `⚠️ Broadcast message is empty.\n\nFormat:\n*BROADCAST ALL: your message*\n*BROADCAST LAST30: your message*\n*BROADCAST REPEAT: your message*`;
  }

  const clientNumber = client.botNumber;
  const stats        = getBroadcastStats(clientNumber);
  const count        = stats[filter] || 0;

  if (count === 0) {
    return `⚠️ No customers found for filter: *${filter}*\n\nCustomer counts:\n• All: ${stats.all}\n• Last 30 days: ${stats.last30}\n• Repeat: ${stats.repeat}\n• New: ${stats.new}`;
  }

  // Confirm before sending
  return `📢 *Broadcast Preview*\n\n` +
    `Filter: *${filter}* (${count} customers)\n\n` +
    `Message:\n"${message}"\n\n` +
    `Reply *CONFIRM BROADCAST* to send, or *CANCEL BROADCAST* to abort.`;
}

// ── confirmBroadcast ───────────────────────────────────────
async function confirmBroadcast(pendingBroadcast, client, sendFn) {
  const { filter, message, clientNumber } = pendingBroadcast;

  // Send confirmation to owner first
  const managerPhone  = client.whatsapp.manager_phone.replace("+", "");
  const phoneNumberId = client.whatsapp.phone_number_id;
  await sendFn(phoneNumberId, managerPhone, `📢 Sending broadcast now...`, client);

  // Run broadcast
  const result = await sendBroadcast(clientNumber, message, filter, client, sendFn);

  // Save to history
  broadcastHistory.unshift({
    id:           Date.now(),
    clientNumber,
    businessName: client.business.name,
    message,
    filter,
    result,
    sentAt:       new Date().toISOString(),
  });
  if (broadcastHistory.length > 50) broadcastHistory.pop();

  return `✅ *Broadcast Complete!*\n\n` +
    `• Sent: *${result.sent}* customers\n` +
    `• Failed: ${result.failed}\n` +
    `• Total: ${result.total}\n\n` +
    `Filter used: ${filter}`;
}

module.exports = router;
module.exports.handleBroadcastCommand = handleBroadcastCommand;
module.exports.confirmBroadcast       = confirmBroadcast;