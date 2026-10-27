// Central configuration for the ShopWise API.
// Values are resolved in this order: defaults -> environment overrides -> process.env

const env = process.env.NODE_ENV || 'development';

const defaults = {
  port: 3000,
  tokenTtlSeconds: 60 * 60, // 1 hour
  profileCacheTtlMs: 30 * 1000, // 30 seconds
  maxOrdersPerMinute: 10,
  taxRate: 0.08,
  maintenanceMode: false,
};

const overrides = {
  development: {
    tokenTtlSeconds: 24 * 60 * 60, // long sessions so devs don't keep logging in
  },
  production: {
    port: 8080,
    profileCacheTtlMs: 5 * 60 * 1000,
    maxOrdersPerMinute: 5,
  },
  test: {
    port: 0, // let the OS pick a free port
    profileCacheTtlMs: 0,
  },
};

if (!overrides[env]) {
  throw new Error(
    `Unknown NODE_ENV "${env}". Expected one of: ${Object.keys(overrides).join(', ')}`
  );
}

const config = {
  ...defaults,
  ...overrides[env],
  env,
};

if (process.env.PORT) {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT "${process.env.PORT}"`);
  }
  config.port = port;
}

if (process.env.MAINTENANCE === 'true') {
  config.maintenanceMode = true;
}

if (process.env.TOKEN_SECRET) {
  config.tokenSecret = process.env.TOKEN_SECRET;
} else if (env === 'production') {
  throw new Error('TOKEN_SECRET must be set in production');
} else {
  config.tokenSecret = 'dev-secret-change-me';
}

module.exports = config;
