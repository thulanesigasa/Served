const encoder = new TextEncoder();
const month = 30 * 24 * 60 * 60_000;
const uuid = () => crypto.randomUUID().replaceAll('-', '');
const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
export const digest = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const result = (status, body) => ({ status, body });
const denied = () => result(401, { error: 'Check your email and password and try again.' });
const invalid = () => result(401, { error: 'Sign in to continue.' });

async function passwordKey(password, salt) {
  const input = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', iterations: 100_000,
    salt: Uint8Array.from(salt.match(/../g), value => parseInt(value, 16)),
  }, input, 256));
}

function equalHash(a, b) {
  let difference = a.length ^ b.length;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

async function hitLimit(statement, key, now) {
  const { hits } = await statement(
    `INSERT INTO guest_auth_limits (key, hits, expires_at) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       hits = CASE WHEN expires_at <= ? THEN 1 ELSE hits + 1 END,
       expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
     RETURNING hits`, key, now + 5 * 60_000, now, now).first();
  return hits;
}

export async function guestAuth(request, statement, action, data) {
  const now = Date.now();
  if (action === 'session' || action === 'logout') {
    const bearer = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!bearer) return invalid();
    const key = await digest(bearer);
    if (action === 'logout' && request.method === 'POST') {
      await statement('DELETE FROM guest_sessions WHERE token_hash = ?', key).run();
      return result(200, { ok: true });
    }
    if (action === 'session' && request.method === 'GET') {
      const guest = await statement(
        `SELECT g.id, g.name, g.email FROM guest_sessions s JOIN guest_accounts g ON s.guest_id = g.id
         WHERE s.token_hash = ? AND s.expires_at > ?`, key, now).first();
      return guest ? result(200, { guest }) : invalid();
    }
  }
  if (!['signup', 'login'].includes(action) || request.method !== 'POST') {
    return result(404, { error: 'This page is unavailable.' });
  }

  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const password = typeof data.password === 'string' ? data.password : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length > 128 || !password.length) {
    return result(400, { error: 'Enter a valid email and password.' });
  }

  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const ipKey = await digest('ip:' + ip);
  if (await hitLimit(statement, ipKey, now) > 60 ||
      await hitLimit(statement, await digest('account:' + ip + ':' + email), now) > 10) {
    return result(429, { error: 'Too many attempts. Try again in a few minutes.' });
  }
  // Bound cleanup work during authentication and keep expiry checks on every read.
  await statement('DELETE FROM guest_auth_limits WHERE key IN (SELECT key FROM guest_auth_limits WHERE expires_at <= ? LIMIT 100)', now).run();
  await statement('DELETE FROM guest_sessions WHERE token_hash IN (SELECT token_hash FROM guest_sessions WHERE expires_at <= ? LIMIT 100)', now).run();

  let guest;
  if (action === 'signup') {
    const name = typeof data.name === 'string' ? data.name.trim().replace(/\s+/g, ' ') : '';
    if (!name || name.length > 45 || password.length < 8 || !/\d/.test(password) || !/[^\p{L}\p{N}\s]/u.test(password)) {
      return result(400, { error: 'Enter a name and use at least 8 characters, a number and a symbol in your password.' });
    }
    const salt = uuid();
    guest = await statement(
      `INSERT INTO guest_accounts (id, name, email, salt, password_hash)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING RETURNING id, name, email`,
      uuid(), name, email, salt, await passwordKey(password, salt)).first();
    if (!guest) return result(409, { error: 'Could not create this account. If you’ve already signed up, sign in.' });
  } else {
    const account = await statement('SELECT id, name, email, salt, password_hash FROM guest_accounts WHERE email = ?', email).first();
    const derived = await passwordKey(password, account?.salt || 'a'.repeat(32));
    if (!equalHash(derived, account?.password_hash || '0'.repeat(64)) || !account) return denied();
    guest = { id: account.id, name: account.name, email: account.email };
  }
  const sessionToken = uuid() + uuid();
  await statement('INSERT INTO guest_sessions (token_hash, guest_id, expires_at) VALUES (?, ?, ?)', await digest(sessionToken), guest.id, now + month).run();
  return result(action === 'signup' ? 201 : 200, { guest, token: sessionToken, expires_at: now + month });
}
