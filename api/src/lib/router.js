'use strict';
const crypto = require('crypto');
const { getStore } = require('./store');
const { ensureSeeded, EXTRAS, BUSINESS_DEFAULTS } = require('./seed');
const U = require('./util');
const A = require('./auth');
const AV = require('./availability');
const { sendBookingMail, sendContactMail, mailMode } = require('./mail');

const { HttpError, uid, nowIso } = U;
const routes = [];
const STAFF_OTP_TTL_MS = 10 * 60 * 1000;
const STAFF_OTP_ATTEMPTS = 5;
function createStaffOtp() {
  const otp = String(crypto.randomInt(0, 100000000)).padStart(8, '0');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(otp, salt, 64).toString('hex');
  return { otp, salt, hash, expiresAt: new Date(Date.now() + STAFF_OTP_TTL_MS).toISOString() };
}
const route = (method, pattern, opts, handler) => {
  if (typeof opts === 'function') { handler = opts; opts = {}; }
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, roles: opts.roles, auth: opts.auth || !!opts.roles, handler });
};
const STAFF = ['superadmin', 'manager', 'admin'];
const MGMT = ['superadmin', 'manager'];

// --------------------------------------------------------------- helpers
async function audit(store, user, action, detail) {
  await store.put('audit', { id: uid('aud_'), at: nowIso(), userId: user?.id || null, username: user?.username || 'public', role: user?.role || null, action, detail });
}
async function notify(store, { type, title, message, bookingId, actorId }) {
  await store.put('notifications', { id: uid('ntf_'), type, title, message, bookingId: bookingId || null, createdAt: nowIso(), readBy: actorId ? [actorId] : [] });
  const all = (await store.list('notifications')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const n of all.slice(300)) await store.remove('notifications', n.id);
}
async function getExtras(store) { return (await store.get('settings', 'extras'))?.items || EXTRAS; }
async function getBusiness(store) {
  return { ...BUSINESS_DEFAULTS, ...(await store.get('settings', 'business') || {}) };
}
async function applyBusinessSettings(store) {
  const business = await getBusiness(store);
  process.env.COMPANY_NAME = business.companyName;
  process.env.COMPANY_EMAIL = business.companyEmail;
  process.env.COMPANY_PHONE = business.phone;
  process.env.SERVICE_AREA = business.serviceArea;
  process.env.CURRENCY = business.currency;
  process.env.TZ_OFFSET_MINUTES = String(business.timezoneOffsetMinutes);
  return business;
}
function parseBusinessSettings(body, existing) {
  const companyName = U.str(body.companyName ?? existing.companyName, { field: 'Company name', required: true, min: 2, max: 80 });
  const companyEmail = U.email(body.companyEmail ?? existing.companyEmail, 'Company e-mail', false);
  const currency = U.str(body.currency ?? existing.currency, { field: 'Currency', required: true, min: 3, max: 3 }).toUpperCase();
  try { new Intl.NumberFormat('en', { style: 'currency', currency }).format(1); }
  catch { throw new HttpError(400, 'Currency must be a supported three-letter ISO currency code'); }
  return {
    id: 'business',
    companyName,
    companyEmail,
    phone: U.str(body.phone ?? existing.phone, { field: 'Phone', max: 30 }),
    serviceArea: U.str(body.serviceArea ?? existing.serviceArea, { field: 'Service area', max: 300 }),
    currency,
    timezoneOffsetMinutes: U.int(body.timezoneOffsetMinutes ?? existing.timezoneOffsetMinutes, { field: 'Timezone offset (minutes)', min: -720, max: 840, def: 330 }),
    updatedAt: nowIso(),
  };
}
async function getPackage(store, id, { activeOnly = false } = {}) {
  const p = await store.get('packages', U.str(id, { field: 'Package', required: true, max: 64 }));
  if (!p || (activeOnly && p.active === false)) throw new HttpError(400, 'Selected package is not available');
  return p;
}
function newRef() {
  const d = U.today().replace(/-/g, '').slice(2);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `AXA-${d}-${s}`;
}
const fmtMoney = (n) => Math.round(n * 100) / 100;

function parseCustomer(c = {}) {
  return {
    name: U.str(c.name, { field: 'Name', required: true, min: 2, max: 100 }),
    email: U.email(c.email),
    phone: U.str(c.phone, { field: 'Phone', required: true, min: 6, max: 30 }),
    ...(c.consentAt ? { consentAt: c.consentAt, consentVersion: c.consentVersion || '1' } : {}),
  };
}
function parseAddress(a = {}) {
  return {
    line1: U.str(a.line1, { field: 'Address', required: true, min: 3, max: 200 }),
    city: U.str(a.city, { field: 'City', required: true, max: 80 }),
    postcode: U.str(a.postcode, { field: 'Postcode', max: 20 }),
  };
}
function parseWhen(body, pkg, { publicRequest }) {
  const date = body.date;
  if (!U.isDate(date)) throw new HttpError(400, 'Please choose a valid date');
  const startTime = body.startTime;
  if (!U.isTime(startTime)) throw new HttpError(400, 'Please choose a valid start time');
  const durationHours = body.durationHours != null && !publicRequest ? U.num(body.durationHours, { field: 'Duration', min: 0.5, max: 12 }) : pkg.durationHours;
  const s = U.toMin(startTime);
  if (s < AV.WORK_START || s + durationHours * 60 > AV.WORK_END) {
    throw new HttpError(400, `The job must fit within working hours (${U.fromMin(AV.WORK_START)}–${U.fromMin(AV.WORK_END)})`);
  }
  if (publicRequest) {
    const t = U.today();
    if (date <= t) throw new HttpError(400, 'Bookings can be made from tomorrow onwards');
    if (date > U.addDays(t, 120)) throw new HttpError(400, 'Bookings can be made up to 120 days ahead');
  }
  return { date, startTime, durationHours };
}
async function resolveExtras(store, ids) {
  if (!Array.isArray(ids)) return [];
  const all = await getExtras(store);
  return [...new Set(ids)].slice(0, 20).map((id) => all.find((e) => e.id === id)).filter(Boolean).map(({ id, name, price }) => ({ id, name, price }));
}
async function validateAgents(store, booking, agentIds, { force }) {
  if (!Array.isArray(agentIds)) throw new HttpError(400, 'agentIds must be a list');
  const agents = await store.list('agents');
  const ids = [...new Set(agentIds)];
  for (const id of ids) if (!agents.find((a) => a.id === id)) throw new HttpError(400, `Unknown agent ${id}`);
  const bookings = await store.list('bookings');
  const win = AV.windowOf(booking);
  const conflicts = ids.map((id) => ({ id, name: agents.find((a) => a.id === id).name, ...AV.checkAgent(agents.find((a) => a.id === id), booking.date, win, bookings, booking.id) })).filter((c) => !c.free);
  if (conflicts.length && !force) {
    throw new HttpError(409, `Agent availability conflict: ${conflicts.map((c) => `${c.name} – ${c.reason}`).join('; ')}`, { conflicts });
  }
  return { ids, conflicts, names: ids.map((id) => agents.find((a) => a.id === id).name) };
}
const agentNames = async (store, ids) => { const agents = await store.list('agents'); return (ids || []).map((id) => agents.find((a) => a.id === id)?.name).filter(Boolean); };
const firstNames = (names) => names.map((n) => n.split(' ')[0]);

