// ============================================================
// services/messageHandler.js  (MULTI-CLIENT VERSION)
// ============================================================
// WHAT CHANGED:
//   OLD: reads prices from db.json (one business only)
//   NEW: reads prices from client config passed in as parameter
//        every function receives the client object
//        bot replies as the correct business automatically
// ============================================================

const { getSession, setState, resetSession, STATES } = require("./stateManager");
const { askClaude } = require("./aiService");
const { v4: uuidv4 } = require("uuid");

// ── MAIN HANDLER ───────────────────────────────────────────
// NEW PARAMETER: client = the config loaded by clientManager
// This tells the bot which business it is right now
async function handleMessage(phone, message, client) {
  const session = getSession(phone);
  const state   = session.state;
  const input   = message.trim().toLowerCase();

  // ── GLOBAL OVERRIDES ───────────────────────────────────
  if (input === "menu" || input === "0" || input === "restart") {
    resetSession(phone);
    return buildMenuMessage(client);
  }

  if (input === "cancel") {
    resetSession(phone);
    return "Order cancelled. No worries! 👋\n\nType *menu* to start again.";
  }

  // ── HUMAN HANDOFF ──────────────────────────────────────
  if (state === STATES.HUMAN_HANDOFF) return null;

  // ── CONFIRM STATE — exact match ────────────────────────
  if (state === STATES.AWAITING_CONFIRM) {
    return handleConfirmation(phone, input, client);
  }

  // ── ALL OTHER STATES → ASK AI ──────────────────────────
  const history = session.conversationHistory || [];

  let aiResponse;
  try {
    // Pass client config to AI so it knows the business data
    aiResponse = await askClaude(message, history, client);
  } catch (error) {
    console.error("AI API failed:", error.message);
    // Fallback to menu when AI unavailable
    resetSession(phone);
    return buildMenuMessage(client);
  }

  // Save conversation history (last 10 messages)
  const updatedHistory = [
    ...history,
    { role: "user",      content: message },
    { role: "assistant", content: JSON.stringify(aiResponse) },
  ].slice(-10);

  setState(phone, { conversationHistory: updatedHistory });

  const intent = aiResponse.intent;

  switch (intent) {

    case "general":
      return aiResponse.reply;

    case "order_start":
      setState(phone, { state: STATES.AWAITING_ORDER });
      return aiResponse.reply;

    case "order_details": {
      const itemName = aiResponse.item?.toLowerCase();
      const quantity = parseFloat(aiResponse.quantity);
      const prices   = client.prices; // ← from CLIENT config, not db.json
      const product  = prices[itemName];

      if (!product) {
        const available = Object.values(prices)
          .filter(p => p.available)
          .map(p => p.name).join(", ");
        return `Sorry, we don't have "${aiResponse.item}" on our menu.\nAvailable: ${available}`;
      }
      if (!product.available) {
        const available = Object.values(prices)
          .filter(p => p.available)
          .map(p => p.name).join(", ");
        return `Sorry, *${product.name}* is out of stock today ❌\nAvailable: ${available}`;
      }

      const lineTotal = product.price * quantity;
      setState(phone, {
        state: STATES.AWAITING_TYPE,
        orderDraft: { itemName: product.name, quantity, unit: product.unit || "", unitPrice: product.price, lineTotal },
      });

      const quantityText = product.unit ? `${quantity}${product.unit}` : `${quantity}`;
      return aiResponse.reply || `Got it! *${product.name} × ${quantityText}* = KES ${lineTotal}\n\nPickup or delivery?`;
    }

    case "pickup":
      setState(phone, {
        state: STATES.AWAITING_NAME,
        orderDraft: { ...session.orderDraft, deliveryType: "pickup" },
      });
      return aiResponse.reply || "Great! What is your name?";

    case "delivery":
      setState(phone, {
        state: STATES.AWAITING_LOCATION,
        orderDraft: { ...session.orderDraft, deliveryType: "delivery" },
      });
      return aiResponse.reply || "Please enter your delivery location:";

    case "got_location":
      setState(phone, {
        state: STATES.AWAITING_NAME,
        orderDraft: { ...session.orderDraft, deliveryLocation: aiResponse.location || message.trim() },
      });
      return aiResponse.reply || "Got it! What is your name?";

    case "got_name": {
      const name  = aiResponse.name || message.trim();
      const draft = getSession(phone).orderDraft;
      setState(phone, {
        state: STATES.AWAITING_CONFIRM,
        orderDraft: { ...draft, customerName: name },
      });

      const quantityText = draft.unit ? `${draft.quantity}${draft.unit}` : `${draft.quantity}`;
      const deliveryLine = draft.deliveryType === "delivery"
        ? `Delivery to: ${draft.deliveryLocation}\nDelivery fee: KES ${client.delivery.fee_min}–${client.delivery.fee_max}`
        : "Pickup from store";

      return `*Order Summary* 📋\n\n👤 Name: ${name}\n• ${draft.itemName} × ${quantityText}\n💰 Total: KES ${draft.lineTotal}\n🚚 ${deliveryLine}\n\nReply:\n*1* to Confirm ✅\n*2* to Cancel ❌`;
    }

    case "human":
      setState(phone, { state: STATES.HUMAN_HANDOFF });
      return aiResponse.reply || `Connecting you to an attendant shortly. 👤\n\nCall us: ${client.business.phone}`;

    default:
      return aiResponse.reply || "I didn't quite get that. Type *menu* to start fresh.";
  }
}

