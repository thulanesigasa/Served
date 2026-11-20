import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../worker/api.js';
import { localDb } from '../scripts/local-db.mjs';

test('guest accounts can sign up, resume a session, sign in and revoke a session', async () => {
  const db = localDb();
  const send = async (action, method = 'GET', data, token) => {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (token) headers.set('Authorization', 'Bearer ' + token);
    const response = await api(new Request('https://served.example/api/guests/' + action, {
      method, headers, body: data && JSON.stringify(data),
    }), { DB: db });
    return { status: response.status, body: await response.json() };
  };
  try {
    const credentials = { name: 'Test Guest', email: 'Guest@example.com', password: 'TestPass12!' };
    assert.equal((await send('session')).status, 401);
    assert.equal((await send('signup', 'POST', { ...credentials, password: 'testpass' })).status, 400);
    const created = await send('signup', 'POST', credentials);
    assert.equal(created.status, 201);
    assert.match(created.body.token, /^[a-f0-9]{64}$/);
    assert.equal(created.body.guest.email, 'guest@example.com');
    assert.equal((await send('signup', 'POST', credentials)).status, 409);
    assert.equal((await send('login', 'POST', { ...credentials, password: 'Invalid1!' })).status, 401);
    const login = await send('login', 'POST', credentials);
    assert.equal(login.status, 200);
    assert.notEqual(login.body.token, created.body.token);
    assert.deepEqual((await send('session', 'GET', undefined, login.body.token)).body.guest, created.body.guest);
    assert.equal((await send('logout', 'POST', {}, login.body.token)).status, 200);
    assert.equal((await send('session', 'GET', undefined, login.body.token)).status, 401);
    assert.equal((await send('session', 'GET', undefined, created.body.token)).status, 200);
  } finally {
    db.close();
  }
});
