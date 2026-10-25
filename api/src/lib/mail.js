'use strict';
/**
 * Booking e-mail threads.
 * The first e-mail for a booking gets a Message-ID; every later update is sent as a reply
 * (same subject prefixed "Re:", In-Reply-To = previous message, References = whole chain,
 * Thread-Topic for Outlook). The company mailbox is CC'd on every message and set as Reply-To,
 * so the customer, the company and staff all see one conversation per booking.
 * Without SMTP settings the messages are recorded in the e-mail log only (status "logged").
 */
const { uid, nowIso, escapeHtml } = require('./util');

const COMPANY = (business) => business?.companyName || process.env.COMPANY_NAME || 'AXA Cleaning';
const COMPANY_EMAIL = (business) => business?.companyEmail || process.env.COMPANY_EMAIL || '';
const FROM = (business) => process.env.MAIL_FROM || (COMPANY_EMAIL(business) ? `${COMPANY(business)} <${COMPANY_EMAIL(business)}>` : 'AXA Cleaning <noreply@localhost>');
const domainOf = (addr) => (String(addr).match(/@([^>\s]+)/) || [])[1] || 'axacleaning.com';

let transporter;
function getTransport() {
  if (transporter !== undefined) return transporter;
  if (!process.env.SMTP_HOST) return (transporter = null);
  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || 'false') === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  } catch (e) {
    console.warn('[mail] nodemailer not available:', e.message);
    transporter = null;
  }
  return transporter;
}

const money = (n, currency = process.env.CURRENCY || 'USD') => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n); }
  catch { return `${currency} ${n}`; }
};
const prettyDate = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const KINDS = {
  received: { badge: 'Request received', color: '#22c3e6', intro: (b) => `Thank you for choosing ${COMPANY()}! We have received your booking request <b>${b.ref}</b>. Our team is checking cleaner availability and will confirm shortly. All updates about this booking will arrive in this same e-mail thread.` },
  accepted: { badge: 'Booking confirmed', color: '#00b894', intro: (b) => `Great news — your booking <b>${b.ref}</b> is <b>confirmed</b>. Your cleaning team will arrive at the scheduled time.` },
  modified: { badge: 'Booking updated', color: '#6c5ce7', intro: (b) => `Your booking <b>${b.ref}</b> has been updated. Please review the details below.` },
  rejected: { badge: 'Booking declined', color: '#e17055', intro: (b) => `We're sorry — we are unable to accept booking <b>${b.ref}</b> as requested.` },
  cancelled: { badge: 'Booking cancelled', color: '#e17055', intro: (b) => `Booking <b>${b.ref}</b> has been cancelled.` },
  completed: { badge: 'Job completed', color: '#00b894', intro: (b) => `Your cleaning for booking <b>${b.ref}</b> is complete. Thank you for choosing ${COMPANY()} — we'd love to hear your feedback, just reply to this e-mail.` },
  note: { badge: 'Message from our team', color: '#0a2540', intro: (b) => `There is a new message about your booking <b>${b.ref}</b>.` },
};

function render(booking, kind, { note, changes, agentNames, business } = {}) {
  const k = KINDS[kind] || KINDS.note;
  const b = booking;
  const companyName = COMPANY(business);
  const companyEmail = COMPANY_EMAIL(business);
  const rows = [
    ['Reference', b.ref], ['Package', b.packageName], ['Date', prettyDate(b.date)], ['Arrival time', b.startTime],
    ['Estimated duration', `${b.durationHours} hours`],
    ['Address', [b.address?.line1, b.address?.city, b.address?.postcode].filter(Boolean).join(', ')],
    ['Extras', (b.extras || []).map((e) => e.name).join(', ') || '—'],
    ['Estimated price', money(b.price, business?.currency)], ['Status', b.status.toUpperCase()],
  ];
  if (agentNames?.length && b.status === 'accepted') rows.splice(5, 0, ['Your cleaners', agentNames.join(', ')]);
  const changeHtml = changes?.length ? `<p style="margin:16px 0 6px;font-weight:600">What changed</p><ul style="margin:0;padding-left:18px">${changes.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : '';
  const noteHtml = note ? `<div style="margin:16px 0;padding:14px 16px;background:#f1f8fb;border-left:4px solid ${k.color};border-radius:8px;white-space:pre-wrap">${escapeHtml(note)}</div>` : '';
  const html = `<!doctype html><html><body style="margin:0;background:#eef4f8;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0a2540">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(10,37,64,.08)">
<tr><td style="background:linear-gradient(135deg,#0a2540,#1565c0 60%,#22c3e6);padding:28px 32px;color:#fff">
<div style="font-size:22px;font-weight:800;letter-spacing:.5px">✦ ${escapeHtml(companyName)}</div>
<div style="display:inline-block;margin-top:12px;padding:6px 12px;border-radius:999px;background:${k.color};font-size:13px;font-weight:600">${k.badge}</div></td></tr>
<tr><td style="padding:28px 32px;font-size:15px;line-height:1.6">
<p style="margin:0 0 12px">Hi ${escapeHtml(b.customer?.name || 'there')},</p><p style="margin:0">${k.intro(b)}</p>${noteHtml}${changeHtml}
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-collapse:collapse;font-size:14px">
${rows.map(([l, v]) => `<tr><td style="padding:9px 0;border-bottom:1px solid #edf2f7;color:#5a6b7d;width:42%">${escapeHtml(l)}</td><td style="padding:9px 0;border-bottom:1px solid #edf2f7;font-weight:600">${escapeHtml(v)}</td></tr>`).join('')}
</table>
<p style="margin:22px 0 0;font-size:13px;color:#5a6b7d">Questions or changes? Simply reply to this e-mail${companyEmail ? ` — it reaches our bookings team at <a href="mailto:${escapeHtml(companyEmail)}">${escapeHtml(companyEmail)}</a>` : ''}. Please keep the reference <b>${b.ref}</b> in the subject.</p>
</td></tr><tr><td style="background:#f7fafc;padding:16px 32px;font-size:12px;color:#8a9bb0">${escapeHtml(companyName)} · Professional cleaning services${companyEmail ? ` · ${escapeHtml(companyEmail)}` : ''}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    `Hi ${b.customer?.name || 'there'},`, '', k.intro(b).replace(/<[^>]+>/g, ''), note ? `\nMessage: ${note}` : '',
    changes?.length ? `\nWhat changed:\n${changes.map((c) => ` - ${c}`).join('\n')}` : '', '',
    ...rows.map(([l, v]) => `${l}: ${v}`), '', `Reply to this e-mail${companyEmail ? ` or write to ${companyEmail}` : ''} (ref ${b.ref}).`, `— ${companyName}`,
  ].join('\n');
  return { html, text, badge: k.badge };
}

