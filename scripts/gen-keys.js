// Ed25519 kalit juftligini yaratadi. Mavjud kalitlarni ustidan yozmaydi!
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../src/config');

const priv = path.resolve(config.privateKeyPath);
const pub = path.resolve(config.publicKeyPath);
if (fs.existsSync(priv)) {
  console.error(`${priv} allaqachon mavjud. Uni almashtirsangiz, barcha CafePOS'lardagi ochiq kalitni ham yangilash kerak bo'ladi.`);
  process.exit(1);
}
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
fs.mkdirSync(path.dirname(priv), { recursive: true });
fs.writeFileSync(priv, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
fs.writeFileSync(pub, publicKey.export({ type: 'spki', format: 'pem' }));
console.log(`Shaxsiy kalit: ${priv}  (HECH KIMGA BERMANG, zaxira nusxasini saqlang)`);
console.log(`Ochiq kalit:   ${pub}  (CafePOS dasturiga joylanadi)\n`);
console.log(fs.readFileSync(pub, 'utf8'));
