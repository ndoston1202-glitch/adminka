// Netlify Server kirish nuqtasi.
// Ilova build paytida bitta faylga (dist/app.cjs) yig'iladi va shu yerdan ishga tushiriladi:
// Express o'zi PORT'ni tinglaydi.
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const { start } = require(path.join(root, 'dist', 'app.cjs'));

await start({ root, port: Number(process.env.PORT) || 3000 });

export const config = {
  path: '/*',
  includedFiles: ['../../dist/**', '../../src/views/**', '../../public/**'],
};
