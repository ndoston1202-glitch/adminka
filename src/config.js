require('dotenv').config({ quiet: true });

function int(name, def) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`${name} butun son bo'lishi kerak`);
  return n;
}

module.exports = {
  port: int('PORT', 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://cafepos:cafepos@localhost:5432/adminka',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  privateKeyPath: process.env.LICENSE_PRIVATE_KEY_PATH || './keys/license_private.pem',
  publicKeyPath: process.env.LICENSE_PUBLIC_KEY_PATH || './keys/license_public.pem',
  privateKeyPem: process.env.LICENSE_PRIVATE_KEY || null,
  publicKeyPem: process.env.LICENSE_PUBLIC_KEY || null,
  offlineGraceDays: int('OFFLINE_GRACE_DAYS', 7),
  isProduction: process.env.NODE_ENV === 'production',
};
