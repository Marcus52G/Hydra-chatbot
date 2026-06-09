// ============================================================
// services/messageHandler.js  (PLAN ENFORCEMENT VERSION)
// ============================================================
// WHAT'S NEW:
//   ✅ Basic plan — no AI, numbered menu only
//   ✅ Smart plan — full AI, customer memory, natural language
//   ✅ Plan check on every AI entry point
//   ✅ Upsell message shown to Basic clients hitting AI features
// ============================================================

const { getSession, setState, resetSession, STATES } = require("./stateManager");
const { askClaude }                                   = require("./aiService");
const { getCustomer, saveCustomer, addOrderToHistory, buildGreeting } = require("./customerMemory");
const { sendSTKPush, formatPhone }                    = require("./mpesaService");
const { v4: uuidv4 }                                  = require("uuid");

function typingDelay(ms = 1200) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── PLAN CHECKER ───────────────────────────────────────────
function isSmartPlan(client) {
  return client.plan === "smart";
}

function upsellMessage(client) {
  return `⚡ *This feature is available on Hydra Smart only.*\n\n` +
    `Hydra Smart includes:\n` +
    `• AI that understands any message\n` +
    `• Remembers your customers\n` +
    `• Handles complaints naturally\n\n` +
    `Upgrade for KES 3,000/mo — contact us:\n` +
    `📞 ${client.business.phone || "Hydra Tech"}\n\n` +
    `Type *menu* to go back.`;
}

// ── MAIN HANDLER ───────────────────────────────────────────
async function handleMessage(phone, message, client) {
  const session  = getSession(phone);
  const state    = session.state;
  const input    = message.trim().toLowerCase();
  const clientNo = client.botNumber;

  // ── GLOBAL OVERRIDES ─────────────────────────────────
  if (input === "menu" || input === "0" || input === "restart") {
    resetSession(phone);
    await typingDelay(600);
    return buildMainMenu(client, phone, clientNo);
  }

  if (input === "cancel") {
    resetSession(phone);
    await typingDelay(600);
    return "Order cancelled. No worries! 👋\n\nType *menu* to start again.";
  }

  // ── HUMAN HANDOFF ─────────────────────────────────────
  if (state === STATES.HUMAN_HANDOFF) return null;

  // ── STATE MACHINE ─────────────────────────────────────
  if (state === STATES.IDLE)              return buildMainMenu(client, phone, clientNo);
  if (state === "MAIN_MENU")              return handleMainMenuSelection(phone, input, client, clientNo);
  if (state === "SELECTING_PRODUCT")      return handleProductSelection(phone, input, client, clientNo);
  if (state === "ENTERING_QUANTITY")      return handleQuantityInput(phone, input, client);
  if (state === STATES.AWAITING_TYPE)     return handleDeliveryType(phone, input, client);
  if (state === STATES.AWAITING_LOCATION) return handleLocationInput(phone, input, client);
  if (state === STATES.AWAITING_NAME)     return handleNameInput(phone, input, client, clientNo);
  if (state === STATES.AWAITING_CONFIRM)  return handleConfirmation(phone, input, client, clientNo);
  if (state === "AWAITING_MPESA")         return handleMpesaNumber(phone, input, client, clientNo);
  if (state === "AI_QUESTION") {
    // Block AI for Basic plan even if state was somehow set
    if (!isSmartPlan(client)) {
      resetSession(phone);
      return upsellMessage(client);
    }
    return handleAIQuestion(phone, message, client, clientNo);
  }

  await typingDelay(600);
  return buildMainMenu(client, phone, clientNo);
}

