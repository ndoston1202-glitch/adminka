const crypto = require('node:crypto');

// Chalkashtiradigan belgilarsiz (0/O, 1/I/L yo'q)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateLicenseKey() {
  const groups = [];
  for (let g = 0; g < 4; g++) {
    let s = '';
    for (let i = 0; i < 4; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
    groups.push(s);
  }
  return `CAFE-${groups.join('-')}`;
}

function normalizeLicenseKey(input) {
  if (typeof input !== 'string') return null;
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw.startsWith('CAFE') || raw.length !== 20) return null;
  const body = raw.slice(4);
  return `CAFE-${body.match(/.{4}/g).join('-')}`;
}

module.exports = { generateLicenseKey, normalizeLicenseKey };
