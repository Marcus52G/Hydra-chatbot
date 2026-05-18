// ============================================================
// services/broadcastService.js
// ============================================================

const fs   = require("fs");
const path = require("path");

// ── Load customers for a client ────────────────────────────
function getCustomers(clientNumber, filter = "all") {
  try {
    const clean    = String(clientNumber).replace("+", "");
    const filePath = path.join(__dirname, `../clients/+${clean}.json`);
    const data     = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const customers = Object.values(data.customers || {});

    if (customers.length === 0) return [];

    switch (filter) {
      case "all":
        return customers.filter(c => c.orderCount > 0);
      case "last30": {
        const ago = Date.now() - 30 * 24 * 60 * 60 * 1000;
        return customers.filter(c => {
          const last = c.orders?.[c.orders.length - 1];
          return last && new Date(last.date).getTime() > ago;
        });
      }
      case "repeat":
        return customers.filter(c => c.orderCount >= 2);
      case "new":
        return customers.filter(c => c.orderCount === 1);
      default:
        return customers.filter(c => c.orderCount > 0);
    }
  } catch (e) {
    console.error("getCustomers error:", e.message);
    return [];
  }
}

// ── Send broadcast ─────────────────────────────────────────
async function sendBroadcast(clientNumber, message, filter = "all", client, sendFn, delay = 1500) {
  const customers = getCustomers(clientNumber, filter);
  if (customers.length === 0) {
    return { sent: 0, failed: 0, total: 0, message: "No customers found" };
  }

  const phoneNumberId = client.whatsapp.phone_number_id;
  let sent = 0, failed = 0;

  console.log(`📢 Broadcasting to ${customers.length} customers (filter: ${filter})...`);

  for (const customer of customers) {
    try {
      const phone = String(customer.phone).replace("+", "");
      const personalised = customer.name
        ? message.replace(/{name}/g, customer.name)
        : message.replace(/Hi \{name\}! /g, "").replace(/{name}/g, "valued customer");

      await sendFn(phoneNumberId, phone, personalised, client);
      sent++;
      console.log(`✅ ${sent}/${customers.length} → ${phone}`);
      await new Promise(r => setTimeout(r, delay));
    } catch (e) {
      console.error(`❌ Failed → ${customer.phone}:`, e.message);
      failed++;
    }
  }

  console.log(`📢 Done: ${sent} sent, ${failed} failed`);
  return { sent, failed, total: customers.length };
}

// ── Broadcast stats ────────────────────────────────────────
function getBroadcastStats(clientNumber) {
  return {
    all:    getCustomers(clientNumber, "all").length,
    last30: getCustomers(clientNumber, "last30").length,
    repeat: getCustomers(clientNumber, "repeat").length,
    new:    getCustomers(clientNumber, "new").length,
  };
}

module.exports = { sendBroadcast, getCustomers, getBroadcastStats };