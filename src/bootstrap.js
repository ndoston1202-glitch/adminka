const bcrypt = require('bcryptjs');
const db = require('./db');
const config = require('./config');

/** Bazada birorta admin bo'lmasa, ADMIN_USERNAME/ADMIN_PASSWORD bilan birinchisini yaratadi. */
async function ensureAdmin() {
  if (!config.bootstrapAdmin) return;
  const { rows } = await db.query('SELECT count(*)::int AS n FROM admins');
  if (rows[0].n > 0) return;
  const { username, password } = config.bootstrapAdmin;
  await db.query('INSERT INTO admins (username, password_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [username, await bcrypt.hash(password, 12)]);
  console.log(`Birinchi admin yaratildi: ${username}`);
}

module.exports = { ensureAdmin };
