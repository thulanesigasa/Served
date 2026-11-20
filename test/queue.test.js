import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../worker/api.js';
import { localDb } from '../scripts/local-db.mjs';

test('guest tickets are idempotent and receive staff-only state changes', async () => {
  const db = localDb();
  const send = async (path, method = 'GET', data, token) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await api(new Request('https://served.example/api/' + path, {
      method, headers, body: data ? JSON.stringify(data) : undefined,
    }), { DB: db });
    return { status: response.status, body: await response.json() };
  };
  try {
    const result = await send('venues', 'POST', { name: 'Corner Café' });
    assert.equal(result.status, 201);
    const { venue, staffToken } = result.body;
    const path = 'venues/' + venue.id;
    const queue = path + '/queue';
    assert.deepEqual((await send(path)).body, venue);
    assert.equal((await send(queue)).status, 401);
    const first = { id: '1'.repeat(32), name: 'Maya', kind: 'table', size: 2 };
    const second = { ...first, id: '2'.repeat(32), name: 'Liam' };
    const pickup = { ...first, id: '3'.repeat(32), name: 'Order 15', kind: 'order' };
    assert.equal((await send(path + '/join', 'POST', first)).body.position, 1);
    assert.equal((await send(path + '/join', 'POST', second)).body.position, 2);
    assert.equal((await send(path + '/join', 'POST', pickup)).body.position, 1);
    await send(path + '/join', 'POST', second);
    assert.equal((await send(queue, 'GET', null, staffToken)).body.length, 3);
    assert.equal((await send(queue, 'PATCH', { id: first.id, status: 'ready' })).status, 401);
    assert.equal((await send(queue, 'PATCH', { id: first.id, status: 'done' }, staffToken)).status, 409);
    assert.equal((await send(queue, 'PATCH', { id: first.id, status: 'ready' }, staffToken)).body.status, 'ready');
    assert.equal((await send('tickets/' + first.id)).body.status, 'ready');
    assert.equal((await send('tickets/' + second.id)).body.position, 1);
    assert.equal((await send(queue, 'PATCH', { id: first.id, status: 'done' }, staffToken)).body.status, 'done');
    assert.equal((await send(queue, 'PATCH', { id: second.id, status: 'cancelled' }, staffToken)).body.status, 'cancelled');
    assert.equal((await send('tickets/' + second.id)).body.status, 'cancelled');
  } finally {
    db.close();
  }
});
