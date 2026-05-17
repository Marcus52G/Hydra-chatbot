// ============================================================
// services/customerMemory.js
// ============================================================
// PURPOSE: Remembers customers across conversations.
//   - Their name
//   - All past orders
//   - Preferences (favourite item, delivery vs pickup)
//   - How many times they've ordered
// ============================================================

const fs   = require("fs");
const path = require("path");

// In-memory cache: { clientNumber: { customerPhone: profile } }
const memoryCache = {};

function getClientPath(clientNumber) {
  const clean = String(clientNumber).replace("+", "");
  return path.join(__dirname, `../clients/+${clean}.json`);
}

function readClientFile(clientNumber) {
  try {
    return JSON.parse(fs.readFileSync(getClientPath(clientNumber), "utf8"));
  } catch (e) { return null; }
}

function writeClientFile(clientNumber, data) {
  try {
    fs.writeFileSync(getClientPath(clientNumber), JSON.stringify(data, null, 2), "utf8");
  } catch (e) { console.error("Memory write error:", e.message); }
}

// ── Get customer profile ───────────────────────────────────
function getCustomer(clientNumber, customerPhone) {
  if (memoryCache[clientNumber]?.[customerPhone]) {
    return memoryCache[clientNumber][customerPhone];
  }
  const clientData = readClientFile(clientNumber);
  if (!clientData) return null;
  const profile = (clientData.customers || {})[customerPhone] || null;
  if (profile) {
    if (!memoryCache[clientNumber]) memoryCache[clientNumber] = {};
    memoryCache[clientNumber][customerPhone] = profile;
  }
  return profile;
}

// ── Save / update customer profile ────────────────────────
function saveCustomer(clientNumber, customerPhone, updates) {
  const clientData = readClientFile(clientNumber);
  if (!clientData) return;
  if (!clientData.customers) clientData.customers = {};

  const existing = clientData.customers[customerPhone] || {
    phone:      customerPhone,
    name:       null,
    orderCount: 0,
    orders:     [],
    preferences: { favouriteItem: null, deliveryType: null, deliveryArea: null },
    firstSeen:  new Date().toISOString(),
    lastSeen:   new Date().toISOString(),
  };

  const updated = {
    ...existing,
    ...updates,
    lastSeen:    new Date().toISOString(),
    preferences: { ...existing.preferences, ...(updates.preferences || {}) },
  };

  clientData.customers[customerPhone] = updated;
  if (!memoryCache[clientNumber]) memoryCache[clientNumber] = {};
  memoryCache[clientNumber][customerPhone] = updated;
  writeClientFile(clientNumber, clientData);
  return updated;
}

// ── Add completed order to customer history ────────────────
function addOrderToHistory(clientNumber, customerPhone, order) {
  const profile     = getCustomer(clientNumber, customerPhone) || {};
  const orders      = profile.orders || [];
  const updatedOrders = [...orders, {
    id:           order.id,
    item:         order.items?.[0]?.name,
    quantity:     order.items?.[0]?.quantity,
    unit:         order.items?.[0]?.unit,
    total:        order.totalPrice,
    deliveryType: order.deliveryType,
    location:     order.deliveryLocation || null,
    date:         new Date().toISOString(),
  }].slice(-10);

  // Calculate favourite item
  const itemCounts = {};
  updatedOrders.forEach(o => {
    if (o.item) itemCounts[o.item] = (itemCounts[o.item] || 0) + 1;
  });
  const favouriteItem = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Calculate preferred delivery type
  const dc = { pickup: 0, delivery: 0 };
  updatedOrders.forEach(o => { if (o.deliveryType) dc[o.deliveryType]++; });
  const preferredDelivery = dc.delivery >= dc.pickup ? "delivery" : "pickup";

  saveCustomer(clientNumber, customerPhone, {
    orderCount:  updatedOrders.length,
    orders:      updatedOrders,
    preferences: {
      favouriteItem,
      deliveryType: preferredDelivery,
      deliveryArea: order.deliveryLocation || profile.preferences?.deliveryArea || null,
    },
  });
}

// ── Build returning customer greeting ─────────────────────
function buildGreeting(profile, businessName) {
  if (!profile?.name || !profile.orderCount) return null;

  const { name, orderCount, orders, preferences } = profile;
  const lastOrder = orders?.[orders.length - 1];
  const favourite = preferences?.favouriteItem;

  if (orderCount === 1 && lastOrder) {
    return `Welcome back *${name}*! 👋 Great to see you again at ${businessName}.\n\nLast time you ordered *${lastOrder.item} × ${lastOrder.quantity}${lastOrder.unit || ""}*. Would you like the same again? 😊`;
  }

  if (orderCount >= 2) {
    const fav = favourite ? ` Your go-to is *${favourite}* 😄` : "";
    return `Hey *${name}*! 👋 Welcome back to ${businessName} — you're one of our regulars!${fav}\n\nWhat can I get you today?`;
  }

  return null;
}

module.exports = { getCustomer, saveCustomer, addOrderToHistory, buildGreeting };