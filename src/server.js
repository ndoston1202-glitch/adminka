const config = require('./config');
const { createApp } = require('./app');
const { loadKeys } = require('./signing');
const { ensureAdmin } = require('./bootstrap');

async function start({ root, port = config.port } = {}) {
  if (config.isProduction && config.sessionSecret === 'dev-secret-change-me') {
    throw new Error("SESSION_SECRET o'rnatilmagan!");
  }
  loadKeys(); // kalitlar yo'q bo'lsa darhol xato beradi
  await ensureAdmin();
  return new Promise((resolve) => {
    const server = createApp({ root }).listen(port, () => {
      console.log(`Adminka http://localhost:${port} da ishlayapti`);
      resolve(server);
    });
  });
}

module.exports = { start };

if (require.main === module) {
  start().catch((err) => { console.error(err); process.exit(1); });
}
