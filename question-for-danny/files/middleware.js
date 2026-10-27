const crypto = require('crypto');
const config = require('./config');
const db = require('./db');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- Tokens ----------
// Format: base64url(payload).base64url(hmac)

function sign(data) {
  return crypto.createHmac('sha256', config.tokenSecret).update(data).digest('base64url');
}

function issueToken(user) {
  const payload = {
    sub: String(user.id),
    exp: Math.floor(Date.now() / 1000) + config.tokenTtlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

function verifyToken(token) {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}

// ---------- Middleware ----------

// Verifies the bearer token and loads the current user from the database,
// so role changes and deactivations take effect immediately.
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return next(new HttpError(401, 'Missing token'));
  }

  const payload = verifyToken(header.slice(7));
  if (!payload) return next(new HttpError(401, 'Invalid or expired token'));

  const user = db.findUserById(payload.sub);
  if (!user || !user.active) return next(new HttpError(401, 'Account unavailable'));

  req.user = { id: user.id, username: user.username, role: user.role };
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return next(new HttpError(403, 'Forbidden'));
    }
    next();
  };
}

// Sliding-window rate limiter, keyed per user.
const recentOrders = new Map(); // userId -> [timestamps]

function rateLimitOrders(req, res, next) {
  const now = Date.now();
  const windowStart = now - 60 * 1000;
  const timestamps = (recentOrders.get(req.user.id) || []).filter((t) => t > windowStart);

  if (timestamps.length >= config.maxOrdersPerMinute) {
    recentOrders.set(req.user.id, timestamps);
    return next(new HttpError(429, 'Too many orders, slow down'));
  }

  timestamps.push(now);
  recentOrders.set(req.user.id, timestamps);
  next();
}

// During maintenance the API stays readable but rejects writes.
function maintenance(req, res, next) {
  const isRead = req.method === 'GET' || req.method === 'HEAD';
  if (config.maintenanceMode && !isRead) {
    return res.status(503).json({ error: 'Down for maintenance' });
  }
  next();
}

function notFound(req, res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.path}`));
}

function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  // Errors raised by express.json() (malformed JSON, payload too large, etc.)
  if (err.type && Number.isInteger(err.status) && err.status < 500) {
    return res.status(err.status).json({ error: 'Invalid request body' });
  }

  console.error(`[${req.requestId}]`, err);
  const body = { error: 'Internal server error' };
  if (config.env === 'development') body.stack = err.stack;
  res.status(500).json(body);
}

module.exports = {
  HttpError,
  issueToken,
  authenticate,
  requireRole,
  rateLimitOrders,
  maintenance,
  notFound,
  errorHandler,
};
