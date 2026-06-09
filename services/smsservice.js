// ============================================================
// services/smsService.js
// ============================================================
// PURPOSE: Send SMS notifications via Africa's Talking
//
// WHEN IT IS USED:
//   1. New order placed → notify manager via SMS
//   2. WhatsApp message fails → SMS fallback
//   3. Owner is offline → SMS still reaches them
//
// WHY SMS AS FALLBACK:
//   WhatsApp needs internet → SMS only needs signal
//   Owner at market with no data? SMS still arrives
//   Owner's WhatsApp off?     SMS still arrives
//   Middle of the night?      Phone buzzes with SMS
// ============================================================

const AfricasTalking = require("africastalking");

// Initialise Africa's Talking client
// Reads credentials from .env file
const AT = AfricasTalking({
  apiKey:   process.env.AT_API_KEY,
  username: process.env.AT_USERNAME || "sandbox",
});

// Get the SMS service from the AT client
const sms = AT.SMS;

// ── sendSMS ────────────────────────────────────────────────
// to      = phone number e.g "+254712345678"
// message = the text to send
//
// Returns: { success: true/false, data/error }
async function sendSMS(to, message) {
  try {
    // Format number — Africa's Talking needs + prefix
    const formatted = formatPhone(to);

    const result = await sms.send({
      to:      [formatted],  // array — can send to multiple
      message,
      from:    process.env.AT_SENDER_ID || undefined,
      // sender ID is optional — only needed for branded SMS
      // leave undefined to use default AT shortcode
    });

    console.log(`📱 SMS sent to ${formatted}:`, result.SMSMessageData?.Message);
    return { success: true, data: result };

  } catch (error) {
    console.error(`❌ SMS failed to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

// ── sendOrderSMS ───────────────────────────────────────────
// Sends a formatted order notification SMS to the manager
// Called automatically when a new order is confirmed
//
// managerPhone = owner's number from client config
// order        = the full order object
// businessName = client's business name
async function sendOrderSMS(managerPhone, order, businessName) {
  // Keep SMS short — max 160 chars for single SMS
  // Longer messages cost more (split into multiple SMS)
  const deliveryInfo = order.deliveryType === "delivery"
    ? `Delivery to: ${order.deliveryLocation}`
    : "Pickup from store";

  const message =
    `NEW ORDER - ${businessName}\n` +
    `Customer: ${order.customerName}\n` +
    `Item: ${order.items?.[0]?.name} x${order.items?.[0]?.quantity}kg\n` +
    `Total: KES ${order.totalPrice}\n` +
    `${deliveryInfo}\n` +
    `ID: ${order.id?.slice(0, 8).toUpperCase()}`;

  return await sendSMS(managerPhone, message);
}

// ── sendWelcomeSMS ─────────────────────────────────────────
// Sends a welcome SMS to a new client after onboarding
// Confirms their bot is being set up
async function sendWelcomeSMS(phone, ownerName, businessName) {
  const message =
    `Hi ${ownerName}! Welcome to Hydra Tech.\n` +
    `Your WhatsApp bot for ${businessName} is being set up.\n` +
    `We will contact you within 24 hours.\n` +
    `- Hydra Tech Team`;

  return await sendSMS(phone, message);
}

// ── sendAlertSMS ───────────────────────────────────────────
// General purpose alert SMS — for system issues etc.
async function sendAlertSMS(phone, alertMessage) {
  return await sendSMS(phone, `HYDRA ALERT: ${alertMessage}`);
}

// ── formatPhone ────────────────────────────────────────────
// Normalise Kenyan phone numbers to +254 format
// Africa's Talking requires international format
function formatPhone(phone) {
  let p = String(phone).replace(/\s+/g, "").replace(/[^0-9+]/g, "");

  // Already has + prefix
  if (p.startsWith("+")) return p;

  // Starts with 0 → replace with 254
  if (p.startsWith("0")) return "+254" + p.slice(1);

  // Starts with 254 → add +
  if (p.startsWith("254")) return "+" + p;

  // Assume Kenya if no prefix
  return "+254" + p;
}

module.exports = {
  sendSMS,
  sendOrderSMS,
  sendWelcomeSMS,
  sendAlertSMS,
};