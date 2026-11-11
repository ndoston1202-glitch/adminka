const crypto = require('node:crypto');
const fs = require('node:fs');
const config = require('./config');

let privateKey;
let publicKey;

function loadKeys() {
  if (privateKey) return;
  const privPem = config.privateKeyPem || fs.readFileSync(config.privateKeyPath, 'utf8');
  privateKey = crypto.createPrivateKey(privPem);
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
