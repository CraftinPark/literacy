const express = require('express');
const config = require('../config');
const db = require('../db');
const { HttpError, requireRole, rateLimitOrders } = require('../middleware');

const router = express.Router();

const PRODUCTS = {
  'sku-tee': { name: 'T-shirt', priceCents: 2000 },
  'sku-mug': { name: 'Mug', priceCents: 1200 },
  'sku-hoodie': { name: 'Hoodie', priceCents: 5500 },
};

const MAX_QUANTITY = 100;

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, 'items must be a non-empty array');
  }
  for (const item of items) {
    if (!item || typeof item.sku !== 'string' || !PRODUCTS[item.sku]) {
      throw new HttpError(400, `Unknown product: ${item && item.sku}`);
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) {
      throw new HttpError(400, `quantity must be an integer between 1 and ${MAX_QUANTITY}`);
    }
  }
  return items.map(({ sku, quantity }) => ({ sku, quantity }));
}

// All amounts are in cents.
function calculatePricing(items, couponCode) {
  const subtotal = items.reduce(
    (sum, { sku, quantity }) => sum + PRODUCTS[sku].priceCents * quantity,
    0
  );

  const code = typeof couponCode === 'string' ? couponCode.trim().toUpperCase() : null;
  let discount = 0;
  if (code === 'BIGSPENDER' && subtotal >= 10000) {
    discount = 2000;
  } else if (code) {
    throw new HttpError(400, `Invalid coupon code: ${couponCode}`);
  }

  const tax = Math.round((subtotal - discount) * config.taxRate);
  return { subtotal, discount, tax, total: subtotal - discount + tax, couponCode: code };
}

function parseOrderId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id)) throw new HttpError(404, 'Order not found');
  return id;
}

// Returns 404 (not 403) for other users' orders so we don't reveal they exist.
function loadOwnedOrder(req) {
  const order = db.findOrderById(parseOrderId(req.params.id));
  const canSee = order && (order.userId === req.user.id || req.user.role === 'admin');
  if (!canSee) throw new HttpError(404, 'Order not found');
  return order;
}

// GET /api/orders — the current user's active orders
router.get('/', (req, res) => {
  res.json(db.listOrdersForUser(req.user.id));
});

// GET /api/orders/all — admin view, includes cancelled orders
// Registered before /:id so "all" isn't treated as an order id.
router.get('/all', requireRole('admin'), (req, res) => {
  res.json(db.listAllOrders());
});

// GET /api/orders/:id
router.get('/:id', (req, res) => {
  res.json(loadOwnedOrder(req));
});

// POST /api/orders
// Clients may send an Idempotency-Key header; retries with the same key
// return the original order instead of creating a duplicate.
router.post('/', rateLimitOrders, (req, res) => {
  const { items, couponCode } = req.body || {};
  const idempotencyKey = req.headers['idempotency-key'];
  const scopedKey = idempotencyKey ? `${req.user.id}:${idempotencyKey}` : null;

  if (scopedKey && db.processedRequests.has(scopedKey)) {
    return res.status(200).json(db.findOrderById(db.processedRequests.get(scopedKey)));
  }

  const cleanItems = validateItems(items);
  const pricing = calculatePricing(cleanItems, couponCode);
  const order = db.createOrder({ userId: req.user.id, items: cleanItems, pricing });

  if (scopedKey) db.processedRequests.set(scopedKey, order.id);
  res.status(201).json(order);
});

// DELETE /api/orders/:id — cancel an order
router.delete('/:id', (req, res) => {
  const order = loadOwnedOrder(req);

  if (order.status === 'cancelled') {
    throw new HttpError(409, 'Order is already cancelled');
  }
  if (req.user.role !== 'admin' && order.status !== 'pending') {
    throw new HttpError(409, 'Only pending orders can be cancelled');
  }

  res.json(db.cancelOrder(order.id));
});

module.exports = router;
