// Netlify Server kirish nuqtasi: Express ilovasi o'zi ishga tushadi va PORT'ni tinglaydi.
import path from 'node:path';
import { onShutdown } from '@netlify/server';
import server from '../../src/server.js';
import db from '../../src/db.js';

const { start } = server;

const root = path.resolve(import.meta.dirname, '../..');
await start({ root, port: Number(process.env.PORT) || 3000 });

onShutdown(async ({ drained }) => {
  await drained;
  await db.pool.end();
});

export const config = {
  path: '/*',
  includedFiles: ['../../src/**', '../../public/**'],
};
