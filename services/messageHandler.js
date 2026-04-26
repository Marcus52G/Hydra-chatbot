// ============================================================
// services/messageHandler.js
// ============================================================
// PURPOSE: The BRAIN of the WhatsApp bot.
//
// This function receives a customer's message and their phone
// number, then decides what to reply based on their current
// STATE in the conversation.
//
// Think of it as a SWITCH BOARD:
//   "What state is this person in?"
//     → "What did they just say?"
//       → "What should I reply?"
//       → "What state should they move to next?"
//
// This file calls:
//   - stateManager  (to read/write session state)
//   - priceService  (to get prices from db.json)
//   - orderService  (to save completed orders)
// ============================================================

const { getSession, setState, resetSession, STATES } = require("./stateManager");
const priceService = require("./priceService");
const orderService = require("./orderService");

// ── MENU TEXT ──────────────────────────────────────────────
// Defined once at the top so it's easy to edit.
// Template literals (backticks) let us write multi-line strings.
const MAIN_MENU = `Welcome to Mama Nyama Butchery 🥩

Please choose:
1. View Prices
2. Available Meat
3. Place Order
4. Delivery Info
5. Location & Hours
6. Talk to Attendant

Reply with a number (1-6)`;

// ── MAIN HANDLER FUNCTION ──────────────────────────────────
// phone   = "+254712345678"
// message = whatever the customer typed (already trimmed/lowercased)
//
// Returns: a string — the reply to send back to the customer
async function handleMessage(phone, message) {
  // Get (or create) this customer's session
  const session = getSession(phone);
  const state   = session.state;

  // Normalise input — remove extra spaces, lowercase
  const input = message.trim().toLowerCase();

  // ── GLOBAL COMMANDS (work from ANY state) ──────────────
  // These override the normal flow — always available.
  if (input === "menu" || input === "0" || input === "restart") {
    resetSession(phone);
    return MAIN_MENU;
  }

  if (input === "cancel") {
    resetSession(phone);
    return "Order cancelled. Type *menu* to start again. 👋";
  }

  // ── ROUTE BY STATE ─────────────────────────────────────
  // Each state has its own handler below.
  switch (state) {

    // ── STATE: IDLE ──────────────────────────────────────
    // Customer is at the main menu, waiting to pick an option.
    case STATES.IDLE:
      return handleMainMenu(phone, input);

    // ── STATE: AWAITING_ORDER ────────────────────────────
    // We asked "what would you like to order?" — waiting for e.g. "Beef 2kg"
    case STATES.AWAITING_ORDER:
      return handleOrderInput(phone, input);

    // ── STATE: AWAITING_TYPE ─────────────────────────────
    // We have their item — asking pickup or delivery?
    case STATES.AWAITING_TYPE:
      return handleDeliveryChoice(phone, input);

    // ── STATE: AWAITING_LOCATION ─────────────────────────
    // They chose delivery — waiting for their location
    case STATES.AWAITING_LOCATION:
      return handleLocationInput(phone, message); // keep original case for addresses

    // ── STATE: AWAITING_NAME ─────────────────────────────
    // Got location — waiting for their name
    case STATES.AWAITING_NAME:
      return handleNameInput(phone, message);

    // ── STATE: AWAITING_CONFIRM ──────────────────────────
    // Showed summary — waiting for 1=confirm or 2=cancel
    case STATES.AWAITING_CONFIRM:
      return handleConfirmation(phone, input);

    // ── STATE: HUMAN_HANDOFF ──────────────────────────────
    // Escalated — don't interfere with human conversation
    case STATES.HUMAN_HANDOFF:
      return null; // null = bot stays silent, human handles it

    default:
      resetSession(phone);
      return MAIN_MENU;
  }
}

// ═══════════════════════════════════════════════════════════
// STATE HANDLERS
// Each function below handles one state.
// They all return a string (the reply).
// ═══════════════════════════════════════════════════════════

