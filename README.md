# AXA Cleaning – website + staff portal

A public website, booking request flow, and role-based staff portal. The API runs locally through `dev-server.js` and is structured for Azure Functions. **Hosting and Azure Static Web Apps setup are intentionally deferred.**

| Part | Where | Tech |
|---|---|---|
| Public website | `frontend/index.html` | HTML/CSS/JS, Three.js 3D hero (from jsDelivr), no build step |
| Staff portal | `frontend/admin/` (`/admin`) | Vanilla JS single-page app |
| API | `api/` → `/api/*` | Azure Functions (Node 20, v4 model) |
| Data | Azure Table Storage in production; JSON file locally | Azure Tables are created on first run |
| E-mail | SMTP | Booking threads and contact messages; logged if SMTP is not configured |

```
frontend/                   static site (app_location)
  index.html  css/  js/     public website
  admin/                    staff portal (login: index.html, app: portal.html)
  staticwebapp.config.json  routing and security headers for a future SWA deployment
api/                        Azure Functions app
  src/index.js              single catch-all HTTP function -> router
  src/lib/                  router, auth, availability, mail, store, seed
dev-server.js               zero-dependency local preview (same router)
tests/api.test.mjs          end-to-end API tests (npm test)
.github/workflows/          existing CI/deployment workflow (not configured or in scope)
```

## Features

**Public site:** responsive marketing pages, package cards, package comparison, a booking wizard with live availability, consent, and idempotent submission, booking tracking, FAQs, and a contact form. The public contact details and currency come from the Super Admin business profile.

**Staff portal** (`/admin`):

- **Dashboard:** KPIs, a 3/7/14-day **availability board for every cleaning agent** (free / partly booked / booked / leave / day off, with confirmed and tentative jobs), pending requests, the next 7 days, request trend and package mix.
- **Bookings:** filter, search, and **accept** (pick agents with live conflict checks and an "auto-pick free" option), **modify** (any field, reassign agents), **reject** with a reason, **create** on a customer's behalf, complete, cancel, re-open, or e-mail the customer. Each booking shows its full e-mail thread and history.
- **Notifications:** a bell with unread count and a pending badge that refreshes every 20 s, plus optional desktop alerts.
- **Agents:** working days, skills, colour, leave dates, active or inactive.
- **Packages and extras:** edit what the public site shows.
- **Contact messages:** review, close, and reply to public inquiries.
- **Business settings (Super Admin only):** configure company details, service area, currency, and timezone. SMTP secrets are not stored in the portal.
- **Users and roles:** see the matrix below. Also includes an **activity log** and **My account** (password change, with a forced change on first sign-in).

### Roles

| Capability | Admin | Manager | Super Admin |
|---|:-:|:-:|:-:|
| Dashboard, availability board, notifications | ✅ | ✅ | ✅ |
| View / accept / modify / reject / create / complete / cancel bookings | ✅ | ✅ | ✅ |
| View agents and packages | ✅ | ✅ | ✅ |
| Manage agents, leave, packages, extras | – | ✅ | ✅ |
| Create / edit / disable / delete **Admin and Manager** users | – | ✅ | ✅ |
| Anything on a **Super Admin** account, or grant Super Admin | – | ❌ | ✅ |
| Activity log | – | ✅ (excluding Super Admin entries) | ✅ |

Safeguards: you can't change your own role or delete yourself, there is always at least one active Super Admin, and a role change, deactivation or password reset signs that user out everywhere.
Availability conflicts can only be overridden by a Manager or Super Admin, and each override requires a reason.

### E-mail thread per booking

1. The customer submits a request. The first e-mail goes **to the customer, CC the company mailbox** (`COMPANY_EMAIL`), with Reply-To set to the company mailbox and a unique `Message-ID`.
2. Every later update (accepted, modified, rejected, message, completed, cancelled) is sent as a **reply**: subject `Re: <original subject>`, `In-Reply-To` set to the previous message and `References` set to the whole chain, plus `Thread-Topic`. Gmail, Outlook and Apple Mail show it as **one conversation**.
3. When the customer replies, the reply reaches the company mailbox in the same thread.

If SMTP isn't configured, e-mails are **recorded but not sent** (status `logged`) and shown in the portal. Delivery failures are recorded and surfaced rather than reported as successful.

### Public submissions

Booking requests require explicit contact consent and an `Idempotency-Key`, so a retry with the same request does not create another booking. Public contact messages are stored in the staff portal and include a honeypot and an in-process rate limit.

