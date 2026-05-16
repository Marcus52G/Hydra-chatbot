const express      = require("express");
const router       = express.Router();
const priceService = require("../services/priceService");

// GET /prices — all prices
router.get("/", (req, res) => {
  try {
    const prices = priceService.getAllPrices();
    res.json({ success: true, data: prices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /prices/available — only in-stock items
router.get("/available", (req, res) => {
  try {
    const items = priceService.getAvailableItems();
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /prices/:item — update a price
// Body: { "price": 650 }
router.patch("/:item", (req, res) => {
  try {
    const { price } = req.body;
    if (price === undefined) {
      return res.status(400).json({ success: false, message: "price is required in body" });
    }
    const updated = priceService.updatePrice(req.params.item, price);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

// PATCH /prices/:item/availability — toggle in/out of stock
// Body: { "available": false }
router.patch("/:item/availability", (req, res) => {
  try {
    const { available } = req.body;
    if (available === undefined) {
      return res.status(400).json({ success: false, message: "available is required in body" });
    }
    const updated = priceService.toggleAvailability(req.params.item, available);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

module.exports = router;