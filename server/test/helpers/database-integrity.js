const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fuel = require('../../src/controllers/fuelRequestsController');
const car = require('../../src/controllers/carRequestsController');
const trash = require('../../src/controllers/trashController');

function invoke(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body }); return this; }
    };
    Promise.resolve(handler({ params: {}, query: {}, body: {}, ...req }, res, reject)).catch(reject);
  });
}

async function runIntegrityScenarios(t, pool) {
  const users = {};
  for (const role of ['DEMANDEUR', 'LOGISTIQUE', 'RAF', 'ADMIN']) {
    users[role] = { id: randomUUID(), role };
    await pool.query(`INSERT INTO users(id, first_name, last_name, username, email, role, password_hash)
      VALUES ($1::uuid, 'Test', 'Integrity', $1::text, $1::text || '@example.test', $2, 'test-only')`, [users[role].id, role]);
  }
  const driverId = randomUUID();
  const vehicleId = randomUUID();
  await pool.query('INSERT INTO drivers(id, full_name) VALUES ($1, $2)', [driverId, 'Test driver']);
  await pool.query('INSERT INTO vehicles(id, plate) VALUES ($1, $2)', [vehicleId, `TEST-${vehicleId}`]);
  let seq = 0;
  async function insertRequest(table, status, deleted, overrides = {}) {
    const id = randomUUID();
    const no = `TEST-${id}`;
    const year = 9000 + Math.floor(Math.random() * 1000);
    if (table === 'fuel_requests') {
      await pool.query(`INSERT INTO fuel_requests(id, year, seq, request_no, request_type, objet,
        amount_estimated_ar, amount_estimated_words, request_date, end_date, status, requester_id, verified_by, deleted_at, created_at)
        VALUES ($1,$2,$3,$4,'MISSION',$5,100,'cent','2026-09-11','2026-09-11',$6,$7,$8,$9, $10)`,
      [id, year, ++seq, no, overrides.objet || 'Mission de test', status, overrides.requesterId || users.DEMANDEUR.id,
        users.LOGISTIQUE.id, deleted ? new Date() : null, overrides.createdAt || new Date()]);
    } else {
      await pool.query(`INSERT INTO car_requests(id, year, seq, request_no, proposed_date, end_date, objet,
        itinerary, people, status, requester_id, logistics_by, deleted_at)
        VALUES ($1,$2,$3,$4,'2026-09-11','2026-09-11','Mission de test','A vers B','Test',$5,$6,$7,$8)`,
      [id, year, ++seq, no, status, users.DEMANDEUR.id, users.LOGISTIQUE.id, deleted ? new Date() : null]);
    }
    return id;
  }

  const transitions = [
    ['fuel_requests', fuel.submit, 'DRAFT', 'DEMANDEUR', 'SUBMITTED'],
    ['fuel_requests', fuel.submit, 'REJECTED', 'DEMANDEUR', 'SUBMITTED'],
    ['fuel_requests', fuel.verify, 'SUBMITTED', 'LOGISTIQUE', 'VERIFIED'],
    ['fuel_requests', fuel.approve, 'VERIFIED', 'RAF', 'APPROVED'],
    ['fuel_requests', fuel.reject, 'SUBMITTED', 'LOGISTIQUE', 'REJECTED'],
    ['fuel_requests', fuel.reject, 'VERIFIED', 'RAF', 'REJECTED'],
    ['fuel_requests', fuel.cancel, 'SUBMITTED', 'DEMANDEUR', 'CANCELLED'],
    ['fuel_requests', fuel.cancel, 'VERIFIED', 'DEMANDEUR', 'CANCELLED'],
    ['car_requests', car.logisticsApprove, 'SUBMITTED', 'LOGISTIQUE', 'LOGISTICS_APPROVED'],
    ['car_requests', car.rafApprove, 'LOGISTICS_APPROVED', 'RAF', 'RAF_APPROVED'],
    ['car_requests', car.reject, 'SUBMITTED', 'LOGISTIQUE', 'REJECTED'],
    ['car_requests', car.reject, 'LOGISTICS_APPROVED', 'RAF', 'REJECTED'],
    ['car_requests', car.cancel, 'SUBMITTED', 'DEMANDEUR', 'CANCELLED'],
    ['car_requests', car.cancel, 'LOGISTICS_APPROVED', 'DEMANDEUR', 'CANCELLED']
  ];
  for (const [table, handler, initial, role, expected] of transitions) {
    await t.test(`${table} ${handler.name} ${initial}: active succeeds and deleted stays unchanged`, async () => {
      for (const deleted of [false, true]) {
        const id = await insertRequest(table, initial, deleted);
        const response = await invoke(handler, { params: { id }, user: users[role],
          body: { reason: 'Test reason', vehicle_id: vehicleId, driver_id: driverId } });
        assert.equal(response.status, deleted ? 404 : 200);
        const current = await pool.query(`SELECT status, deleted_at FROM ${table} WHERE id=$1`, [id]);
        assert.equal(current.rows[0].status, deleted ? initial : expected);
        const audits = await pool.query("SELECT count(*)::int AS count FROM admin_audit_logs WHERE meta->>'requestId'=$1", [id]);
        assert.equal(audits.rows[0].count, deleted ? 0 : 1);
      }
    });
  }

  await t.test('global search and pagination share ownership/status filters and stable ordering', async () => {
    const unique = `Pagination-${randomUUID()}`;
    const expected = [];
    for (let index = 0; index < 55; index++) {
      expected.push(await insertRequest('fuel_requests', 'SUBMITTED', false, { objet: unique, createdAt: '2026-09-11T00:00:00Z' }));
    }
    await insertRequest('fuel_requests', 'SUBMITTED', true, { objet: unique });
    await insertRequest('fuel_requests', 'VERIFIED', false, { objet: unique });
    await insertRequest('fuel_requests', 'SUBMITTED', false, { objet: unique, requesterId: users.ADMIN.id });
    const ids = [];
    for (const page of [1, 2]) {
      const response = await invoke(fuel.list, { user: users.DEMANDEUR, query: { page, limit: 50, status: 'SUBMITTED', q: unique } });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.pagination, { page, limit: 50, total: 55, pages: 2 });
      ids.push(...response.body.requests.map((row) => row.id));
    }
    assert.deepEqual(ids, expected.sort().reverse());
    const special = `literal-%_\\-${randomUUID()}`;
    const literalId = await insertRequest('fuel_requests', 'SUBMITTED', false, { objet: special });
    const literalResponse = await invoke(fuel.list, { user: users.DEMANDEUR, query: { q: special } });
    assert.deepEqual(literalResponse.body.requests.map((row) => row.id), [literalId]);
  });

  for (const handlerName of ['hardDelete', 'hardDeleteMany', 'purgeAll']) {
    await t.test(`trash ${handlerName} preserves vehicle history and rolls back the whole selection`, async () => {
      const linkedId = randomUUID();
      const freeId = randomUUID();
      const logId = randomUUID();
      await pool.query(`INSERT INTO vehicles(id, plate, deleted_at) VALUES ($1::uuid,$1::text,now()), ($2::uuid,$2::text,now())`, [linkedId, freeId]);
      await pool.query(`INSERT INTO vehicle_fuel_logs(id, vehicle_id, source_file_name, sheet_name, row_in_sheet)
        VALUES ($1,$2,'manual','manual',1)`, [logId, linkedId]);
      const response = await invoke(trash[handlerName], { user: users.ADMIN,
        params: { entity: 'vehicles', id: linkedId }, body: { ids: [freeId, linkedId] } });
      assert.equal(response.status, 409);
      assert.equal(response.body.error, 'DEPENDENT_RECORDS');
      assert.equal((await pool.query('SELECT id FROM vehicles WHERE id=ANY($1::uuid[])', [[linkedId, freeId]])).rowCount, 2);
      assert.equal((await pool.query('SELECT id FROM vehicle_fuel_logs WHERE id=$1', [logId])).rowCount, 1);
      await assert.rejects(pool.query('DELETE FROM vehicles WHERE id=$1', [linkedId]), (error) => ['23503', '23001'].includes(error.code));
      // Even a log in the trash must not disappear as an implicit side effect.
      await pool.query('UPDATE vehicle_fuel_logs SET deleted_at=now() WHERE id=$1', [logId]);
      const stillBlocked = await invoke(trash[handlerName], { user: users.ADMIN,
        params: { entity: 'vehicles', id: linkedId }, body: { ids: [freeId, linkedId] } });
      assert.equal(stillBlocked.status, 409);
      await pool.query('DELETE FROM vehicle_fuel_logs WHERE id=$1', [logId]);
      const success = await invoke(trash[handlerName], { user: users.ADMIN,
        params: { entity: 'vehicles', id: linkedId }, body: { ids: [freeId, linkedId] } });
      assert.equal(success.status, 200);
      await pool.query('DELETE FROM vehicles WHERE id=ANY($1::uuid[])', [[freeId, linkedId]]);
    });
  }

  await t.test('RLS denies browser roles even if a SELECT grant is accidentally reintroduced', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('GRANT USAGE ON SCHEMA public TO anon');
      await client.query('GRANT SELECT ON users TO anon');
      await client.query('SET LOCAL ROLE anon');
      assert.equal((await client.query('SELECT id FROM users')).rowCount, 0);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
}

module.exports = { runIntegrityScenarios };
