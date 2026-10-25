'use strict';
const crypto = require('crypto');
const { settings } = require('./runtime-config');

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const uid = (prefix = '') => prefix + crypto.randomBytes(9).toString('base64url');
const nowIso = () => new Date().toISOString();
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

// ---- date / time helpers (dates are plain 'YYYY-MM-DD' strings, times 'HH:MM') ----
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
const isTime = (s) => typeof s === 'string' && TIME_RE.test(s);
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const weekday = (date) => new Date(date + 'T00:00:00Z').getUTCDay();
function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// "Today" in the business time zone (configurable offset in minutes, default from TZ_OFFSET_MINUTES or UTC)
function today() {
  const off = Number(settings.timezoneOffsetMinutes || 0);
  return new Date(Date.now() + off * 60000).toISOString().slice(0, 10);
}

// ---- validation helpers ----
function str(v, { field, min = 0, max = 500, required = false } = {}) {
  if (v == null || v === '') {
    if (required) throw new HttpError(400, `${field} is required`);
    return '';
  }
  if (typeof v !== 'string' && typeof v !== 'number') throw new HttpError(400, `${field} must be text`);
  const s = String(v).trim();
  if (required && !s) throw new HttpError(400, `${field} is required`);
  if (s.length < min) throw new HttpError(400, `${field} must be at least ${min} characters`);
  if (s.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return s;
}
const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/;
function email(v, field = 'Email', required = true) {
  const s = str(v, { field, max: 254, required }).toLowerCase();
  if (s && !EMAIL_RE.test(s)) throw new HttpError(400, `${field} is not a valid email address`);
  return s;
}
function int(v, { field, min = 0, max = 1000, def = 0 } = {}) {
  if (v == null || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n) || Math.floor(n) !== n || n < min || n > max) throw new HttpError(400, `${field} must be a whole number between ${min} and ${max}`);
  return n;
}
function num(v, { field, min = 0, max = 1e7, def = 0 } = {}) {
  if (v == null || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${field} must be a number between ${min} and ${max}`);
  return Math.round(n * 100) / 100;
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = {
  HttpError, uid, nowIso, clone, isDate, isTime, toMin, fromMin, weekday, addDays, today,
  str, email, int, num, escapeHtml,
};
