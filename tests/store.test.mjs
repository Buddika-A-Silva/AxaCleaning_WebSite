import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SupabaseRpcStore } = require('../api/src/lib/store');
const { mailMode, sendBookingMail, sendContactMail } = require('../api/src/lib/mail');

test('Resend sends booking threads and contact mail over its HTTP API', async () => {
  const previousFetch = globalThis.fetch;
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousMailFrom = process.env.MAIL_FROM;
  const calls = [];
  try {
    process.env.RESEND_API_KEY = 're_test_key';
    assert.equal(mailMode(), 'misconfigured');
    process.env.MAIL_FROM = 'AXA Cleaning <bookings@example.com>';
    assert.equal(mailMode(), 'resend');
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ id: 'email-id' }), { status: 200 });
    };

    const store = new (require('../api/src/lib/store').MemoryStore)();
    const business = { companyName: 'AXA Cleaning', companyEmail: 'bookings@example.com', currency: 'USD' };
    const booking = {
      id: 'booking-1',
      ref: 'AXA-260101-ABCD',
      packageName: 'Standard',
      customer: { name: 'Customer', email: 'customer@example.com' },
      address: { line1: '1 Main Street', city: 'Town', postcode: '12345' },
      date: '2026-01-02',
      startTime: '09:00',
      durationHours: 2,
      extras: [],
      price: 100,
      status: 'pending',
    };
    const first = await sendBookingMail(store, booking, 'received', { business });
    const reply = await sendBookingMail(store, booking, 'note', { business });
    assert.equal(first.status, 'sent');
    assert.equal(reply.status, 'sent');

    const firstPayload = JSON.parse(calls[0].options.body);
    const replyPayload = JSON.parse(calls[1].options.body);
    assert.equal(calls[0].url, 'https://api.resend.com/emails');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer re_test_key');
    assert.equal(calls[0].options.headers['Idempotency-Key'], 'booking-1-1');
    assert.equal(firstPayload.from, process.env.MAIL_FROM);
    assert.equal(firstPayload.to, 'customer@example.com');
    assert.equal(firstPayload.cc, 'bookings@example.com');
    assert.equal(firstPayload.reply_to, 'bookings@example.com');
    assert.equal(replyPayload.headers['In-Reply-To'], first.messageId);
    assert.equal(replyPayload.headers.References, first.messageId);
    assert.equal(calls[1].options.headers['Idempotency-Key'], 'booking-1-2');

    const contact = {
      id: 'contact-1',
      name: 'Customer',
      email: 'customer@example.com',
      phone: '555-0100',
      message: 'Please call me.',
    };
    const contactMail = await sendContactMail(store, contact, business);
    assert.equal(contactMail.status, 'sent');
    const contactPayload = JSON.parse(calls[2].options.body);
    assert.equal(contactPayload.to, 'bookings@example.com');
    assert.equal(contactPayload.reply_to, 'customer@example.com');
    assert.equal(calls[2].options.headers['Idempotency-Key'], 'contact-contact-1');

    globalThis.fetch = async () => new Response('{}', { status: 401 });
    const previousConsoleError = console.error;
    console.error = () => {};
    let failedContact;
    try {
      failedContact = await sendContactMail(store, { ...contact, id: 'contact-2' }, business);
    } finally {
      console.error = previousConsoleError;
    }
    assert.equal(failedContact.status, 'failed');
    assert.match(failedContact.error, /HTTP 401/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousApiKey;
    if (previousMailFrom === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = previousMailFrom;
  }
});

test('Supabase Edge storage uses private RPCs and preserves JSON records', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    const name = url.split('/').pop();
    const result = name === 'axa_records_list'
      ? [{ id: 'one', nested: { safe: true } }]
      : name === 'axa_records_get'
        ? { id: 'one' }
        : name === 'axa_store_lock_acquire'
          ? true
          : null;
    return new Response(JSON.stringify(result), { status: 200 });
  };
  const store = new SupabaseRpcStore('https://project.supabase.co/', 'secret-key', fetchMock);
  assert.equal(store.mode, 'supabase-edge');
  assert.deepEqual(await store.list('packages'), [{ id: 'one', nested: { safe: true } }]);
  assert.deepEqual(await store.get('packages', 'one'), { id: 'one' });
  await store.put('packages', { id: 'one', name: 'Deep Clean' });
  await store.remove('packages', 'one');
  assert.equal(calls.length, 4);
  assert.ok(calls.every(({ url }) => url.includes('/rest/v1/rpc/axa_records_')));
  assert.ok(calls.every(({ options }) => options.headers.apikey === 'secret-key'));
  assert.ok(calls.every(({ options }) => options.headers.Authorization === 'Bearer secret-key'));
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    p_collection: 'packages',
    p_id: 'one',
    p_data: { id: 'one', name: 'Deep Clean' },
  });
});

