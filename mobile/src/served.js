const defaultOrigin = 'https://served-queue.zippybasil1024.chatgpt.site';
export const origin = (process.env.EXPO_PUBLIC_SERVED_URL || defaultOrigin).replace(/\/$/, '');
const validId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);

export function guestDestination(value) {
  const url = new URL(value.trim());
  if (url.origin !== origin || url.pathname !== '/') throw new Error('Use the guest link from your restaurant.');
  const ticket = url.searchParams.get('ticket');
  const venue = url.searchParams.get('venue');
  if (validId(ticket)) return { ticket };
  if (validId(venue)) return { venue };
  throw new Error('This QR code does not contain a live Served guest link.');
}

export async function request(path, body, signal) {
  let response;
  try {
    response = await fetch(origin + '/api/' + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Could not connect. Check your internet connection and try again.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The queue is unavailable. Try again.');
  return result;
}

export function ticketDetails(ticket) {
  const table = ticket.kind === 'table';
  if (ticket.status === 'ready') return [
    table ? 'Your table is ready!' : 'Your order is ready!',
    table ? 'Show this ticket at the host stand.' : 'Show this ticket at the pickup counter.',
  ];
  if (ticket.status === 'done') return ['You’re all set', 'Staff completed this ticket.'];
  if (ticket.status === 'cancelled') return ['Ticket cancelled', 'Speak to staff if you still need help.'];
  return ['You’re in the queue', ticket.position === 1
    ? 'You’re next in line.' : `There are ${Math.max(0, ticket.position - 1)} tickets ahead of you.`];
}
