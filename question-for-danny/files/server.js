const crypto = require('crypto');
const express = require('express');
const config = require('./config');
const db = require('./db');
const ordersRouter = require('./routes/orders');
const {
  HttpError,
  issueToken,
  authenticate,
  requireRole,
  maintenance,
  notFound,
  errorHandler,
} = require('./middleware');

const app = express();

// Tag every request so logs can be correlated
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', env: config.env, maintenance: config.maintenanceMode });
});

app.use(maintenance);
app.use(express.json({ limit: '100kb' }));

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;

// ---------- Auth ----------

app.post('/auth/signup', (req, res) => {
  const { username, email, password } = req.body || {};

  if (!isNonEmptyString(username) || !USERNAME_PATTERN.test(username)) {
    throw new HttpError(400, 'username must be 3-30 letters, numbers or underscores');
  }
  if (!isNonEmptyString(email) || !EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, 'A valid email is required');
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw new HttpError(400, 'Password must be at least 8 characters');
  }
  if (db.findUserByUsername(username)) {
    throw new HttpError(409, 'Username taken');
  }

  const user = db.createUser({ username, email, password });
  res.status(201).json({ token: issueToken(user) });
});

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!isNonEmptyString(username) || typeof password !== 'string') {
    throw new HttpError(400, 'username and password are required');
  }

  const user = db.findUserByUsername(username);
  if (!user || !user.active || !db.verifyPassword(password, user.passwordHash)) {
    throw new HttpError(401, 'Invalid credentials');
  }
  res.json({ token: issueToken(user) });
});

// ---------- Profile ----------

const profileCache = new Map(); // userId -> { data, expiresAt }

function toProfile(user) {
  return { id: user.id, username: user.username, email: user.email, role: user.role };
}

app.get('/me', authenticate, (req, res) => {
  const cached = profileCache.get(req.user.id);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.data);
  }

  const data = toProfile(db.findUserById(req.user.id));
  profileCache.set(req.user.id, { data, expiresAt: Date.now() + config.profileCacheTtlMs });
  res.json(data);
});

app.patch('/me', authenticate, (req, res) => {
  const { email } = req.body || {};
  if (!isNonEmptyString(email) || !EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, 'A valid email is required');
  }

  const user = db.updateUser(req.user.id, { email });
  profileCache.delete(req.user.id);
  res.json(toProfile(user));
});

// ---------- Admin ----------

app.post('/admin/users/:id/role', authenticate, requireRole('admin'), (req, res) => {
  const { role } = req.body || {};
  if (!db.ROLES.includes(role)) {
    throw new HttpError(400, `role must be one of: ${db.ROLES.join(', ')}`);
  }

  const user = db.updateUser(Number(req.params.id), { role });
  if (!user) throw new HttpError(404, 'User not found');

  profileCache.delete(user.id);
  res.json(toProfile(user));
});

// ---------- Orders ----------

app.use('/api/orders', authenticate, ordersRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`ShopWise API listening on port ${config.port} (${config.env})`);
});
