const { Pool } = require('pg');
const config = require('./config');

function connectionString() {
  if (config.databaseUrl) return config.databaseUrl;
  try {
    return require('@netlify/database').getConnectionString();
  } catch {
    return 'postgres://cafepos:cafepos@localhost:5432/adminka';
  }
}

// Netlify Server 60 soniya jim turgan ulanishlarni uzadi, shuning uchun idle < 60s
const pool = new Pool({ connectionString: connectionString(), idleTimeoutMillis: 30_000, max: 10 });
pool.on('error', (err) => console.error('PG pool xatosi:', err.message));

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query: (text, params) => pool.query(text, params), withTransaction };