function bookingView(b, agents) {
  return { ...b, agents: (b.agentIds || []).map((id) => { const a = agents.find((x) => x.id === id); return a ? { id, name: a.name, color: a.color } : { id, name: 'Removed agent' }; }) };
}
function conflictOverrideReason(user, body) {
  if (!body.force) return '';
  if (!MGMT.includes(user.role)) throw new HttpError(403, 'Only Managers and Super Admins may override an availability conflict');
  return U.str(body.overrideReason, { field: 'Override reason', required: true, min: 5, max: 500 });
}
const agentScheduleLocks = (date, ids) => ids.map((id) => `agent-schedule:${date}:${id}`);
async function withBookingLocks(store, id, getAdditionalKeys, action) {
  return store.withLocks([`booking:${id}`], async () => {
    const booking = await loadBooking(store, id);
    const scheduleKeys = [
      ...agentScheduleLocks(booking.date, booking.agentIds || []),
      ...getAdditionalKeys(booking),
    ];
    return store.withLocks(scheduleKeys, () => action(booking));
  });
}

// --------------------------------------------------------------- public
route('GET', '/health', async ({ store }) => ({ ok: true, storage: store.mode, mail: mailMode(), time: nowIso() }));

route('GET', '/admin/settings', { roles: ['superadmin'] }, async ({ store }) => {
  const business = await getBusiness(store);
  const [packages, agents] = await Promise.all([store.list('packages'), store.list('agents')]);
  const checks = [
    { id: 'company-email', label: 'Company reply mailbox', ready: Boolean(business.companyEmail) },
    { id: 'company-phone', label: 'Public phone number', ready: Boolean(business.phone) },
    { id: 'service-area', label: 'Service area', ready: Boolean(business.serviceArea) },
    { id: 'packages', label: 'Active service packages', ready: packages.some((p) => p.active !== false) },
    { id: 'agents', label: 'Cleaning team', ready: agents.some((a) => a.active !== false) },
    { id: 'email', label: 'Resend settings configured (not delivery-tested)', ready: mailMode() === 'resend' && Boolean(business.companyEmail) },
    { id: 'legal', label: 'Privacy notice and terms reviewed (owner/legal action)', ready: false },
    { id: 'storage', label: 'Supabase Edge Function storage', ready: store.mode === 'supabase-edge' },
  ];
  return {
    business,
    mail: { mode: mailMode(), apiKeyConfigured: Boolean(process.env.RESEND_API_KEY), senderConfigured: Boolean(process.env.MAIL_FROM) },
    checks,
    ready: checks.every((item) => item.ready),
  };
});
route('PUT', '/admin/settings', { roles: ['superadmin'] }, async ({ store, user, body }) => {
  const settings = parseBusinessSettings(body, await getBusiness(store));
  await store.put('settings', settings);
  await applyBusinessSettings(store);
  await audit(store, user, 'settings.business.update', 'Updated public business settings');
  return { business: settings };
});

route('GET', '/packages', async ({ store }) => {
  const business = await getBusiness(store);
  const packages = (await store.list('packages')).filter((p) => p.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
  return { currency: business.currency, company: { name: business.companyName, email: business.companyEmail, phone: business.phone, serviceArea: business.serviceArea }, packages, extras: await getExtras(store), workStart: U.fromMin(AV.WORK_START), workEnd: U.fromMin(AV.WORK_END) };
});

route('GET', '/availability/calendar', async ({ store, query }) => {
  // which days in a month are open (some agent works) – for the public date picker
  const month = /^\d{4}-\d{2}$/.test(query.month || '') ? query.month : U.today().slice(0, 7);
  const agents = (await store.list('agents')).filter((a) => a.active !== false);
  const bookings = await store.list('bookings');
  const pkg = query.packageId ? await store.get('packages', query.packageId) : null;
  const days = [];
  for (let d = `${month}-01`; d.startsWith(month); d = U.addDays(d, 1)) {
    const open = AV.isOpenDay(d, agents);
    let state = open ? 'open' : 'closed';
    if (open && pkg) {
      const s = AV.slots(d, pkg.durationHours, pkg.agentsRequired || 1, agents, bookings);
      const avail = s.filter((x) => x.available).length;
      state = avail === 0 ? 'full' : avail <= 2 ? 'limited' : 'open';
    }
    days.push({ date: d, state });
  }
  return { month, today: U.today(), days };
});

route('GET', '/availability/slots', async ({ store, query }) => {
  if (!U.isDate(query.date)) throw new HttpError(400, 'date is required (YYYY-MM-DD)');
  const pkg = await getPackage(store, query.packageId, { activeOnly: true });
  const agents = (await store.list('agents')).filter((a) => a.active !== false);
  return { date: query.date, durationHours: pkg.durationHours, slots: AV.slots(query.date, pkg.durationHours, pkg.agentsRequired || 1, agents, await store.list('bookings')) };
});

const publicLimiter = new Map();
route('POST', '/bookings', async ({ store, body, ip, headers }) => {
  if (body.website) throw new HttpError(400, 'Invalid submission');
  const rawKey = headers['idempotency-key'];
  if (typeof rawKey !== 'string' || rawKey.length < 16 || rawKey.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(rawKey)) {
    throw new HttpError(400, 'A valid Idempotency-Key header is required');
  }
  const key = crypto.createHash('sha256').update(rawKey).digest('hex');
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return store.withLocks([`idempotency:${key}`], async () => {
    const prior = await store.get('idempotency', key);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new HttpError(409, 'This idempotency key was already used for different booking details');
      return { status: prior.status, body: prior.response };
    }
    const ipKey = ip || 'anon';
    const hits = (publicLimiter.get(ipKey) || []).filter((t) => Date.now() - t < 3600e3);
    if (hits.length >= 10) throw new HttpError(429, 'Too many booking requests from this network. Please call us instead.');
    publicLimiter.set(ipKey, [...hits, Date.now()]);
    if (body.consent !== true) throw new HttpError(400, 'Please confirm consent to be contacted about this request');

    const pkg = await getPackage(store, body.packageId, { activeOnly: true });
    const when = parseWhen(body, pkg, { publicRequest: true });
    const extras = await resolveExtras(store, body.extras);
    const at = nowIso();
    const booking = {
      id: uid('bkg_'), ref: newRef(), packageId: pkg.id, packageName: pkg.name, ...when, agentsRequired: pkg.agentsRequired || 1,
      extras, price: fmtMoney(pkg.price + extras.reduce((s, e) => s + e.price, 0)),
      customer: { ...parseCustomer(body.customer), consentAt: at, consentVersion: '1' }, address: parseAddress(body.address),
      propertyType: U.str(body.propertyType, { field: 'Property type', max: 40 }) || 'Home',
      bedrooms: U.int(body.bedrooms, { field: 'Bedrooms', max: 20 }), bathrooms: U.int(body.bathrooms, { field: 'Bathrooms', max: 20 }),
      notes: U.str(body.notes, { field: 'Notes', max: 1000 }), internalNotes: '',
      status: 'pending', agentIds: [], source: 'web', createdAt: at, updatedAt: at,
      history: [{ at, by: 'customer', action: 'requested', note: 'Booking requested via website' }], email: null,
    };
    await store.put('bookings', booking);
    const response = { ref: booking.ref, status: booking.status, date: booking.date, startTime: booking.startTime, price: booking.price, emailStatus: 'logged' };
    await store.put('idempotency', { id: key, fingerprint, status: 201, response, createdAt: at });
    const mail = await sendBookingMail(store, booking, 'received');
    await store.put('bookings', booking);
    await notify(store, { type: 'booking_new', title: `New booking request ${booking.ref}`, message: `${booking.customer.name} · ${pkg.name} · ${booking.date} ${booking.startTime}`, bookingId: booking.id });
    response.emailStatus = mail.status;
    await store.put('idempotency', { id: key, fingerprint, status: 201, response, createdAt: at });
    return { status: 201, body: response };
  });
});

