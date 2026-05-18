// ============================================================
// routes/whatsapp.js  (PHASE 3 — BROADCAST VERSION)
// ============================================================

const express           = require("express");
const router            = express.Router();
const { handleMessage } = require("../services/messageHandler");
const { getClient, listClients } = require("../services/clientManager");
const { handleBroadcastCommand, confirmBroadcast } = require("./broadcast");

const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;

// Pending broadcasts per manager phone
const pendingBroadcasts = {};

// ── GET /webhook — Meta verification ──────────────────────
router.get("/", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified by Meta");
    res.status(200).send(challenge);
  } else {
    res.status(403).send("Forbidden");
  }
});

// ── POST /webhook — receive messages ───────────────────────
router.post("/", async (req, res) => {
  res.status(200).send("OK");

  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return;

    const value = body.entry?.[0]?.changes?.[0]?.value;
    if (!value?.messages) return;

    const message = value.messages[0];
    if (message.type !== "text") return;

    const customerPhone   = message.from;
    const customerText    = message.text.body;
    const receivingNumber = value?.metadata?.display_phone_number;

    if (!receivingNumber) {
      console.error("Could not determine receiving number");
      return;
    }

    const client = getClient(receivingNumber);
    if (!client) {
      console.warn(`No client config found for: ${receivingNumber}`);
      return;
    }

    console.log(`📨 [${client.business.name}] from ${customerPhone}: "${customerText}"`);

    // ── Check if message is from the manager ──────────────
    const managerPhone = client.whatsapp.manager_phone?.replace("+", "");
    const isManager    = managerPhone && customerPhone === managerPhone;

    if (isManager) {
      const upperText = customerText.toUpperCase().trim();

      // Handle broadcast commands
      if (upperText.startsWith("BROADCAST")) {
        const reply = await handleBroadcastCommand(customerText, client, sendWhatsAppMessage);
        // Save pending broadcast
        if (reply.includes("CONFIRM BROADCAST")) {
          const filter  = upperText.includes("LAST30") ? "last30"
            : upperText.includes("REPEAT") ? "repeat"
            : upperText.includes("NEW")    ? "new"
            : "all";
          const message = customerText.slice(customerText.indexOf(":") + 1).trim();
          pendingBroadcasts[customerPhone] = { filter, message, clientNumber: client.botNumber };
        }
        await sendWhatsAppMessage(receivingNumber, customerPhone, reply, client);
        return;
      }

      // Confirm broadcast
      if (upperText === "CONFIRM BROADCAST") {
        const pending = pendingBroadcasts[customerPhone];
        if (!pending) {
          await sendWhatsAppMessage(receivingNumber, customerPhone, "No pending broadcast found. Send a BROADCAST command first.", client);
          return;
        }
        delete pendingBroadcasts[customerPhone];
        const result = await confirmBroadcast(pending, client, sendWhatsAppMessage);
        await sendWhatsAppMessage(receivingNumber, customerPhone, result, client);
        return;
      }

      // Cancel broadcast
      if (upperText === "CANCEL BROADCAST") {
        delete pendingBroadcasts[customerPhone];
        await sendWhatsAppMessage(receivingNumber, customerPhone, "❌ Broadcast cancelled.", client);
        return;
      }

      // Manager stats command
      if (upperText === "STATS" || upperText === "STATUS") {
        const { getBroadcastStats } = require("../services/broadcastService");
        const stats = getBroadcastStats(client.botNumber);
        const reply =
          `📊 *${client.business.name} — Stats*\n\n` +
          `👥 Total customers: *${stats.all}*\n` +
          `🔄 Active (last 30d): *${stats.last30}*\n` +
          `⭐ Repeat customers: *${stats.repeat}*\n` +
          `🆕 New customers: *${stats.new}*\n\n` +
          `*Broadcast commands:*\n` +
          `BROADCAST ALL: message\n` +
          `BROADCAST LAST30: message\n` +
          `BROADCAST REPEAT: message\n` +
          `BROADCAST NEW: message`;
        await sendWhatsAppMessage(receivingNumber, customerPhone, reply, client);
        return;
      }
    }

    // ── Regular customer message ───────────────────────────
    const reply = await handleMessage(customerPhone, customerText, client);
    if (reply === null) return;
    await sendWhatsAppMessage(receivingNumber, customerPhone, reply, client);

  } catch (error) {
    console.error("Webhook error:", error.message);
  }
});

// ── GET /webhook/clients ───────────────────────────────────
router.get("/clients", (req, res) => {
  const clients = listClients();
  res.json({ success: true, count: clients.length, clients });
});

// ── sendWhatsAppMessage ────────────────────────────────────
async function sendWhatsAppMessage(botNumber, to, text, client) {
  const phoneNumberId = client?.whatsapp?.phone_number_id || botNumber;
  const accessToken   = process.env.WA_ACCESS_TOKEN;
  const url           = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`WhatsApp send failed: ${err.error?.message}`);
  }

  console.log(`✅ [${client?.business?.name}] Sent to ${to}`);
  return response.json();
}

router.sendWhatsAppMessage = sendWhatsAppMessage;
module.exports = router;