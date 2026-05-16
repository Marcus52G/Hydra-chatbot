// ============================================================
// routes/whatsapp.js  (MULTI-CLIENT VERSION)
// ============================================================
// WHAT CHANGED: detects which client owns the receiving number
// loads that client's config, replies as that business
// ============================================================

const express           = require("express");
const router            = express.Router();
const { handleMessage } = require("../services/messageHandler");
const { getClient, listClients } = require("../services/clientManager");

const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;

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

    // Load the correct client for this bot number
    const client = getClient(receivingNumber);

    if (!client) {
      console.warn(`No client config found for: ${receivingNumber}`);
      console.warn(`Create clients/+${receivingNumber}.json to register`);
      return;
    }

    console.log(`📨 [${client.business.name}] from ${customerPhone}: "${customerText}"`);

    // Pass client config to handler so it knows which business
    const reply = await handleMessage(customerPhone, customerText, client);

    if (reply === null) return; // human handoff — stay silent

    await sendWhatsAppMessage(receivingNumber, customerPhone, reply, client);

  } catch (error) {
    console.error("Webhook error:", error.message);
  }
});

// ── GET /webhook/clients — list registered clients ─────────
router.get("/clients", (req, res) => {
  const clients = listClients();
  res.json({ success: true, count: clients.length, clients });
});

// ── sendWhatsAppMessage ────────────────────────────────────
// Uses the client's own phone_number_id for sending
async function sendWhatsAppMessage(botNumber, to, text, client) {
  const phoneNumberId = client?.whatsapp?.phone_number_id
    || process.env.WA_PHONE_NUMBER_ID;
  const accessToken = process.env.WA_ACCESS_TOKEN;

  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

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

module.exports = router;
router.sendWhatsAppMessage = sendWhatsAppMessage;