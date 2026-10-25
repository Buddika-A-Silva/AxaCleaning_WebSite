'use strict';
/**
 * Booking e-mail threads.
 * The first e-mail for a booking gets a Message-ID; every later update is sent as a reply
 * (same subject prefixed "Re:", In-Reply-To = previous message, References = whole chain,
 * Thread-Topic for Outlook). The company mailbox is CC'd on every message and set as Reply-To,
 * so the customer, the company and staff all see one conversation per booking.
 * Without a Resend API key the messages are recorded in the e-mail log only (status "logged").
 */
const { uid, nowIso, escapeHtml } = require('./util');
const { settings } = require('./runtime-config');

const COMPANY = (business) => business?.companyName || settings.companyName || 'AXA Cleaning';
const COMPANY_EMAIL = (business) => business?.companyEmail || settings.companyEmail || '';
const FROM = (business) => process.env.MAIL_FROM || (COMPANY_EMAIL(business) ? `${COMPANY(business)} <${COMPANY_EMAIL(business)}>` : 'AXA Cleaning <noreply@localhost>');
const domainOf = (addr) => (String(addr).match(/@([^>\s]+)/) || [])[1] || 'axacleaning.com';

async function sendWithResend(message, idempotencyKey) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(message),
  });
  if (!response.ok) throw new Error(`Resend email API returned HTTP ${response.status}.`);
}

function resendMessage(message) {
  const headers = {
    ...message.headers,
    'Message-ID': message.messageId,
  };
  if (message.inReplyTo) {
    headers['In-Reply-To'] = message.inReplyTo;
    headers.References = message.references.join(' ');
  }
  return {
    from: message.from,
    to: message.to,
    ...(message.cc ? { cc: message.cc } : {}),
    ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    subject: message.subject,
    html: message.html,
    text: message.text,
    headers,
  };
}

