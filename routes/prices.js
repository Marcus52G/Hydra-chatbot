// ============================================================
// services/priceService.js
// ============================================================
// PURPOSE: This file contains ALL the business logic for prices.
// "Business logic" means: the rules and operations of your app.
//
// WHY A SEPARATE FILE?
// If WhatsApp, a website, or an app all need prices,
// they all call THIS file. You only write the logic ONCE.
// ============================================================

const fs   = require("fs");                    // fs = File System — built into Node.js, lets you read/write files
const path = require("path");                  // path = helps build file paths that work on all operating systems

// __dirname = the folder THIS file is in (services/)
// We go up one level (..) to reach the project root, then into data/db.json
const DB_PATH = path.join(__dirname, "../data/db.json");

// ── Helper: read the database ──────────────────────────────
// Every time we want data, we read the file fresh.
// JSON.parse() converts the raw text into a JavaScript object.
function readDB() {
  const raw = fs.readFileSync(DB_PATH, "utf8"); // read file as text
  return JSON.parse(raw);                        // convert text → object
}

// ── Helper: write to the database ─────────────────────────
// JSON.stringify() converts a JavaScript object back to text.
// The "null, 2" makes the JSON nicely indented (pretty-printed).
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

// ── 1. Get ALL prices ──────────────────────────────────────
// Returns the full prices object from the database.
// Example return value:
//   { beef: { name: "Beef", price: 600, available: true }, ... }
function getAllPrices() {
  const db = readDB();
  return db.prices;
}

// ── 2. Get only AVAILABLE items ────────────────────────────
// Object.values() turns { beef:{...}, goat:{...} } into [{...}, {...}]
// .filter() keeps only items where available === true
function getAvailableItems() {
  const prices = getAllPrices();
  return Object.values(prices).filter(item => item.available === true);
}

// ── 3. Update the price of one item ────────────────────────
// itemKey  = "beef" | "goat" | "chicken" | "pork"
// newPrice = a number, e.g. 650
function updatePrice(itemKey, newPrice) {
  // Make sure the item actually exists before changing it
  const db = readDB();

  if (!db.prices[itemKey]) {
    // Throwing an error stops the function and sends the message back to the caller
    throw new Error(`Item "${itemKey}" not found in menu`);
  }

  db.prices[itemKey].price = newPrice; // update the value
  writeDB(db);                         // save back to file
  return db.prices[itemKey];           // return the updated item
}

// ── 4. Toggle availability (in stock / out of stock) ───────
function toggleAvailability(itemKey, isAvailable) {
  const db = readDB();

  if (!db.prices[itemKey]) {
    throw new Error(`Item "${itemKey}" not found`);
  }

  db.prices[itemKey].available = isAvailable; // true or false
  writeDB(db);
  return db.prices[itemKey];
}

// ── Export functions ────────────────────────────────────────
// module.exports makes these functions available when another
// file does: const priceService = require('./priceService')
module.exports = {
  getAllPrices,
  getAvailableItems,
  updatePrice,
  toggleAvailability,
};