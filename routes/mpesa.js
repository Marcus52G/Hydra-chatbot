// ============================================================
// routes/mpesa.js
// ============================================================
// PURPOSE: Receives payment callbacks from Safaricom
//   - Safaricom hits POST /mpesa/callback after customer pays
//   - We match payment to order using checkoutRequestId
//   - Send receipt to customer via WhatsApp
//   - Notify owner payment received
// ============================================================

const express            = require("express");
const router             = express.Router();
const { parseCallback }  = require("../services/mpesaService");
const { getClient }      = require("../services/clientManager");

// In-memory store: checkoutRequestId → { order, client, customerPhone }
// This lets us match the callback to the right order
const pendingPayments = {};

// ── Register a pending payment ──────────────────────────────
// Called by messageHandler after STK Push is sent
function registerPendingPayment(checkoutRequestId, data) {
  pendingPayments[checkoutRequestId] = {
    ...data,
    createdAt: Date.now(),
  };
  console.log(`💾 Pending payment registered: ${checkoutRequestId}`);

  // Auto-cleanup after 10 minutes (payment window)
  setTimeout(() => {
    delete pendingPayments[checkoutRequestId];
  }, 10 * 60 * 1000);
}

// ── GET /mpesa/callback — Safaricom verification ────────────
router.get("/callback", (req, res) => {
  res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// ── POST /mpesa/callback — payment result ───────────────────
router.post("/callback", async (req, res) => {
  // Always respond 200 to Safaricom immediately
  res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

  try {
    const result = parseCallback(req.body);
    console.log("📩 M-Pesa callback received:", JSON.stringify(result));

    if (!result.checkoutRequestId) {
      console.error("No checkoutRequestId in callback");
      return;
    }

    const pending = pendingPayments[result.checkoutRequestId];

    if (!pending) {
      console.warn(`No pending payment found for: ${result.checkoutRequestId}`);
      return;
    }

    const { order, client, customerPhone } = pending;
    const { sendWhatsAppMessage }          = require("./whatsapp");
    const phoneNumberId                    = client.whatsapp.phone_number_id;
    const managerPhone                     = client.whatsapp.manager_phone.replace("+", "");

    if (result.success) {
      // ── Payment successful ──────────────────────────────
      console.log(`✅ Payment confirmed: ${result.mpesaReceiptNumber} — KES ${result.amount}`);

      // Update order status
      order.status        = "paid";
      order.mpesaReceipt  = result.mpesaReceiptNumber;
      order.paidAt        = new Date().toISOString();

      // Send receipt to customer
      const customerReceipt =
        `✅ *Payment Received!*\n\n` +
        `Receipt No: *${result.mpesaReceiptNumber}*\n` +
        `Amount: *KES ${result.amount}*\n` +
        `Order ID: *${order.id.slice(0, 8).toUpperCase()}*\n\n` +
        `Thank you *${order.customerName}*! 🙏\n` +
        `Your order will be ${order.deliveryType === "delivery" ? "delivered shortly 🚚" : "ready for pickup 🏪"}.\n\n` +
        `📞 Queries: ${client.business.phone}\n\n` +
        `Type *menu* to place another order.`;

      await sendWhatsAppMessage(phoneNumberId, customerPhone, customerReceipt, client);

      // Notify owner — payment confirmed
      const ownerNotification =
        `💰 *Payment Confirmed — ${client.business.name}*\n\n` +
        `Order ID: *${order.id.slice(0, 8).toUpperCase()}*\n` +
        `👤 Customer: ${order.customerName}\n` +
        `📞 Phone: +${customerPhone}\n` +
        `🛒 ${order.items[0].name} × ${order.items[0].quantity}${order.items[0].unit || ""}\n` +
        `💰 *KES ${result.amount} PAID ✅*\n` +
        `🧾 Receipt: ${result.mpesaReceiptNumber}\n` +
        `${order.deliveryType === "delivery" ? `🚚 Deliver to: ${order.deliveryLocation}` : "🏪 Pickup from store"}`;

      await sendWhatsAppMessage(phoneNumberId, managerPhone, ownerNotification, client);

    } else {
      // ── Payment failed / cancelled ──────────────────────
      console.log(`❌ Payment failed: ${result.resultDesc}`);

      const failMessage =
        `❌ *Payment Failed*\n\n` +
        `Reason: ${result.resultDesc || "Payment was not completed"}\n\n` +
        `Your order *${order.id.slice(0, 8).toUpperCase()}* has not been confirmed.\n\n` +
        `Please try again or type *menu* to restart.\n` +
        `📞 Need help? Call: ${client.business.phone}`;

      await sendWhatsAppMessage(phoneNumberId, customerPhone, failMessage, client);
    }

    // Clean up pending payment
    delete pendingPayments[result.checkoutRequestId];

  } catch (error) {
    console.error("M-Pesa callback error:", error.message);
  }
});

// ── GET /mpesa/pending — debug endpoint ─────────────────────
router.get("/pending", (req, res) => {
  res.json({
    count:   Object.keys(pendingPayments).length,
    pending: Object.keys(pendingPayments),
  });
});

module.exports = router;
module.exports.registerPendingPayment = registerPendingPayment;