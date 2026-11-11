const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// Test muhiti: alohida baza va vaqtinchalik kalitlar
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://cafepos:cafepos@localhost:5432/adminka_test';
const kp = crypto.generateKeyPairSync('ed25519');
process.env.LICENSE_PRIVATE_KEY = kp.privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.OFFLINE_GRACE_DAYS = '7';

const db = require('../src/db');
const { migrate } = require('../scripts/migrate');
const { createApp } = require('../src/app');
const licenses = require('../src/licenses');
const { verifyToken } = require('../src/signing');

let server; let base; let customerId;
const DEV_A = 'device-aaaa-1111';
const DEV_B = 'device-bbbb-2222';
const DAY = 86400000;

async function api(path, body) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  const { rows } = await db.query("INSERT INTO customers (name, cafe_name) VALUES ('Ali', 'Ali Cafe') RETURNING id");
  customerId = rows[0].id;
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => { server.close(); await db.pool.end(); });

test('aktivlashtirish: kalit qurilmaga bog\'lanadi va imzolangan token qaytadi', async () => {
  const lic = await licenses.createLicense({ customerId, plan: 'monthly', months: 1, amount: 100000 });
  const r = await api('/api/v1/activate', { key: lic.license_key.toLowerCase(), device_id: DEV_A, device_name: 'Kassa-1' });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  const payload = verifyToken(r.body.token, kp.publicKey.export({ type: 'spki', format: 'pem' }));
  assert.ok(payload, 'imzo to\'g\'ri bo\'lishi kerak');
  assert.equal(payload.device_id, DEV_A);
  assert.equal(payload.key, lic.license_key);
  assert.equal(payload.customer, 'Ali Cafe');
  assert.ok(new Date(payload.offline_until) <= new Date(payload.expires_at));

  // Soxtalashtirilgan token rad etiladi
  const [body, sig] = r.body.token.split('.');
  const fake = Buffer.from(JSON.stringify({ ...payload, expires_at: '2099-01-01T00:00:00Z' })).toString('base64url');
  assert.equal(verifyToken(`${fake}.${sig}`), null);
  assert.ok(body);

  // Boshqa qurilma rad etiladi va jurnalga yoziladi
  const r2 = await api('/api/v1/activate', { key: lic.license_key, device_id: DEV_B });
  assert.equal(r2.status, 409);
  assert.equal(r2.body.code, 'device_mismatch');
  const { rows } = await db.query("SELECT * FROM license_events WHERE license_id = $1 AND type = 'rejected'", [lic.id]);
  assert.equal(rows.length, 1);

  // Bog'langan qurilmadan tekshiruv ishlaydi
  const r3 = await api('/api/v1/check', { key: lic.license_key, device_id: DEV_A, app_version: '1.2.0' });
  assert.equal(r3.status, 200);

  // Qurilma uzilgach, yangi kompyuter aktivlashtira oladi
  await licenses.resetDevice(lic.id);
  assert.equal((await api('/api/v1/check', { key: lic.license_key, device_id: DEV_A })).body.code, 'not_activated');
  assert.equal((await api('/api/v1/activate', { key: lic.license_key, device_id: DEV_B })).status, 200);
});

test('noto\'g\'ri kalit', async () => {
  const r = await api('/api/v1/activate', { key: 'CAFE-AAAA-BBBB-CCCC-DDDD', device_id: DEV_A });
  assert.equal(r.status, 404);
  assert.equal(r.body.code, 'invalid_key');
  const r2 = await api('/api/v1/activate', { key: 'salom', device_id: DEV_A });
  assert.equal(r2.status, 400);
});

test('to\'lovsiz kalit ishlamaydi, to\'lovdan keyin ishlaydi', async () => {
  const lic = await licenses.createLicense({ customerId, plan: 'monthly', months: 0 });
  const r = await api('/api/v1/activate', { key: lic.license_key, device_id: DEV_A });
  assert.equal(r.status, 402);
  assert.equal(r.body.code, 'expired');

  await licenses.extendLicense({ licenseId: lic.id, months: 1, amount: 150000, method: "Karta o'tkazma" });
  const r2 = await api('/api/v1/check', { key: lic.license_key, device_id: DEV_A });
  assert.equal(r2.status, 200);
  const days = (new Date(r2.body.license.expires_at) - Date.now()) / DAY;
  assert.ok(days > 27 && days < 32, `~1 oy bo'lishi kerak, ${days}`);
});

