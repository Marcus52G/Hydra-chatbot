// ============================================================
// services/orderService.js
// ============================================================
// PURPOSE: Handles everything related to orders.
//   - Creating a new order
//   - Getting all orders
//   - Updating order status
//
// This is the most important service in the system.
// ============================================================

const fs   = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid"); // uuid generates unique IDs like "3f7a-..." for each order

const DB_PATH = path.join(__dirname, "../data/db.json");

function readDB()       { return JSON.parse(fs.readFileSync(DB_PATH, "utf8")); }
function writeDB(data)  { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8"); }

// ── ORDER STATUS VALUES ─────────────────────────────────────
// These are the possible "stages" of an order lifecycle.
// Using constants (instead of typing strings everywhere) prevents typos.
const ORDER_STATUS = {
  PENDING:    "pending",     // just placed, waiting for manager
  CONFIRMED:  "confirmed",   // manager accepted it
  PREPARING:  "preparing",   // being cut / packed
  READY:      "ready",       // ready for pickup or delivery
  DELIVERED:  "delivered",   // completed
  CANCELLED:  "cancelled",   // customer or manager cancelled
};

// ── 1. Create a new order ──────────────────────────────────
// orderData is an object the caller provides, for example:
// {
//   customerName: "John",
//   customerPhone: "+254700000000",
//   items: [{ name: "Beef", quantity: 2, unit: "kg" }],
//   deliveryType: "delivery",   // "pickup" or "delivery"
//   deliveryLocation: "Rongai"  // only if deliveryType === "delivery"
// }
function createOrder(orderData) {
  // ── Validate required fields ──
  // If any required field is missing, throw an error immediately.
  // This protects the database from bad/incomplete data.
  const required = ["customerName", "customerPhone", "items", "deliveryType"];
  for (const field of required) {
    if (!orderData[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (!Array.isArray(orderData.items) || orderData.items.length === 0) {
    throw new Error("Order must have at least one item");
  }

  // ── Calculate total price ──
  // We read prices from the DB to do the calculation server-side.
  // NEVER trust a price sent from the client (could be manipulated).
  const db = readDB();
  let totalPrice = 0;

  const itemsWithPrices = orderData.items.map(item => {
    const key = item.name.toLowerCase();           // "Beef" → "beef"
    const productData = db.prices[key];

    if (!productData) {
      throw new Error(`Unknown product: "${item.name}"`);
    }
    if (!productData.available) {
      throw new Error(`"${item.name}" is currently out of stock`);
    }

    const lineTotal = productData.price * item.quantity; // e.g. 600 * 2 = 1200
    totalPrice += lineTotal;

    // Return an enriched item object (original data + price info)
    return {
      name:      productData.name,
      quantity:  item.quantity,
      unit:      productData.unit,
      unitPrice: productData.price,
      lineTotal,
    };
  });

  // ── Build the order object ──
  // new Date().toISOString() gives "2025-07-04T10:30:00.000Z" — a standard timestamp
  const newOrder = {
    id:               uuidv4(),                   // unique ID, e.g. "a1b2-c3d4-..."
    customerName:     orderData.customerName,
    customerPhone:    orderData.customerPhone,
    items:            itemsWithPrices,
    deliveryType:     orderData.deliveryType,     // "pickup" or "delivery"
    deliveryLocation: orderData.deliveryLocation || null,
    totalPrice,
    status:           ORDER_STATUS.PENDING,        // always starts as "pending"
    createdAt:        new Date().toISOString(),
    updatedAt:        new Date().toISOString(),
  };

  // ── Save to database ──
  db.orders.push(newOrder); // add to the orders array
  writeDB(db);

  return newOrder; // return the full order (caller can use the ID, total, etc.)
}

// ── 2. Get all orders ──────────────────────────────────────
// Optional filter: pass "pending" to get only pending orders, etc.
function getAllOrders(statusFilter = null) {
  const db = readDB();

  if (statusFilter) {
    return db.orders.filter(order => order.status === statusFilter);
  }

  return db.orders; // return everything if no filter
}

// ── 3. Get a single order by ID ────────────────────────────
function getOrderById(orderId) {
  const db = readDB();
  const order = db.orders.find(o => o.id === orderId); // .find() returns first match or undefined

  if (!order) {
    throw new Error(`Order with ID "${orderId}" not found`);
  }

  return order;
}

// ── 4. Update order status ─────────────────────────────────
// Called by the manager to move an order through its lifecycle
function updateOrderStatus(orderId, newStatus) {
  // Make sure the new status is one of the allowed values
  const validStatuses = Object.values(ORDER_STATUS);
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid status "${newStatus}". Valid: ${validStatuses.join(", ")}`);
  }

  const db = readDB();
  const index = db.orders.findIndex(o => o.id === orderId); // findIndex returns position in array (-1 if not found)

  if (index === -1) {
    throw new Error(`Order "${orderId}" not found`);
  }

  db.orders[index].status    = newStatus;
  db.orders[index].updatedAt = new Date().toISOString(); // track when it was last changed
  writeDB(db);

  return db.orders[index];
}

module.exports = {
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  ORDER_STATUS,
};