// ── BUILD MAIN MENU ────────────────────────────────────────
async function buildMainMenu(client, phone, clientNo) {
  await typingDelay(800);
  setState(phone, { state: "MAIN_MENU" });

  // Returning customer greeting (Smart only)
  let welcomeText = `👋 Welcome to *${client.business.name}*!`;
  if (isSmartPlan(client)) {
    const profile  = getCustomer(clientNo, phone);
    const greeting = buildGreeting(profile, client.business.name);
    if (greeting) welcomeText = greeting;
  }

  return `${welcomeText}\n\n` +
    `What would you like to do?\n\n` +
    `1️⃣ View prices & menu\n` +
    `2️⃣ Place an order\n` +
    `3️⃣ Delivery information\n` +
    `4️⃣ Location & hours\n` +
    `5️⃣ Ask a question\n` +
    `6️⃣ Talk to someone\n\n` +
    `Reply with a number 👇`;
}

// ── MAIN MENU SELECTION ────────────────────────────────────
async function handleMainMenuSelection(phone, input, client, clientNo) {
  await typingDelay(800);

  switch (input) {
    case "1": {
      setState(phone, { state: "MAIN_MENU" });
      const prices = Object.values(client.prices).map(p => {
        const u = p.unit ? `/${p.unit}` : "";
        return `${p.available ? "✅" : "❌"} ${p.name} — KES ${p.price}${u}${!p.available ? " _(unavailable)_" : ""}`;
      }).join("\n");
      return `📋 *${client.business.name} — Today's Prices*\n\n${prices}\n\nType *2* to place an order or *menu* to go back 😊`;
    }

    case "2": {
      const available = Object.values(client.prices).filter(p => p.available);
      if (available.length === 0) {
        return `Sorry, no items are available right now 😔\n\nCall us: ${client.business.phone}`;
      }
      setState(phone, { state: "SELECTING_PRODUCT", productList: available });
      const list = available.map((p, i) => {
        const u = p.unit ? `/${p.unit}` : "";
        return `${i + 1}️⃣ ${p.name} — KES ${p.price}${u}`;
      }).join("\n");
      return `🛒 *What would you like to order?*\n\n${list}\n\nReply with a number 👇`;
    }

    case "3": {
      setState(phone, { state: "MAIN_MENU" });
      const d = client.delivery;
      if (!d.available) {
        return `🚫 No delivery — Pickup only from:\n${client.business.location}\n\nType *menu* to go back.`;
      }
      return `🚚 *Delivery Information*\n\n` +
        `• Available: Yes ✅\n` +
        `• Fee: KES ${d.fee_min}–${d.fee_max}\n` +
        `• Time: ${d.estimated_time}\n\n` +
        `Type *2* to order or *menu* to go back.`;
    }

    case "4": {
      setState(phone, { state: "MAIN_MENU" });
      return `📍 *Location & Hours*\n\n` +
        `🏪 ${client.business.location}\n` +
        `🕐 ${client.business.hours}\n` +
        `📞 ${client.business.phone}\n` +
        `🗺️ ${client.business.maps_link}\n\n` +
        `Type *menu* to go back.`;
    }

    case "5": {
      // ── PLAN CHECK — Block AI for Basic ─────────────
      if (!isSmartPlan(client)) {
        setState(phone, { state: "MAIN_MENU" });
        return upsellMessage(client);
      }
      setState(phone, { state: "AI_QUESTION" });
      return `💬 *Ask me anything!*\n\nWhat would you like to know about ${client.business.name}?\n\n_(Type *menu* anytime to go back.)_`;
    }

    case "6": {
      setState(phone, { state: STATES.HUMAN_HANDOFF });
      return `👤 *Connecting you to our team...*\n\nSomeone will be with you shortly.\n\nOr call us: *${client.business.phone}*`;
    }

    default: {
      // ── PLAN CHECK — Natural language only for Smart ─
      if (!isSmartPlan(client)) {
        return `Please reply with a number from the menu:\n\n` +
          `1️⃣ View prices\n2️⃣ Place an order\n3️⃣ Delivery info\n` +
          `4️⃣ Location & hours\n5️⃣ Ask a question\n6️⃣ Talk to someone`;
      }
      return handleAIQuestion(phone, input, client, clientNo);
    }
  }
}

