'use strict';

const messages = {
  Name: 'Numele',
  Email: 'Adresa de e-mail',
  Phone: 'Telefonul',
  Message: 'Mesajul',
  'Property type': 'Tipul proprietății',
  Bedrooms: 'Numărul de dormitoare',
  Bathrooms: 'Numărul de băi',
  'Not found': 'Nu a fost găsit.',
  'Method not allowed': 'Metoda nu este permisă.',
  'Please sign in': 'Autentifică-te.',
  'Your session has expired. Please sign in again.': 'Sesiunea a expirat. Te rugăm să te autentifici din nou.',
  'You do not have permission to do this': 'Nu ai permisiunea de a efectua această acțiune.',
  'Change your password before using the staff portal': 'Schimbă parola înainte de a utiliza portalul personalului.',
  'Something went wrong on our side. Please try again.': 'A apărut o problemă. Te rugăm să încerci din nou.',
  'Invalid submission': 'Trimitere invalidă.',
  'Thank you. Your message has been received.': 'Mulțumim. Mesajul tău a fost primit.',
  'Use My account to change your own password': 'Folosește secțiunea Contul meu pentru a-ți schimba parola.',
  'You cannot delete your own account': 'Nu îți poți șterge propriul cont.',
  'Only a Super Admin can issue reset codes.': 'Doar un Super Admin poate emite coduri de resetare.',
  'You cannot change your own role or deactivate yourself': 'Nu îți poți schimba propriul rol și nu te poți dezactiva.',
  'At least one active Super Admin account must remain': 'Trebuie să existe cel puțin un cont Super Admin activ.',
  'Invalid username or password': 'Nume de utilizator sau parolă incorectă.',
  'Invalid one-time code': 'Cod de unică folosință incorect.',
  'One-time code has expired': 'Codul de unică folosință a expirat.',
  'One-time code is required': 'Codul de unică folosință este obligatoriu.',
  'Please choose a valid date and time': 'Alege o dată și o oră valide.',
  'This time is no longer available': 'Acest interval nu mai este disponibil.',
  'Booking not found': 'Rezervarea nu a fost găsită.',
  'Package not found': 'Pachetul nu a fost găsit.',
  'Agent not found': 'Membrul personalului nu a fost găsit.',
  'Service area scope is invalid': 'Scara zonei deservite nu este validă.',
  'No packages are currently available': 'Momentan nu există pachete disponibile.',
  'Configure the company mailbox and verified MAIL_FROM before enabling Resend delivery.': 'Configurează adresa de e-mail a companiei și expeditorul MAIL_FROM verificat înainte de a activa trimiterea prin Resend.',
  'Too many messages. Please try again later.': 'Ai trimis prea multe mesaje. Te rugăm să încerci mai târziu.',
};

function romanian(message) {
  if (messages[message]) return messages[message];
  let match = /^(.*?) is required$/.exec(message);
  if (match) return `${messages[match[1]] || match[1]} este obligatoriu.`;
  match = /^(.*?) must be text$/.exec(message);
  if (match) return `${messages[match[1]] || match[1]} trebuie să fie text.`;
  match = /^(.*?) must be at least (\d+) characters$/.exec(message);
  if (match) return `${messages[match[1]] || match[1]} trebuie să aibă cel puțin ${match[2]} caractere.`;
  match = /^(.*?) must be at most (\d+) characters$/.exec(message);
  if (match) return `${messages[match[1]] || match[1]} trebuie să aibă cel mult ${match[2]} caractere.`;
  match = /^(.*?) is not a valid email address$/.exec(message);
  if (match) return `${messages[match[1]] || match[1]} nu este o adresă de e-mail validă.`;
  match = /^Booking is already (.+)$/.exec(message);
  if (match) return `Rezervarea este deja ${messages[match[1]] || match[1]}.`;
  return message;
}

function localized(message, language) {
  return language === 'ro' ? romanian(message) : message;
}

function requestLanguage(headers = {}) {
  const value = Object.entries(headers).find(([key]) => key.toLowerCase() === 'accept-language')?.[1];
  return String(value || '').toLowerCase().split(/[,;]/)[0].startsWith('ro') ? 'ro' : 'en';
}

module.exports = { localized, requestLanguage };
