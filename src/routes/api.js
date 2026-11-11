const express = require('express');
const rateLimit = require('express-rate-limit');
const licenses = require('../licenses');
const { publicKeyPem } = require('../signing');

const router = express.Router();

router.use(rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { ok: false, code: 'rate_limited', message: "Juda ko'p so'rov. Birozdan keyin urinib ko'ring" } }));

router.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

router.get('/v1/public-key', (req, res) => res.type('text/plain').send(publicKeyPem()));

function handler(bind) {
  return async (req, res) => {
    const b = req.body || {};
    try {
      const result = await licenses.clientCheck({
        key: b.key,
        deviceId: b.device_id,
        deviceName: typeof b.device_name === 'string' ? b.device_name.slice(0, 200) : null,
        appVersion: typeof b.app_version === 'string' ? b.app_version.slice(0, 50) : null,
        ip: req.ip,
        bind,
      });
      if (result.ok) return res.json({ ok: true, server_time: new Date().toISOString(), token: result.token, license: result.license });
      const { status, ...rest } = result;
      return res.status(status).json({ ...rest, server_time: new Date().toISOString() });
    } catch (err) {
      if (err instanceof licenses.LicenseError) {
        return res.status(err.status).json({ ok: false, code: err.code, message: err.message });
      }
      throw err;
    }
  };
}

// Birinchi marta kalit kiritilganda
router.post('/v1/activate', handler(true));
// Dastur ishga tushganda va vaqti-vaqti bilan (masalan har 6 soatda)
router.post('/v1/check', handler(false));

module.exports = router;