// ── handleMainMenu ─────────────────────────────────────────
async function handleMainMenu(phone, input) {
  switch (input) {

    case "1": { // View Prices
      const prices = priceService.getAllPrices();
      // Build a text list from the prices object
      // Object.values() → array of price items
      const list = Object.values(prices)
        .map(p => {
          const stock = p.available ? "✅" : "❌ Out of stock";
          return `${p.name} — KES ${p.price}/${p.unit}  ${stock}`;
        })
        .join("\n");

      return `*Current Prices* 💰\n\n${list}\n\nType *menu* to go back.`;
    }

    case "2": { // Available Meat
      const items = priceService.getAvailableItems();
      const list  = items.map(p => `✅ ${p.name} — KES ${p.price}/${p.unit}`).join("\n");
      return `*Available Today* 🥩\n\n${list}\n\nReply *3* to place an order.`;
    }

    case "3": { // Place Order
      setState(phone, { state: STATES.AWAITING_ORDER });
      return `What would you like to order? 📝

Available items:
${priceService.getAvailableItems().map(p => `• ${p.name}`).join("\n")}

Type your order like this:
*Beef 2kg*  or  *Chicken 1.5kg*`;
    }

    case "4": // Delivery Info
      return `*Delivery Information* 🚚

Fee: KES 100 – 300 (based on distance)
Time: 30 – 90 minutes
Area: Nairobi & surroundings

Type *3* to place an order or *menu* to go back.`;

    case "5": // Location & Hours
      return `*Find Us* 📍

📌 Tom Mboya Street, Nairobi
🗺️ Maps: https://maps.google.com/?q=-1.2864,36.8172

⏰ Hours:
Mon – Sat: 6:00 AM – 8:00 PM
Sunday: 7:00 AM – 4:00 PM

Type *menu* to go back.`;

    case "6": // Human handoff
      setState(phone, { state: STATES.HUMAN_HANDOFF });
      // In production: trigger a notification to the manager here
      return `You'll be connected to an attendant shortly. 👤

Please hold — someone will respond within a few minutes.
Type *menu* at any time to return to the bot.`;

    default:
      return `Sorry, I didn't understand that. 🤔\n\nPlease reply with a number from 1 to 6.\n\n${MAIN_MENU}`;
  }
}

// ── handleOrderInput ───────────────────────────────────────
// Parses "Beef 2kg" → { item: "beef", quantity: 2 }
async function handleOrderInput(phone, input) {
  // Regex breakdown:
  // ^           = start of string
  // ([a-z]+)    = capture group 1: one or more letters (the meat name)
  // \s+         = one or more spaces
  // (\d+\.?\d*) = capture group 2: a number, optionally with decimal (e.g. 1.5)
  // kg?         = the letter k followed by optional g (accepts "1k" or "1kg")
  // $           = end of string
  const match = input.match(/^([a-z]+)\s+(\d+\.?\d*)kg?$/);

  if (!match) {
    return `Please type your order in this format:\n*Beef 2kg*\n\nAvailable: ${priceService.getAvailableItems().map(p => p.name).join(", ")}\n\nOr type *menu* to go back.`;
  }

  const itemName = match[1];           // "beef"
  const quantity = parseFloat(match[2]); // 2.0

  // Check item exists and is available
  const prices = priceService.getAllPrices();
  const product = prices[itemName];

  if (!product) {
    return `Sorry, we don't have "${itemName}" on our menu.\n\nAvailable: ${priceService.getAvailableItems().map(p => p.name).join(", ")}`;
  }
  if (!product.available) {
    return `Sorry, *${product.name}* is out of stock today. ❌\n\nAvailable items: ${priceService.getAvailableItems().map(p => p.name).join(", ")}`;
  }

  // Save to draft and advance state
  const lineTotal = product.price * quantity;
  setState(phone, {
    state: STATES.AWAITING_TYPE,
    orderDraft: {
      itemName:  product.name,
      quantity,
      unitPrice: product.price,
      lineTotal,
    },
  });

  return `Got it! 👍\n\n*${product.name} × ${quantity}kg* = KES ${lineTotal}\n\nHow would you like to receive it?\n1. Pickup (free)\n2. Delivery (KES 100–300)`;
}

