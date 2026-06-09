// ============================================================
// routes/onboard.js  (COMPLETE VERSION — WhatsApp + SMS)
// ============================================================
// PURPOSE: Fully automated client onboarding
//   1. Receives form submission
//   2. Validates required fields
//   3. Checks for duplicate numbers
//   4. Builds client JSON config
//   5. Saves to clients/ folder
//   6. Reloads into clientManager
//   7. Notifies YOU via WhatsApp + SMS
//   8. Sends welcome WhatsApp + SMS to new client
// ============================================================

const express = require("express");
const router  = express.Router();
const fs      = require("fs");
const path    = require("path");

const CLIENTS_DIR = path.join(__dirname, "../clients");

// ── POST /onboard/submit ───────────────────────────────────
router.post("/submit", async (req, res) => {
  try {
    const data = req.body;

    // ── 1. Validate required fields ────────────────────────
    const required = ["biz_name","owner_name","wa_number","personal_number","biz_type","location"];
    for (const field of required) {
      if (!data[field]?.toString().trim()) {
        return res.status(400).json({
          success: false,
          message: `Missing required field: ${field}`,
        });
      }
    }

    // ── 2. Format and check duplicate ──────────────────────
    const waNumber   = formatPhone(data.wa_number);
    const clientFile = path.join(CLIENTS_DIR, `${waNumber}.json`);

    if (fs.existsSync(clientFile)) {
      return res.status(409).json({
        success: false,
        message: `${waNumber} is already registered. Contact Hydra Tech to update your details.`,
      });
    }

    // ── 3. Build prices from submitted products ─────────────
    const prices = {};
    (data.products || []).forEach(p => {
      if (!p.name?.trim() || !p.price) return;
      const key = p.name.trim().toLowerCase().replace(/\s+/g, "_");
      prices[key] = {
        name:      p.name.trim(),
        price:     parseFloat(p.price) || 0,
        unit:      p.unit?.trim() || "",
        available: true,
      };
    });

    // ── 4. Build hours string ───────────────────────────────
    const days      = data.days || ["Mon","Tue","Wed","Thu","Fri","Sat"];
    const openTime  = data.open_time  || "08:00";
    const closeTime = data.close_time || "20:00";
    const hours     = `${days.join(", ")}: ${formatTime(openTime)} - ${formatTime(closeTime)}`;

    // ── 5. Build full client config ─────────────────────────
    const config = {
      business: {
        name:      data.biz_name.trim(),
        phone:     data.personal_number.trim(),
        location:  data.location.trim(),
        maps_link: `https://maps.google.com/?q=${encodeURIComponent(data.location.trim())}`,
        hours,
        type:      data.biz_type,
      },
      prices,
      delivery: {
        available:      data.delivery !== "no",
        fee_min:        parseInt(data.delivery_fee_min) || 100,
        fee_max:        parseInt(data.delivery_fee_max) || 300,
        estimated_time: data.delivery_time || "30-60 minutes",
        area:           data.delivery_area || "",
      },
      faqs:  {},
      rules: [
        "Always reply in the same language the customer used",
        "Always end every message with a follow-up question or next step",
        "If customer complains, apologize sincerely and offer the manager contact",
      ],
      whatsapp: {
        phone_number_id: process.env.WA_PHONE_NUMBER_ID || "",
        manager_phone:   data.personal_number.trim(),
      },
      plan:         data.plan || "basic",
      owner_name:   data.owner_name.trim(),
      owner_email:  data.email || "",
      onboarded_at: new Date().toISOString(),
      orders:       [],
      customers:    {},
    };

    // ── 6. Save config file ─────────────────────────────────
    if (!fs.existsSync(CLIENTS_DIR)) fs.mkdirSync(CLIENTS_DIR, { recursive: true });
    fs.writeFileSync(clientFile, JSON.stringify(config, null, 2), "utf8");
    console.log(`🎉 New client onboarded: ${data.biz_name} (${waNumber})`);

    // ── 7. Reload into clientManager cache ──────────────────
    try {
      const { reloadClient } = require("../services/clientManager");
      reloadClient(waNumber);
    } catch (e) { console.log("ClientManager reload:", e.message); }

    // ── 8. Notify YOU via WhatsApp ──────────────────────────
    const planLabel = data.plan === "smart"
      ? "Hydra Smart — KES 3,000/mo"
      : "Hydra Basic — KES 1,500/mo";

    try {
      const { sendWhatsAppMessage } = require("./whatsapp");
      const pid        = process.env.WA_PHONE_NUMBER_ID;
      const ownerPhone = (process.env.MANAGER_PHONE || "").replace("+", "");

      if (pid && ownerPhone) {
        await sendWhatsAppMessage(pid, ownerPhone,
          `🎉 *New Client Onboarded!*\n\n` +
          `🏪 *${data.biz_name}*\n` +
          `👤 Owner: ${data.owner_name}\n` +
          `📞 Bot Number: ${waNumber}\n` +
          `📱 Personal: ${data.personal_number}\n` +
          `📍 Location: ${data.location}\n` +
          `🏷️ Type: ${data.biz_type}\n` +
          `📦 Products: ${Object.keys(prices).length} items\n` +
          `💰 Plan: ${planLabel}\n\n` +
          `✅ Config saved: clients/${waNumber}.json\n` +
          `⚡ Next: register their number on Meta.`,
          { business: { name: "Hydra Tech" }, whatsapp: { phone_number_id: pid } }
        );
        console.log("✅ Owner WhatsApp notification sent");
      }
    } catch (e) { console.error("Owner WhatsApp error:", e.message); }

    // ── 9. Notify YOU via SMS (fallback) ────────────────────
    // Works even if WhatsApp is off or you have no data
    try {
      const { sendAlertSMS } = require("../services/smsService");
      await sendAlertSMS(
        process.env.MANAGER_PHONE,
        `NEW CLIENT: ${data.biz_name} (${waNumber}) - ${planLabel}. Check WhatsApp for details.`
      );
      console.log("📱 Owner SMS notification sent");
    } catch (e) { console.error("Owner SMS error:", e.message); }

    // ── 10. Welcome WhatsApp to new client ──────────────────
    try {
      const { sendWhatsAppMessage } = require("./whatsapp");
      const pid         = process.env.WA_PHONE_NUMBER_ID;
      const clientPhone = formatPhone(data.personal_number).replace("+", "");

      if (pid) {
        await sendWhatsAppMessage(pid, clientPhone,
          `👋 *Welcome to Hydra Tech, ${data.owner_name}!*\n\n` +
          `We have received your setup form for *${data.biz_name}* ✅\n\n` +
          `*What happens next:*\n\n` +
          `1️⃣ We review your details\n` +
          `2️⃣ Configure your bot within 24 hours\n` +
          `3️⃣ Test it live with you\n` +
          `4️⃣ Go live on your WhatsApp number 🚀\n\n` +
          `Any questions? Just reply here.\n\n` +
          `— *Hydra Tech Team* 🤖`,
          { business: { name: "Hydra Tech" }, whatsapp: { phone_number_id: pid } }
        );
        console.log("✅ Welcome WhatsApp sent to client");
      }
    } catch (e) { console.error("Welcome WhatsApp error:", e.message); }

    // ── 11. Welcome SMS to new client ───────────────────────
    // Reaches them even if WhatsApp is off — guaranteed delivery
    try {
      const { sendWelcomeSMS } = require("../services/smsService");
      await sendWelcomeSMS(
        data.personal_number,
        data.owner_name,
        data.biz_name
      );
      console.log("📱 Welcome SMS sent to client");
    } catch (e) { console.error("Welcome SMS error:", e.message); }

    // SMS welcome to new client
    try {
      const { sendWelcomeSMS } = require("../services/smsService");
      await sendWelcomeSMS(data.personal_number, data.owner_name, data.biz_name);
      console.log("📱 Welcome SMS sent to client");
    } catch (e) { console.error("Welcome SMS error:", e.message); }

    // SMS alert to you
    try {
      const { sendAlertSMS } = require("../services/smsService");
      await sendAlertSMS(
        process.env.MANAGER_PHONE,
        `New client: ${data.biz_name} (${waNumber}) - ${data.plan} plan`
      );
    } catch (e) { console.error("Owner SMS error:", e.message); }

    // ── 12. Send success response ───────────────────────────
    res.json({
      success:      true,
      message:      "Setup complete! We will contact you within 24 hours.",
      clientNumber: waNumber,
      businessName: data.biz_name,
    });

  } catch (err) {
    console.error("Onboard submit error:", err.message);
    res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again or contact us on WhatsApp.",
    });
  }
});

