// ============================================================
// services/clientManager.js
// ============================================================
// PURPOSE: Loads the right client config based on WhatsApp number
//   - getClient(number) → returns client config object
//   - listClients()     → returns all registered clients
//   - saveOrder()       → saves order to client file
// ============================================================

const fs   = require("fs");
const path = require("path");

const CLIENTS_DIR = path.join(__dirname, "../clients");

// Cache loaded clients in memory so we don't read disk every message
const clientCache = {};

// ── Load all clients on startup ────────────────────────────
function loadAllClients() {
  try {
    const files = fs.readdirSync(CLIENTS_DIR).filter(f => f.endsWith(".json") && f !== "TEMPLATE.json");
    files.forEach(file => {
      const filePath = path.join(CLIENTS_DIR, file);
      try {
        const data   = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const number = file.replace(".json", ""); // e.g. "+254118612755"
        clientCache[number] = data;
        // Store the bot number on the object for reference
        clientCache[number].botNumber = number;
        console.log(`✅ Loaded client: ${data.business?.name} (${number})`);
      } catch (e) {
        console.error(`Failed to load client file ${file}:`, e.message);
      }
    });
  } catch (e) {
    console.error("Could not read clients directory:", e.message);
  }
}

// Load on startup
loadAllClients();

// ── Get client by WhatsApp number ──────────────────────────
// The number can come in different formats — normalize it
function getClient(number) {
  if (!number) return null;

  const cleaned = String(number).replace(/\s+/g, "").replace(/^\+/, "");

  // Try different formats
  const attempts = [
    `+${cleaned}`,           // +254118612755
    `+0${cleaned}`,          // fallback
  ];

  for (const attempt of attempts) {
    if (clientCache[attempt]) return clientCache[attempt];
  }

  // Try partial match (last 9 digits)
  const last9 = cleaned.slice(-9);
  const match  = Object.keys(clientCache).find(k => k.slice(-9) === last9);
  if (match) return clientCache[match];

  return null;
}

// ── List all registered clients ────────────────────────────
function listClients() {
  return Object.values(clientCache).map(c => ({
    name:   c.business?.name,
    number: c.botNumber,
    plan:   c.plan || "basic",
  }));
}

// ── Save order to client file ──────────────────────────────
function saveOrder(clientNumber, orderId, orderData) {
  try {
    const clean    = String(clientNumber).replace("+", "");
    const filePath = path.join(CLIENTS_DIR, `+${clean}.json`);
    const data     = JSON.parse(fs.readFileSync(filePath, "utf8"));

    if (!data.orders) data.orders = [];
    data.orders.push(orderData);

    // Keep last 100 orders only
    if (data.orders.length > 100) data.orders = data.orders.slice(-100);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    console.log(`💾 Order ${orderId} saved for ${data.business?.name}`);
  } catch (e) {
    console.error("saveOrder error:", e.message);
  }
}

// ── Reload a single client (useful after config update) ───
function reloadClient(clientNumber) {
  try {
    const clean    = String(clientNumber).replace("+", "");
    const filePath = path.join(CLIENTS_DIR, `+${clean}.json`);
    const data     = JSON.parse(fs.readFileSync(filePath, "utf8"));
    clientCache[`+${clean}`] = data;
    clientCache[`+${clean}`].botNumber = `+${clean}`;
    return data;
  } catch (e) {
    console.error("reloadClient error:", e.message);
    return null;
  }
}

module.exports = { getClient, listClients, saveOrder, reloadClient };