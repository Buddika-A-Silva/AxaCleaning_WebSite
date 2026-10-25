#!/usr/bin/env node
'use strict';
/**
 * Zero-dependency local preview: serves ./frontend and runs the API router on /api/*.
 *   node dev-server.js            -> http://localhost:4280
 * Uses a JSON file (api/.data/db.json) for data and logs e-mails instead of sending
 * them unless SMTP_* variables are set. For a production-like run use the SWA CLI (see README).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handle } = require('./api/src/lib/router');

const PORT = Number(process.env.PORT || 4280);
const ROOT = path.join(__dirname, 'frontend');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'staticwebapp.config.json'), 'utf8'));

function serveStatic(req, res, urlPath) {
  for (const r of config.routes || []) if (r.route === urlPath && r.rewrite) urlPath = r.rewrite;
  let file = path.normalize(path.join(ROOT, decodeURIComponent(urlPath)));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    const fb = config.navigationFallback;
    const excluded = (fb.exclude || []).some((g) => new RegExp('^' + g.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$').test(urlPath));
    if (!excluded && !path.extname(urlPath)) file = path.join(ROOT, fb.rewrite);
    else { res.writeHead(404, { 'Content-Type': 'text/html' }); return fs.createReadStream(path.join(ROOT, '404.html')).pipe(res); }
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', ...(config.globalHeaders || {}) });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/') || url.pathname === '/api') {
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 1e6) { res.writeHead(413); return res.end(); } }
    let body = null;
    if (raw) { try { body = JSON.parse(raw); } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end('{"error":"Invalid JSON body"}'); } }
    const out = await handle({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body, ip: req.socket.remoteAddress });
    res.writeHead(out.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(out.body == null ? '' : JSON.stringify(out.body));
  }
  serveStatic(req, res, url.pathname);
});

if (require.main === module) server.listen(PORT, () => console.log(`AXA Cleaning running at http://localhost:${PORT}  (admin: /admin)`));
module.exports = server;
