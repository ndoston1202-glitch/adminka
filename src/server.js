const config = require('./config');
const { createApp } = require('./app');
const { loadKeys } = require('./signing');

if (config.isProduction && config.sessionSecret === 'dev-secret-change-me') {
  console.error('SESSION_SECRET o\'rnatilmagan!');
  process.exit(1);
}
loadKeys(); // kalitlar yo'q bo'lsa darhol xato beradi

createApp().listen(config.port, () => console.log(`Adminka http://localhost:${config.port} da ishlayapti`));
