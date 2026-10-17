// Base para los tests: esquema "test" (DB_SCHEMA) que se borra y recrea en cada archivo.
// No toca los datos de desarrollo. Los archivos corren de a uno (--test-concurrency=1).
import { before, after } from 'node:test';
import { pool, iniciarDb } from './db.js';

before(async () => {
  if (process.env.DB_SCHEMA !== 'test') throw new Error('Los tests corren con DB_SCHEMA=test (npm test)');
  await pool.query('DROP SCHEMA IF EXISTS test CASCADE; CREATE SCHEMA test');
  await iniciarDb();
});
after(() => pool.end());
