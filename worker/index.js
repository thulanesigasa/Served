import { api } from './api.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(request, env);
      } catch (error) {
        console.error('Served queue error', error);
        return Response.json({ error: 'The queue is temporarily unavailable. Try again.' },
          { status: 503, headers: { 'cache-control': 'no-store' } });
      }
    }
    const file = Object.hasOwn(SERVED_ASSETS, url.pathname) ? SERVED_ASSETS[url.pathname] : undefined;
    if (!file) return new Response('Page unavailable.', { status: 404 });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method unavailable.', { status: 405 });
    }
    const [mime, base64] = file;
    return new Response(request.method === 'HEAD' ? null : Uint8Array.from(atob(base64), char => char.charCodeAt(0)),
      { headers: {
        'content-type': mime, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'self'; img-src 'self' data:; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com; base-uri 'none'; form-action 'self'",
      } });
  },
};