// ── handleConfirmation ─────────────────────────────────────
async function handleConfirmation(phone, input, client) {
  if (input === "2") {
    resetSession(phone);
    return "Order cancelled. No worries! 👋\n\nType *menu* to start again.";
  }

  if (input !== "1") {
    return "Please reply *1* to confirm or *2* to cancel.";
  }

  const session = getSession(phone);
  const draft   = session.orderDraft;

  // Build order object
  const order = {
    id:               uuidv4(),
    customerName:     draft.customerName,
    customerPhone:    phone,
    items:            [{ name: draft.itemName, quantity: draft.quantity, unit: draft.unit || null, unitPrice: draft.unitPrice, lineTotal: draft.lineTotal }],
    deliveryType:     draft.deliveryType,
    deliveryLocation: draft.deliveryLocation || null,
    totalPrice:       draft.lineTotal,
    status:           "pending",
    createdAt:        new Date().toISOString(),
  };

  // Save order to this client's config file
  try {
    const { saveOrder } = require("./clientManager");
    saveOrder(client.botNumber || phone, order.id, order);
  } catch (e) {
    console.error("Order save error:", e.message);
  }

  resetSession(phone);

  return `✅ *Order Confirmed!*\n\nOrder ID: ${order.id.slice(0, 8).toUpperCase()}\n\nWe have received your order and will ${draft.deliveryType === "delivery" ? "deliver it shortly 🚚" : "have it ready for pickup 🏪"}.\n\nFor queries call: ${client.business.phone}\n\nThank you!`;
}

// ── buildMenuMessage ───────────────────────────────────────
// Builds menu from THIS CLIENT's prices — not db.json
function buildMenuMessage(client) {
  const available = Object.values(client.prices)
    .filter(p => p.available)
    .map(p => {
      const unitText = p.unit ? ` / ${p.unit}` : "";
      return `• ${p.name} — KES ${p.price}${unitText}`;
    })
    .join("\n");

  const availableText = available || "No items are available right now.";

  return `Welcome to ${client.business.name} 🛒\n\nHow can I help you today?\n\n📋 *Available today:*\n${availableText}\n\nJust type naturally — I understand English and Swahili! 😊\n\nOr type *menu* anytime to restart.`;
}

module.exports = { handleMessage };