// ── GET /onboard/check/:number ─────────────────────────────
// Check if a number is already registered before submitting
router.get("/check/:number", (req, res) => {
  const num    = formatPhone(req.params.number);
  const exists = fs.existsSync(path.join(CLIENTS_DIR, `${num}.json`));
  res.json({ success: true, exists, number: num });
});

// ── GET /onboard/clients ───────────────────────────────────
// Returns all registered clients with stats
// Protected by API key — only you can call this
router.get("/clients", (req, res) => {
  if (req.query.apiKey !== process.env.BROADCAST_API_KEY) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  try {
    const files = fs.readdirSync(CLIENTS_DIR)
      .filter(f => f.endsWith(".json") && f !== "TEMPLATE.json");

    const clients = files.map(f => {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(CLIENTS_DIR, f), "utf8"));
        return {
          number:       f.replace(".json", ""),
          name:         d.business?.name,
          type:         d.business?.type,
          plan:         d.plan,
          owner:        d.owner_name,
          onboarded_at: d.onboarded_at,
          orders:       d.orders?.length || 0,
          customers:    Object.keys(d.customers || {}).length,
        };
      } catch (e) { return null; }
    }).filter(Boolean);

    res.json({ success: true, count: clients.length, clients });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── HELPERS ────────────────────────────────────────────────
// Normalise Kenyan phone numbers to +254 format
function formatPhone(phone) {
  let p = String(phone).replace(/\s+/g, "").replace(/[^0-9]/g, "");
  if (p.startsWith("0"))    p = "254" + p.slice(1);
  if (!p.startsWith("254")) p = "254" + p;
  return `+${p}`;
}

// Convert 24hr time to 12hr AM/PM
function formatTime(t) {
  if (!t) return t;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

module.exports = router;