const contactLimiter = new Map();
route('POST', '/contact', async ({ store, body, ip }) => {
  if (body.website) throw new HttpError(400, 'Invalid submission');
  const key = ip || 'anon';
  const hits = (contactLimiter.get(key) || []).filter((t) => Date.now() - t < 3600e3);
  if (hits.length >= 5) throw new HttpError(429, 'Too many messages. Please try again later.');
  contactLimiter.set(key, [...hits, Date.now()]);
  const contact = {
    id: uid('msg_'),
    name: U.str(body.name, { field: 'Name', required: true, min: 2, max: 100 }),
    email: U.email(body.email),
    phone: U.str(body.phone, { field: 'Phone', max: 30 }),
    message: U.str(body.message, { field: 'Message', required: true, min: 10, max: 3000 }),
    createdAt: nowIso(),
    status: 'new',
  };
  await store.put('contacts', contact);
  const business = await getBusiness(store);
  const mail = await sendContactMail(store, contact, business);
  contact.emailStatus = mail.status;
  await store.put('contacts', contact);
  await notify(store, { type: 'contact_new', title: `New contact message from ${contact.name}`, message: contact.message.slice(0, 140) });
  return { status: 201, body: { id: contact.id, message: 'Thank you. Your message has been received.', emailStatus: mail.status } };
});
route('GET', '/admin/contacts', { roles: STAFF }, async ({ store, query }) => {
  const all = (await store.list('contacts')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const status = query.status;
  const items = status && status !== 'all' ? all.filter((c) => c.status === status) : all;
  return { total: items.length, items: items.slice(0, 200) };
});
route('PATCH', '/admin/contacts/:id', { roles: STAFF }, async ({ store, user, params, body }) => {
  const contact = await store.get('contacts', params.id);
  if (!contact) throw new HttpError(404, 'Contact message not found');
  if (!['new', 'read', 'closed'].includes(body.status)) throw new HttpError(400, 'Status must be new, read or closed');
  contact.status = body.status;
  contact.updatedAt = nowIso();
  await store.put('contacts', contact);
  await audit(store, user, 'contact.update', `${contact.id} → ${contact.status}`);
  return contact;
});

route('GET', '/bookings/track', async ({ store, query }) => {
  const ref = U.str(query.ref, { field: 'Reference', required: true, max: 40 }).toUpperCase();
  const em = U.email(query.email);
  const b = (await store.list('bookings')).find((x) => x.ref === ref && x.customer.email === em);
  if (!b) throw new HttpError(404, 'No booking found with that reference and e-mail');
  const names = b.status === 'accepted' ? firstNames(await agentNames(store, b.agentIds)) : [];
  return { ref: b.ref, status: b.status, packageName: b.packageName, date: b.date, startTime: b.startTime, durationHours: b.durationHours, price: b.price, cleaners: names,
    timeline: b.history.filter((h) => h.public !== false).map((h) => ({ at: h.at, action: h.action })) };
});

// --------------------------------------------------------------- auth
route('POST', '/auth/login', async ({ store, body, ip }) => {
  const username = U.str(body.username, { field: 'Username', required: true, max: 60 }).toLowerCase();
  const key = `${ip}|${username}`;
  A.throttle(key);
  const user = (await store.list('users')).find((u) => u.username.toLowerCase() === username);
  let authenticated = !!user && user.active !== false && A.verifyPassword(body.password || '', user.salt, user.passwordHash);
  if (!authenticated && user && user.active !== false) {
    const otp = await store.getAuthOtp(user.id);
    if (otp && A.verifyPassword(body.password || '', otp.salt, otp.hash)) {
      authenticated = await store.consumeAuthOtp(user.id, otp.hash);
      if (authenticated) {
        user.salt = null;
        user.passwordHash = null;
        user.mustChangePassword = true;
      }
    } else if (otp) {
      await store.failAuthOtp(user.id);
    }
  }
  if (!authenticated) {
    A.recordFailure(key);
    throw new HttpError(401, 'Invalid username or password');
  }
  A.clearFailures(key);
  user.lastLoginAt = nowIso();
  await store.put('users', user);
  await audit(store, user, 'login', 'Signed in');
  return { ...A.signToken(user), user: A.publicUser(user) };
});
route('GET', '/auth/me', { roles: STAFF }, async ({ user }) => ({ user: A.publicUser(user) }));
route('POST', '/auth/change-password', { roles: STAFF }, async ({ store, user, body }) => {
  if (!user.mustChangePassword && !A.verifyPassword(body.currentPassword || '', user.salt, user.passwordHash)) throw new HttpError(400, 'Current password is incorrect');
  A.checkPasswordPolicy(body.newPassword);
  if (!user.mustChangePassword && body.newPassword === body.currentPassword) throw new HttpError(400, 'New password must be different from the current one');
  const { salt, hash } = A.hashPassword(body.newPassword);
  user.salt = salt; user.passwordHash = hash;
  user.mustChangePassword = false;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await store.put('users', user);
  await store.deleteAuthOtp(user.id);
  await audit(store, user, 'password.change', 'Changed own password');
  return { ...A.signToken(user), user: A.publicUser(user) };
});

// --------------------------------------------------------------- dashboard
route('GET', '/admin/stats', { roles: STAFF }, async ({ store }) => {
  const [bookings, agents] = await Promise.all([store.list('bookings'), store.list('agents')]);
  const t = U.today();
  const month = t.slice(0, 7);
  const count = (s) => bookings.filter((b) => b.status === s).length;
  const todays = bookings.filter((b) => b.date === t && ['accepted', 'completed'].includes(b.status));
  const b0 = AV.board(agents, bookings, t, 1);
  const weekAhead = U.addDays(t, 7);
  const trend = Array.from({ length: 14 }, (_, i) => { const d = U.addDays(t, i - 13); return { date: d, requests: bookings.filter((b) => b.createdAt.slice(0, 10) === d).length }; });
  const byPackage = {};
  for (const b of bookings) byPackage[b.packageName] = (byPackage[b.packageName] || 0) + 1;
  return {
    today: t,
    counts: { pending: count('pending'), accepted: count('accepted'), rejected: count('rejected'), completed: count('completed'), cancelled: count('cancelled'), total: bookings.length },
    todayJobs: todays.length,
    agentsActive: agents.filter((a) => a.active !== false).length,
    agentsAvailableToday: b0.agents.filter((a) => ['available', 'partial'].includes(a.days[0].status)).length,
    revenueMonth: fmtMoney(bookings.filter((b) => b.date.startsWith(month) && ['accepted', 'completed'].includes(b.status)).reduce((s, b) => s + b.price, 0)),
    upcoming: bookings.filter((b) => b.date >= t && b.date <= weekAhead && ['accepted', 'pending'].includes(b.status)).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)).slice(0, 8)
      .map((b) => ({ id: b.id, ref: b.ref, date: b.date, startTime: b.startTime, status: b.status, packageName: b.packageName, customer: b.customer.name })),
    trend, byPackage,
  };
});
route('GET', '/admin/availability', { roles: STAFF }, async ({ store, query }) => {
  const start = U.isDate(query.start) ? query.start : U.today();
  const days = U.int(query.days, { field: 'days', min: 1, max: 31, def: 7 });
  return AV.board(await store.list('agents'), await store.list('bookings'), start, days);
});

