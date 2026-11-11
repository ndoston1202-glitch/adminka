const db = require('./db');
const config = require('./config');
const { generateLicenseKey, normalizeLicenseKey } = require('./licenseKey');
const { signToken } = require('./signing');

const PLAN_MONTHS = { monthly: 1, yearly: 12 };
const DAY = 24 * 60 * 60 * 1000;

class LicenseError extends Error {
  constructor(code, status, message, extra = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

async function logEvent(client, licenseId, type, details, ip) {
  await client.query(
    'INSERT INTO license_events (license_id, type, details, ip) VALUES ($1, $2, $3, $4)',
    [licenseId, type, details ? JSON.stringify(details) : null, ip || null],
  );
}

/** Yangi kalit yaratish. Agar months > 0 bo'lsa, birinchi to'lov ham yoziladi. */
async function createLicense({ customerId, plan, months, amount, method, note, adminId }) {
  if (!PLAN_MONTHS[plan]) throw new LicenseError('bad_plan', 400, "Noto'g'ri tarif");
  const m = Number.parseInt(months, 10) || 0;
  if (m < 0 || m > 120) throw new LicenseError('bad_months', 400, "Oylar soni 0..120 oralig'ida bo'lishi kerak");

  return db.withTransaction(async (client) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const key = generateLicenseKey();
      const { rows } = await client.query(
        `INSERT INTO licenses (license_key, customer_id, plan, expires_at, note)
         VALUES ($1, $2, $3, now() + make_interval(months => $4), $5)
         ON CONFLICT (license_key) DO NOTHING
         RETURNING *`,
        [key, customerId, plan, m, note || null],
      );
      if (!rows.length) continue;
      const license = rows[0];
      await logEvent(client, license.id, 'created', { plan, months: m, adminId });
      if (m > 0) {
        await client.query(
          `INSERT INTO payments (license_id, amount, months, method, note, admin_id, old_expires_at, new_expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)`,
          [license.id, Number(amount) || 0, m, method || null, 'Birinchi to\'lov', adminId || null, license.expires_at],
        );
      }
      return license;
    }
    throw new Error('Kalit yaratib bo\'lmadi');
  });
}

