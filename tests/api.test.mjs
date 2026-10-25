// End-to-end tests for the API and static routing. Run: npm test  (Node 18+, no dependencies)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'axa-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.SEED_DEMO_DATA = 'true';
process.env.SEED_SUPERADMIN_PASSWORD = 'TestOnly-Super@12345';
process.env.AUTH_SECRET = 'test-secret-1234567890-test-secret';
delete process.env.RESEND_API_KEY;
delete process.env.MAIL_FROM;
const require = createRequire(import.meta.url);
const server = require('../dev-server.js');
let base;

before(async () => {
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  const suToken = await login('superadmin', process.env.SEED_SUPERADMIN_PASSWORD);
  for (const [username, name, role, password] of [
    ['manager', 'Maya Manager', 'manager', 'Manager@12345'],
    ['admin', 'Adam Admin', 'admin', 'Admin@12345'],
  ]) {
    const created = await call('POST', '/admin/users', { username, name, role }, suToken);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.match(created.body.otp, /^\d{8}$/);
    await claimOtp(username, created.body.otp, password);
  }
});
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

let bookingKeySequence = 0;
async function call(method, p, body, token, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...(token ? { 'X-Auth-Token': token } : {}) };
  if (method === 'POST' && p === '/bookings') headers['Idempotency-Key'] = `test-booking-request-${++bookingKeySequence}`;
  Object.assign(headers, extraHeaders);
  const res = await fetch(base + '/api' + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const login = async (u, p) => (await call('POST', '/auth/login', { username: u, password: p })).body.token;
async function claimOtp(username, otp, newPassword) {
  const signedIn = await call('POST', '/auth/login', { username, password: otp });
  assert.equal(signedIn.status, 200, JSON.stringify(signedIn.body));
  assert.equal(signedIn.body.user.mustChangePassword, true);
  const blocked = await call('GET', '/admin/stats', null, signedIn.body.token);
  assert.equal(blocked.status, 403);
  const changed = await call('POST', '/auth/change-password', { newPassword }, signedIn.body.token);
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal(changed.body.user.mustChangePassword, false);
  assert.equal((await call('POST', '/auth/login', { username, password: otp })).status, 401, 'one-time code cannot be reused');
  return changed.body.token;
}
function futureWorkday(offset = 3) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + offset);
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const customer = { name: 'Test Customer', email: 'customer@example.com', phone: '+94 77 123 4567' };
const address = { line1: '1 Test Road', city: 'Colombo', postcode: '00100' };

let su, mgr, adm, bookingId, bookingRef, agents;
const date = futureWorkday(5);

test('health and public packages', async () => {
  const h = await call('GET', '/health');
  assert.equal(h.status, 200); assert.equal(h.body.storage, 'file'); assert.equal(h.body.mail, 'log-only');
  const p = await call('GET', '/packages');
  assert.equal(p.status, 200); assert.ok(p.body.packages.length >= 5); assert.ok(p.body.extras.length > 0);
});

