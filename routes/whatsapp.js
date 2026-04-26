// ============================================================
// routes/whatsapp.js
// ============================================================
// PURPOSE: Handles ALL communication with Meta's WhatsApp API.
//
// HOW WHATSAPP API WORKS (simplified):
//
//  1. You register a webhook URL with Meta
//     (e.g. https://yourserver.com/webhook)
//
//  2. When a customer sends you a WhatsApp message, Meta sends
//     an HTTP POST request to your webhook with the message data.
//
//  3. Your server processes the message and calls Meta's API
//     to send a reply back to the customer.
//
//  4. Meta also sends a GET request first to VERIFY your webhook
//     is real (the verification handshake).
//
// This file handles steps 2, 3, and 4.
// ============================================================

const express        = require("express");
const router         = express.Router();
const { handleMessage } = require("../services/messageHandler");

// ── ENVIRONMENT VARIABLES ──────────────────────────────────
// NEVER hardcode secrets in code. Use environment variables.
// process.env reads from your system environment or a .env file.
// We'll create the .env file separately.
const VERIFY_TOKEN   = process.env.WA_VERIFY_TOKEN;   // you make this up
const ACCESS_TOKEN   = process.env.WA_ACCESS_TOKEN;   // from Meta dashboard
const PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID; // from Meta dashboard

// ── GET /webhook — VERIFICATION HANDSHAKE ─────────────────
// When you register your webhook in Meta's dashboard, Meta sends
// a GET request to verify you own the server.
// Meta sends: ?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=RANDOM_NUMBER
// You must respond with the challenge number to prove it's you.
router.get("/", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified by Meta");
    // Respond with the challenge as plain text (not JSON)
    res.status(200).send(challenge);
  } else {
    console.warn("❌ Webhook verification failed — token mismatch");
    res.status(403).send("Forbidden");
  }
});

// ── POST /webhook — RECEIVE MESSAGES ──────────────────────
// Every incoming WhatsApp message arrives here.
// Meta's payload structure is deeply nested — we must dig into it.
router.post("/", async (req, res) => {
  // ALWAYS respond 200 immediately to Meta, even before processing.
  // If you take too long, Meta will think you're offline and retry.
  res.status(200).send("OK");

  try {
    const body = req.body;

    // Guard: make sure this is a WhatsApp message event
    // The structure is: body.entry[0].changes[0].value.messages[0]
    if (body.object !== "whatsapp_business_account") return;

    const entry   = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    // Ignore status updates (delivered, read receipts) — only process messages
    if (!value?.messages) return;

    const message = value.messages[0];

    // We only handle text messages for now (could add image/audio later)
    if (message.type !== "text") {
      await sendWhatsAppMessage(message.from, "Sorry, I can only read text messages right now. Please type your message.");
      return;
    }

    const customerPhone = message.from;       // "+254712345678"
    const customerText  = message.text.body;  // "Beef 2kg"

    console.log(`📨 Message from ${customerPhone}: "${customerText}"`);

    // ── Pass to the message handler ────────────────────────
    // handleMessage figures out what to reply based on conversation state
    const reply = await handleMessage(customerPhone, customerText);

    // null means the conversation is in human handoff mode — bot stays silent
    if (reply === null) {
      console.log(`🤫 Human handoff active for ${customerPhone} — bot silent`);
      return;
    }

    // ── Send the reply back to the customer ────────────────
    await sendWhatsAppMessage(customerPhone, reply);

  } catch (error) {
    console.error("Webhook processing error:", error);
    // Don't re-throw — we already sent 200 to Meta
  }
});

// ── sendWhatsAppMessage ────────────────────────────────────
// Calls the Meta WhatsApp Cloud API to send a message.
// This is the ONLY function that touches the external API.
// Keeping it isolated means it's easy to test and swap later.
async function sendWhatsAppMessage(to, text) {
  const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

  // fetch() is built into Node.js 18+
  const response = await fetch(url, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${ACCESS_TOKEN}`, // your Meta access token
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,                                        // customer's phone number
      type: "text",
      text: { body: text },                      // the message content
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    console.error("WhatsApp API error:", JSON.stringify(err));
    throw new Error(`WhatsApp send failed: ${err.error?.message}`);
  }

  console.log(`✅ Sent to ${to}`);
  return response.json();
}

// Export sendWhatsAppMessage too — other parts of the system
// (e.g. sending manager notifications) will need it
module.exports = router;
module.exports.sendWhatsAppMessage = sendWhatsAppMessage;