const express = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const licenses = require('../licenses');

const router = express.Router();

// --- CSRF va flash ---
router.use((req, res, next) => {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrf = req.session.csrf;
  res.locals.admin = req.session.admin || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.path = req.path;
  if (req.method === 'POST') {
    const token = req.body && req.body._csrf;
    if (typeof token !== 'string' || token.length !== req.session.csrf.length
      || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(req.session.csrf))) {
      return res.status(403).send('CSRF token noto\'g\'ri. Sahifani yangilang.');
    }
  }
  next();
});

const flash = (req, type, text) => { req.session.flash = { type, text }; };
const back = (req, res, fallback) => res.redirect(req.get('Referer') || fallback);

// --- Login ---
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true });

router.get('/login', (req, res) => res.render('login', { error: null }));

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const { rows } = await db.query('SELECT * FROM admins WHERE username = $1', [String(username || '')]);
  const ok = rows.length && (await bcrypt.compare(String(password || ''), rows[0].password_hash));
  if (!ok) return res.status(401).render('login', { error: "Login yoki parol noto'g'ri" });
  req.session.regenerate((err) => {
    if (err) return res.status(500).send('Sessiya xatosi');
    req.session.admin = { id: rows[0].id, username: rows[0].username };
    res.redirect('/');
  });
});

router.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

router.use((req, res, next) => (req.session.admin ? next() : res.redirect('/login')));

// --- Bosh sahifa ---
router.get('/', async (req, res) => {
  const { rows: [stats] } = await db.query(`
    SELECT
      (SELECT count(*) FROM customers)::int AS customers,
      (SELECT count(*) FROM licenses WHERE status = 'active' AND expires_at > now())::int AS active,
      (SELECT count(*) FROM licenses WHERE status = 'active' AND expires_at > now() AND expires_at <= now() + interval '7 days')::int AS expiring,
      (SELECT count(*) FROM licenses WHERE status = 'active' AND expires_at <= now())::int AS expired,
      (SELECT count(*) FROM licenses WHERE status = 'blocked')::int AS blocked,
      (SELECT COALESCE(sum(amount), 0) FROM payments WHERE created_at >= date_trunc('month', now())) AS month_revenue`);
  const { rows: expiring } = await db.query(`
    SELECT l.*, c.name AS customer_name, c.cafe_name, c.phone
      FROM licenses l JOIN customers c ON c.id = l.customer_id
     WHERE l.status = 'active' AND l.expires_at <= now() + interval '7 days'
     ORDER BY l.expires_at ASC LIMIT 20`);
  const { rows: payments } = await db.query(`
    SELECT p.*, l.license_key, c.name AS customer_name, c.cafe_name
      FROM payments p JOIN licenses l ON l.id = p.license_id JOIN customers c ON c.id = l.customer_id
     ORDER BY p.created_at DESC LIMIT 10`);
  res.render('dashboard', { stats, expiring, payments });
});

// --- Mijozlar ---
router.get('/customers', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const { rows } = await db.query(`
    SELECT c.*, count(l.id)::int AS license_count, max(l.expires_at) AS max_expires
      FROM customers c LEFT JOIN licenses l ON l.customer_id = c.id
     WHERE $1 = '' OR c.name ILIKE '%' || $1 || '%' OR c.cafe_name ILIKE '%' || $1 || '%' OR c.phone ILIKE '%' || $1 || '%'
     GROUP BY c.id ORDER BY c.created_at DESC LIMIT 200`, [q]);
  res.render('customers', { customers: rows, q });
});

router.get('/customers/new', (req, res) => res.render('customer_form', { customer: {}, errors: null }));

function customerFields(body) {
  const f = (k) => (typeof body[k] === 'string' ? body[k].trim() : '') || null;
  return { name: f('name'), cafe_name: f('cafe_name'), phone: f('phone'), address: f('address'), note: f('note') };
}

router.post('/customers', async (req, res) => {
  const c = customerFields(req.body);
  if (!c.name) return res.status(400).render('customer_form', { customer: c, errors: 'Ism majburiy' });
  const { rows } = await db.query(
    'INSERT INTO customers (name, cafe_name, phone, address, note) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [c.name, c.cafe_name, c.phone, c.address, c.note]);
  flash(req, 'success', "Mijoz qo'shildi. Endi unga kalit yarating.");
  res.redirect(`/customers/${rows[0].id}`);
});

router.get('/customers/:id', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).render('error', { message: 'Mijoz topilmadi' });
  const { rows: lic } = await db.query('SELECT * FROM licenses WHERE customer_id = $1 ORDER BY created_at DESC', [req.params.id]);
  res.render('customer', { customer: rows[0], licenses: lic, errors: null });
});