test('Romanian API errors and booking e-mail content follow the selected language', async () => {
  const invalid = await call('POST', '/contact', { email: 'customer@example.com', message: 'A sufficiently long message.' }, null, { 'Accept-Language': 'ro-RO,ro;q=0.9' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, 'Numele este obligatoriu.');
  const { render } = require('../api/src/lib/mail.js');
  const email = render({
    ref: 'AXA-TEST-RO', language: 'ro', date, startTime: '09:00', durationHours: 2,
    packageName: 'Pachet test', price: 100, status: 'pending',
    customer: { name: 'Client test' }, address: {}, extras: [],
  }, 'received');
  assert.match(email.text, /Am primit solicitarea ta de rezervare/);
  assert.match(email.text, /Referință: AXA-TEST-RO/);
});

test('public availability: calendar and slots', async () => {
  const c = await call('GET', `/availability/calendar?month=${date.slice(0, 7)}&packageId=pkg-deep`);
  assert.equal(c.status, 200); assert.ok(c.body.days.find((d) => d.date === date));
  const s = await call('GET', `/availability/slots?date=${date}&packageId=pkg-deep`);
  assert.equal(s.status, 200); assert.ok(s.body.slots.some((x) => x.available));
});

test('public booking: validation', async () => {
  const past = await call('POST', '/bookings', { packageId: 'pkg-essential', date: '2020-01-01', startTime: '09:00', customer, address, consent: true });
  assert.equal(past.status, 400);
  const hp = await call('POST', '/bookings', { packageId: 'pkg-essential', date, startTime: '09:00', customer, address, consent: true, website: 'spam' });
  assert.equal(hp.status, 400);
  const badEmail = await call('POST', '/bookings', { packageId: 'pkg-essential', date, startTime: '09:00', customer: { ...customer, email: 'nope' }, address, consent: true });
  assert.equal(badEmail.status, 400);
  const late = await call('POST', '/bookings', { packageId: 'pkg-move', date, startTime: '15:00', customer, address, consent: true });
  assert.equal(late.status, 400, 'job must fit working hours');
  assert.equal((await call('POST', '/bookings', { packageId: 'pkg-essential', date, startTime: '09:00', customer, address })).status, 400, 'explicit consent is required');
  assert.equal((await call('POST', '/bookings', { packageId: 'pkg-essential', date, startTime: '09:00', customer, address, consent: true }, null, { 'Idempotency-Key': '' })).status, 400, 'idempotency key is required');
});

test('public booking: create + track', async () => {
  const request = { packageId: 'pkg-deep', date, startTime: '09:00', extras: ['oven', 'bogus'], customer, address, bedrooms: 3, bathrooms: 2, consent: true };
  const key = 'integration-booking-request-001';
  const r = await call('POST', '/bookings', request, null, { 'Idempotency-Key': key });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.match(r.body.ref, /^AXA-\d{6}-[A-Z0-9]{4}$/);
  assert.equal(r.body.price, 189 + 30);
  assert.equal(r.body.emailStatus, 'logged');
  const retry = await call('POST', '/bookings', request, null, { 'Idempotency-Key': key });
  assert.equal(retry.status, 201);
  assert.equal(retry.body.ref, r.body.ref, 'retry returns the original booking');
  const mismatch = await call('POST', '/bookings', { ...request, notes: 'different payload' }, null, { 'Idempotency-Key': key });
  assert.equal(mismatch.status, 409, 'a key cannot be reused for different request data');
  bookingRef = r.body.ref;
  const t = await call('GET', `/bookings/track?ref=${bookingRef}&email=CUSTOMER@example.com`);
  assert.equal(t.status, 200); assert.equal(t.body.status, 'pending');
  const wrong = await call('GET', `/bookings/track?ref=${bookingRef}&email=other@example.com`);
  assert.equal(wrong.status, 404);
});

test('auth: logins, bad password, unauthenticated', async () => {
  assert.equal((await call('POST', '/auth/login', { username: 'superadmin', password: 'wrong' })).status, 401);
  su = await login('superadmin', 'TestOnly-Super@12345'); mgr = await login('manager', 'Manager@12345'); adm = await login('admin', 'Admin@12345');
  assert.ok(su && mgr && adm);
  assert.equal((await call('GET', '/admin/bookings')).status, 401);
  assert.equal((await call('GET', '/admin/bookings', null, 'garbage.token.here')).status, 401);
  const me = await call('GET', '/auth/me', null, su);
  assert.equal(me.body.user.role, 'superadmin'); assert.equal(me.body.user.passwordHash, undefined);
});

test('notifications: staff are notified of the new request', async () => {
  const n = await call('GET', '/admin/notifications', null, adm);
  assert.equal(n.status, 200);
  assert.ok(n.body.items.some((x) => x.type === 'booking_new' && x.title.includes(bookingRef)));
  assert.equal(n.body.items.filter((x) => x.type === 'booking_new' && x.title.includes(bookingRef)).length, 1, 'idempotent replay does not duplicate notifications');
  assert.ok(n.body.unread >= 1); assert.ok(n.body.pending >= 1);
  await call('POST', '/admin/notifications/read', { all: true }, adm);
  assert.equal((await call('GET', '/admin/notifications', null, adm)).body.unread, 0);
});

test('roles: admin limits', async () => {
  assert.equal((await call('GET', '/admin/users', null, adm)).status, 403);
  assert.equal((await call('GET', '/admin/audit', null, adm)).status, 403);
  assert.equal((await call('GET', '/admin/stats', null, adm)).status, 200);
  assert.equal((await call('GET', '/admin/availability', null, adm)).status, 200);
});

test('admin can manage packages and agents but not portal accounts', async () => {
  const agent = await call('POST', '/admin/agents', { name: 'Admin Cleaner', workingDays: [1, 3, 5] }, adm);
  assert.equal(agent.status, 201);
  assert.equal((await call('PATCH', `/admin/agents/${agent.body.id}`, { active: false }, adm)).body.active, false);
  const leaveDate = futureWorkday(40);
  assert.equal((await call('POST', `/admin/agents/${agent.body.id}/leave`, { date: leaveDate, reason: 'Training' }, adm)).status, 200);
  assert.equal((await call('DELETE', `/admin/agents/${agent.body.id}/leave/${leaveDate}`, null, adm)).status, 200);
  assert.equal((await call('DELETE', `/admin/agents/${agent.body.id}`, null, adm)).status, 200);

  const pkg = await call('POST', '/admin/packages', { name: 'Admin Package', price: 25 }, adm);
  assert.equal(pkg.status, 201);
  assert.equal((await call('PATCH', `/admin/packages/${pkg.body.id}`, { name: 'Updated Admin Package' }, adm)).body.name, 'Updated Admin Package');
  assert.equal((await call('DELETE', `/admin/packages/${pkg.body.id}`, null, adm)).status, 200);

  const beforeExtras = (await call('GET', '/admin/packages', null, adm)).body.extras;
  const extras = await call('PUT', '/admin/extras', { items: [...beforeExtras, { id: 'admin-extra', name: 'Admin Extra', price: 5 }] }, adm);
  assert.equal(extras.status, 200);
  assert.ok(extras.body.items.some((item) => item.id === 'admin-extra'));
  assert.equal((await call('PUT', '/admin/extras', { items: beforeExtras }, adm)).status, 200);

  assert.equal((await call('GET', '/admin/users', null, adm)).status, 403);
  assert.equal((await call('POST', '/admin/users', { username: 'another-admin', role: 'admin' }, adm)).status, 403);
  assert.equal((await call('PATCH', '/admin/users/not-a-user', { name: 'Not allowed' }, adm)).status, 403);
  assert.equal((await call('DELETE', '/admin/users/not-a-user', null, adm)).status, 403);
  assert.equal((await call('POST', '/admin/users/not-a-user/reset-password', {}, adm)).status, 403);
});

test('roles: manager cannot touch super admin or reset passwords; can manage others', async () => {
  const users = (await call('GET', '/admin/users', null, mgr)).body.items;
  const suUser = users.find((u) => u.role === 'superadmin');
  assert.equal(suUser.canManage, false);
  assert.equal((await call('PATCH', `/admin/users/${suUser.id}`, { name: 'Hacked' }, mgr)).status, 403);
  assert.equal((await call('DELETE', `/admin/users/${suUser.id}`, null, mgr)).status, 403);
  assert.equal((await call('POST', `/admin/users/${suUser.id}/reset-password`, {}, mgr)).status, 403);
  const admUser = users.find((u) => u.username === 'admin');
  assert.equal((await call('POST', `/admin/users/${admUser.id}/reset-password`, {}, mgr)).status, 403);
  assert.equal((await call('POST', '/admin/users', { name: 'Evil', username: 'evil', role: 'superadmin' }, mgr)).status, 403);
  const c = await call('POST', '/admin/users', { name: 'New Manager', username: 'mgr2', role: 'manager' }, mgr);
  assert.equal(c.status, 201);
  assert.match(c.body.otp, /^\d{8}$/);
  await claimOtp('mgr2', c.body.otp, 'ManagerTwo123');
  const a = await call('POST', '/admin/users', { name: 'New Admin', username: 'adm2', role: 'admin' }, mgr);
  assert.equal(a.status, 201);
  assert.match(a.body.otp, /^\d{8}$/);
  assert.equal(a.body.mustChangePassword, true);
  assert.equal((await call('POST', '/admin/users', { name: 'Dup', username: 'adm2', role: 'admin' }, mgr)).status, 409);
  assert.equal((await call('POST', '/admin/users', { name: 'Weak', username: 'weak', role: 'admin' }, mgr)).status, 201);
  // promoting to superadmin is blocked for managers
  assert.equal((await call('PATCH', `/admin/users/${a.body.id}`, { role: 'superadmin' }, mgr)).status, 403);
  // role change invalidates the user's existing token
  const t = await claimOtp('adm2', a.body.otp, 'AdminTwo123');
  assert.equal((await call('PATCH', `/admin/users/${a.body.id}`, { role: 'manager' }, mgr)).status, 200);
  assert.equal((await call('GET', '/auth/me', null, t)).status, 401);
  assert.equal((await call('DELETE', `/admin/users/${a.body.id}`, null, mgr)).status, 200);
  // manager cannot change own role
  const me = users.find((u) => u.username === 'manager');
  assert.equal((await call('PATCH', `/admin/users/${me.id}`, { role: 'admin' }, mgr)).status, 400);
});

test('roles: super admin safeguards', async () => {
  const users = (await call('GET', '/admin/users', null, su)).body.items;
  const self = users.find((u) => u.username === 'superadmin');
  assert.equal((await call('DELETE', `/admin/users/${self.id}`, null, su)).status, 400);
  const s2 = await call('POST', '/admin/users', { name: 'Second SA', username: 'sa2', role: 'superadmin' }, su);
  assert.equal(s2.status, 201);
  assert.match(s2.body.otp, /^\d{8}$/);
  assert.equal((await call('GET', '/admin/users', null, mgr)).body.items.find((u) => u.username === 'manager').canResetPassword, false);
  const secondToken = await login('sa2', s2.body.otp);
  assert.ok(secondToken);
  const reset = await call('POST', `/admin/users/${s2.body.id}/reset-password`, {}, su);
  assert.equal(reset.status, 200);
  assert.match(reset.body.otp, /^\d{8}$/);
  assert.equal((await call('POST', '/auth/login', { username: 'sa2', password: s2.body.otp })).status, 401, 'reset invalidates the previous code');
  const secondNewToken = await claimOtp('sa2', reset.body.otp, 'SecondSuper123');
  assert.equal((await call('GET', '/admin/users', null, secondNewToken)).status, 200);
  assert.equal((await call('DELETE', `/admin/users/${s2.body.id}`, null, su)).status, 200);
});

test('booking workflow: accept → threaded e-mail', async () => {
  const list = await call('GET', '/admin/bookings?status=pending', null, adm);
  const b = list.body.items.find((x) => x.ref === bookingRef);
  bookingId = b.id;
  const av = await call('GET', `/admin/bookings/${bookingId}/agents`, null, adm);
  assert.equal(av.status, 200);
  agents = av.body.agents.filter((a) => a.free);
  assert.ok(agents.length >= 2);
  assert.equal((await call('POST', `/admin/bookings/${bookingId}/accept`, { agentIds: [] }, adm)).status, 400);
  const acc = await call('POST', `/admin/bookings/${bookingId}/accept`, { agentIds: [agents[0].id, agents[1].id], message: 'See you soon' }, adm);
  assert.equal(acc.status, 200, JSON.stringify(acc.body));
  assert.equal(acc.body.booking.status, 'accepted');
  const d = (await call('GET', `/admin/bookings/${bookingId}`, null, adm)).body;
  assert.equal(d.emails.length, 2);
  const [first, second] = d.emails;
  assert.equal(first.inReplyTo, null);
  assert.equal(second.inReplyTo, first.messageId);
  assert.deepEqual(second.references, [first.messageId]);
  assert.equal(second.subject, `Re: ${first.subject}`);
  assert.equal(second.cc, undefined, 'no fabricated company mailbox is included before configuration');
  assert.match(second.text, /See you soon/);
});

test('availability: double-booking blocked unless forced; leave respected', async () => {
  const r = await call('POST', '/bookings', { packageId: 'pkg-essential', date, startTime: '10:00', customer: { ...customer, email: 'b2@example.com' }, address, consent: true });
  assert.equal(r.status, 201);
  const b2 = (await call('GET', '/admin/bookings?status=pending', null, adm)).body.items.find((x) => x.ref === r.body.ref);
  const av = (await call('GET', `/admin/bookings/${b2.id}/agents`, null, adm)).body.agents;
  assert.equal(av.find((a) => a.id === agents[0].id).free, false, 'agent busy 09:00-14:00 must not be free at 10:00');
  const c = await call('POST', `/admin/bookings/${b2.id}/accept`, { agentIds: [agents[0].id] }, adm);
  assert.equal(c.status, 409); assert.ok(c.body.details.conflicts.length);
  assert.equal((await call('POST', `/admin/bookings/${b2.id}/accept`, { agentIds: [agents[0].id], force: true, overrideReason: 'Exceptional coverage' }, adm)).status, 403);
  assert.equal((await call('POST', `/admin/bookings/${b2.id}/accept`, { agentIds: [agents[0].id], force: true }, mgr)).status, 400);
  const f = await call('POST', `/admin/bookings/${b2.id}/accept`, { agentIds: [agents[0].id], force: true, overrideReason: 'Exceptional coverage' }, mgr);
  assert.equal(f.status, 200);
  // leave
  const third = agents[2];
  const lv = await call('POST', `/admin/agents/${third.id}/leave`, { date, reason: 'Sick' }, mgr);
  assert.equal(lv.status, 200);
  const av2 = (await call('GET', `/admin/agents/check?date=${date}&startTime=15:00&durationHours=2`, null, adm)).body.agents;
  assert.equal(av2.find((a) => a.id === third.id).free, false);
  const board = (await call('GET', `/admin/availability?start=${date}&days=1`, null, adm)).body;
  assert.equal(board.agents.find((a) => a.id === third.id).days[0].status, 'leave');
  assert.ok(['partial', 'booked'].includes(board.agents.find((a) => a.id === agents[0].id).days[0].status));
  assert.equal((await call('DELETE', `/admin/agents/${third.id}/leave/${date}`, null, mgr)).status, 200);
});

test('booking workflow: modify, message, complete keep the same thread', async () => {
  const newDate = futureWorkday(9);
  const m = await call('PATCH', `/admin/bookings/${bookingId}`, { date: newDate, startTime: '08:00', message: 'Moved as requested' }, adm);
  assert.equal(m.status, 200, JSON.stringify(m.body));
  assert.equal(m.body.booking.date, newDate);
  assert.equal((await call('PATCH', `/admin/bookings/${bookingId}`, {}, adm)).status, 400, 'nothing changed');
  assert.equal((await call('POST', `/admin/bookings/${bookingId}/message`, { message: 'Please leave the gate open' }, adm)).status, 200);
  assert.equal((await call('POST', `/admin/bookings/${bookingId}/status`, { status: 'completed' }, adm)).status, 200);
  assert.equal((await call('PATCH', `/admin/bookings/${bookingId}`, { notes: 'x' }, adm)).status, 400, 'completed is locked');
  const d = (await call('GET', `/admin/bookings/${bookingId}`, null, adm)).body;
  assert.equal(d.emails.length, 5);
  const root = d.emails[0].messageId;
  for (let i = 1; i < 5; i++) {
    assert.equal(d.emails[i].inReplyTo, d.emails[i - 1].messageId);
    assert.equal(d.emails[i].references[0], root);
    assert.equal(d.emails[i].references.length, i);
  }
  assert.ok(d.emails.every((e) => e.subject.endsWith(bookingRef + '') || e.subject.includes(bookingRef)));
  assert.deepEqual(d.emails.map((e) => e.kind), ['received', 'accepted', 'modified', 'note', 'completed']);
});

test('booking workflow: reject needs reason; staff create', async () => {
  const r = await call('POST', '/bookings', { packageId: 'pkg-eco', date, startTime: '13:00', customer: { ...customer, email: 'rej@example.com' }, address, consent: true });
  const b = (await call('GET', '/admin/bookings?status=pending', null, adm)).body.items.find((x) => x.ref === r.body.ref);
  assert.equal((await call('POST', `/admin/bookings/${b.id}/reject`, {}, adm)).status, 400);
  const rj = await call('POST', `/admin/bookings/${b.id}/reject`, { reason: 'No team that day' }, adm);
  assert.equal(rj.status, 200); assert.equal(rj.body.booking.status, 'rejected');
  const free = (await call('GET', `/admin/agents/check?date=${futureWorkday(12)}&startTime=09:00&durationHours=2`, null, adm)).body.agents.find((a) => a.free);
  const c = await call('POST', '/admin/bookings', { packageId: 'pkg-essential', date: futureWorkday(12), startTime: '09:00', customer: { ...customer, email: 'phone@example.com' }, address, agentIds: [free.id] }, adm);
  assert.equal(c.status, 201, JSON.stringify(c.body)); assert.equal(c.body.booking.status, 'accepted'); assert.equal(c.body.booking.source, 'staff');
});

test('manager: agents and packages CRUD, audit', async () => {
  const a = await call('POST', '/admin/agents', { name: 'New Cleaner', workingDays: [1, 2, 3], skills: ['Windows'] }, mgr);
  assert.equal(a.status, 201);
  assert.equal((await call('PATCH', `/admin/agents/${a.body.id}`, { active: false }, mgr)).body.active, false);
  assert.equal((await call('DELETE', `/admin/agents/${a.body.id}`, null, mgr)).status, 200);
  const p = await call('POST', '/admin/packages', { name: 'Window Wash', nameRo: 'Spălare geamuri', price: 59, features: 'Inside glass\nFrames', featuresRo: 'Curățare geamuri\nTocuri', durationHours: 2 }, mgr);
  assert.equal(p.status, 201); assert.deepEqual(p.body.features, ['Inside glass', 'Frames']);
  assert.deepEqual(p.body.featuresRo, ['Curățare geamuri', 'Tocuri']);
  assert.ok((await call('GET', '/packages')).body.packages.some((x) => x.name === 'Window Wash' && x.nameRo === 'Spălare geamuri'));
  assert.equal((await call('DELETE', `/admin/packages/${p.body.id}`, null, mgr)).status, 200);
  const del = await call('DELETE', '/admin/packages/pkg-deep', null, mgr);
  assert.equal(del.body.archived, true, 'packages with bookings are archived');
  const audit = await call('GET', '/admin/audit', null, mgr);
  assert.ok(audit.body.items.some((x) => x.action === 'booking.accepted'));
  assert.ok(audit.body.items.every((x) => x.role !== 'superadmin'), 'managers do not see super admin activity');
});

test('availability locks serialize simultaneous assignments', async () => {
  const scheduleDate = futureWorkday(30);
  const request = (email) => call('POST', '/bookings', {
    packageId: 'pkg-essential', date: scheduleDate, startTime: '09:00',
    customer: { ...customer, email }, address, consent: true,
  });
  const [first, second] = await Promise.all([request('race-one@example.com'), request('race-two@example.com')]);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(second.status, 201, JSON.stringify(second.body));
  const [firstBooking, secondBooking] = await Promise.all([
    call('GET', `/admin/bookings?status=pending&q=${first.body.ref}`, null, adm),
    call('GET', `/admin/bookings?status=pending&q=${second.body.ref}`, null, adm),
  ]);
  const ids = [firstBooking.body.items[0].id, secondBooking.body.items[0].id];
  const available = (await call('GET', `/admin/agents/check?date=${scheduleDate}&startTime=09:00&durationHours=2`, null, adm)).body.agents.find((a) => a.free);
  assert.ok(available);
  const results = await Promise.all(ids.map((id) => call('POST', `/admin/bookings/${id}/accept`, { agentIds: [available.id] }, adm)));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
});

test('contact submissions are stored and can be closed by staff', async () => {
  let first;
  for (let i = 0; i < 5; i++) {
    const result = await call('POST', '/contact', {
      name: 'Contact Customer', email: `contact${i}@example.com`, phone: '',
      message: `Please contact me about service ${i}.`, website: '', language: i === 0 ? 'ro' : 'en',
    }, null, i === 0 ? { 'Accept-Language': 'ro' } : {});
    assert.equal(result.status, 201, JSON.stringify(result.body));
    if (i === 0) {
      first = result.body;
      assert.equal(first.message, 'Mulțumim. Mesajul tău a fost primit.');
    }
  }
  assert.equal(first.emailStatus, 'logged');
  assert.equal((await call('POST', '/contact', {
    name: 'Rate Limited', email: 'limited@example.com', message: 'Please call me about a service.',
  })).status, 429);
  const messages = await call('GET', '/admin/contacts?status=all', null, adm);
  assert.equal(messages.status, 200);
  assert.equal(messages.body.total, 5);
  assert.equal(messages.body.items.find((item) => item.id === first.id).language, 'ro');
  assert.equal((await call('PATCH', `/admin/contacts/${first.id}`, { status: 'closed' }, adm)).body.status, 'closed');
  assert.equal((await call('PATCH', `/admin/contacts/${first.id}`, { status: 'unknown' }, adm)).status, 400);
});

test('Super Admin business settings control public profile without exposing secrets', async () => {
  assert.equal((await call('GET', '/admin/settings', null, mgr)).status, 403);
  const saved = await call('PUT', '/admin/settings', {
    companyName: 'AXA Cleaning Test', companyEmail: 'team@example.com', phone: '+1 555 0100',
    serviceArea: 'Approved Test Area', currency: 'AUD', timezoneOffsetMinutes: 600,
  }, su);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const publicProfile = await call('GET', '/packages');
  assert.equal(publicProfile.body.currency, 'AUD');
  assert.equal(publicProfile.body.company.email, 'team@example.com');
  assert.equal(publicProfile.body.company.phone, '+1 555 0100');
  assert.equal(publicProfile.body.company.serviceArea, 'Approved Test Area');
  const settings = await call('GET', '/admin/settings', null, su);
  assert.equal(settings.body.business.currency, 'AUD');
  assert.equal(settings.body.business.serviceAreaScope, 'custom');
  assert.equal(settings.body.business.serviceAreaDetails, 'Approved Test Area');
  assert.equal(settings.body.checks.some((c) => c.id === 'legal'), false);
  assert.deepEqual(Object.keys(settings.body.mail).sort(), ['apiKeyConfigured', 'mode', 'senderConfigured']);

  const worldwide = await call('PUT', '/admin/settings', { serviceAreaScope: 'worldwide', serviceAreaDetails: '' }, su);
  assert.equal(worldwide.status, 200, JSON.stringify(worldwide.body));
  assert.equal((await call('GET', '/admin/settings', null, su)).body.checks.find((c) => c.id === 'service-area').ready, true);
  assert.equal((await call('GET', '/packages')).body.company.serviceArea, 'Worldwide');
  assert.equal((await call('GET', '/packages', null, null, { 'Accept-Language': 'ro' })).body.company.serviceArea, 'La nivel mondial');

  const invalidArea = await call('PUT', '/admin/settings', { serviceAreaScope: 'planetwide' }, su);
  assert.equal(invalidArea.status, 400);
});

test('staff password change revokes existing sessions', async () => {
  const t = await login('mgr2', 'ManagerTwo123');
  assert.equal((await call('GET', '/admin/bookings', null, t)).status, 200);
  assert.equal((await call('GET', '/auth/me', null, t)).status, 200);
  assert.equal((await call('POST', '/auth/change-password', { currentPassword: 'wrong', newPassword: 'Newpass123' }, t)).status, 400);
  const ok = await call('POST', '/auth/change-password', { currentPassword: 'ManagerTwo123', newPassword: 'Newpass123' }, t);
  assert.equal(ok.status, 200);
  assert.equal((await call('GET', '/auth/me', null, t)).status, 401, 'old token revoked');
  assert.equal((await call('GET', '/auth/me', null, ok.body.token)).status, 200);
});

test('production configuration rejects insecure launch defaults', async () => {
  const { validateProductionConfig } = require('../api/src/lib/config');
  assert.throws(
    () => validateProductionConfig({ NODE_ENV: 'production' }),
    /AUTH_SECRET/,
  );
  assert.throws(
    () => validateProductionConfig({ NODE_ENV: 'production', AUTH_SECRET: 'x'.repeat(32) }),
    /SUPABASE_URL and a service-role secret key/,
  );
  assert.throws(() => validateProductionConfig({
    NODE_ENV: 'production',
    AUTH_SECRET: 'x'.repeat(32),
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    SEED_DEMO_DATA: 'true',
  }), /SEED_DEMO_DATA/);
  assert.doesNotThrow(() => validateProductionConfig({
    NODE_ENV: 'production',
    AUTH_SECRET: 'x'.repeat(32),
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    SEED_DEMO_DATA: 'false',
  }));
  assert.doesNotThrow(() => validateProductionConfig({
    NODE_ENV: 'production',
    AUTH_SECRET: 'x'.repeat(32),
    SUPABASE_URL: 'https://wuhfojchbveaeozyztxs.supabase.co',
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'service-key' }),
    SEED_DEMO_DATA: 'false',
  }));
  assert.throws(() => validateProductionConfig({
    NODE_ENV: 'production',
    AUTH_SECRET: 'x'.repeat(32),
    SUPABASE_URL: 'http://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    SEED_DEMO_DATA: 'false',
  }), /HTTPS Supabase project URL/);
});

