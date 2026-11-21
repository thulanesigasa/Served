import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guestOrdering } from '../web/ordering.js';

test('confirmed demo ticket survives refresh and is available in History', async t => {
  const storage = new Map();
  const location = new URL('https://served.test/?demo-menu=1');
  t.mock.method(globalThis, 'setInterval', () => {});
  const globals = {
    location,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    window: { scrollTo() {} },
    history: { replaceState: (_state, _title, next) => { location.href = next; } },
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable:true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    });
  }

  function openPage() {
    let click;
    const app = {
      innerHTML:'',
      addEventListener: (type, callback) => { if (type === 'click') click = callback; },
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    guestOrdering(app, location.searchParams);
    return {
      app,
      click: (orderAction, value) => click({ target:{ closest: () => ({ dataset:{ orderAction, value } }) } }),
    };
  }

  const first = openPage();
  await first.click('plus', 'burger');
  await first.click('demo-cart');
  await first.click('demo-payment');
  assert.doesNotMatch(first.app.innerHTML, /Ticket #[A-F0-9]+/);
  await first.click('demo-place');
  const [ticket] = JSON.parse(storage.get('served.demoOrders'));
  const ticketNumber = new RegExp('Ticket #' + ticket.number);
  assert.match(first.app.innerHTML, ticketNumber);
  assert.equal(location.searchParams.get('demo-ticket'), ticket.id);

  const refreshed = openPage();
  assert.match(refreshed.app.innerHTML, ticketNumber);
  await refreshed.click('demo-return');
  assert.equal(location.searchParams.has('demo-ticket'), false);
  assert.match(refreshed.app.innerHTML, /Demo menu/);

  await refreshed.click('tab', 'history');
  assert.match(refreshed.app.innerHTML, /Demo tickets/);
  assert.match(refreshed.app.innerHTML, ticketNumber);
  await refreshed.click('open-demo-ticket', ticket.id);
  assert.match(refreshed.app.innerHTML, ticketNumber);
  assert.match(refreshed.app.innerHTML, /Double Smash Burger/);
});
