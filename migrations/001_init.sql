CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  cafe_name  TEXT,
  phone      TEXT,
  address    TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS licenses (
  id            SERIAL PRIMARY KEY,
  license_key   TEXT NOT NULL UNIQUE,
  customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  plan          TEXT NOT NULL CHECK (plan IN ('monthly', 'yearly')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  expires_at    TIMESTAMPTZ NOT NULL,
  device_id     TEXT,
  device_name   TEXT,
  activated_at  TIMESTAMPTZ,
  last_check_at TIMESTAMPTZ,
  last_ip       TEXT,
  app_version   TEXT,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS licenses_customer_idx ON licenses(customer_id);
CREATE INDEX IF NOT EXISTS licenses_expires_idx ON licenses(expires_at);

CREATE TABLE IF NOT EXISTS payments (
  id          SERIAL PRIMARY KEY,
  license_id  INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  amount      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  months      INTEGER NOT NULL CHECK (months > 0),
  method      TEXT,
  note        TEXT,
  admin_id    INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  old_expires_at TIMESTAMPTZ,
  new_expires_at TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_license_idx ON payments(license_id);

CREATE TABLE IF NOT EXISTS license_events (
  id         SERIAL PRIMARY KEY,
  license_id INTEGER REFERENCES licenses(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  details    JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS license_events_license_idx ON license_events(license_id, created_at DESC);

-- connect-pg-simple sessiya jadvali
CREATE TABLE IF NOT EXISTS "session" (
  "sid"    VARCHAR NOT NULL PRIMARY KEY,
  "sess"   JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