// ── PRODUCT SELECTION ──────────────────────────────────────
async function handleProductSelection(phone, input, client, clientNo) {
  await typingDelay(800);
  const session     = getSession(phone);
  const productList = session.productList || Object.values(client.prices).filter(p => p.available);
  const index       = parseInt(input) - 1;

  if (isNaN(index) || index < 0 || index >= productList.length) {
    const list = productList.map((p, i) => {
      const u = p.unit ? `/${p.unit}` : "";
      return `${i + 1}️⃣ ${p.name} — KES ${p.price}${u}`;
    }).join("\n");
    return `Please reply with a number from the list:\n\n${list}`;
  }

  const selected = productList[index];
  setState(phone, {
    state:      "ENTERING_QUANTITY",
    orderDraft: { itemName: selected.name, unitPrice: selected.price, unit: selected.unit || "" },
  });

  const unitText = selected.unit || "units";
  return `✅ *${selected.name}* selected!\n\nHow many *${unitText}* would you like?\n_(e.g. type *2* for 2${selected.unit || ""})_`;
}

// ── QUANTITY INPUT ─────────────────────────────────────────
async function handleQuantityInput(phone, input, client) {
  await typingDelay(800);
  const quantity = parseFloat(input);
  if (isNaN(quantity) || quantity <= 0) {
    return `Please enter a valid quantity (e.g. *1*, *2*, *0.5*)`;
  }

  const draft     = getSession(phone).orderDraft;
  const lineTotal = draft.unitPrice * quantity;
  const qText     = draft.unit ? `${quantity}${draft.unit}` : `${quantity}`;

  setState(phone, { state: STATES.AWAITING_TYPE, orderDraft: { ...draft, quantity, lineTotal } });

  return `🛒 *${draft.itemName} × ${qText}* = *KES ${lineTotal}*\n\n` +
    `How would you like to receive your order?\n\n` +
    `1️⃣ Pickup from store 🏪\n` +
    `2️⃣ Delivery to my location 🚚\n\n` +
    `Reply with *1* or *2* 👇`;
}

// ── DELIVERY TYPE ──────────────────────────────────────────
async function handleDeliveryType(phone, input, client) {
  await typingDelay(800);
  if (input === "1") {
    setState(phone, { state: STATES.AWAITING_NAME, orderDraft: { ...getSession(phone).orderDraft, deliveryType: "pickup" } });
    return `🏪 *Pickup selected!*\n\nWhat is your name for the order?`;
  }
  if (input === "2") {
    if (!client.delivery.available) {
      return `Sorry, delivery is not available.\n\nReply *1* for pickup instead.`;
    }
    setState(phone, { state: STATES.AWAITING_LOCATION, orderDraft: { ...getSession(phone).orderDraft, deliveryType: "delivery" } });
    return `🚚 *Delivery selected!*\n\nPlease enter your delivery location:\n_(e.g. Rongai near Total)_`;
  }
  return `Please reply *1* for Pickup or *2* for Delivery 👇`;
}

// ── LOCATION INPUT ─────────────────────────────────────────
async function handleLocationInput(phone, input, client) {
  await typingDelay(800);
  setState(phone, { state: STATES.AWAITING_NAME, orderDraft: { ...getSession(phone).orderDraft, deliveryLocation: input.trim() } });
  return `📍 *${input.trim()}* noted!\n\nWhat is your name for the order?`;
}

