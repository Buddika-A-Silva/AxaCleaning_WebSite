'use strict';
const crypto = require('crypto');
const { HttpError } = require('./util');
const { isProductionEnvironment } = require('./config');

const ROLES = ['superadmin', 'manager', 'admin'];
const ROLE_LABEL = { superadmin: 'Super Admin', manager: 'Manager', admin: 'Admin' };
const ROLE_RANK = { admin: 1, manager: 2, superadmin: 3 };
const TOKEN_TTL_SEC = Number(process.env.TOKEN_TTL_HOURS || 12) * 3600;

let warned = false;
function secret() {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return s;
  if (isProductionEnvironment()) throw new Error('Production requires AUTH_SECRET to contain at least 32 characters.');
  if (!warned) { console.warn('[auth] AUTH_SECRET is not set (or < 32 chars). Using an insecure development secret.'); warned = true; }
  return 'axa-dev-secret-change-me-in-production';
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64);
  const known = Buffer.from(hash, 'hex');
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}
function checkPasswordPolicy(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (pw.length > 128) throw new HttpError(400, 'Password is too long');
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw new HttpError(400, 'Password must contain letters and numbers');
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function signToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: user.id, role: user.role, tv: user.tokenVersion || 0, iat: now, exp: now + TOKEN_TTL_SEC };
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const sig = crypto.createHmac('sha256', secret()).update(`${head}.${body}`).digest('base64url');
  return { token: `${head}.${body}.${sig}`, expiresAt: new Date(payload.exp * 1000).toISOString() };
}
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac('sha256', secret()).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (!p.exp || p.exp < Date.now() / 1000) return null;
    return p;
  } catch { return null; }
}

const publicUser = (u) => u && ({
  id: u.id, username: u.username, name: u.name, email: u.email, phone: u.phone || '', role: u.role,
  roleLabel: ROLE_LABEL[u.role], active: u.active !== false, mustChangePassword: !!u.mustChangePassword,
  createdAt: u.createdAt, createdBy: u.createdBy || null, lastLoginAt: u.lastLoginAt || null,
});

/**
 * Who may manage which account.
 *  superadmin: everyone (guards against removing the last super admin are applied by the caller)
 *  manager:    managers and admins, never super admins; cannot grant super admin
 *  admin:      nobody (only their own password)
 */
function canManageUser(actor, target) {
  if (!actor) return false;
  if (actor.role === 'superadmin') return true;
  if (actor.role === 'manager') return !target || target.role !== 'superadmin';
  return false;
}
function canAssignRole(actor, role) {
  if (!ROLES.includes(role)) return false;
  if (actor.role === 'superadmin') return true;
  if (actor.role === 'manager') return role !== 'superadmin';
  return false;
}

// simple in-memory login throttle (per instance)
const attempts = new Map();
function throttle(key) {
  const now = Date.now();
  const rec = attempts.get(key) || { n: 0, until: 0, first: now };
  if (rec.until > now) throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.');
  return rec;
}
function recordFailure(key) {
  const now = Date.now();
  const rec = attempts.get(key) || { n: 0, until: 0, first: now };
  if (now - rec.first > 15 * 60000) { rec.n = 0; rec.first = now; }
  rec.n += 1;
  if (rec.n >= 5) { rec.until = now + 5 * 60000; rec.n = 0; rec.first = now; }
  attempts.set(key, rec);
}
const clearFailures = (key) => attempts.delete(key);

module.exports = {
  ROLES, ROLE_LABEL, ROLE_RANK, hashPassword, verifyPassword, checkPasswordPolicy, signToken, verifyToken,
  publicUser, canManageUser, canAssignRole, throttle, recordFailure, clearFailures,
};
