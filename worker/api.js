const json = (data, status = 200) => Response.json(data, {
  status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});
const fail = (message, status) => json({ error: message }, status);
const token = () => crypto.randomUUID().replaceAll('-', '');
const hash = async value => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
};
const name = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
const validId = value => /^[a-f0-9]{32}$/.test(value ?? '');
const SELECT = 'number, id, name, kind, size, status, created_at, called_at, closed_at';

async function readBody(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error();
  const reader = request.body?.getReader();
  if (!reader) throw new Error();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2048) {
      await reader.cancel();
      throw new Error();
    }
    text += decoder.decode(value, { stream: true });
  }
  const data = JSON.parse(text + decoder.decode());
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
  return data;
}

export async function api(request, env) {
  const url = new URL(request.url);
  const [, , collection, id, action] = url.pathname.split('/');
  const db = env.DB;
  const statement = (query, ...params) => db.prepare(query).bind(...params);
  const write = request.method === 'POST' || request.method === 'PATCH';
  if (!db) return fail('Queue service is unavailable. Please try again.', 503);
  if (!write && request.method !== 'GET') return fail('Method unavailable.', 405);
  if (write && request.headers.get('origin') && request.headers.get('origin') !== url.origin) {
    return fail('Open Served to make this change.', 403);
  }
  let data;
  if (write) {
    try { data = await readBody(request); }
    catch { return fail('Send valid queue details.', 400); }
  }
  if (collection === 'venues' && !id && request.method === 'POST') {
    const venueName = name(data.name);
    if (!venueName || venueName.length > 60) return fail('Enter a venue name up to 60 characters.', 400);
    const venue = { id: token(), name: venueName };
    const staffToken = token() + token();
    await statement('INSERT INTO venues (id, name, staff_hash) VALUES (?, ?, ?)',
      venue.id, venue.name, await hash(staffToken)).run();
    return json({ venue, staffToken }, 201);
  }
  if (!validId(id)) return fail('This link is unavailable.', 404);
  if (collection === 'tickets' && !action && request.method === 'GET') {
    const ticket = await statement(
      `SELECT ${SELECT.split(', ').map(column => 't.' + column).join(', ')}, t.venue_id, v.name AS venue_name
       FROM tickets t JOIN venues v ON v.id = t.venue_id WHERE t.id = ?`, id).first();
    return ticket ? json(await guestTicket(statement, ticket)) : fail('Ticket unavailable.', 404);
  }
  if (collection !== 'venues') return fail('Page unavailable.', 404);
  const venue = await statement('SELECT * FROM venues WHERE id = ?', id).first();
  if (!venue) return fail('Venue unavailable. Check the QR code with staff.', 404);
  if (!action && request.method === 'GET') return json({ id: venue.id, name: venue.name });
  if (action === 'join' && request.method === 'POST') {
    const guestName = name(data.name);
    const kind = data.kind;
    const size = kind === 'table' ? data.size : 1;
    if (!guestName || guestName.length > 45 || !['table', 'order'].includes(kind) ||
        !Number.isInteger(size) || size < 1 || size > 20 || !validId(data.id)) {
      return fail('Enter a name and valid ticket details.', 400);
    }
    await statement(
      'INSERT INTO tickets (id, venue_id, name, kind, size, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
      data.id, id, guestName, kind, size, Date.now()).run();
    const ticket = await statement(`SELECT ${SELECT} FROM tickets WHERE id = ? AND venue_id = ?`, data.id, id).first();
    if (!ticket) return fail('Start a new ticket and try again.', 409);
    return json(await guestTicket(statement, { ...ticket, venue_id: id, venue_name: venue.name }), 201);
  }
  const staffToken = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!staffToken || await hash(staffToken) !== venue.staff_hash) return fail('Staff access is required.', 401);
  if (action === 'queue' && request.method === 'GET') {
    const { results } = await statement(
      `SELECT ${SELECT} FROM tickets WHERE venue_id = ? AND (status IN ('waiting','ready') OR closed_at > ?)
       ORDER BY number DESC`, id, Date.now() - 86_400_000).all();
    return json(results);
  }
  if (action === 'queue' && request.method === 'PATCH') {
    const next = { ready: "status = 'waiting'", done: "status = 'ready'", cancelled: "status IN ('waiting','ready')" };
    if (!validId(data.id) || !Object.hasOwn(next, data.status)) return fail('Choose a valid ticket action.', 400);
    const now = Date.now();
    const updated = await statement(
      `UPDATE tickets SET status = ?, called_at = COALESCE(called_at, ?), closed_at = ?
       WHERE id = ? AND venue_id = ? AND ${next[data.status]} RETURNING ${SELECT}`,
      data.status, data.status === 'ready' ? now : null, data.status === 'ready' ? null : now, data.id, id).first();
    return updated ? json(updated) : fail('This ticket has already changed. Refreshing the queue.', 409);
  }
  return fail('Page unavailable.', 404);
}

async function guestTicket(statement, ticket) {
  if (ticket.status !== 'waiting') return ticket;
  const { ahead } = await statement(
    "SELECT COUNT(*) AS ahead FROM tickets WHERE venue_id = ? AND kind = ? AND status = 'waiting' AND number < ?",
    ticket.venue_id, ticket.kind, ticket.number).first();
  return { ...ticket, position: ahead + 1 };
}
