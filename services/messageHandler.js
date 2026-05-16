// ============================================================
// services/messageHandler.js  (AI-POWERED VERSION)
// ============================================================
// PURPOSE: Conversation manager — now powered by Claude AI.
//
// WHAT CHANGED:
//   OLD: regex match → hardcoded reply
//   NEW: ask Claude AI → smart reply
//
// WHAT STAYED THE SAME:
//   stateManager, orderService, priceService, all routes
// ============================================================

const { getSession, setState, resetSession, STATES } = require("./stateManager");
const priceService = require("./priceService");
const orderService = require("./orderService");
const { askClaude } = require("./aiService");

// ── MAIN HANDLER ───────────────────────────────────────────
async function handleMessage(phone, message) {
  const session = getSession(phone);
  const state   = session.state;
  const input   = message.trim().toLowerCase();

  // ── GLOBAL OVERRIDES ───────────────────────────────────
  if (input === "menu" || input === "0" || input === "restart") {
    resetSession(phone);
    return buildMenuMessage();
  }

  if (input === "cancel") {
    resetSession(phone);
    return "Order cancelled. No worries! 👋\n\nType *menu* to start again.";
  }

  // ── HUMAN HANDOFF ──────────────────────────────────────
  if (state === STATES.HUMAN_HANDOFF) {
    return null;
  }

  // ── CONFIRM STATE — exact match, no AI needed ──────────
  if (state === STATES.AWAITING_CONFIRM) {
    return handleConfirmation(phone, input);
  }

  // ── ALL OTHER STATES → ASK CLAUDE ─────────────────────
  const history = session.conversationHistory || [];

  let aiResponse;
  try {
    aiResponse = await askClaude(message, history);
  } catch (error) {
    console.error("Claude API failed:", error.message);
    return "Sorry, I am having trouble right now. Type *menu* to try again or call +254712345678";
  }

  // Save conversation history (last 10 messages = 5 exchanges)
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
      const prices   = priceService.getAllPrices();
      const product  = prices[itemName];

      if (!product) {
        return `Sorry, we don't have "${aiResponse.item}" on our menu.\nAvailable: ${priceService.getAvailableItems().map(p => p.name).join(", ")}`;
      }
      if (!product.available) {
        return `Sorry, *${product.name}* is out of stock today ❌\nAvailable: ${priceService.getAvailableItems().map(p => p.name).join(", ")}`;
      }

      const lineTotal = product.price * quantity;
      setState(phone, {
        state: STATES.AWAITING_TYPE,
        orderDraft: { itemName: product.name, quantity, unitPrice: product.price, lineTotal },
      });

      return aiResponse.reply || `Got it! *${product.name} × ${quantity}kg* = KES ${lineTotal}\n\nPickup or delivery?`;
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

      const deliveryLine = draft.deliveryType === "delivery"
        ? `Delivery to: ${draft.deliveryLocation}\nDelivery fee: KES 100-300`
        : "Pickup from store";

      return `*Order Summary* 📋\n\n👤 Name: ${name}\n🥩 ${draft.itemName} × ${draft.quantity}kg\n💰 Total: KES ${draft.lineTotal}\n🚚 ${deliveryLine}\n\nReply:\n*1* to Confirm ✅\n*2* to Cancel ❌`;
    }

    case "human":
      setState(phone, { state: STATES.HUMAN_HANDOFF });
      return aiResponse.reply || "Connecting you to an attendant shortly. 👤";

    default:
      return aiResponse.reply || "I didn't quite get that. Type *menu* to start fresh.";
  }
}

// ── handleConfirmation ─────────────────────────────────────
async function handleConfirmation(phone, input) {
  if (input === "2") {
    resetSession(phone);
    return "Order cancelled. No worries! 👋\n\nType *menu* to start again.";
  }

  if (input !== "1") {
    return "Please reply *1* to confirm or *2* to cancel.";
  }

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

    resetSession(phone);

    return `✅ *Order Confirmed!*\n\nOrder ID: ${order.id.slice(0, 8).toUpperCase()}\n\nWe have received your order and will ${draft.deliveryType === "delivery" ? "deliver it shortly 🚚" : "have it ready for pickup 🏪"}.\n\nFor queries call: +254712345678\n\nAsante! 🥩`;

  } catch (error) {
    console.error("Order creation failed:", error.message);
    return "Sorry, something went wrong. Please call us: +254712345678";
  }
}

// ── buildMenuMessage ───────────────────────────────────────
function buildMenuMessage() {
  const items = priceService.getAvailableItems();
  const list  = items.map(p => `• ${p.name} — KES ${p.price}/kg`).join("\n");

  return `Welcome to Mama Nyama Butchery 🥩\n\nHow can I help you today?\n\n📋 *Available today:*\n${list}\n\nJust type naturally — I understand English and Swahili! 😊\n\nOr type *menu* anytime to restart.`;
}

module.exports = { handleMessage };