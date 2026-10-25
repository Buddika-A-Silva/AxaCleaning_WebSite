'use strict';
// Azure Functions (Node.js v4 programming model) entry point.
// One catch-all HTTP function forwards every /api/* call to the framework-free router,
// which the local dev server (../../dev-server.js) and tests use too.
const { app } = require('@azure/functions');
const { handle } = require('./lib/router');

app.http('api', {
  route: '{*path}',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (request) => {
    const url = new URL(request.url);
    const headers = {};
    request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    let body = null;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const text = await request.text();
      if (text) { try { body = JSON.parse(text); } catch { return { status: 400, jsonBody: { error: 'Invalid JSON body' } }; } }
    }
    const ip = (headers['x-forwarded-for'] || headers['x-client-ip'] || '').split(',')[0].trim().replace(/:\d+$/, '');
    const res = await handle({ method: request.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers, body, ip });
    return { status: res.status, jsonBody: res.body ?? undefined, headers: { 'Cache-Control': 'no-store', ...(res.headers || {}) } };
  },
});
