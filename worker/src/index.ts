// TETO Fitness calendar feed Worker — see SPEC.md §9.
// Stores one app-generated iCalendar text per feed in KV and serves it to Apple Calendar.
// It never receives workout logs, measurements, habits or profile data.

interface Env {
  FEEDS: KVNamespace;
  ALLOWED_ORIGIN: string; // e.g. https://7mdg.github.io
}

interface FeedRecord {
  tokenHash: string;
  ics: string;
  updatedAt: string;
  revoked?: boolean;
}

const MAX_ICS_BYTES = 256 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{22}$/;

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const randomId = () => b64url(crypto.getRandomValues(new Uint8Array(16))); // 128 bit -> 22 chars

async function sha256(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return b64url(new Uint8Array(digest));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cors(env: Env, req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  if (origin !== env.ALLOWED_ORIGIN) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

async function authorise(env: Env, req: Request, id: string): Promise<FeedRecord | Response> {
  const rec = await env.FEEDS.get<FeedRecord>(`feed:${id}`, 'json');
  if (!rec || rec.revoked) return new Response('Not found', { status: 404 });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token || !timingSafeEqual(await sha256(token), rec.tokenHash)) return new Response('Forbidden', { status: 403 });
  return rec;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const h = cors(env, req);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

    // Public: GET /c/<id>.ics  (subscribed by Apple Calendar; no Origin header)
    const feedMatch = /^\/c\/([A-Za-z0-9_-]+)\.ics$/.exec(url.pathname);
    if (feedMatch && (req.method === 'GET' || req.method === 'HEAD')) {
      const id = feedMatch[1]!;
      if (!ID_RE.test(id)) return new Response('Not found', { status: 404 });
      const rec = await env.FEEDS.get<FeedRecord>(`feed:${id}`, 'json');
      if (!rec) return new Response('Not found', { status: 404 });
      if (rec.revoked) return new Response('Gone', { status: 410 });
      return new Response(req.method === 'HEAD' ? null : rec.ics, {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Last-Modified': new Date(rec.updatedAt).toUTCString(),
        },
      });
    }

    // API: only from the app origin
    if (url.pathname.startsWith('/api/') && req.headers.get('Origin') !== env.ALLOWED_ORIGIN) {
      return new Response('Forbidden', { status: 403 });
    }

    if (url.pathname === '/api/feeds' && req.method === 'POST') {
      const id = randomId();
      const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
      const empty = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TETO//TETO Fitness//EN\r\nX-WR-CALNAME:TETO Fitness\r\nEND:VCALENDAR\r\n';
      const rec: FeedRecord = { tokenHash: await sha256(token), ics: empty, updatedAt: new Date().toISOString() };
      await env.FEEDS.put(`feed:${id}`, JSON.stringify(rec));
      return json({ id, writeToken: token }, 201, h);
    }

    const apiMatch = /^\/api\/feeds\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    if (apiMatch) {
      const id = apiMatch[1]!;
      if (!ID_RE.test(id)) return new Response('Not found', { status: 404, headers: h });
      const auth = await authorise(env, req, id);
      if (auth instanceof Response) return new Response(auth.body, { status: auth.status, headers: h });

      if (req.method === 'PUT') {
        const body = await req.text();
        if (new TextEncoder().encode(body).length > MAX_ICS_BYTES) return new Response('Too large', { status: 413, headers: h });
        if (!body.startsWith('BEGIN:VCALENDAR') || !body.trimEnd().endsWith('END:VCALENDAR')) {
          return new Response('Not an iCalendar document', { status: 400, headers: h });
        }
        await env.FEEDS.put(`feed:${id}`, JSON.stringify({ ...auth, ics: body, updatedAt: new Date().toISOString() }));
        return new Response(null, { status: 204, headers: h });
      }

      if (req.method === 'DELETE') {
        // Keep a tombstone for 90 days so subscribers get 410 Gone instead of a silent 404.
        await env.FEEDS.put(`feed:${id}`, JSON.stringify({ ...auth, ics: '', revoked: true, updatedAt: new Date().toISOString() }), {
          expirationTtl: 90 * 24 * 3600,
        });
        return new Response(null, { status: 204, headers: h });
      }
    }

    return new Response('Not found', { status: 404, headers: h });
  },
};