// ── handleDeliveryChoice ───────────────────────────────────
async function handleDeliveryChoice(phone, input) {
  if (input === "1") {
    setState(phone, {
      state: STATES.AWAITING_NAME,
      orderDraft: { ...getSession(phone).orderDraft, deliveryType: "pickup" },
    });
    return `Great, pickup it is! 🏪\n\nWhat is your name?`;
  }

  if (input === "2") {
    setState(phone, {
      state: STATES.AWAITING_LOCATION,
      orderDraft: { ...getSession(phone).orderDraft, deliveryType: "delivery" },
    });
    return `Please enter your delivery location:\n(e.g. "Rongai, near Total petrol station")`;
  }

  return `Please reply *1* for Pickup or *2* for Delivery.`;
}

// ── handleLocationInput ────────────────────────────────────
async function handleLocationInput(phone, message) {
  if (message.trim().length < 3) {
    return `Please enter a valid location (e.g. "Rongai, near Total").`;
  }

  setState(phone, {
    state: STATES.AWAITING_NAME,
    orderDraft: { ...getSession(phone).orderDraft, deliveryLocation: message.trim() },
  });

  return `📍 Location noted: *${message.trim()}*\n\nWhat is your name?`;
}

// ── handleNameInput ────────────────────────────────────────
async function handleNameInput(phone, message) {
  const name = message.trim();
  if (name.length < 2) {
    return `Please enter your full name.`;
  }

  const draft = getSession(phone).orderDraft;

  setState(phone, {
    state: STATES.AWAITING_CONFIRM,
    orderDraft: { ...draft, customerName: name },
  });

  // Build summary
  const deliveryLine = draft.deliveryType === "delivery"
    ? `Delivery to: ${draft.deliveryLocation}\nDelivery fee: KES 100–300 (confirmed on dispatch)`
    : `Pickup from store`;

  return `*Order Summary* 📋\n\n👤 Name: ${name}\n🥩 Item: ${draft.itemName} × ${draft.quantity}kg\n💰 Total: KES ${draft.lineTotal}\n🚚 ${deliveryLine}\n\nReply:\n*1* to Confirm ✅\n*2* to Cancel ❌`;
}

// ── handleConfirmation ─────────────────────────────────────
async function handleConfirmation(phone, input) {
  if (input === "2") {
    resetSession(phone);
    return `Order cancelled. No worries! 👋\n\nType *menu* to start again.`;
  }

  if (input !== "1") {
    return `Please reply *1* to confirm or *2* to cancel.`;
  }

  // ── PLACE THE ORDER ──────────────────────────────────────
  const session = getSession(phone);
  const draft   = session.orderDraft;

  try {
    const order = orderService.createOrder({
      customerName:     draft.customerName,
      customerPhone:    phone,
      items:            [{ name: draft.itemName, quantity: draft.quantity }],
      deliveryType:     draft.deliveryType,
      deliveryLocation: draft.deliveryLocation || null,
    });

    resetSession(phone); // clear session after successful order

    return `✅ *Order Confirmed!*\n\nOrder ID: ${order.id.slice(0, 8).toUpperCase()}\n\nWe've received your order and will ${draft.deliveryType === "delivery" ? "deliver it shortly" : "have it ready for pickup"}.\n\nFor queries, call: +254712345678\n\nThank you! 🥩`;

  } catch (error) {
    // Something went wrong saving the order
    console.error("Order creation failed:", error.message);
    return `Sorry, something went wrong saving your order. Please call us directly: +254712345678`;
  }
}

module.exports = { handleMessage };