/** To'lov qabul qilish: muddat max(hozir, eski muddat) + months ga uzaytiriladi. */
async function extendLicense({ licenseId, months, amount, method, note, adminId }) {
  const m = Number.parseInt(months, 10);
  if (!(m > 0 && m <= 120)) throw new LicenseError('bad_months', 400, "Oylar soni 1..120 oralig'ida bo'lishi kerak");

  return db.withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM licenses WHERE id = $1 FOR UPDATE', [licenseId]);
    if (!rows.length) throw new LicenseError('not_found', 404, 'Kalit topilmadi');
    const old = rows[0];
    const { rows: upd } = await client.query(
      `UPDATE licenses
          SET expires_at = GREATEST(now(), expires_at) + make_interval(months => $2)
        WHERE id = $1 RETURNING *`,
      [licenseId, m],
    );
    const license = upd[0];
    await client.query(
      `INSERT INTO payments (license_id, amount, months, method, note, admin_id, old_expires_at, new_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [licenseId, Number(amount) || 0, m, method || null, note || null, adminId || null, old.expires_at, license.expires_at],
    );
    await logEvent(client, licenseId, 'extended', { months: m, amount: Number(amount) || 0, from: old.expires_at, to: license.expires_at, adminId });
    return license;
  });
}

async function setStatus(licenseId, status, adminId) {
  if (!['active', 'blocked'].includes(status)) throw new LicenseError('bad_status', 400, "Noto'g'ri holat");
  return db.withTransaction(async (client) => {
    const { rows } = await client.query('UPDATE licenses SET status = $2 WHERE id = $1 RETURNING *', [licenseId, status]);
    if (!rows.length) throw new LicenseError('not_found', 404, 'Kalit topilmadi');
    await logEvent(client, licenseId, status === 'blocked' ? 'blocked' : 'unblocked', { adminId });
    return rows[0];
  });
}

/** Qurilmani uzish — mijoz boshqa kompyuterda qayta aktivlashtira oladi. */
async function resetDevice(licenseId, adminId) {
  return db.withTransaction(async (client) => {
    const { rows: before } = await client.query('SELECT device_id, device_name FROM licenses WHERE id = $1', [licenseId]);
    if (!before.length) throw new LicenseError('not_found', 404, 'Kalit topilmadi');
    const { rows } = await client.query(
      'UPDATE licenses SET device_id = NULL, device_name = NULL, activated_at = NULL WHERE id = $1 RETURNING *',
      [licenseId],
    );
    await logEvent(client, licenseId, 'device_reset', { ...before[0], adminId });
    return rows[0];
  });
}

function buildToken(license, customer) {
  const now = Date.now();
  const expires = new Date(license.expires_at).getTime();
  const offlineUntil = Math.min(expires, now + config.offlineGraceDays * DAY);
  const payload = {
    v: 1,
    key: license.license_key,
    device_id: license.device_id,
    customer: customer.cafe_name || customer.name,
    plan: license.plan,
    expires_at: new Date(expires).toISOString(),
    offline_until: new Date(offlineUntil).toISOString(),
    issued_at: new Date(now).toISOString(),
  };
  return { token: signToken(payload), payload };
}

function validateDeviceId(deviceId) {
  if (typeof deviceId !== 'string' || deviceId.length < 8 || deviceId.length > 200) {
    throw new LicenseError('bad_device_id', 400, "device_id noto'g'ri");
  }
}

/**
 * CafePOS chaqiradigan asosiy funksiya.
 * bind=true  -> aktivlashtirish (bo'sh kalitni qurilmaga bog'laydi)
 * bind=false -> tekshirish (faqat bog'langan qurilma uchun)
 */
async function clientCheck({ key, deviceId, deviceName, appVersion, ip, bind }) {
  const licenseKey = normalizeLicenseKey(key);
  if (!licenseKey) throw new LicenseError('invalid_key', 400, "Kalit formati noto'g'ri");
  validateDeviceId(deviceId);

  return db.withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT l.*, c.name AS customer_name, c.cafe_name
         FROM licenses l JOIN customers c ON c.id = l.customer_id
        WHERE l.license_key = $1 FOR UPDATE OF l`,
      [licenseKey],
    );
    if (!rows.length) throw new LicenseError('invalid_key', 404, 'Bunday kalit mavjud emas');
    let license = rows[0];
    const customer = { name: license.customer_name, cafe_name: license.cafe_name };

    // Rad etishlar ham jurnalga yozilishi uchun throw emas, natija qaytariladi (tranzaksiya commit bo'ladi)
    const fail = async (code, status, message) => {
      await logEvent(client, license.id, 'rejected', { code, deviceId, deviceName }, ip);
      return { ok: false, code, status, message };
    };

    if (license.status === 'blocked') return fail('blocked', 403, 'Kalit bloklangan. Administratorga murojaat qiling');

    if (!license.device_id) {
      if (!bind) return fail('not_activated', 409, 'Kalit hali aktivlashtirilmagan');
      const { rows: upd } = await client.query(
        `UPDATE licenses SET device_id = $2, device_name = $3, activated_at = now() WHERE id = $1 RETURNING *`,
        [license.id, deviceId, deviceName || null],
      );
      license = upd[0];
      await logEvent(client, license.id, 'activated', { deviceId, deviceName, appVersion }, ip);
    } else if (license.device_id !== deviceId) {
      return fail('device_mismatch', 409, 'Bu kalit boshqa kompyuterda aktivlashtirilgan');
    }

    const { rows: upd2 } = await client.query(
      `UPDATE licenses SET last_check_at = now(), last_ip = $2, app_version = COALESCE($3, app_version)
        WHERE id = $1 RETURNING *`,
      [license.id, ip || null, appVersion || null],
    );
    license = upd2[0];

    if (new Date(license.expires_at).getTime() <= Date.now()) {
      return { ok: false, code: 'expired', status: 402, message: 'Foydalanish muddati tugagan', expires_at: license.expires_at };
    }

    const { token, payload } = buildToken(license, customer);
    return { ok: true, token, license: payload };
  });
}

module.exports = { createLicense, extendLicense, setStatus, resetDevice, clientCheck, LicenseError, PLAN_MONTHS };
