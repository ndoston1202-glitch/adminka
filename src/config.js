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
  // Lokal: DATABASE_URL. Netlify'da bo'sh qoldiriladi — Netlify Database avtomatik ulanadi
  databaseUrl: process.env.DATABASE_URL || null,
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  privateKeyPath: process.env.LICENSE_PRIVATE_KEY_PATH || './keys/license_private.pem',
  publicKeyPath: process.env.LICENSE_PUBLIC_KEY_PATH || './keys/license_public.pem',
  privateKeyPem: process.env.LICENSE_PRIVATE_KEY || null,
  publicKeyPem: process.env.LICENSE_PUBLIC_KEY || null,
  offlineGraceDays: int('OFFLINE_GRACE_DAYS', 7),
  isProduction: process.env.NODE_ENV === 'production' || !!process.env.NETLIFY,
  timeZone: process.env.APP_TIMEZONE || 'Asia/Tashkent',
  // Birinchi ishga tushishda admin bo'lmasa, shu login/parol bilan yaratiladi
  bootstrapAdmin: process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD
    ? { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD } : null,
};
