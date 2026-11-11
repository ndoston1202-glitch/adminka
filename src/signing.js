const crypto = require('node:crypto');
const fs = require('node:fs');
const config = require('./config');

let privateKey;
let publicKey;

function loadKeys() {
  if (privateKey) return;
  const raw = (config.privateKeyPem || fs.readFileSync(config.privateKeyPath, 'utf8')).trim();
  // PEM yoki bir qatorli base64 (PKCS8 DER) — muhit o'zgaruvchisida saqlash qulay bo'lishi uchun
  privateKey = raw.startsWith('-----')
    ? crypto.createPrivateKey(raw)
    : crypto.createPrivateKey({ key: Buffer.from(raw, 'base64'), format: 'der', type: 'pkcs8' });
  publicKey = crypto.createPublicKey(privateKey);
}

function publicKeyPem() {
  loadKeys();
  return publicKey.export({ type: 'spki', format: 'pem' });
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** Token formati: base64url(JSON payload) + "." + base64url(Ed25519 imzo) */
function signToken(payload) {
  loadKeys();
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.sign(null, Buffer.from(body), privateKey);
  return `${body}.${b64url(sig)}`;
}

function verifyToken(token, pubKeyPem) {
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const key = pubKeyPem ? crypto.createPublicKey(pubKeyPem) : (loadKeys(), publicKey);
  const ok = crypto.verify(null, Buffer.from(body), key, Buffer.from(sig, 'base64url'));
  if (!ok) return null;
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

module.exports = { signToken, verifyToken, publicKeyPem, loadKeys };
