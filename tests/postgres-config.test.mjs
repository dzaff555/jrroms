import test from 'node:test';
import assert from 'node:assert/strict';

test('production database connection requires DATABASE_URL even when demo flags are set', async () => {
  process.env.NODE_ENV = 'production';
  delete process.env.DATABASE_URL;
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '1';
  process.env.DB_USER = 'test';
  process.env.DB_PASSWORD = '';
  process.env.DB_NAME = 'test';
  process.env.USE_LOCAL_DATA = 'true';
  process.env.NO_DATABASE = 'true';

  const { getDbPool, testConnection } = await import('../src/lib/database/db.ts');

  try {
    const connection = await testConnection();
    assert.equal(connection.connected, false);
    assert.match(connection.error, /Production requires DATABASE_URL/);
  } finally {
    await getDbPool().end();
  }
});
