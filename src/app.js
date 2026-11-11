const path = require('node:path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const config = require('./config');
const db = require('./db');
const helpers = require('./viewHelpers');

/**
 * @param {object} [opts]
 * @param {string} [opts.root] loyiha ildizi (Netlify'da kod bundle qilinganda __dirname ga ishonib bo'lmaydi)
 */
function createApp({ root = path.join(__dirname, '..') } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.engine('ejs', require('ejs').__express); // bundler ko'rishi uchun aniq require
  app.set('view engine', 'ejs');
  app.set('views', path.join(root, 'src', 'views'));
  app.locals.h = helpers;

  app.use(helmet());
  app.use('/static', express.static(path.join(root, 'public', 'static')));

  // CafePOS uchun API (sessiyasiz, JSON)
  app.use('/api', express.json({ limit: '10kb' }), require('./routes/api'));

  // Admin panel
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  app.use(session({
    store: new PgSession({ pool: db.pool, tableName: 'session' }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: 'adminka.sid',
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 12 * 60 * 60 * 1000 },
  }));
  app.use('/', require('./routes/admin'));

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error(err);
    if (req.path.startsWith('/api')) return res.status(500).json({ ok: false, code: 'server_error', message: 'Server xatosi' });
    res.status(500).render('error', { message: 'Server xatosi' });
  });
  return app;
}

module.exports = { createApp };
