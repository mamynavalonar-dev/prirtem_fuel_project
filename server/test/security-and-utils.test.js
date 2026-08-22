const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/prirtem_test';
process.env.JWT_SECRET ||= 'test-only-jwt-secret-at-least-32-characters';
process.env.APP_CLIENT_URL ||= 'https://fuel.example.org';

const { passwordSchema } = require('../src/controllers/authController');
const { buildResetLink } = require('../src/utils/mailer');
const { verifyCsrf } = require('../src/middleware/csrf');
const { parseDate, toInt } = require('../src/utils/excel/parseUtils');
const { insertRows } = require('../src/controllers/importController');

test('password policy rejects weak passwords and accepts a strong one', () => {
  assert.equal(passwordSchema.safeParse('weak-password').success, false);
  assert.equal(passwordSchema.safeParse('Correct-Horse-7!').success, true);
});

test('reset link contains only the token and uses the configured origin', () => {
  const link = new URL(buildResetLink('a'.repeat(64)));
  assert.equal(link.origin, new URL(process.env.APP_CLIENT_URL).origin);
  assert.equal(link.pathname, '/reset');
  assert.equal(link.searchParams.get('token'), 'a'.repeat(64));
  assert.equal(link.searchParams.has('email'), false);
});

test('CSRF middleware accepts a matching double-submit token', () => {
  let nextCalled = false;
  const req = {
    method: 'POST',
    cookies: { prirtem_session: 'session', csrf_token: 'token' },
    headers: { 'x-csrf-token': 'token' }
  };
  verifyCsrf(req, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('CSRF middleware rejects a mismatched token', () => {
  let statusCode;
  let payload;
  const res = {
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; }
  };
  verifyCsrf({
    method: 'DELETE',
    cookies: { prirtem_session: 'session', csrf_token: 'token-a' },
    headers: { 'x-csrf-token': 'token-b' }
  }, res, () => {});
  assert.equal(statusCode, 403);
  assert.equal(payload.error, 'CSRF_TOKEN_INVALID');
});

test('Excel parsing keeps dates stable and bounds integers', () => {
  assert.equal(parseDate('31/12/2025'), '2025-12-31');
  assert.equal(parseDate('31/02/2025'), null);
  assert.equal(toInt(2147483648), null);
});

test('bulk insert splits large imports into bounded queries', async () => {
  const calls = [];
  const client = { query: async (sql, values) => { calls.push({ sql, values }); } };
  const rows = Array.from({ length: 401 }, (_, index) => [index, `row-${index}`]);
  await insertRows(client, 'safe_table', ['id', 'label'], rows);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].values.length, 400);
  assert.equal(calls[2].values.length, 2);
});


const { neutralizeCsvFormula, csvEscape, normalizeHttpUrl } = require('../src/utils/security');

test('CSV export neutralizes spreadsheet formula prefixes, including after leading spaces', () => {
  for (const prefix of ['=', '+', '-', '@', '\t', '\r', '\n']) {
    assert.equal(neutralizeCsvFormula(`${prefix}danger`).startsWith("'"), true, `prefix ${JSON.stringify(prefix)}`);
    assert.equal(neutralizeCsvFormula(`   ${prefix}danger`).startsWith("'"), true, `spaced prefix ${JSON.stringify(prefix)}`);
  }
  assert.equal(csvEscape('normal value'), 'normal value');
  assert.equal(csvEscape('a,b'), '"a,b"');
});

test('external URL validation only accepts http and https', () => {
  assert.equal(normalizeHttpUrl('https://example.org/path'), 'https://example.org/path');
  assert.equal(normalizeHttpUrl('http://example.org'), 'http://example.org/');
  for (const value of ['javascript:alert(1)', 'data:text/html,x', 'file:///tmp/a', 'not a url']) {
    assert.equal(normalizeHttpUrl(value), null, value);
  }
});

const { auditedMutation } = require('../src/utils/auditedMutation');

function createMockTransactionClient(mutationRow = { id: 'row-1', requester_id: 'user-1' }) {
  const statements = [];
  const client = {
    released: false,
    async query(sql) {
      const normalized = String(sql).trim();
      statements.push(normalized);
      if (!['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalized)) {
        return { rows: mutationRow ? [mutationRow] : [], rowCount: mutationRow ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() { this.released = true; }
  };
  return { client, statements };
}

test('audited mutation commits only after the required audit succeeds', async () => {
  const { client, statements } = createMockTransactionClient();
  let auditArgs;
  const row = await auditedMutation({
    dbPool: { connect: async () => client },
    sql: 'UPDATE example SET value=1 RETURNING *',
    actorId: 'actor-1',
    action: 'TEST_ACTION',
    targetUserId: (item) => item.requester_id,
    meta: { requestId: 'row-1' },
    writeAudit: async (args) => { auditArgs = args; }
  });

  assert.equal(row.id, 'row-1');
  assert.deepEqual(statements, ['BEGIN', 'UPDATE example SET value=1 RETURNING *', 'COMMIT']);
  assert.equal(auditArgs.db, client);
  assert.equal(auditArgs.required, true);
  assert.equal(auditArgs.targetUserId, 'user-1');
  assert.equal(client.released, true);
});

test('audited mutation rolls back the business change when the audit fails', async () => {
  const { client, statements } = createMockTransactionClient();
  await assert.rejects(
    auditedMutation({
      dbPool: { connect: async () => client },
      sql: 'UPDATE example SET value=1 RETURNING *',
      actorId: 'actor-1',
      action: 'TEST_ACTION',
      writeAudit: async () => { throw new Error('audit unavailable'); }
    }),
    /audit unavailable/
  );

  assert.deepEqual(statements, ['BEGIN', 'UPDATE example SET value=1 RETURNING *', 'ROLLBACK']);
  assert.equal(client.released, true);
});
