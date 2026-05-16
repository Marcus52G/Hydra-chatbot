const express      = require("express");
const router       = express.Router();
const orderService = require("../services/orderService");

// GET /orders — all orders, optional ?status=pending filter
router.get("/", (req, res) => {
  try {
    const { status } = req.query;
    const orders = orderService.getAllOrders(status || null);
    res.json({ success: true, count: orders.length, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /orders/:id — single order by ID
router.get("/:id", (req, res) => {
  try {
    const order = orderService.getOrderById(req.params.id);
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

// POST /orders — create a new order
// Body: { customerName, customerPhone, items, deliveryType, deliveryLocation }
router.post("/", (req, res) => {
  try {
    const order = orderService.createOrder(req.body);
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PATCH /orders/:id/status — update order status
// Body: { "status": "confirmed" }
router.patch("/:id/status", (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: "status is required in body" });
    }
    const updated = orderService.updateOrderStatus(req.params.id, status);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;