// --------------------------------------------------------------- notifications
route('GET', '/admin/notifications', { roles: STAFF }, async ({ store, user }) => {
  const all = (await store.list('notifications')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const items = all.slice(0, 50).map((n) => ({ ...n, read: n.readBy.includes(user.id), readBy: undefined }));
  const pending = (await store.list('bookings')).filter((b) => b.status === 'pending').length;
  return { unread: all.filter((n) => !n.readBy.includes(user.id)).length, pending, items };
});
route('POST', '/admin/notifications/read', { roles: STAFF }, async ({ store, user, body }) => {
  const all = await store.list('notifications');
  const ids = body.all ? all.map((n) => n.id) : Array.isArray(body.ids) ? body.ids : [];
  for (const n of all) if (ids.includes(n.id) && !n.readBy.includes(user.id)) { n.readBy.push(user.id); await store.put('notifications', n); }
  return { ok: true };
});

// --------------------------------------------------------------- bookings (all staff)
route('GET', '/admin/bookings', { roles: STAFF }, async ({ store, query }) => {
  const [bookings, agents] = await Promise.all([store.list('bookings'), store.list('agents')]);
  const q = (query.q || '').toLowerCase().trim();
  let list = bookings.filter((b) => (!query.status || query.status === 'all' || b.status === query.status)
    && (!query.from || b.date >= query.from) && (!query.to || b.date <= query.to)
    && (!query.agentId || (b.agentIds || []).includes(query.agentId))
    && (!q || [b.ref, b.customer.name, b.customer.email, b.customer.phone, b.packageName, b.address?.city].join(' ').toLowerCase().includes(q)));
  const sort = query.sort || 'created';
  list.sort(sort === 'date' ? (a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime) : (a, b) => b.createdAt.localeCompare(a.createdAt));
  return { total: list.length, items: list.slice(0, 500).map((b) => bookingView(b, agents)) };
});
route('GET', '/admin/bookings/:id', { roles: STAFF }, async ({ store, params }) => {
  const b = await store.get('bookings', params.id);
  if (!b) throw new HttpError(404, 'Booking not found');
  const [agents, emails] = await Promise.all([store.list('agents'), store.list('emails')]);
  return { booking: bookingView(b, agents), emails: emails.filter((e) => e.bookingId === b.id).sort((x, y) => x.sentAt.localeCompare(y.sentAt)) };
});
route('GET', '/admin/bookings/:id/agents', { roles: STAFF }, async ({ store, params, query }) => {
  const b = await store.get('bookings', params.id);
  if (!b) throw new HttpError(404, 'Booking not found');
  // allow "what if" checks for a modified date/time before saving
  if (U.isDate(query.date)) b.date = query.date;
  if (U.isTime(query.startTime)) b.startTime = query.startTime;
  if (query.durationHours) b.durationHours = Number(query.durationHours) || b.durationHours;
  return { date: b.date, startTime: b.startTime, durationHours: b.durationHours, agentsRequired: b.agentsRequired || 1, agents: AV.agentsForBooking(b, await store.list('agents'), await store.list('bookings')) };
});
route('GET', '/admin/agents/check', { roles: STAFF }, async ({ store, query }) => {
  if (!U.isDate(query.date) || !U.isTime(query.startTime)) throw new HttpError(400, 'date and startTime are required');
  const b = { id: query.excludeId || '_new', date: query.date, startTime: query.startTime, durationHours: Number(query.durationHours) || 2 };
  return { agents: AV.agentsForBooking(b, await store.list('agents'), await store.list('bookings')) };
});

route('POST', '/admin/bookings', { roles: STAFF }, async ({ store, user, body }) => {
  const pkg = await getPackage(store, body.packageId);
  const when = parseWhen(body, pkg, { publicRequest: false });
  const extras = await resolveExtras(store, body.extras);
  const at = nowIso();
  const booking = {
    id: uid('bkg_'), ref: newRef(), packageId: pkg.id, packageName: pkg.name, ...when, agentsRequired: pkg.agentsRequired || 1, extras,
    price: body.price != null && body.price !== '' ? U.num(body.price, { field: 'Price' }) : fmtMoney(pkg.price + extras.reduce((s, e) => s + e.price, 0)),
    customer: parseCustomer(body.customer), address: parseAddress(body.address),
    propertyType: U.str(body.propertyType, { field: 'Property type', max: 40 }) || 'Home',
    bedrooms: U.int(body.bedrooms, { field: 'Bedrooms', max: 20 }), bathrooms: U.int(body.bathrooms, { field: 'Bathrooms', max: 20 }),
    notes: U.str(body.notes, { field: 'Notes', max: 1000 }), internalNotes: U.str(body.internalNotes, { field: 'Internal notes', max: 2000 }),
    status: 'pending', agentIds: [], source: 'staff', createdBy: user.username, createdAt: at, updatedAt: at,
    history: [{ at, by: user.username, action: 'created', note: 'Created by staff' }], email: null,
  };
  let names = [];
  const saveBooking = async () => {
    if (Array.isArray(body.agentIds) && body.agentIds.length) {
      const overrideReason = conflictOverrideReason(user, body);
      const v = await validateAgents(store, booking, body.agentIds, { force: !!body.force });
      booking.agentIds = v.ids; booking.status = 'accepted'; names = v.names;
      booking.history.push({ at, by: user.username, action: 'accepted', note: `Assigned: ${v.names.join(', ')}${v.conflicts.length ? ` (conflict overridden: ${overrideReason})` : ''}` });
    }
    await store.put('bookings', booking);
  };
  if (Array.isArray(body.agentIds) && body.agentIds.length) {
    await store.withLocks(agentScheduleLocks(booking.date, body.agentIds), saveBooking);
  } else await saveBooking();
  const message = U.str(body.message, { field: 'Message', max: 2000 });
  await sendBookingMail(store, booking, booking.status === 'accepted' ? 'accepted' : 'received', { note: message, agentNames: firstNames(names), by: user.username });
  await store.put('bookings', booking);
  await audit(store, user, 'booking.create', booking.ref);
  await notify(store, { type: 'booking_update', title: `${booking.ref} created by ${user.name}`, message: `${booking.customer.name} · ${booking.date} ${booking.startTime}`, bookingId: booking.id, actorId: user.id });
  return { status: 201, body: { booking } };
});

async function loadBooking(store, id) {
  const b = await store.get('bookings', id);
  if (!b) throw new HttpError(404, 'Booking not found');
  return b;
}
async function finish(store, user, b, { action, kind, note, changes, historyNote, notifyCustomer = true, auditMsg }) {
  b.updatedAt = nowIso();
  b.history.push({ at: b.updatedAt, by: user.username, action, note: [historyNote, changes?.join('; '), note].filter(Boolean).join(' — ') });
  let mail = null;
  if (notifyCustomer) mail = await sendBookingMail(store, b, kind, { note, changes, agentNames: firstNames(await agentNames(store, b.agentIds)), by: user.username });
  await store.put('bookings', b);
  await audit(store, user, `booking.${action}`, auditMsg || b.ref);
  await notify(store, { type: 'booking_update', title: `${b.ref} ${action} by ${user.name}`, message: `${b.customer.name} · ${b.date} ${b.startTime}`, bookingId: b.id, actorId: user.id });
  const agents = await store.list('agents');
  return { booking: bookingView(b, agents), email: mail && { status: mail.status, subject: mail.subject } };
}

route('POST', '/admin/bookings/:id/accept', { roles: STAFF }, async ({ store, user, params, body }) => {
  const overrideReason = conflictOverrideReason(user, body);
  return withBookingLocks(store, params.id, (b) => agentScheduleLocks(b.date, body.agentIds || []), async (b) => {
  if (!['pending', 'rejected'].includes(b.status)) throw new HttpError(400, `Booking is already ${b.status}`);
  if (!Array.isArray(body.agentIds) || !body.agentIds.length) throw new HttpError(400, 'Assign at least one cleaning agent before accepting');
  const v = await validateAgents(store, b, body.agentIds, { force: !!body.force });
  b.agentIds = v.ids; b.status = 'accepted';
  const note = U.str(body.message, { field: 'Message', max: 2000 });
  const historyNote = `Cleaners assigned: ${v.names.join(', ')}${v.conflicts.length ? ` (conflict override: ${overrideReason})` : ''}`;
  return finish(store, user, b, { action: 'accepted', kind: 'accepted', note, historyNote, auditMsg: `${b.ref} → ${v.names.join(', ')}${v.conflicts.length ? ` (override: ${overrideReason})` : ''}` });
  });
});
route('POST', '/admin/bookings/:id/reject', { roles: STAFF }, async ({ store, user, params, body }) => {
  return withBookingLocks(store, params.id, () => [], async (b) => {
  if (['completed', 'cancelled', 'rejected'].includes(b.status)) throw new HttpError(400, `Booking is already ${b.status}`);
  const reason = U.str(body.reason, { field: 'Reason', required: true, min: 3, max: 2000 });
  b.status = 'rejected'; b.agentIds = [];
  return finish(store, user, b, { action: 'rejected', kind: 'rejected', note: reason });
  });
});
route('POST', '/admin/bookings/:id/status', { roles: STAFF }, async ({ store, user, params, body }) => {
  return withBookingLocks(store, params.id, () => [], async (b) => {
  const status = body.status;
  const allowed = { completed: ['accepted'], cancelled: ['pending', 'accepted'], pending: ['rejected', 'cancelled'] };
  if (!allowed[status]) throw new HttpError(400, 'Status must be completed, cancelled or pending');
  if (!allowed[status].includes(b.status)) throw new HttpError(400, `Cannot change a ${b.status} booking to ${status}`);
  b.status = status;
  if (status === 'pending') b.agentIds = [];
  const note = U.str(body.message, { field: 'Message', max: 2000 });
  return finish(store, user, b, { action: status === 'pending' ? 'reopened' : status, kind: status === 'pending' ? 'note' : status, note: note || (status === 'pending' ? 'Your booking has been re-opened and is being reviewed again.' : ''), notifyCustomer: body.notify !== false });
  });
});
route('POST', '/admin/bookings/:id/message', { roles: STAFF }, async ({ store, user, params, body }) => {
  return withBookingLocks(store, params.id, () => [], async (b) => {
  const note = U.str(body.message, { field: 'Message', required: true, max: 4000 });
  return finish(store, user, b, { action: 'messaged', kind: 'note', note });
  });
});
route('PATCH', '/admin/bookings/:id', { roles: STAFF }, async ({ store, user, params, body }) => {
  const overrideReason = conflictOverrideReason(user, body);
  return withBookingLocks(
    store,
    params.id,
    (b) => [
      ...agentScheduleLocks(body.date || b.date, body.agentIds || b.agentIds || []),
    ],
    async (b) => {
  if (['completed', 'cancelled'].includes(b.status)) throw new HttpError(400, `A ${b.status} booking cannot be modified`);
  const changes = [];
  const set = (label, key, val, fmt = (x) => x) => { if (JSON.stringify(b[key]) !== JSON.stringify(val)) { changes.push(`${label}: ${fmt(b[key]) || '—'} → ${fmt(val) || '—'}`); b[key] = val; } };
  if (body.packageId && body.packageId !== b.packageId) {
    const p = await getPackage(store, body.packageId);
    changes.push(`Package: ${b.packageName} → ${p.name}`);
    Object.assign(b, { packageId: p.id, packageName: p.name, agentsRequired: p.agentsRequired || 1 });
    if (body.durationHours == null) b.durationHours = p.durationHours;
  }
  if (body.date || body.startTime || body.durationHours != null) {
    const w = parseWhen({ date: body.date || b.date, startTime: body.startTime || b.startTime, durationHours: body.durationHours ?? b.durationHours }, { durationHours: b.durationHours }, { publicRequest: false });
    set('Date', 'date', w.date); set('Arrival time', 'startTime', w.startTime); set('Duration (h)', 'durationHours', w.durationHours);
  }
  if (body.extras) set('Extras', 'extras', await resolveExtras(store, body.extras), (x) => (x || []).map((e) => e.name).join(', '));
  if (body.price != null && body.price !== '') set('Price', 'price', U.num(body.price, { field: 'Price' }));
  if (body.customer) { const c = parseCustomer({ ...b.customer, ...body.customer }); set('Customer', 'customer', c, (x) => `${x.name} (${x.email}, ${x.phone})`); }
  if (body.address) set('Address', 'address', parseAddress({ ...b.address, ...body.address }), (x) => [x.line1, x.city, x.postcode].filter(Boolean).join(', '));
  if (body.notes != null) set('Customer notes', 'notes', U.str(body.notes, { field: 'Notes', max: 1000 }));
  if (body.propertyType != null) set('Property', 'propertyType', U.str(body.propertyType, { field: 'Property type', max: 40 }));
  if (body.bedrooms != null) set('Bedrooms', 'bedrooms', U.int(body.bedrooms, { field: 'Bedrooms', max: 20 }));
  if (body.bathrooms != null) set('Bathrooms', 'bathrooms', U.int(body.bathrooms, { field: 'Bathrooms', max: 20 }));
  const internalChanged = body.internalNotes != null && body.internalNotes !== b.internalNotes;
  if (internalChanged) b.internalNotes = U.str(body.internalNotes, { field: 'Internal notes', max: 2000 });

  // agents: re-validate when assignment or schedule changed on a confirmed booking
  const newAgents = Array.isArray(body.agentIds) ? [...new Set(body.agentIds)] : b.agentIds;
  const scheduleChanged = changes.some((c) => /^(Date|Arrival time|Duration)/.test(c));
  if (newAgents.length && (b.status === 'accepted' || Array.isArray(body.agentIds)) && (scheduleChanged || JSON.stringify(newAgents) !== JSON.stringify(b.agentIds))) {
    const v = await validateAgents(store, b, newAgents, { force: !!body.force });
    if (JSON.stringify(v.ids) !== JSON.stringify(b.agentIds)) changes.push(`Cleaners: ${firstNames(v.names).join(', ')}`);
    if (v.conflicts.length) changes.push(`Availability override reason: ${overrideReason}`);
    b.agentIds = v.ids;
    if (b.status === 'pending' && body.accept) b.status = 'accepted';
  }
  if (Array.isArray(body.agentIds) && !body.agentIds.length && b.agentIds.length) { b.agentIds = []; changes.push('Cleaners: unassigned'); if (b.status === 'accepted') b.status = 'pending'; }

  if (!changes.length && !internalChanged) throw new HttpError(400, 'Nothing changed');
  const note = U.str(body.message, { field: 'Message', max: 2000 });
  const customerVisible = changes.length > 0;
  return finish(store, user, b, { action: 'modified', kind: 'modified', note, changes, notifyCustomer: customerVisible && body.notify !== false });
    },
  );
});

// --------------------------------------------------------------- agents
route('GET', '/admin/agents', { roles: STAFF }, async ({ store }) => ({ items: (await store.list('agents')).sort((a, b) => a.name.localeCompare(b.name)) }));
function parseAgent(body, existing = {}) {
  const wd = body.workingDays ?? existing.workingDays ?? [1, 2, 3, 4, 5, 6];
  if (!Array.isArray(wd) || wd.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new HttpError(400, 'workingDays must be a list of weekday numbers 0–6');
  return {
    name: U.str(body.name ?? existing.name, { field: 'Name', required: true, min: 2, max: 80 }),
    phone: U.str(body.phone ?? existing.phone, { field: 'Phone', max: 30 }),
    email: U.email(body.email ?? existing.email, 'Email', false),
    color: /^#[0-9a-f]{6}$/i.test(body.color || '') ? body.color : existing.color || '#22c3e6',
    skills: Array.isArray(body.skills) ? body.skills.map((s) => U.str(s, { field: 'Skill', max: 40 })).filter(Boolean).slice(0, 12) : existing.skills || [],
    workingDays: [...new Set(wd)].sort(),
    active: body.active != null ? !!body.active : existing.active !== false,
  };
}
route('POST', '/admin/agents', { roles: MGMT }, async ({ store, user, body }) => {
  const a = { id: uid('agt_'), ...parseAgent(body), leaves: [], createdAt: nowIso() };
  await store.put('agents', a); await audit(store, user, 'agent.create', a.name);
  return { status: 201, body: a };
});
route('PATCH', '/admin/agents/:id', { roles: MGMT }, async ({ store, user, params, body }) => {
  const a = await store.get('agents', params.id); if (!a) throw new HttpError(404, 'Agent not found');
  Object.assign(a, parseAgent(body, a)); await store.put('agents', a); await audit(store, user, 'agent.update', a.name);
  return a;
});
route('DELETE', '/admin/agents/:id', { roles: MGMT }, async ({ store, user, params }) => {
  const a = await store.get('agents', params.id); if (!a) throw new HttpError(404, 'Agent not found');
  const future = (await store.list('bookings')).filter((b) => b.status === 'accepted' && b.date >= U.today() && b.agentIds.includes(a.id));
  if (future.length) throw new HttpError(409, `${a.name} is assigned to ${future.length} upcoming booking(s): ${future.map((b) => b.ref).join(', ')}. Reassign them or deactivate the agent instead.`);
  await store.remove('agents', a.id); await audit(store, user, 'agent.delete', a.name);
  return { ok: true };
});
route('POST', '/admin/agents/:id/leave', { roles: MGMT }, async ({ store, user, params, body }) => {
  const a = await store.get('agents', params.id); if (!a) throw new HttpError(404, 'Agent not found');
  const from = body.date || body.from; const to = body.to || from;
  if (!U.isDate(from) || !U.isDate(to) || to < from) throw new HttpError(400, 'Valid date (or from/to range) required');
  const reason = U.str(body.reason, { field: 'Reason', max: 100 });
  const bookings = await store.list('bookings');
  const clashes = [];
  for (let d = from, n = 0; d <= to && n < 62; d = U.addDays(d, 1), n++) {
    if (!(a.leaves || []).some((l) => l.date === d)) (a.leaves ||= []).push({ date: d, reason });
    clashes.push(...bookings.filter((b) => b.date === d && b.status === 'accepted' && b.agentIds.includes(a.id)).map((b) => b.ref));
  }
  a.leaves.sort((x, y) => x.date.localeCompare(y.date));
  await store.put('agents', a); await audit(store, user, 'agent.leave', `${a.name} ${from}${to !== from ? '…' + to : ''}`);
  return { agent: a, warnings: clashes.length ? [`${a.name} is still assigned to ${clashes.join(', ')} — reassign these bookings.`] : [] };
});
route('DELETE', '/admin/agents/:id/leave/:date', { roles: MGMT }, async ({ store, user, params }) => {
  const a = await store.get('agents', params.id); if (!a) throw new HttpError(404, 'Agent not found');
  a.leaves = (a.leaves || []).filter((l) => l.date !== params.date);
  await store.put('agents', a); await audit(store, user, 'agent.leave.remove', `${a.name} ${params.date}`);
  return { agent: a };
});

// --------------------------------------------------------------- packages
function parsePackage(body, existing = {}) {
  const list = (v, f) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : f || []).map((s) => String(s).trim()).filter(Boolean).slice(0, 20).map((s) => s.slice(0, 120));
  return {
    name: U.str(body.name ?? existing.name, { field: 'Name', required: true, max: 60 }),
    category: U.str(body.category ?? existing.category, { field: 'Category', max: 40 }) || 'Home',
    tagline: U.str(body.tagline ?? existing.tagline, { field: 'Tagline', max: 140 }),
    price: U.num(body.price ?? existing.price, { field: 'Price', min: 0 }),
    durationHours: U.num(body.durationHours ?? existing.durationHours ?? 2, { field: 'Duration', min: 0.5, max: 10 }),
    agentsRequired: U.int(body.agentsRequired ?? existing.agentsRequired ?? 1, { field: 'Agents required', min: 1, max: 10, def: 1 }),
    features: list(body.features, existing.features), excludes: list(body.excludes, existing.excludes),
    color: /^#[0-9a-f]{6}$/i.test(body.color || '') ? body.color : existing.color || '#22c3e6',
    icon: ['sparkle', 'bubbles', 'box', 'building', 'leaf', 'home'].includes(body.icon) ? body.icon : existing.icon || 'sparkle',
    popular: body.popular != null ? !!body.popular : !!existing.popular,
    active: body.active != null ? !!body.active : existing.active !== false,
    order: U.int(body.order ?? existing.order ?? 99, { field: 'Order', max: 999, def: 99 }),
  };
}
route('GET', '/admin/packages', { roles: STAFF }, async ({ store }) => ({ items: (await store.list('packages')).sort((a, b) => (a.order || 0) - (b.order || 0)), extras: await getExtras(store) }));
route('POST', '/admin/packages', { roles: MGMT }, async ({ store, user, body }) => {
  const p = { id: uid('pkg_'), ...parsePackage(body), createdAt: nowIso() };
  await store.put('packages', p); await audit(store, user, 'package.create', p.name);
  return { status: 201, body: p };
});
route('PATCH', '/admin/packages/:id', { roles: MGMT }, async ({ store, user, params, body }) => {
  const p = await store.get('packages', params.id); if (!p) throw new HttpError(404, 'Package not found');
  Object.assign(p, parsePackage(body, p)); await store.put('packages', p); await audit(store, user, 'package.update', p.name);
  return p;
});
route('DELETE', '/admin/packages/:id', { roles: MGMT }, async ({ store, user, params }) => {
  const p = await store.get('packages', params.id); if (!p) throw new HttpError(404, 'Package not found');
  if ((await store.list('bookings')).some((b) => b.packageId === p.id)) { p.active = false; await store.put('packages', p); await audit(store, user, 'package.archive', p.name); return { archived: true }; }
  await store.remove('packages', p.id); await audit(store, user, 'package.delete', p.name);
  return { ok: true };
});
route('PUT', '/admin/extras', { roles: MGMT }, async ({ store, user, body }) => {
  if (!Array.isArray(body.items)) throw new HttpError(400, 'items must be a list');
  const items = body.items.slice(0, 30).map((e) => ({ id: U.str(e.id, { field: 'Extra id', max: 30 }) || uid('x'), name: U.str(e.name, { field: 'Extra name', required: true, max: 60 }), price: U.num(e.price, { field: 'Extra price' }) }));
  await store.put('settings', { id: 'extras', items }); await audit(store, user, 'extras.update', `${items.length} extras`);
  return { items };
});

// --------------------------------------------------------------- users
route('GET', '/admin/users', { roles: MGMT }, async ({ store, user }) => ({
  items: (await store.list('users')).sort((a, b) => A.ROLE_RANK[b.role] - A.ROLE_RANK[a.role] || a.username.localeCompare(b.username))
    .map((u) => ({ ...A.publicUser(u), canManage: A.canManageUser(user, u), canResetPassword: user.role === 'superadmin' && u.id !== user.id, isSelf: u.id === user.id })),
}));
route('POST', '/admin/users', { roles: MGMT }, async ({ store, user, body }) => {
  const role = body.role;
  if (!A.canAssignRole(user, role)) throw new HttpError(403, `You cannot create a ${A.ROLE_LABEL[role] || role} account`);
  const username = U.str(body.username, { field: 'Username', required: true, min: 3, max: 40 }).toLowerCase();
  if (!/^[a-z0-9._-]+$/.test(username)) throw new HttpError(400, 'Username may contain letters, numbers, dot, dash and underscore');
  if ((await store.list('users')).some((u) => u.username === username)) throw new HttpError(409, 'Username already exists');
  const otp = createStaffOtp();
  const u = {
    id: uid('usr_'), username, name: U.str(body.name, { field: 'Name', required: true, max: 80 }), email: U.email(body.email, 'Email', false),
    phone: U.str(body.phone, { field: 'Phone', max: 30 }), role, salt: null, passwordHash: null, active: true,
    mustChangePassword: true, tokenVersion: 0, createdAt: nowIso(), createdBy: user.username,
  };
  await store.put('users', u);
  await store.setAuthOtp(u.id, { salt: otp.salt, hash: otp.hash, expiresAt: otp.expiresAt, attemptsRemaining: STAFF_OTP_ATTEMPTS });
  await audit(store, user, 'user.create', `${u.username} (${A.ROLE_LABEL[role]})`);
  return { status: 201, body: { ...A.publicUser(u), otp: otp.otp, otpExpiresAt: otp.expiresAt } };
});
async function loadManagedUser(store, actor, id) {
  const target = await store.get('users', id);
  if (!target) throw new HttpError(404, 'User not found');
  if (!A.canManageUser(actor, target)) throw new HttpError(403, 'You do not have permission to manage this account');
  return target;
}
async function assertNotLastSuperadmin(store, target, nextRole, nextActive) {
  if (target.role !== 'superadmin') return;
  if (nextRole === 'superadmin' && nextActive !== false) return;
  const others = (await store.list('users')).filter((u) => u.role === 'superadmin' && u.active !== false && u.id !== target.id);
  if (!others.length) throw new HttpError(400, 'There must always be at least one active Super Admin');
}
route('PATCH', '/admin/users/:id', { roles: MGMT }, async ({ store, user, params, body }) => {
  const t = await loadManagedUser(store, user, params.id);
  const nextRole = body.role ?? t.role;
  const nextActive = body.active != null ? !!body.active : t.active !== false;
  if (nextRole !== t.role && !A.canAssignRole(user, nextRole)) throw new HttpError(403, `You cannot assign the ${A.ROLE_LABEL[nextRole] || nextRole} role`);
  if (t.id === user.id && (nextRole !== t.role || !nextActive)) throw new HttpError(400, 'You cannot change your own role or deactivate yourself');
  await assertNotLastSuperadmin(store, t, nextRole, nextActive);
  const accessChanged = nextRole !== t.role || nextActive !== (t.active !== false);
  const before = `${t.role}/${t.active !== false}`;
  if (body.name != null) t.name = U.str(body.name, { field: 'Name', required: true, max: 80 });
  if (body.email != null) t.email = U.email(body.email, 'Email', false);
  if (body.phone != null) t.phone = U.str(body.phone, { field: 'Phone', max: 30 });
  if (accessChanged) t.tokenVersion = (t.tokenVersion || 0) + 1;
  t.role = nextRole; t.active = nextActive;
  await store.put('users', t);
  if (accessChanged) await store.deleteAuthOtp(t.id);
  await audit(store, user, 'user.update', `${t.username} ${before} → ${t.role}/${t.active}`);
  return A.publicUser(t);
});
route('POST', '/admin/users/:id/reset-password', { roles: ['superadmin'] }, async ({ store, user, params }) => {
  const t = await loadManagedUser(store, user, params.id);
  if (t.id === user.id) throw new HttpError(400, 'Use My account to change your own password');
  const otp = createStaffOtp();
  Object.assign(t, { salt: null, passwordHash: null, mustChangePassword: true, tokenVersion: (t.tokenVersion || 0) + 1 });
  await store.put('users', t);
  await store.setAuthOtp(t.id, { salt: otp.salt, hash: otp.hash, expiresAt: otp.expiresAt, attemptsRemaining: STAFF_OTP_ATTEMPTS });
  await audit(store, user, 'user.reset-password', t.username);
  return { ok: true, otp: otp.otp, otpExpiresAt: otp.expiresAt };
});
route('DELETE', '/admin/users/:id', { roles: MGMT }, async ({ store, user, params }) => {
  const t = await loadManagedUser(store, user, params.id);
  if (t.id === user.id) throw new HttpError(400, 'You cannot delete your own account');
  await assertNotLastSuperadmin(store, t, null, false);
  await store.deleteAuthOtp(t.id);
  await store.remove('users', t.id); await audit(store, user, 'user.delete', t.username);
  return { ok: true };
});

route('GET', '/admin/audit', { roles: MGMT }, async ({ store, user, query }) => {
  let items = (await store.list('audit')).sort((a, b) => b.at.localeCompare(a.at));
  if (user.role !== 'superadmin') items = items.filter((x) => x.role !== 'superadmin');
  const limit = U.int(query.limit, { field: 'limit', min: 1, max: 500, def: 200 });
  return { items: items.slice(0, limit) };
});

// --------------------------------------------------------------- dispatcher
async function handle({ method, path, query = {}, headers = {}, body, ip }) {
  try {
    const store = getStore();
    await ensureSeeded(store);
    await applyBusinessSettings(store);
    const p = ('/' + String(path || '').replace(/^\/+/, '').replace(/^api\/?/, '')).replace(/\/+$/, '') || '/';
    if (method === 'OPTIONS') return { status: 204, body: null };
    const candidates = routes.filter((x) => x.re.test(p));
    if (!candidates.length) throw new HttpError(404, 'Not found');
    const r = candidates.find((x) => x.method === method);
    if (!r) throw new HttpError(405, 'Method not allowed');
    const match = r.re.exec(p);
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(match[i + 1]); });
    let user = null;
    if (r.auth) {
      const token = headers['x-auth-token'] || (headers.authorization || '').replace(/^Bearer\s+/i, '');
      const claims = A.verifyToken(token);
      if (!claims) throw new HttpError(401, 'Please sign in');
      user = await store.get('users', claims.sub);
      if (!user || user.active === false || (user.tokenVersion || 0) !== claims.tv) throw new HttpError(401, 'Your session has expired. Please sign in again.');
      if (r.roles && !r.roles.includes(user.role)) throw new HttpError(403, 'You do not have permission to do this');
      if (user.mustChangePassword && !['/auth/me', '/auth/change-password'].includes(p)) {
        throw new HttpError(403, 'Change your password before using the staff portal');
      }
    }
    const out = await r.handler({ store, user, params, query, headers, body: body && typeof body === 'object' ? body : {}, ip });
    if (out && out.status && 'body' in out) return out;
    return { status: 200, body: out };
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message, details: e.details } };
    console.error('[api] unhandled', e);
    return { status: 500, body: { error: 'Something went wrong on our side. Please try again.' } };
  }
}

module.exports = { handle, routes };
