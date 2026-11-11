const { timeZone } = require('./config');

// Server qaysi zonada bo'lishidan qat'i nazar, sanalar Toshkent vaqtida ko'rsatiladi
const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function parts(d) {
  return Object.fromEntries(fmt.formatToParts(new Date(d)).map((p) => [p.type, p.value]));
}

function date(d) {
  if (!d) return '—';
  const p = parts(d);
  return `${p.day}.${p.month}.${p.year}`;
}

function dateTime(d) {
  if (!d) return '—';
  const p = parts(d);
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

function money(n) {
  return `${Number(n || 0).toLocaleString('ru-RU').replace(/,/g, ' ')} so'm`;
}

function daysLeft(d) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

/** Kalit holati: [css-klass, matn] */
function licenseState(l) {
  if (l.status === 'blocked') return ['danger', 'Bloklangan'];
  const left = daysLeft(l.expires_at);
  if (left <= 0) return ['danger', 'Muddati tugagan'];
  if (left <= 7) return ['warning', `${left} kun qoldi`];
  return ['success', `Faol (${left} kun)`];
}

const PLANS = { monthly: 'Oylik', yearly: 'Yillik' };
const EVENTS = {
  created: 'Yaratildi', extended: 'Uzaytirildi', activated: 'Aktivlashtirildi', rejected: 'Rad etildi',
  blocked: 'Bloklandi', unblocked: 'Blokdan chiqarildi', device_reset: 'Qurilma uzildi',
};
const REJECT = {
  blocked: 'bloklangan', not_activated: 'aktivlashtirilmagan', device_mismatch: 'boshqa qurilma',
};

module.exports = { date, dateTime, money, daysLeft, licenseState, PLANS, EVENTS, REJECT };