// ── NAME INPUT ─────────────────────────────────────────────
async function handleNameInput(phone, input, client, clientNo) {
  await typingDelay(1000);
  const name  = input.trim();
  const draft = getSession(phone).orderDraft;
  setState(phone, { state: STATES.AWAITING_CONFIRM, orderDraft: { ...draft, customerName: name } });

  // Save name to memory (both plans)
  saveCustomer(clientNo, phone, { name });

  const qText       = draft.unit ? `${draft.quantity}${draft.unit}` : `${draft.quantity}`;
  const deliveryLine = draft.deliveryType === "delivery"
    ? `🚚 Delivery to: ${draft.deliveryLocation}\n💸 Fee: KES ${client.delivery.fee_min}–${client.delivery.fee_max}`
    : `🏪 Pickup from store`;

  return `📋 *Order Summary*\n\n` +
    `👤 Name: *${name}*\n` +
    `🛒 Item: *${draft.itemName} × ${qText}*\n` +
    `💰 Total: *KES ${draft.lineTotal}*\n` +
    `${deliveryLine}\n\n` +
    `━━━━━━━━━━━━━━━\n` +
    `*1* ✅ Confirm & Pay via M-Pesa\n` +
    `*2* ❌ Cancel order\n\n` +
    `Reply with *1* or *2* 👇`;
}

// ── CONFIRM ORDER → TRIGGER M-PESA ────────────────────────
async function handleConfirmation(phone, input, client, clientNo) {
  if (input === "2") {
    resetSession(phone);
    await typingDelay(600);
    return `Order cancelled. No worries! 👋\n\nType *menu* to start again.`;
  }
  if (input !== "1") {
    return `Please reply *1* to confirm or *2* to cancel 👇`;
  }

  await typingDelay(800);
  const profile    = getCustomer(clientNo, phone);
  const savedPhone = profile?.mpesaPhone;
  setState(phone, { state: "AWAITING_MPESA" });

  if (savedPhone) {
    return `💳 *M-Pesa Payment*\n\n` +
      `We have your number: *${savedPhone}*\n\n` +
      `1️⃣ Use this number\n` +
      `2️⃣ Enter a different number\n\n` +
      `Reply with *1* or *2* 👇`;
  }
  return `💳 *M-Pesa Payment*\n\nPlease enter the M-Pesa number to pay from:\n_(e.g. 0712345678)_`;
}