test('login throttling', async () => {
  for (let i = 0; i < 5; i++) await call('POST', '/auth/login', { username: 'admin', password: 'bad' });
  assert.equal((await call('POST', '/auth/login', { username: 'admin', password: 'Admin@12345' })).status, 429);
});

test('static routing mirrors staticwebapp.config.json', async () => {
  const home = await fetch(base + '/'); assert.equal(home.status, 200); assert.match(await home.text(), /AXA Cleaning/);
  const admin = await fetch(base + '/admin'); assert.match(await admin.text(), /Staff portal/);
  const deep = await fetch(base + '/some/client/route'); assert.equal(deep.status, 200);
  const missing = await fetch(base + '/js/nope.js'); assert.equal(missing.status, 404);
  assert.equal((await call('GET', '/does-not-exist')).status, 404);
  assert.equal((await call('DELETE', '/packages')).status, 405);
});

test('production seeding creates the initial admin without demo business data', async () => {
  const keys = ['NODE_ENV', 'AUTH_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS', 'SEED_DEMO_DATA', 'SEED_SUPERADMIN_PASSWORD', 'SEED_SUPERADMIN_USERNAME', 'COMPANY_NAME', 'COMPANY_EMAIL', 'COMPANY_PHONE', 'SERVICE_AREA', 'CURRENCY', 'TZ_OFFSET_MINUTES'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const seedPath = require.resolve('../api/src/lib/seed');
  const cachedSeed = require.cache[seedPath];
  try {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_SECRET = 'p'.repeat(40);
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    process.env.SEED_DEMO_DATA = 'false';
    process.env.SEED_SUPERADMIN_PASSWORD = 'ProductionSeed123';
    process.env.SEED_SUPERADMIN_USERNAME = 'launchadmin';
    for (const key of ['COMPANY_NAME', 'COMPANY_EMAIL', 'COMPANY_PHONE', 'SERVICE_AREA', 'CURRENCY', 'TZ_OFFSET_MINUTES']) delete process.env[key];
    delete require.cache[seedPath];
    const { ensureSeeded } = require('../api/src/lib/seed');
    const { MemoryStore } = require('../api/src/lib/store');
    const store = new MemoryStore();
    await ensureSeeded(store);
    assert.equal((await store.list('users')).length, 1);
    assert.equal((await store.list('users'))[0].username, 'launchadmin');
    assert.equal((await store.list('packages')).length, 0);
    assert.equal((await store.list('agents')).length, 0);
    assert.equal((await store.list('bookings')).length, 0);
    assert.equal((await store.get('settings', 'business')).companyEmail, '');
  } finally {
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
    delete require.cache[seedPath];
    if (cachedSeed) require.cache[seedPath] = cachedSeed;
  }
});
