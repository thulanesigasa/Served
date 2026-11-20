import { digest, guestAuth } from './guests.js';

const uuid = () => crypto.randomUUID().replaceAll('-', '');
const validId = value => /^[a-f0-9]{32}$/.test(value ?? '');
const clean = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
const out = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const error = (message, status) => out({ error: message }, status);
const reference = orderId => 'served-' + orderId;

function merchant(env, venueId) {
  try {
    const key = JSON.parse(env.PAYSTACK_VENUES || '{}')[venueId];
    return /^sk_live_[a-z0-9]+$/i.test(key ?? '') ? key : null;
  } catch {
    return null;
  }
}

async function paystack(key, path, data) {
  const res = await fetch('https://api.paystack.co/transaction/' + path, {
    method: data ? 'POST' : 'GET',
    signal: AbortSignal.timeout(15_000),
    headers: { Authorization: 'Bearer ' + key, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    body: data ? JSON.stringify(data) : undefined,
  });
  const body = await res.json().catch(() => null);
  return res.ok && body?.status === true ? body.data : null;
}

function orderView({ email, guest_id, items, initializing_at, payment_url, ...order }) {
  return { ...order, items: JSON.parse(items), ...(order.status === 'pending' && payment_url ? { payment_url } : {}) };
}

function readOrder(db, id) {
  return db(`SELECT o.*, v.name AS venue_name, t.label AS table_label FROM food_orders o
             JOIN venues v ON v.id = o.venue_id JOIN dining_tables t ON t.id = o.table_id WHERE o.id = ?`, id).first();
}

async function confirmPayment(env, db, order) {
  if (order.status !== 'pending') return order;
  const key = merchant(env, order.venue_id);
  if (!key) return order;
  const verified = await paystack(key, 'verify/' + reference(order.id));
  if (verified?.status !== 'success' || verified.reference !== reference(order.id) ||
      verified.currency !== 'ZAR' || verified.amount !== order.total) return order;
  await db("UPDATE food_orders SET status = 'paid', updated_at = ? WHERE id = ? AND status = 'pending'", Date.now(), order.id).run();
  return readOrder(db, order.id);
}

const HOLD_MS = 30 * 60_000;
const activeOrder = table => `EXISTS (
  SELECT 1 FROM food_orders o WHERE o.table_id = ${table} AND o.status IN ('paid','preparing','ready')
)`;

async function reservationHolder(request, db, input) {
  if (request.headers.has('authorization')) {
    const session = await guestAuth(new Request(request.url, { headers: request.headers }), db, 'session');
    return session.status === 200 ? { holder: await digest('guest:' + session.body.guest.id), guest: session.body.guest } : null;
  }
  return validId(input.holder) ? { holder: await digest('browser:' + input.holder) } : null;
}

function holdTable(db, tableId, holder, now = Date.now()) {
  return db(`INSERT INTO table_reservations (table_id, holder_hash, expires_at)
    SELECT ?, ?, ? WHERE NOT ${activeOrder('?')}
    ON CONFLICT(table_id) DO UPDATE SET holder_hash = excluded.holder_hash, expires_at = excluded.expires_at
    WHERE table_reservations.expires_at <= ? OR table_reservations.holder_hash = excluded.holder_hash
    RETURNING expires_at`, tableId, holder, now + HOLD_MS, tableId, now).first();
}

const tableBusy = () => error('This table is already reserved. Choose another available table and scan its QR code.', 409);

async function checkout(request, env, db, table, input) {
  const { id, quantities } = input;
  if (!validId(id) || !quantities || typeof quantities !== 'object' || Array.isArray(quantities)) {
    return error('Your cart is invalid. Reopen the menu.', 400);
  }
  const key = merchant(env, table.venue_id);
  if (!key) return error('Online payment is not available at this restaurant yet.', 503);

  const identity = await reservationHolder(request, db, input);
  if (!identity) return error('Reopen the table menu or sign in again to place this order.', 401);
  const account = identity.guest;
  const guestName = account?.name || clean(input.name);
  const email = account?.email || clean(input.email).toLowerCase();
  if (!guestName || guestName.length > 45 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return error('Enter your name and a valid email for checkout.', 400);
  }

  let order = await readOrder(db, id);
  if (!order) {
    const selection = Object.entries(quantities);
    if (!selection.length || selection.length > 25 || selection.some(([item, qty]) =>
      !validId(item) || !Number.isInteger(qty) || qty < 1 || qty > 20)) return error('Choose valid quantities before checking out.', 400);
    const ids = selection.map(([item]) => item);
    const { results: products } = await db(
      `SELECT id, name, price FROM menu_items WHERE venue_id = ? AND available = 1 AND id IN (${ids.map(() => '?').join(',')})`,
      table.venue_id, ...ids).all();
    if (products.length !== ids.length) return error('An item is no longer available. Refresh the menu and try again.', 409);
    const items = products.map(product => ({ ...product, quantity: quantities[product.id] }));
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (input.expected_total !== total) return error('The menu price changed. Refresh the menu before paying.', 409);
    const now = Date.now();
    if (!await holdTable(db, table.id, identity.holder, now)) return tableBusy();
    await db(`INSERT INTO food_orders (id, venue_id, table_id, guest_id, guest_name, email, items, total, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?) ON CONFLICT(id) DO NOTHING`,
      id, table.venue_id, table.id, account?.id ?? null, guestName, email, JSON.stringify(items), total, now, now).run();
    order = await readOrder(db, id);
  }
  if (order.table_id !== table.id || order.guest_id !== (account?.id ?? null) || order.email !== email) return error('This checkout is unavailable.', 404);
  if (order.payment_url || order.status !== 'pending') return out(orderView(order));
  const now = Date.now();
  const lock = await db(`UPDATE food_orders SET initializing_at = ? WHERE id = ? AND payment_url IS NULL
    AND (initializing_at IS NULL OR initializing_at < ?) RETURNING id`, now, id, now - 60_000).first();
  if (!lock) return error('Checkout is opening. Try again in a moment.', 409);
  try {
    const callback = new URL('/', request.url);
    callback.searchParams.set('order', id);
    callback.searchParams.set('payment', 'return');
    const payment = await paystack(key, 'initialize', {
      email: order.email, amount: order.total, currency: 'ZAR', reference: reference(id),
      callback_url: callback.href,
    });
    const url = payment?.authorization_url ? new URL(payment.authorization_url) : null;
    if (!url || url.origin !== 'https://checkout.paystack.com') return error('Checkout could not open. Try again shortly.', 502);
    await db('UPDATE food_orders SET payment_url = ? WHERE id = ?', url.href, id).run();
    return out(orderView(await readOrder(db, id)), 201);
  } finally {
    await db('UPDATE food_orders SET initializing_at = NULL WHERE id = ? AND initializing_at = ?', id, now).run();
  }
}

async function webhook(request, env, db) {
  const signature = request.headers.get('x-paystack-signature');
  if (!/^[a-f0-9]{128}$/.test(signature ?? '')) return error('Invalid webhook signature.', 401);
  const reader = request.body?.getReader();
  if (!reader) return error('Invalid webhook.', 400);
  const contents = new Uint8Array(65_536);
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.byteLength > contents.length) {
      await reader.cancel();
      return error('Webhook too large.', 413);
    }
    contents.set(value, size);
    size += value.byteLength;
  }
  const raw = contents.subarray(0, size);
  let event;
  try { event = JSON.parse(new TextDecoder().decode(raw)); }
  catch { return error('Invalid webhook.', 400); }
  const id = event?.data?.reference?.match(/^served-([a-f0-9]{32})$/)?.[1];
  if (event?.event !== 'charge.success' || !id) return out({ ok: true });
  const order = await readOrder(db, id);
  const key = order && merchant(env, order.venue_id);
  if (!key) return error('Invalid webhook signature.', 401);
  const hmac = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-512' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', hmac, Uint8Array.from(signature.match(/../g), hex => parseInt(hex, 16)), raw);
  if (!valid) return error('Invalid webhook signature.', 401);
  const current = await confirmPayment(env, db, order);
  if (current.status === 'pending') return error('Payment verification is pending.', 502);
  return out({ ok: true });
}

