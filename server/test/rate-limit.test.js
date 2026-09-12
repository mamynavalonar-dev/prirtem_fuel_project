const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PostgresRateLimitStore, usePostgresRateLimits } = require('../src/utils/postgresRateLimitStore');

test('serverless deployments share counters and local development remains self-contained', () => {
  assert.equal(usePostgresRateLimits({ VERCEL: '1' }), true);
  assert.equal(usePostgresRateLimits({ SERVERLESS: 'true' }), true);
  assert.equal(usePostgresRateLimits({}), false);
  assert.equal(usePostgresRateLimits({ RATE_LIMIT_STORE: 'postgres' }), true);
  assert.throws(() => usePostgresRateLimits({ RATE_LIMIT_STORE: 'typo' }));
});

test('counter namespaces cannot collide and do not retain plain client addresses', () => {
  const api = new PostgresRateLimitStore(null, 'api');
  const login = new PostgresRateLimitStore(null, 'login');
  assert.notEqual(api.storageKey('192.0.2.1'), login.storageKey('192.0.2.1'));
  assert.match(api.storageKey('192.0.2.1'), /^[a-f0-9]{64}$/);
  assert.equal(api.storageKey('192.0.2.1'), new PostgresRateLimitStore(null, 'api').storageKey('192.0.2.1'));
});

test('database failures do not silently disable the rate limit', async () => {
  const store = new PostgresRateLimitStore({ query: async () => { throw new Error('db unavailable'); } }, 'test');
  store.init({ windowMs: 60_000 });
  await assert.rejects(store.increment('client'), /db unavailable/);
});

test('separate instances share atomic counters, preserve windows and expire correctly', {
  skip: process.env.RUN_DB_TESTS !== 'true'
}, async (t) => {
  const databaseUrl = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(databaseUrl.hostname), 'DB tests require local PostgreSQL');
  assert.match(databaseUrl.pathname, /test/i, 'DB tests require a dedicated test database');
  const { createPool } = require('../src/db');
  const pool = createPool(process.env.DATABASE_URL, { max: 5 });
  const namespace = `test-${randomUUID()}`;
  const first = new PostgresRateLimitStore(pool, namespace);
  const second = new PostgresRateLimitStore(pool, namespace);
  const other = new PostgresRateLimitStore(pool, `${namespace}-other`);
  for (const store of [first, second, other]) store.init({ windowMs: 60_000 });
  t.after(async () => {
    await Promise.all([first.resetKey('client'), other.resetKey('client')]);
    await pool.end();
  });

  const hits = await Promise.all(Array.from({ length: 20 }, (_, index) =>
    (index % 2 ? first : second).increment('client')));
  assert.deepEqual(hits.map((hit) => hit.totalHits).sort((a, b) => a - b), Array.from({ length: 20 }, (_, index) => index + 1));
  assert.equal(new Set(hits.map((hit) => hit.resetTime.getTime())).size, 1);
  assert.equal((await other.increment('client')).totalHits, 1);
  await first.decrement('client');
  assert.equal((await second.increment('client')).totalHits, 20);

  await pool.query("UPDATE public.api_rate_limits SET reset_at=now()-interval '1 second' WHERE key=$1", [first.storageKey('client')]);
  const renewed = await second.increment('client');
  assert.equal(renewed.totalHits, 1);
  assert.ok(renewed.resetTime > new Date());
  await first.resetKey('client');
  assert.equal((await second.increment('client')).totalHits, 1);
});
