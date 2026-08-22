const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEMO_ROLES,
  getDemoUsername,
  isDemoMode,
  isDemoUsername,
  isDemoUser
} = require('../src/utils/demoMode');
const { blockDemoSensitiveMutation } = require('../src/middleware/demo');
const { getImportLimits } = require('../src/utils/importLimits');

test('demo mode exposes only the three public workflow roles', () => {
  assert.deepEqual(DEMO_ROLES, ['DEMANDEUR', 'LOGISTIQUE', 'RAF']);
  assert.equal(getDemoUsername('DEMANDEUR'), 'demo.demandeur');
  assert.equal(getDemoUsername('LOGISTIQUE'), 'demo.logistique');
  assert.equal(getDemoUsername('RAF'), 'demo.raf');
  assert.equal(getDemoUsername('ADMIN'), null);
});

test('demo users are identified by exact reserved usernames', () => {
  assert.equal(isDemoUsername('demo.demandeur'), true);
  assert.equal(isDemoUsername('DEMO.LOGISTIQUE'), true);
  assert.equal(isDemoUser({ username: 'demo.raf' }), true);
  assert.equal(isDemoUsername('demo.admin'), false);
  assert.equal(isDemoUsername('real-user'), false);
});

test('demo mode flag is explicit', () => {
  const previous = process.env.DEMO_MODE;
  process.env.DEMO_MODE = 'true';
  assert.equal(isDemoMode(), true);
  process.env.DEMO_MODE = 'false';
  assert.equal(isDemoMode(), false);
  if (previous === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = previous;
});

test('sensitive mutations are blocked for a demo account only in demo mode', () => {
  const previous = process.env.DEMO_MODE;
  process.env.DEMO_MODE = 'true';

  let nextCalled = false;
  let statusCode;
  let payload;
  const res = {
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; }
  };

  blockDemoSensitiveMutation(
    { user: { username: 'demo.logistique' } },
    res,
    () => { nextCalled = true; }
  );

  assert.equal(nextCalled, false);
  assert.equal(statusCode, 403);
  assert.equal(payload.error, 'DEMO_SENSITIVE_ACTION_DISABLED');

  process.env.DEMO_MODE = 'false';
  blockDemoSensitiveMutation(
    { user: { username: 'demo.logistique' } },
    res,
    () => { nextCalled = true; }
  );
  assert.equal(nextCalled, true);

  if (previous === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = previous;
});

test('Vercel import limits stay below the 4.5 MB function request ceiling', () => {
  const limits = getImportLimits({
    VERCEL: '1',
    DEMO_MODE: 'true',
    IMPORT_MAX_FILE_SIZE_MB: '99',
    IMPORT_MAX_FILES: '99'
  });

  assert.equal(limits.maxFileSizeMb, 3);
  assert.equal(limits.maxFiles, 1);
  assert.equal(limits.maxFileSizeBytes, 3 * 1024 * 1024);
});

test('non-serverless deployments keep the existing 5 MB / 5 file defaults', () => {
  const limits = getImportLimits({});
  assert.equal(limits.maxFileSizeMb, 5);
  assert.equal(limits.maxFiles, 5);
});
