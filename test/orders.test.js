import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { api } from '../worker/api.js';
import { localDb } from '../scripts/local-db.mjs';

test('table checkout verifies the payment before exposing an order to staff', async t => {
  const DB = localDb();
  t.after(() => DB.close());
  const env = { DB };
  const key = 'sk_live_mockForTests';
  let initialized;
  let amount = 1;
  let success = false;
  let inits = 0;
  t.mock.method(globalThis, 'fetch', async (endpoint, options) => {
    assert.equal(options.headers.Authorization, 'Bearer ' + key);
    const url = new URL(endpoint);
    assert.equal(url.origin, 'https://api.paystack.co');
    if (url.pathname.endsWith('/initialize')) {
      initialized = JSON.parse(options.body);
      ++inits;
      return Response.json({ status:true, data:{ authorization_url:'https://checkout.paystack.com/testing' } });
    }
    assert.match(url.pathname, /\/verify\/served-/);
    return Response.json({ status:true, data:{ reference:initialized.reference, status:success ? 'success' : 'pending', amount, currency:'ZAR' } });
  });
  async function send(path, method = 'GET', body, credential, headers = {}) {
    const res = await api(new Request('https://served.example/api/' + path, {
      method, headers:{ ...(body ? { 'Content-Type':'application/json' } : {}), ...(credential ? { Authorization:'Bearer ' + credential } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    }), env);
    return [res.status, await res.json()];
  }
  const [, { venue, staffToken }] = await send('venues', 'POST', { name:'Test cafe' });
  const staff = 'ordering/' + venue.id;
  assert.equal((await send(staff))[0], 401);
  const [, table] = await send(staff + '/table', 'POST', { label:'Table 5' }, staffToken);
  const [, item] = await send(staff + '/menu', 'POST', { name:'Chips', description:'With salt', price:4000, available:true }, staffToken);
  const menu = 'menus/' + table.id;
  assert.equal((await send(menu))[1].payment_available, false);
  const [, account] = await send('guests/signup', 'POST', { name:'Test Guest', email:'guest@example.com', password:'Testing42!' });
  assert.equal((await send(menu + '/visit', 'POST', {}, account.token))[0], 200);
  assert.equal((await send('orders/shops', 'GET', undefined, account.token))[1][0].id, venue.id);
  const id = randomUUID().replaceAll('-', '');
  const cart = { id, quantities:{ [item.id]:2 }, expected_total:8000 };
  assert.equal((await send(menu + '/checkout', 'POST', cart, account.token))[0], 503);
  env.PAYSTACK_VENUES = JSON.stringify({ [venue.id]:key });
  assert.equal((await send(menu + '/checkout', 'POST', { ...cart, expected_total:1 }, account.token))[0], 409);
  const [status, pending] = await send(menu + '/checkout', 'POST', cart, account.token);
  assert.equal(status, 201);
  assert.equal(initialized.amount, 8000);
  assert.equal(initialized.currency, 'ZAR');
  assert.match(initialized.callback_url, new RegExp(id));
  assert.equal(pending.status, 'pending');
  assert.equal(pending.table_label, 'Table 5');
  assert.equal(pending.guest_name, 'Test Guest');
  assert.equal(pending.email, undefined);
  assert.equal((await send(menu + '/checkout', 'POST', cart, account.token))[1].id, id);
  assert.equal(inits, 1);
  assert.deepEqual((await send(staff, 'GET', undefined, staffToken))[1].orders, []);
  assert.equal((await send(staff + '/order', 'PATCH', { id, status:'preparing' }, staffToken))[0], 409);

  success = true;
  assert.equal((await send('orders/' + id + '/verify', 'POST', {}))[1].status, 'pending');
  amount = 8000;
  const webhook = { event:'charge.success', data:{ reference:initialized.reference } };
  assert.equal((await send('paystack/webhook', 'POST', webhook, undefined, { 'x-paystack-signature':'1'.repeat(128) }))[0], 401);
  const signature = createHmac('sha512', key).update(JSON.stringify(webhook)).digest('hex');
  assert.equal((await send('paystack/webhook', 'POST', webhook, undefined, { 'x-paystack-signature':signature }))[0], 200);
  assert.equal((await send(staff, 'GET', undefined, staffToken))[1].orders[0].status, 'paid');
  assert.equal((await send('orders/' + id + '/received', 'POST', {}))[0], 409);
  for (const next of ['preparing', 'ready']) {
    assert.equal((await send(staff + '/order', 'PATCH', { id, status:next }, staffToken))[0], 200);
    assert.equal((await send('orders/' + id))[1].status, next);
  }
  assert.equal((await send('orders/' + id + '/received', 'POST', {}))[1].status, 'delivered');
  assert.equal((await send(staff + '/order', 'PATCH', { id, status:'delivered' }, staffToken))[0], 200);
  assert.equal((await send('orders', 'GET', undefined, account.token))[1][0].status, 'delivered');
});
