import process from 'node:process';
import { Buffer } from 'node:buffer';

Object.assign(process.env, Deno.env.toObject());
Object.assign(globalThis, { Buffer });

const { handle } = await import('../../../api/src/lib/router.js');
const functionPrefix = '/functions/v1/axa-api';
const defaultOrigins = [
  'https://yellow-mud-06abc5e10.6.azurestaticapps.net',
  'http://localhost:4280',
  'http://127.0.0.1:4280',
];
const allowedOrigins = new Set([
  ...defaultOrigins,
  ...(process.env.CORS_ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
]);
const corsHeaders = (origin: string | null) => ({
  ...(origin && allowedOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key, X-Auth-Token',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  const cors = corsHeaders(origin);
  if (origin && !allowedOrigins.has(origin)) {
    return Response.json({ error: 'Origin is not allowed' }, { status: 403, headers: cors });
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const url = new URL(request.url);
  const path = url.pathname.startsWith(functionPrefix)
    ? url.pathname.slice(functionPrefix.length) || '/'
    : url.pathname;
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
  let body = null;
  if (!['GET', 'HEAD'].includes(request.method)) {
    const text = await request.text();
    if (text) {
      try { body = JSON.parse(text); }
      catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: cors });
      }
    }
  }
  const ip = (headers['cf-connecting-ip'] || headers['x-forwarded-for'] || headers['x-client-ip'] || '')
    .split(',')[0].trim().replace(/:\d+$/, '');
  const result = await handle({
    method: request.method,
    path,
    query: Object.fromEntries(url.searchParams),
    headers,
    body,
    ip,
  });
  const responseHeaders = new Headers(cors);
  responseHeaders.set('Cache-Control', 'no-store');
  Object.entries(result.headers || {}).forEach(([key, value]) => responseHeaders.set(key, value));
  if (result.status === 204 || result.body == null) {
    return new Response(null, { status: result.status, headers: responseHeaders });
  }
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(result.body), { status: result.status, headers: responseHeaders });
});