test('Supabase Edge locks acquire in key order and release after an action fails', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    const result = url.endsWith('/axa_store_lock_acquire') ? true : true;
    return new Response(JSON.stringify(result), { status: 200 });
  };
  const store = new SupabaseRpcStore('https://project.supabase.co', 'secret-key', fetchMock);
  await assert.rejects(
    store.withLocks(['schedule:b', 'schedule:a', 'schedule:a'], async () => {
      throw new Error('action failed');
    }),
    /action failed/,
  );
  const locks = calls.filter(({ url }) => url.includes('axa_store_lock_acquire'));
  const releases = calls.filter(({ url }) => url.includes('axa_store_lock_release'));
  assert.equal(locks.length, 2);
  assert.equal(releases.length, 2);
  const lockBodies = locks.map(({ options }) => JSON.parse(options.body));
  assert.deepEqual(lockBodies.map(({ p_lock_key }) => p_lock_key), [...lockBodies.map(({ p_lock_key }) => p_lock_key)].sort());
});

test('MemoryStore persists OTPs with expiry, attempt limits and one-time consumption', async () => {
  const { MemoryStore } = require('../api/src/lib/store');
  const store = new MemoryStore();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  await store.setAuthOtp('user-1', {
    salt: 'salt',
    hash: 'hash',
    expiresAt,
    attemptsRemaining: 2,
  });
  assert.equal((await store.getAuthOtp('user-1')).attemptsRemaining, 2);
  assert.equal(await store.failAuthOtp('user-1'), 1);
  assert.equal(await store.consumeAuthOtp('user-1', 'wrong'), false);
  assert.equal(await store.consumeAuthOtp('user-1', 'hash'), true);
  assert.equal(await store.getAuthOtp('user-1'), null);
  await store.setAuthOtp('user-2', {
    salt: 'salt',
    hash: 'hash',
    expiresAt: new Date(Date.now() - 1).toISOString(),
    attemptsRemaining: 5,
  });
  assert.equal(await store.getAuthOtp('user-2'), null);
});

test('Supabase OTP store calls only the scoped private RPC interface', async () => {
  const calls = [];
  const otpExpiry = new Date(Date.now() + 60_000).toISOString();
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    const name = url.split('/').pop();
    const result = name === 'axa_auth_otp_get'
      ? { salt: 'salt', hash: 'hash', expiresAt: otpExpiry, attemptsRemaining: 4 }
      : name === 'axa_auth_otp_fail'
        ? 3
        : name === 'axa_auth_otp_consume'
          ? true
          : true;
    return new Response(JSON.stringify(result), { status: 200 });
  };
  const store = new SupabaseRpcStore('https://project.supabase.co', 'service-key', fetchMock);
  const otp = { salt: 'salt', hash: 'hash', expiresAt: new Date(Date.now() + 60_000).toISOString() };
  await store.setAuthOtp('user-1', otp);
  assert.deepEqual(await store.getAuthOtp('user-1'), {
    salt: 'salt',
    hash: 'hash',
    expiresAt: otpExpiry,
    attemptsRemaining: 4,
  });
  assert.equal(await store.failAuthOtp('user-1'), 3);
  assert.equal(await store.consumeAuthOtp('user-1', 'hash'), true);
  await store.deleteAuthOtp('user-1');
  assert.deepEqual(calls.map(({ url }) => url.split('/').pop()), [
    'axa_auth_otp_set',
    'axa_auth_otp_get',
    'axa_auth_otp_fail',
    'axa_auth_otp_consume',
    'axa_auth_otp_delete',
  ]);
  assert.ok(calls.every(({ options }) => options.headers.apikey === 'service-key'));
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_user_id: 'user-1',
    p_salt: otp.salt,
    p_hash: otp.hash,
    p_expires_at: otp.expiresAt,
  });
});
