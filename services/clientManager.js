// ============================================================
// services/clientManager.js
// ============================================================
// PURPOSE: The multi-client brain.
//
// This file answers one question every time a message arrives:
//   "Which client owns this WhatsApp number?"
//
// HOW IT WORKS:
//   Every client has a config file in the clients/ folder.
//   The filename is their WhatsApp bot number e.g:
//     clients/+254118612755.json  ← Sample Store
//     clients/+254733000000.json  ← Second Client
//     clients/+254744000000.json  ← Third Client
//
//   When Meta sends a webhook, it tells us:
//     - which number RECEIVED the message (the bot number)
//   We use that number to find the right config file.
//   Then the bot replies using that client's data only.
//
// ADDING A NEW CLIENT:
//   1. Copy TEMPLATE.json
//   2. Rename it to their WhatsApp number e.g +254733000000.json
//   3. Fill in their business data
//   4. Done — no code changes needed
// ============================================================

const fs   = require("fs");
const path = require("path");

// Path to the clients folder
const CLIENTS_DIR = path.join(__dirname, "../clients");

// In-memory cache — loads each client config once
// then keeps it in memory for speed
// { "+254118612755": { business:{}, prices:{}, ... } }
const clientCache = {};

// ── getClient ──────────────────────────────────────────────
// Returns the config for the given WhatsApp number.
// botNumber = the number that RECEIVED the message
//             e.g. "+254118612755" or "254118612755"
function getClient(botNumber) {
  // Normalise number format — always use + prefix
  // Meta sometimes sends numbers without + sign
  const normalised = botNumber.startsWith("+")
    ? botNumber
    : `+${botNumber}`;

  // Return from cache if already loaded
  if (clientCache[normalised]) {
    return clientCache[normalised];
  }

  // Build path to this client's config file
  const filePath = path.join(CLIENTS_DIR, `${normalised}.json`);

  // Check if config file exists
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  No client config found for number: ${normalised}`);
    console.warn(`   Create: clients/${normalised}.json`);
    return null; // caller must handle null
  }

  // Load and parse the config
  try {
    const raw    = fs.readFileSync(filePath, "utf8");
    const config = JSON.parse(raw);
    config.botNumber = normalised;

    // Store in cache for next time
    clientCache[normalised] = config;

    console.log(`✅ Loaded client: ${config.business.name} (${normalised})`);
    return config;

  } catch (error) {
    console.error(`❌ Failed to load client config for ${normalised}:`, error.message);
    return null;
  }
}

// ── saveOrder ──────────────────────────────────────────────
// Saves a new order to the client's config file.
// Each client stores their own orders inside their JSON file.
// orderId     = unique order ID
// orderData   = the full order object
// botNumber   = which client this belongs to
function saveOrder(botNumber, orderId, orderData) {
  const normalised = botNumber.startsWith("+") ? botNumber : `+${botNumber}`;
  const filePath   = path.join(CLIENTS_DIR, `${normalised}.json`);

  if (!fs.existsSync(filePath)) return false;

  try {
    const raw    = fs.readFileSync(filePath, "utf8");
    const config = JSON.parse(raw);

    // Add order to this client's orders array
    if (!config.orders) config.orders = [];
    config.orders.push(orderData);

    // Write back to file
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf8");

    // Update cache
    clientCache[normalised] = config;

    return true;
  } catch (error) {
    console.error("Failed to save order:", error.message);
    return false;
  }
}

// ── getClientOrders ────────────────────────────────────────
// Returns all orders for a specific client
function getClientOrders(botNumber) {
  const client = getClient(botNumber);
  return client ? (client.orders || []) : [];
}

// ── refreshClient ──────────────────────────────────────────
// Forces a reload of client config from disk.
// Useful when you update a client's prices manually.
// Call this via an API endpoint: POST /admin/refresh/:number
function refreshClient(botNumber) {
  const normalised = botNumber.startsWith("+") ? botNumber : `+${botNumber}`;
  delete clientCache[normalised]; // clear cache
  return getClient(normalised);   // reload from disk
}

// ── listClients ────────────────────────────────────────────
// Returns a list of all registered client numbers.
// Used for the admin dashboard.
function listClients() {
  try {
    const files = fs.readdirSync(CLIENTS_DIR);
    return files
      .filter(f => f.endsWith(".json") && f !== "TEMPLATE.json")
      .map(f => f.replace(".json", ""));
  } catch (error) {
    return [];
  }
}

module.exports = {
  getClient,
  saveOrder,
  getClientOrders,
  refreshClient,
  listClients,
};