// Foydalanish: npm run create-admin -- <login> <parol>
// Login mavjud bo'lsa, parol yangilanadi.
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');

(async () => {
  const [username, password] = process.argv.slice(2);
  if (!username || !password || password.length < 8) {
    console.error('Foydalanish: npm run create-admin -- <login> <parol (kamida 8 belgi)>');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO admins (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [username, hash]);
  console.log(`Admin "${username}" saqlandi`);
  await pool.end();
})().catch((err) => { console.error(err); process.exit(1); });