const money = (n, currency = settings.currency || 'USD', language = 'en') => {
  try { return new Intl.NumberFormat(language === 'ro' ? 'ro-RO' : 'en-US', { style: 'currency', currency }).format(n); }
  catch { return `${currency} ${n}`; }
};
const prettyDate = (d, language = 'en') => new Date(d + 'T00:00:00Z').toLocaleDateString(language === 'ro' ? 'ro-RO' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const KINDS = {
  received: { badge: 'Request received', color: '#22c3e6', intro: (b) => `Thank you for choosing ${COMPANY()}! We have received your booking request <b>${b.ref}</b>. Our team is checking cleaner availability and will confirm shortly. All updates about this booking will arrive in this same e-mail thread.` },
  accepted: { badge: 'Booking confirmed', color: '#00b894', intro: (b) => `Great news — your booking <b>${b.ref}</b> is <b>confirmed</b>. Your cleaning team will arrive at the scheduled time.` },
  modified: { badge: 'Booking updated', color: '#6c5ce7', intro: (b) => `Your booking <b>${b.ref}</b> has been updated. Please review the details below.` },
  rejected: { badge: 'Booking declined', color: '#e17055', intro: (b) => `We're sorry — we are unable to accept booking <b>${b.ref}</b> as requested.` },
  cancelled: { badge: 'Booking cancelled', color: '#e17055', intro: (b) => `Booking <b>${b.ref}</b> has been cancelled.` },
  completed: { badge: 'Job completed', color: '#00b894', intro: (b) => `Your cleaning for booking <b>${b.ref}</b> is complete. Thank you for choosing ${COMPANY()} — we'd love to hear your feedback, just reply to this e-mail.` },
  note: { badge: 'Message from our team', color: '#0a2540', intro: (b) => `There is a new message about your booking <b>${b.ref}</b>.` },
};

const KINDS_RO = {
  received: { badge: 'Solicitare primită', intro: (b) => `Îți mulțumim că ai ales ${COMPANY()}! Am primit solicitarea ta de rezervare <b>${b.ref}</b>. Echipa noastră verifică disponibilitatea și îți va confirma în curând. Toate actualizările vor veni în aceeași conversație prin e-mail.` },
  accepted: { badge: 'Rezervare confirmată', intro: (b) => `Vești bune — rezervarea <b>${b.ref}</b> este <b>confirmată</b>. Echipa de curățenie va ajunge la ora programată.` },
  modified: { badge: 'Rezervare actualizată', intro: (b) => `Rezervarea <b>${b.ref}</b> a fost actualizată. Consultă detaliile de mai jos.` },
  rejected: { badge: 'Rezervare refuzată', intro: (b) => `Ne pare rău — nu putem accepta rezervarea <b>${b.ref}</b> în forma solicitată.` },
  cancelled: { badge: 'Rezervare anulată', intro: (b) => `Rezervarea <b>${b.ref}</b> a fost anulată.` },
  completed: { badge: 'Serviciu finalizat', intro: (b) => `Curățenia aferentă rezervării <b>${b.ref}</b> a fost finalizată. Îți mulțumim că ai ales ${COMPANY()}! Ne-ar plăcea să aflăm părerea ta; răspunde la acest e-mail.` },
  note: { badge: 'Mesaj din partea echipei', intro: (b) => `Ai primit un mesaj nou despre rezervarea <b>${b.ref}</b>.` },
};

function render(booking, kind, { note, changes, agentNames, business } = {}) {
  const language = booking.language === 'ro' ? 'ro' : 'en';
  const ro = language === 'ro';
  const source = (ro ? KINDS_RO : KINDS)[kind] || (ro ? KINDS_RO : KINDS).note;
  const k = { ...source, color: (KINDS[kind] || KINDS.note).color };
  const b = booking;
  const companyName = COMPANY(business);
  const companyEmail = COMPANY_EMAIL(business);
  const rows = [
    [ro ? 'Referință' : 'Reference', b.ref], [ro ? 'Pachet' : 'Package', b.packageName], [ro ? 'Data' : 'Date', prettyDate(b.date, language)], [ro ? 'Ora sosirii' : 'Arrival time', b.startTime],
    [ro ? 'Durată estimată' : 'Estimated duration', `${b.durationHours} ${ro ? 'ore' : 'hours'}`],
    [ro ? 'Adresă' : 'Address', [b.address?.line1, b.address?.city, b.address?.postcode].filter(Boolean).join(', ')],
    [ro ? 'Servicii suplimentare' : 'Extras', (b.extras || []).map((e) => e.name).join(', ') || '—'],
    [ro ? 'Preț estimat' : 'Estimated price', money(b.price, business?.currency, language)], [ro ? 'Stare' : 'Status', b.status.toUpperCase()],
  ];
  if (agentNames?.length && b.status === 'accepted') rows.splice(5, 0, [ro ? 'Echipa ta de curățenie' : 'Your cleaners', agentNames.join(', ')]);
  const changeHtml = changes?.length ? `<p style="margin:16px 0 6px;font-weight:600">${ro ? 'Modificări' : 'What changed'}</p><ul style="margin:0;padding-left:18px">${changes.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : '';
  const noteHtml = note ? `<div style="margin:16px 0;padding:14px 16px;background:#f1f8fb;border-left:4px solid ${k.color};border-radius:8px;white-space:pre-wrap">${escapeHtml(note)}</div>` : '';
  const html = `<!doctype html><html><body style="margin:0;background:#eef4f8;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0a2540">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(10,37,64,.08)">
<tr><td style="background:linear-gradient(135deg,#0a2540,#1565c0 60%,#22c3e6);padding:28px 32px;color:#fff">
<div style="font-size:22px;font-weight:800;letter-spacing:.5px">✦ ${escapeHtml(companyName)}</div>
<div style="display:inline-block;margin-top:12px;padding:6px 12px;border-radius:999px;background:${k.color};font-size:13px;font-weight:600">${k.badge}</div></td></tr>
<tr><td style="padding:28px 32px;font-size:15px;line-height:1.6">
<p style="margin:0 0 12px">${ro ? 'Bună' : 'Hi'} ${escapeHtml(b.customer?.name || (ro ? '' : 'there'))},</p><p style="margin:0">${k.intro(b)}</p>${noteHtml}${changeHtml}
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-collapse:collapse;font-size:14px">
${rows.map(([l, v]) => `<tr><td style="padding:9px 0;border-bottom:1px solid #edf2f7;color:#5a6b7d;width:42%">${escapeHtml(l)}</td><td style="padding:9px 0;border-bottom:1px solid #edf2f7;font-weight:600">${escapeHtml(v)}</td></tr>`).join('')}
</table>
<p style="margin:22px 0 0;font-size:13px;color:#5a6b7d">${ro ? 'Ai întrebări sau modificări? Răspunde la acest e-mail' : 'Questions or changes? Simply reply to this e-mail'}${companyEmail ? ` — ${ro ? 'mesajul ajunge la echipa noastră de rezervări la' : 'it reaches our bookings team at'} <a href="mailto:${escapeHtml(companyEmail)}">${escapeHtml(companyEmail)}</a>` : ''}. ${ro ? 'Păstrează referința' : 'Please keep the reference'} <b>${b.ref}</b> ${ro ? 'în subiect' : 'in the subject'}.</p>
</td></tr><tr><td style="background:#f7fafc;padding:16px 32px;font-size:12px;color:#8a9bb0">${escapeHtml(companyName)} · ${ro ? 'Servicii profesionale de curățenie' : 'Professional cleaning services'}${companyEmail ? ` · ${escapeHtml(companyEmail)}` : ''}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    `${ro ? 'Bună' : 'Hi'} ${b.customer?.name || (ro ? '' : 'there')},`, '', k.intro(b).replace(/<[^>]+>/g, ''), note ? `\n${ro ? 'Mesaj' : 'Message'}: ${note}` : '',
    changes?.length ? `\n${ro ? 'Modificări' : 'What changed'}:\n${changes.map((c) => ` - ${c}`).join('\n')}` : '', '',
    ...rows.map(([l, v]) => `${l}: ${v}`), '', `${ro ? 'Răspunde la acest e-mail' : 'Reply to this e-mail'}${companyEmail ? ` ${ro ? 'sau scrie la' : 'or write to'} ${companyEmail}` : ''} (${ro ? 'ref.' : 'ref'} ${b.ref}).`, `— ${companyName}`,
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
  if (process.env.RESEND_API_KEY) {
    try {
      if (!companyEmail || !process.env.MAIL_FROM) throw new Error('Configure the company mailbox and verified MAIL_FROM before enabling Resend delivery.');
      await sendWithResend(
        resendMessage(msg),
        `${booking.id}-${(thread?.count || 0) + 1}`,
      );
      record.status = 'sent';
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

const mailMode = () => (
  process.env.RESEND_API_KEY
    ? (process.env.MAIL_FROM ? 'resend' : 'misconfigured')
    : 'log-only'
);

async function sendContactMail(store, contact, business) {
  const companyEmail = COMPANY_EMAIL(business);
  const from = FROM(business);
  const subject = `${COMPANY(business)} contact request ${contact.id}`;
  const ro = contact.language === 'ro';
  const text = `${ro ? 'Nume' : 'Name'}: ${contact.name}\nE-mail: ${contact.email}\n${ro ? 'Telefon' : 'Phone'}: ${contact.phone || (ro ? 'Necompletat' : 'Not provided')}\n\n${contact.message}`;
  const record = {
    id: uid('eml_'), kind: 'contact', contactId: contact.id, to: companyEmail, replyTo: contact.email,
    subject, text, sentAt: nowIso(), status: 'logged', error: null, by: 'public',
  };
  if (process.env.RESEND_API_KEY) {
    try {
      if (!companyEmail || !process.env.MAIL_FROM) throw new Error('Configure the company mailbox and verified MAIL_FROM before enabling Resend delivery.');
      await sendWithResend({
        from,
        to: companyEmail,
        reply_to: contact.email,
        subject,
        text,
      }, `contact-${contact.id}`);
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