router.post('/customers/:id', async (req, res) => {
  const c = customerFields(req.body);
  if (!c.name) { flash(req, 'error', 'Ism majburiy'); return res.redirect(`/customers/${req.params.id}`); }
  await db.query('UPDATE customers SET name=$2, cafe_name=$3, phone=$4, address=$5, note=$6 WHERE id=$1',
    [req.params.id, c.name, c.cafe_name, c.phone, c.address, c.note]);
  flash(req, 'success', 'Saqlandi');
  res.redirect(`/customers/${req.params.id}`);
});

// --- Kalitlar ---
const FILTERS = {
  all: 'TRUE',
  active: "l.status = 'active' AND l.expires_at > now()",
  expiring: "l.status = 'active' AND l.expires_at > now() AND l.expires_at <= now() + interval '7 days'",
  expired: "l.status = 'active' AND l.expires_at <= now()",
  blocked: "l.status = 'blocked'",
  unused: 'l.device_id IS NULL',
};

router.get('/licenses', async (req, res) => {
  const filter = FILTERS[req.query.filter] ? req.query.filter : 'all';
  const q = String(req.query.q || '').trim();
  const { rows } = await db.query(`
    SELECT l.*, c.name AS customer_name, c.cafe_name
      FROM licenses l JOIN customers c ON c.id = l.customer_id
     WHERE ${FILTERS[filter]}
       AND ($1 = '' OR l.license_key ILIKE '%' || $1 || '%' OR c.name ILIKE '%' || $1 || '%' OR c.cafe_name ILIKE '%' || $1 || '%')
     ORDER BY l.expires_at ASC LIMIT 300`, [q]);
  res.render('licenses', { licenses: rows, filter, q });
});

router.post('/licenses', async (req, res) => {
  const customerId = Number.parseInt(req.body.customer_id, 10);
  try {
    const lic = await licenses.createLicense({
      customerId, plan: req.body.plan, months: req.body.months, amount: req.body.amount,
      method: req.body.method, note: req.body.note, adminId: req.session.admin.id,
    });
    flash(req, 'success', `Kalit yaratildi: ${lic.license_key}`);
    res.redirect(`/licenses/${lic.id}`);
  } catch (err) {
    if (!(err instanceof licenses.LicenseError)) throw err;
    flash(req, 'error', err.message);
    res.redirect(`/customers/${customerId}`);
  }
});

router.get('/licenses/:id', async (req, res) => {
  const { rows } = await db.query(`
    SELECT l.*, c.name AS customer_name, c.cafe_name, c.phone
      FROM licenses l JOIN customers c ON c.id = l.customer_id WHERE l.id = $1`, [req.params.id]);
  if (!rows.length) return res.status(404).render('error', { message: 'Kalit topilmadi' });
  const { rows: payments } = await db.query(`
    SELECT p.*, a.username FROM payments p LEFT JOIN admins a ON a.id = p.admin_id
     WHERE p.license_id = $1 ORDER BY p.created_at DESC`, [req.params.id]);
  const { rows: events } = await db.query(
    'SELECT * FROM license_events WHERE license_id = $1 ORDER BY created_at DESC LIMIT 50', [req.params.id]);
  res.render('license', { license: rows[0], payments, events, monthsForPlan: licenses.PLAN_MONTHS });
});

async function action(req, res, fn, okText) {
  try {
    await fn();
    flash(req, 'success', okText);
  } catch (err) {
    if (!(err instanceof licenses.LicenseError)) throw err;
    flash(req, 'error', err.message);
  }
  res.redirect(`/licenses/${req.params.id}`);
}

router.post('/licenses/:id/extend', (req, res) => action(req, res, () => licenses.extendLicense({
  licenseId: req.params.id, months: req.body.months, amount: req.body.amount,
  method: req.body.method, note: req.body.note, adminId: req.session.admin.id,
}), "To'lov qabul qilindi, muddat uzaytirildi"));

router.post('/licenses/:id/block', (req, res) => action(req, res,
  () => licenses.setStatus(req.params.id, 'blocked', req.session.admin.id), 'Kalit bloklandi'));
router.post('/licenses/:id/unblock', (req, res) => action(req, res,
  () => licenses.setStatus(req.params.id, 'active', req.session.admin.id), 'Kalit faollashtirildi'));
router.post('/licenses/:id/reset-device', (req, res) => action(req, res,
  () => licenses.resetDevice(req.params.id, req.session.admin.id), "Qurilma uzildi. Kalitni yangi kompyuterda aktivlashtirish mumkin"));

// --- To'lovlar ---
router.get('/payments', async (req, res) => {
  const { rows } = await db.query(`
    SELECT p.*, l.license_key, c.name AS customer_name, c.cafe_name, a.username
      FROM payments p JOIN licenses l ON l.id = p.license_id JOIN customers c ON c.id = l.customer_id
      LEFT JOIN admins a ON a.id = p.admin_id
     ORDER BY p.created_at DESC LIMIT 300`);
  res.render('payments', { payments: rows });
});

module.exports = router;
