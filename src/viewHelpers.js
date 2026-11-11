const pad = (n) => String(n).padStart(2, '0');

function date(d) {
  if (!d) return '—';
  const x = new Date(d);
  return `${pad(x.getDate())}.${pad(x.getMonth() + 1)}.${x.getFullYear()}`;
}

function dateTime(d) {
  if (!d) return '—';
  const x = new Date(d);
  return `${date(x)} ${pad(x.getHours())}:${pad(x.getMinutes())}`;
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