function menuItems(db, venueId) {
  return db('SELECT id, name, description, price, category FROM menu_items WHERE venue_id = ? AND available = 1 ORDER BY name', venueId).all();
}

export async function ordering(request, env, db, section, id, action, data) {
  const method = request.method;
  if (section === 'paystack' && id === 'webhook' && !action && method === 'POST') return webhook(request, env, db);
  if (section === 'orders' && (!id || id === 'shops') && !action && method === 'GET') {
    const session = await guestAuth(request, db, 'session');
    if (session.status !== 200) return out(session.body, session.status);
    if (id === 'shops') {
      const { results } = await db(`SELECT v.id, v.name, s.visited_at AS date FROM shop_visits s
        JOIN venues v ON v.id = s.venue_id WHERE s.guest_id = ? ORDER BY s.visited_at DESC LIMIT 100`, session.body.guest.id).all();
      return out(results);
    }
    const { results } = await db(`SELECT o.*, v.name AS venue_name, t.label AS table_label FROM food_orders o
      JOIN venues v ON v.id = o.venue_id JOIN dining_tables t ON t.id = o.table_id
      WHERE o.guest_id = ? ORDER BY o.number DESC LIMIT 100`, session.body.guest.id).all();
    return out(results.map(orderView));
  }
  if (!validId(id)) return error('This link is unavailable.', 404);
  if (section === 'menus') {
    const table = await db(`SELECT t.*, v.name AS venue_name FROM dining_tables t JOIN venues v ON v.id = t.venue_id WHERE t.id = ?`, id).first();
    if (!table && !action && method === 'GET') {
      const venue = await db('SELECT id, name FROM venues WHERE id = ?', id).first();
      if (!venue) return error('Menu unavailable. Ask the restaurant for its QR code.', 404);
      const [items, tables] = await Promise.all([
        menuItems(db, id),
        db(`SELECT t.id, t.label FROM dining_tables t
          WHERE t.venue_id = ? AND NOT ${activeOrder('t.id')}
          AND NOT EXISTS (SELECT 1 FROM table_reservations r WHERE r.table_id = t.id AND r.expires_at > ?)
          ORDER BY t.label`, id, Date.now()).all(),
      ]);
      return out({ id, venue_id:id, venue_name:venue.name, general:true, items:items.results,
        tables:tables.results, payment_available:Boolean(merchant(env, id)) });
    }
    if (!table) return error('Table unavailable. Ask staff for a table QR code.', 404);
    if (!action && method === 'GET') {
      const { results } = await menuItems(db, table.venue_id);
      const now = Date.now();
      const { results: alternatives } = await db(`SELECT t.label FROM dining_tables t
        WHERE t.venue_id = ? AND t.id <> ? AND NOT ${activeOrder('t.id')}
        AND NOT EXISTS (SELECT 1 FROM table_reservations r WHERE r.table_id = t.id AND r.expires_at > ?)
        ORDER BY t.label LIMIT 12`, table.venue_id, id, now).all();
      return out({ ...table, items: results, alternatives: alternatives.map(row => row.label), payment_available: Boolean(merchant(env, table.venue_id)) });
    }
    if (action === 'reservation' && method === 'POST') {
      const identity = await reservationHolder(request, db, data);
      if (!identity) return error('Reopen the table menu or sign in again to reserve.', 401);
      if (data.release === true) {
        await db('DELETE FROM table_reservations WHERE table_id = ? AND holder_hash = ?', id, identity.holder).run();
        return out({ ok:true });
      }
      if (data.check === true) {
        const now = Date.now();
        const reservation = await db('SELECT holder_hash, expires_at FROM table_reservations WHERE table_id = ? AND expires_at > ?', id, now).first();
        const occupied = await db(`SELECT ${activeOrder('?')} AS occupied`, id).first();
        const own = reservation?.holder_hash === identity.holder;
        return out({ busy: Boolean(occupied.occupied || (reservation && !own)), expires_at: own ? reservation.expires_at : null });
      }
      const reservation = await holdTable(db, id, identity.holder);
      return reservation ? out(reservation, 201) : tableBusy();
    }
    if (action === 'visit' && method === 'POST') {
      const session = await guestAuth(new Request(request.url, { headers:request.headers }), db, 'session');
      if (session.status !== 200) return out(session.body, session.status);
      await db(`INSERT INTO shop_visits (guest_id, venue_id, visited_at) VALUES (?, ?, ?)
        ON CONFLICT(guest_id, venue_id) DO UPDATE SET visited_at = excluded.visited_at`,
        session.body.guest.id, table.venue_id, Date.now()).run();
      return out({ ok:true });
    }
    if (action === 'checkout' && method === 'POST') return checkout(request, env, db, table, data);
  }
  if (section === 'orders') {
    let order = await readOrder(db, id);
    if (!order) return error('Order unavailable.', 404);
    if (!action && method === 'GET') return out(orderView(order));
    if (action === 'verify' && method === 'POST') {
      order = await confirmPayment(env, db, order);
      return out(orderView(order));
    }
    if (action === 'received' && method === 'POST') {
      if (!['ready','delivered'].includes(order.status)) return error('Your order is still being prepared.', 409);
      await db("UPDATE food_orders SET status = 'delivered', updated_at = ? WHERE id = ? AND status = 'ready'", Date.now(), id).run();
      return out(orderView(await readOrder(db, id)));
    }
  }
  if (section !== 'ordering') return error('Page unavailable.', 404);
  const venue = await db('SELECT * FROM venues WHERE id = ?', id).first();
  const staff = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!venue || !staff || await digest(staff) !== venue.staff_hash) return error('Staff access is required.', 401);
  if (!action && method === 'GET') {
    const [tables, menu, orders] = await Promise.all([
      db(`SELECT t.id, t.label, (${activeOrder('t.id')} OR EXISTS (
        SELECT 1 FROM table_reservations r WHERE r.table_id = t.id AND r.expires_at > ?
      )) AS occupied FROM dining_tables t WHERE t.venue_id = ? ORDER BY t.label`, Date.now(), id).all(),
      db('SELECT id, name, description, price, available, category FROM menu_items WHERE venue_id = ? ORDER BY name', id).all(),
      db(`SELECT o.*, t.label AS table_label FROM food_orders o JOIN dining_tables t ON t.id = o.table_id
          WHERE o.venue_id = ? AND o.status <> 'pending' AND (o.status <> 'delivered' OR o.updated_at >= ?)
          ORDER BY o.number DESC LIMIT 200`, id, Date.now() - 86_400_000).all(),
    ]);
    return out({ venue: { id, name: venue.name }, payment_available: Boolean(merchant(env, id)), tables: tables.results, items: menu.results, orders: orders.results.map(orderView) });
  }
  if (action === 'table' && method === 'POST') {
    const label = clean(data.label);
    if (!label || label.length > 32) return error('Enter a table label up to 32 characters.', 400);
    const table = await db(`INSERT INTO dining_tables (id, venue_id, label) VALUES (?, ?, ?)
      ON CONFLICT(venue_id, label) DO UPDATE SET label = excluded.label RETURNING id, label`, uuid(), id, label).first();
    return out(table, 201);
  }
  if (action === 'menu' && method === 'POST') {
    const name = clean(data.name), description = clean(data.description);
    const category = clean(data.category);
    if (category.length > 32) return error('Enter a category up to 32 characters.', 400);
    if (!name || name.length > 80 || description.length > 160 || !Number.isInteger(data.price) ||
        data.price < 100 || data.price > 1_000_000 || typeof data.available !== 'boolean') return error('Enter valid item details and price.', 400);
    const item = validId(data.id)
      ? await db(`UPDATE menu_items SET name = ?, description = ?, price = ?, available = ?, category = COALESCE(?, category)
                  WHERE id = ? AND venue_id = ? RETURNING id`, name, description, data.price, Number(data.available), category || null, data.id, id).first()
      : await db(`INSERT INTO menu_items (id, venue_id, name, description, price, available, category)
                  VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`, uuid(), id, name, description, data.price, Number(data.available), category || 'Other').first();
    return item ? out(item) : error('Menu item unavailable.', 404);
  }
  if (action === 'order' && method === 'PATCH') {
    const previous = new Map([['preparing','paid'], ['ready','preparing'], ['delivered','ready']]).get(data.status);
    if (!previous || !validId(data.id)) return error('Invalid order change.', 400);
    const updated = await db(`UPDATE food_orders SET status = ?, updated_at = ? WHERE id = ? AND venue_id = ?
      AND status = ? RETURNING id`, data.status, Date.now(), data.id, id, previous).first();
    if (updated) return out({ ok: true });
    const existing = await db('SELECT status FROM food_orders WHERE id = ? AND venue_id = ?', data.id, id).first();
    return existing?.status === data.status ? out({ ok: true }) : error('The order changed. Refresh the queue.', 409);
  }
  return error('Page unavailable.', 404);
}