// ── M-PESA NUMBER INPUT ────────────────────────────────────
async function handleMpesaNumber(phone, input, client, clientNo) {
  await typingDelay(800);
  const session = getSession(phone);
  const draft   = session.orderDraft;
  let mpesaPhone;

  if (input === "1") {
    const profile = getCustomer(clientNo, phone);
    mpesaPhone    = profile?.mpesaPhone;
    if (!mpesaPhone) {
      setState(phone, { state: "AWAITING_MPESA" });
      return `Please enter your M-Pesa number:\n_(e.g. 0712345678)_`;
    }
  } else if (input === "2") {
    setState(phone, { state: "AWAITING_MPESA", awaitingNewPhone: true });
    return `Please enter your M-Pesa number:\n_(e.g. 0712345678)_`;
  } else {
    mpesaPhone = input.replace(/\s+/g, "");
    if (mpesaPhone.length < 9) {
      return `Please enter a valid M-Pesa number:\n_(e.g. 0712345678)_`;
    }
  }

  const formattedPhone = formatPhone(mpesaPhone);
  saveCustomer(clientNo, phone, { mpesaPhone: formattedPhone });

  const order = {
    id:               uuidv4(),
    customerName:     draft.customerName,
    customerPhone:    phone,
    items:            [{ name: draft.itemName, quantity: draft.quantity, unit: draft.unit || null, unitPrice: draft.unitPrice, lineTotal: draft.lineTotal }],
    deliveryType:     draft.deliveryType,
    deliveryLocation: draft.deliveryLocation || null,
    totalPrice:       draft.lineTotal,
    status:           "pending_payment",
    createdAt:        new Date().toISOString(),
  };

  try {
    const { saveOrder } = require("./clientManager");
    saveOrder(clientNo, order.id, order);
  } catch (e) { console.error("Order save error:", e.message); }

  try {
    addOrderToHistory(clientNo, phone, order);
  } catch (e) { console.error("Memory update error:", e.message); }

  try {
    const { sendSTKPush }            = require("./mpesaService");
    const { registerPendingPayment } = require("../routes/mpesa");

    const stkResult = await sendSTKPush(formattedPhone, order.totalPrice, order.id, client.business.name);
    registerPendingPayment(stkResult.checkoutRequestId, { order, client, customerPhone: phone });
    resetSession(phone);

    // SMS to manager when order placed
    try {
      const { sendOrderSMS } = require("./smsService");
      const managerPhone = client.whatsapp?.manager_phone || process.env.MANAGER_PHONE;
      await sendOrderSMS(managerPhone, order, client.business.name);
    } catch (e) { console.error("Order SMS error:", e.message); }

    return `💳 *M-Pesa prompt sent!*\n\n` +
      `Check your phone *${mpesaPhone}* and enter your M-Pesa PIN to pay *KES ${order.totalPrice}*.\n\n` +
      `Order ID: *${order.id.slice(0, 8).toUpperCase()}*\n\n` +
      `⏳ You have 60 seconds to complete payment.\n\n` +
      `📞 Need help? Call: ${client.business.phone}`;
  } catch (e) {
    console.error("STK Push error:", e.message);
    // SMS alert when payment fails
    try {
      const { sendAlertSMS } = require("./smsService");
      const managerPhone = client.whatsapp?.manager_phone || process.env.MANAGER_PHONE;
      await sendAlertSMS(
        managerPhone,
        `Order received but M-Pesa failed. Call: ${draft.customerName} ${phone}. Order: ${draft.itemName} x${draft.quantity} = KES ${draft.lineTotal}`
      );
    } catch (smsE) { console.error("Alert SMS error:", smsE.message); }
    resetSession(phone);
    return `⚠️ *M-Pesa prompt could not be sent.*\n\n` +
      `Your order *${order.id.slice(0, 8).toUpperCase()}* has been received.\n` +
      `Please pay *KES ${order.totalPrice}* on arrival or call:\n\n` +
      `📞 ${client.business.phone}\n\nType *menu* to start a new order.`;
  }
}

// ── AI QUESTION HANDLER (Smart plan only) ─────────────────
async function handleAIQuestion(phone, message, client, clientNo) {
  // Double check plan
  if (!isSmartPlan(client)) {
    resetSession(phone);
    return upsellMessage(client);
  }

  await typingDelay(1200);
  const session         = getSession(phone);
  const history         = session.conversationHistory || [];
  const customerProfile = getCustomer(clientNo, phone);
  const customerContext = customerProfile
    ? `\nCUSTOMER CONTEXT:\n- Name: ${customerProfile.name || "unknown"}\n- Orders: ${customerProfile.orderCount || 0}\n- Favourite: ${customerProfile.preferences?.favouriteItem || "none"}`
    : "";

  let aiResponse;
  try {
    aiResponse = await askClaude(message, history, client, customerContext);
  } catch (error) {
    console.error("AI API failed:", error.message);
    return `Sorry, I couldn't process that.\n\nCall us: ${client.business.phone}\n\nOr type *menu* to restart.`;
  }

  const updatedHistory = [
    ...history,
    { role: "user",      content: message },
    { role: "assistant", content: JSON.stringify(aiResponse) },
  ].slice(-10);

  setState(phone, { conversationHistory: updatedHistory });

  if (aiResponse.intent === "order_start" || aiResponse.intent === "order_details") {
    setState(phone, { state: "MAIN_MENU" });
    return `${aiResponse.reply || "Let me help you place an order!"}\n\nType *2* to start your order.`;
  }

  if (aiResponse.intent === "human") {
    setState(phone, { state: STATES.HUMAN_HANDOFF });
    return aiResponse.reply || `Connecting you to our team 👤\n\nOr call: ${client.business.phone}`;
  }

  return `${aiResponse.reply || "I didn't quite get that."}\n\n_Type *menu* to go back or ask another question._`;
}

module.exports = { handleMessage };