test('uzaytirish: faol kalit joriy tugash sanasidan, tugagan kalit bugundan uzaytiriladi', async () => {
  const lic = await licenses.createLicense({ customerId, plan: 'yearly', months: 12 });
  const ext = await licenses.extendLicense({ licenseId: lic.id, months: 12, amount: 1000000 });
  const diffDays = (new Date(ext.expires_at) - new Date(lic.expires_at)) / DAY;
  assert.ok(diffDays >= 365 && diffDays <= 366);

  await db.query("UPDATE licenses SET expires_at = now() - interval '100 days' WHERE id = $1", [lic.id]);
  const ext2 = await licenses.extendLicense({ licenseId: lic.id, months: 1 });
  const left = (new Date(ext2.expires_at) - Date.now()) / DAY;
  assert.ok(left > 27 && left < 32);

  const { rows } = await db.query('SELECT * FROM payments WHERE license_id = $1 ORDER BY id', [lic.id]);
  assert.equal(rows.length, 3);
  await assert.rejects(licenses.extendLicense({ licenseId: lic.id, months: 0 }), { code: 'bad_months' });
});

test('bloklangan kalit rad etiladi', async () => {
  const lic = await licenses.createLicense({ customerId, plan: 'monthly', months: 1 });
  assert.equal((await api('/api/v1/activate', { key: lic.license_key, device_id: DEV_A })).status, 200);
  await licenses.setStatus(lic.id, 'blocked');
  const r = await api('/api/v1/check', { key: lic.license_key, device_id: DEV_A });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'blocked');
  await licenses.setStatus(lic.id, 'active');
  assert.equal((await api('/api/v1/check', { key: lic.license_key, device_id: DEV_A })).status, 200);
});

test('oflayn muddat kalit muddatidan oshmaydi', async () => {
  const lic = await licenses.createLicense({ customerId, plan: 'monthly', months: 1 });
  await db.query("UPDATE licenses SET expires_at = now() + interval '2 days' WHERE id = $1", [lic.id]);
  const r = await api('/api/v1/activate', { key: lic.license_key, device_id: DEV_A });
  assert.equal(r.body.license.offline_until, r.body.license.expires_at);
});

test('admin panel: login, CSRF va mijoz qo\'shish', async () => {
  const bcrypt = require('bcryptjs');
  await db.query('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', ['test', await bcrypt.hash('parol12345', 4)]);

  let cookie = '';
  const req = async (path, opts = {}) => {
    const res = await fetch(base + path, { redirect: 'manual', ...opts, headers: { cookie, ...(opts.headers || {}) } });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { res, text: await res.text() };
  };
  const form = (o) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });

  assert.equal((await req('/')).res.status, 302); // login talab qilinadi
  const page = await req('/login');
  const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];

  assert.equal((await req('/login', form({ username: 'test', password: 'parol12345' }))).res.status, 403); // csrf yo'q
  assert.equal((await req('/login', form({ _csrf: csrf, username: 'test', password: 'xato' }))).res.status, 401);
  const ok = await req('/login', form({ _csrf: csrf, username: 'test', password: 'parol12345' }));
  assert.equal(ok.res.status, 302);

  const dash = await req('/');
  assert.equal(dash.res.status, 200);
  const csrf2 = dash.text.match(/name="_csrf" value="([^"]+)"/)[1];
  const created = await req('/customers', form({ _csrf: csrf2, name: 'Vali', cafe_name: '<b>Vali Cafe</b>' }));
  assert.equal(created.res.status, 302);
  const cust = await req(created.res.headers.get('location'));
  assert.ok(cust.text.includes('&lt;b&gt;Vali Cafe&lt;/b&gt;'), 'HTML escape qilinishi kerak');

  // Kalit yaratish -> kalit sahifasi -> to'lov qabul qilish
  const custId = created.res.headers.get('location').split('/').pop();
  const lic = await req('/licenses', form({ _csrf: csrf2, customer_id: custId, plan: 'monthly', months: '1', amount: '100000', method: "Karta o'tkazma" }));
  assert.equal(lic.res.status, 302);
  const licPath = lic.res.headers.get('location');
  const ext = await req(`${licPath}/extend`, form({ _csrf: csrf2, months: '2', amount: '200000', method: "Karta o'tkazma" }));
  assert.equal(ext.res.status, 302);
  const licPage = await req(licPath);
  assert.ok(licPage.text.includes("To&#39;lov qabul qilindi"));
  for (const p of ['/licenses', '/licenses?filter=expired', '/payments', '/customers?q=Vali']) {
    assert.equal((await req(p)).res.status, 200, p);
  }
});