## Run locally

```bash
node dev-server.js          # http://localhost:4280   (no install needed)
npm test                    # API and routing tests
```

Data is saved to `api/.data/db.json`. Delete that file to reset.

On a fresh database, set `SEED_SUPERADMIN_PASSWORD` to create the initial Super Admin; no default account passwords are embedded in the source or sample settings. For PowerShell:

```powershell
$env:SEED_SUPERADMIN_PASSWORD = 'choose-a-unique-password'
node dev-server.js
```

Demo booking data can be enabled locally with `SEED_DEMO_DATA=true`; it does not create demo user accounts.

> ⚠️ Production startup rejects the development signing-key fallback, missing persistent storage, and demo-data seeding. Before the first production startup, configure `AUTH_SECRET` (at least 32 characters), `STORAGE_CONNECTION_STRING`, and a unique `SEED_SUPERADMIN_PASSWORD` (at least 12 characters with letters and numbers); set `SEED_DEMO_DATA=false`. The seed password is only required until the first Super Admin account is created.

## Launch readiness and remaining work

Admin sign-in intentionally uses application-managed username/password accounts; Microsoft Entra ID is not required. Use a unique production `AUTH_SECRET`, unique account passwords, HTTPS, and tightly controlled manager-created accounts.

The Super Admin can set the company name, reply mailbox, public phone, service area, currency, and business timezone. Azure Communication Services SMTP credentials are intentionally deferred; configure them only in the API host environment. The portal's readiness checklist reports missing settings, but a green configuration check is not a live e-mail delivery test.

**Do not treat this repository as launch-approved until the owner completes these items:**

- Replace local demo package, price, extra, and agent data with approved business content. Never reuse a development database for production.
- Confirm the service area, public contact details, and currency in Business Settings.
- Have the privacy notice and terms reviewed and publish the approved content. The readiness checklist deliberately remains incomplete until this external action is done.
- Implement secure, expiring customer self-service links if customers must change or cancel requests online. The current public tracking lookup uses the booking reference and customer e-mail and is read-only.
- Configure ACS SMTP (`smtp.azurecomm.net:587`, TLS/STARTTLS, ACS SMTP credentials, and a verified `MAIL_FROM`) in the future API host environment, then test delivery and replies end-to-end.
- Choose and configure hosting, production monitoring/alerting, backup/restore, and operational support. **Azure Static Web Apps deployment/provisioning is explicitly out of scope for now.**
- Exercise the Azure Table Storage distributed-lock implementation against the chosen production account and load profile before relying on it for concurrent booking operations.

### Local setup

```bash
npm test
```

For a fresh local database, set `SEED_SUPERADMIN_PASSWORD` and start `npm run dev`. By default, local development seeds demo service content; turn it off with `SEED_DEMO_DATA=false` when you want an empty setup. Use the Super Admin portal to configure the real profile, packages, extras, agents, and accounts.

### Production API configuration (for a future host)

| Setting | Required value / guidance |
|---|---|
| `AUTH_SECRET` | At least 32 characters; keep it private |
| `STORAGE_CONNECTION_STRING` | Azure Table Storage connection string |
| `SEED_SUPERADMIN_PASSWORD` | Unique initial password; only needed before the first Super Admin exists |
| `SEED_DEMO_DATA` | `false` |
| `SMTP_HOST` | `smtp.azurecomm.net` after ACS is provisioned |
| `SMTP_PORT` / `SMTP_SECURE` | `587` / `false` (STARTTLS) |
| `SMTP_USER` / `SMTP_PASS` | ACS SMTP credentials; secrets belong in host configuration |
| `MAIL_FROM` | Sender address verified for the ACS resource |
| `WORK_START` / `WORK_END` | Approved operating hours, e.g. `08:00` / `18:00` |
| `TOKEN_TTL_HOURS` | Staff session duration (default `12`) |

## Security notes

- Passwords are hashed with scrypt and per-user salt. Sessions are HMAC-signed tokens checked against the user record on every request. Failed sign-ins are throttled.
- The portal sends its token in an `X-Auth-Token` header.
- Every permission check runs on the server. The UI only hides what you can't use.
- Public booking and contact forms have honeypots and per-IP hourly limits. Login and public throttles are per process (in memory), so a production host needs an external rate-limit/WAF strategy.
- Static security headers and CSP are currently defined for a future Static Web Apps deployment; hosting is not yet selected or configured.