/**
 * Send (or log) the next message in a booking's thread. Mutates booking.email; caller saves the booking.
 */
async function sendBookingMail(store, booking, kind, opts = {}) {
  const business = opts.business || await store.get('settings', 'business');
  const thread = booking.email || null;
  const companyEmail = COMPANY_EMAIL(business);
  const from = FROM(business);
  const baseSubject = `${COMPANY(business)} – Booking request ${booking.ref}`;
  const subject = thread ? `Re: ${thread.subject}` : baseSubject;
  const messageId = `<${booking.ref.toLowerCase()}.${Date.now()}.${uid()}@${domainOf(from)}>`;
  const { html, text, badge } = render(booking, kind, { ...opts, business });
  const msg = {
    from, to: booking.customer.email, cc: companyEmail || undefined, replyTo: companyEmail || undefined,
    subject, html, text, messageId,
    headers: { 'Thread-Topic': baseSubject, 'X-AXA-Booking-Ref': booking.ref },
  };
  if (thread) { msg.inReplyTo = thread.lastMessageId; msg.references = [...thread.references]; }

  const record = {
    id: uid('eml_'), bookingId: booking.id, ref: booking.ref, kind, badge, to: msg.to, cc: msg.cc, subject,
    messageId, inReplyTo: msg.inReplyTo || null, references: msg.references || [], text, sentAt: nowIso(), status: 'logged', error: null, by: opts.by || 'system',
  };
  const t = getTransport();
  if (t) {
    try {
      if (!companyEmail || !process.env.MAIL_FROM) throw new Error('Configure the company mailbox and MAIL_FROM before enabling SMTP delivery.');
      await t.sendMail(msg); record.status = 'sent';
    }
    catch (e) { record.status = 'failed'; record.error = String(e.message || e).slice(0, 300); console.error('[mail] send failed', e); }
  }
  await store.put('emails', record);
  booking.email = {
    subject: thread ? thread.subject : baseSubject,
    rootMessageId: thread ? thread.rootMessageId : messageId,
    lastMessageId: messageId,
    references: [...(thread?.references || []), messageId],
    count: (thread?.count || 0) + 1,
  };
  return record;
}

const mailMode = () => (process.env.SMTP_HOST ? 'smtp' : 'log-only');

async function sendContactMail(store, contact, business) {
  const companyEmail = COMPANY_EMAIL(business);
  const from = FROM(business);
  const subject = `${COMPANY(business)} contact request ${contact.id}`;
  const text = `Name: ${contact.name}\nE-mail: ${contact.email}\nPhone: ${contact.phone || 'Not provided'}\n\n${contact.message}`;
  const record = {
    id: uid('eml_'), kind: 'contact', contactId: contact.id, to: companyEmail, replyTo: contact.email,
    subject, text, sentAt: nowIso(), status: 'logged', error: null, by: 'public',
  };
  const t = getTransport();
  if (t) {
    try {
      if (!companyEmail || !process.env.MAIL_FROM) throw new Error('Configure the company mailbox and MAIL_FROM before enabling SMTP delivery.');
      await t.sendMail({ from, to: companyEmail, replyTo: contact.email, subject, text });
      record.status = 'sent';
    } catch (e) {
      record.status = 'failed';
      record.error = String(e.message || e).slice(0, 300);
      console.error('[mail] contact delivery failed', e);
    }
  }
  await store.put('emails', record);
  return record;
}

module.exports = { sendBookingMail, sendContactMail, render, mailMode, money };
