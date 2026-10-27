// In-memory data store. Swap for a real database later.
const crypto = require('crypto');

const users = new Map(); // id -> user
const orders = new Map(); // id -> order
const processedRequests = new Map(); // `${userId}:${idempotencyKey}` -> orderId

let nextUserId = 1;
let nextOrderId = 1000;

const ROLES = ['customer', 'admin'];

// ---------- Passwords ----------

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto
    .pbkdf2Sync(password, salt, 100000, 32, 'sha256')
    .toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt] = stored.split(':');
  const candidate = Buffer.from(hashPassword(password, salt));
  const expected = Buffer.from(stored);
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

// ---------- Users ----------

function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

function createUser({ username, email, password, role = 'customer' }) {
  const user = {
    id: nextUserId++,
    username: normalizeUsername(username),
    email,
    passwordHash: hashPassword(password),
    role,
    active: true,
    createdAt: new Date().toISOString(),
  };
  users.set(user.id, user);
  return user;
}

function findUserById(id) {
  return users.get(id) || null;
}

function findUserByUsername(username) {
  const normalized = normalizeUsername(username);
  for (const user of users.values()) {
    if (user.username === normalized) return user;
  }
  return null;
}

function updateUser(id, fields) {
  const user = users.get(id);
  if (!user) return null;
  Object.assign(user, fields);
  return user;
}

// ---------- Orders ----------

function createOrder({ userId, items, pricing }) {
  const order = {
    id: nextOrderId++,
    userId,
    items,
    ...pricing,
    status: 'pending',
    createdAt: new Date().toISOString(),
    cancelledAt: null,
  };
  orders.set(order.id, order);
  return order;
}

function findOrderById(id) {
  return orders.get(id) || null;
}

// Returns the user's active orders, newest first.
function listOrdersForUser(userId) {
  return [...orders.values()]
    .filter((o) => o.userId === userId && o.status !== 'cancelled')
    .sort((a, b) => b.id - a.id);
}

// Returns every order, including cancelled ones, newest first.
function listAllOrders() {
  return [...orders.values()].sort((a, b) => b.id - a.id);
}

// Orders are never hard-deleted so finance can still audit them.
function cancelOrder(id) {
  const order = orders.get(id);
  if (!order) return null;
  order.status = 'cancelled';
  order.cancelledAt = new Date().toISOString();
  return order;
}

// ---------- Seed data ----------

createUser({ username: 'admin', email: 'admin@shopwise.dev', password: 'adminpass123', role: 'admin' });
createUser({ username: 'alice', email: 'alice@example.com', password: 'wonderland1' });
createUser({ username: 'bob', email: 'bob@example.com', password: 'builder123' });

module.exports = {
  ROLES,
  processedRequests,
  verifyPassword,
  createUser,
  findUserById,
  findUserByUsername,
  updateUser,
  createOrder,
  findOrderById,
  listOrdersForUser,
  listAllOrders,
  cancelOrder,
};
