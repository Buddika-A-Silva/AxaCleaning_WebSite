# AXA Cleaning – website + staff portal

A public website, booking request flow, and role-based staff portal. The customer-facing frontend is deployed to the existing Azure Static Web App; the API is being prepared for Supabase Edge Functions. Staff sign-in remains application-managed.

| Part | Where | Tech |
|---|---|---|
| Public website | `frontend/index.html` | HTML/CSS/JS, Three.js 3D hero (from jsDelivr), no build step |
| Staff portal | `frontend/admin/` (`/admin`) | Vanilla JS single-page app |
| API | `api/` → Supabase Edge Function `axa-api` | Deno Edge Function reusing the application router |
| Data | Supabase private schema in production; JSON file locally | Apply all three migrations before first use |
| E-mail | Resend HTTP API | Booking threads and contact messages; logged if the API key is not configured |

```
frontend/                   static site
  index.html  css/  js/     public website
  admin/                    staff portal (login: index.html, app: portal.html)
  staticwebapp.config.json  routing and security headers for the existing SWA
api/                        API router and local development server
  src/lib/                  router, auth, availability, mail, store, seed
supabase/functions/         Supabase Edge Function wrapper and build output
supabase/migrations/        private storage schema and service-only RPCs
dev-server.js               local preview (same router)
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
- **Business settings (Super Admin only):** configure company details, service area, currency, and timezone. Resend API secrets are not stored in the portal.
- **Users and roles:** see the matrix below. Also includes an **activity log** and **My account** (password change, with a forced change on first sign-in).

### Roles

| Capability | Admin | Manager | Super Admin |
|---|:-:|:-:|:-:|
| Dashboard, availability board, notifications | ✅ | ✅ | ✅ |
| View / accept / modify / reject / create / complete / cancel bookings | ✅ | ✅ | ✅ |
| View agents and packages | ✅ | ✅ | ✅ |
| Manage agents, leave, packages, extras | ✅ | ✅ | ✅ |
| Create / edit / disable / delete **Admin and Manager** users | – | ✅ | ✅ |
| Anything on a **Super Admin** account, or grant Super Admin | – | ❌ | ✅ |
| Activity log | – | ✅ (excluding Super Admin entries) | ✅ |

Admins can manage cleaning-agent profiles and schedules, packages, and extras, but cannot manage portal-user accounts or view the activity log. Safeguards: you can't change your own role or delete yourself, there is always at least one active Super Admin, and a role change, deactivation or password reset signs that user out everywhere.
Availability conflicts can only be overridden by a Manager or Super Admin, and each override requires a reason.

### Languages

The public website, booking and contact forms, staff sign-in, and staff portal support English and Romanian. A language selector is available on each page; the preference is saved in the browser and defaults to Romanian when the browser language is Romanian, otherwise English. Dates, currency display, standard API validation/errors, and customer booking e-mails use the selected locale. The selected language is stored with a customer's booking/contact request. Service package names, categories, descriptions, included/excluded features, and extras have optional Romanian fields; if a business has not supplied a Romanian value, the English value is shown. Staff can maintain these translations in the Packages section.

### E-mail thread per booking

1. The customer submits a request. The first e-mail goes **to the customer, CC the company mailbox** (`COMPANY_EMAIL`), with Reply-To set to the company mailbox and a unique `Message-ID`.
2. Every later update (accepted, modified, rejected, message, completed, cancelled) is sent as a **reply**: subject `Re: <original subject>`, `In-Reply-To` set to the previous message and `References` set to the whole chain, plus `Thread-Topic`. Gmail, Outlook and Apple Mail show it as **one conversation**.
3. When the customer replies, the reply reaches the company mailbox in the same thread.

If Resend isn't configured, e-mails are **recorded but not sent** (status `logged`) and shown in the portal. Delivery failures are recorded and surfaced rather than reported as successful. Booking updates use custom `Message-ID`, `In-Reply-To`, and `References` headers to preserve threading.

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

> ⚠️ Production startup rejects the development signing-key fallback, missing Supabase storage credentials, and demo-data seeding. Configure `AUTH_SECRET` (at least 32 characters), `SUPABASE_URL`, the Supabase service-role secret, and `SEED_DEMO_DATA=false`. A unique `SEED_SUPERADMIN_PASSWORD` (at least 12 characters with letters and numbers) is needed only until the first Super Admin exists; remove it immediately after provisioning. Keep all secrets in Supabase Edge Function settings, never in source control or frontend configuration.

### Supabase Edge Functions and database

The existing Supabase project is `wuhfojchbveaeozyztxs` in `ap-northeast-1` (Tokyo). Staff sign-in remains app-managed; Supabase Auth is not used. The private records, locks, and OTP tables exist. All 11 expected RPCs were verified to grant execute to `service_role` and not `anon`; direct SELECT/INSERT privileges on the private tables are denied to both roles, so the API accesses records through the RPCs. The project has no `supabase_migrations.schema_migrations` table because migrations were applied manually; do not reapply them blindly, and reconcile migration history before relying on CLI migration tracking. App data, including staff records, is stored in the private `axa_records` table by collection; one-time sign-in codes are stored separately in `axa_auth_otps` as salted scrypt hashes with expiry and an attempt limit. The API communicates through PostgREST RPC and does not require a database connection URL. Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or the Supabase `SUPABASE_SECRET_KEYS` JSON value containing `default`) in Edge Function secrets. Never put a service-role key or other secret in frontend code, the repository, or chat. SSL enforcement is enabled and was verified after the database restart; a subsequent database query and live API health check succeeded.

### Staff account provisioning and reset codes

Managers and Super Admins can create staff accounts in the portal. Creation issues a random eight-digit OTP that is displayed once to the administrator; share it securely with the staff member. It expires after 10 minutes, permits at most five attempts, and is consumed on the first successful sign-in. The new staff member must then set a permanent password before accessing portal features. Only a Super Admin can issue a reset OTP; this invalidates existing sessions and the user's previous password. OTP plaintext is never stored or written to activity logs. The existing `axa_records` table stores user profile/role/password-hash records; `axa_auth_otps` stores only salted OTP hashes and expiry/attempt metadata. If an OTP expires or is lost, a Super Admin can issue another from the Users section.

Build the function bundle with `npm run build:edge --prefix api`, then deploy `supabase/functions/axa-api` using the Supabase CLI or dashboard. The `axa-api` function is deployed and its live health endpoint returns HTTP 200 using Supabase storage. The health response currently reports `mail: "log-only"` because a verified sender and Resend key are not configured. The checked-in `supabase/config.toml` disables platform JWT verification because the API performs staff-token authorization itself; the API's public routes and application authentication must remain protected by its own validation, throttling, and role checks. Configure `CORS_ALLOWED_ORIGINS` with the exact production frontend origin if it changes.

## Launch readiness and remaining work

Admin sign-in intentionally uses application-managed username/password accounts; Microsoft Entra ID is not required. Use a unique production `AUTH_SECRET`, unique account passwords, HTTPS, and tightly controlled manager-created accounts.

The Super Admin can set the company name, reply mailbox, public phone, service-area scope (local, regional, nationwide, worldwide, or custom) and optional area details, currency, and business timezone at any time. Public service-area scope labels are localized to English or Romanian. Customer e-mail uses the Resend HTTP API, which is compatible with Supabase Edge Functions. Verify a sending domain in Resend, then configure its API key and sender as Supabase Edge Function secrets. The portal's readiness checklist reports missing settings, but a green configuration check is not a live e-mail delivery test.

The currently deployed staff portal's go-live checklist reports that the reply mailbox, public phone, service area, active packages, cleaning team, and Resend settings are incomplete. The current profile defaults to AXA Cleaning, LKR, and UTC+5:30; confirm the currency and timezone with the business owner before launch. The existing customer site and portal render in English and Romanian, but no frontend deployment was made during the latest production verification.

Per owner direction, the portal does not block readiness on privacy/terms review. No legal text was created or reviewed, and removing this checklist item does not attest to legal compliance.

**Do not treat this repository as launch-approved until the owner completes these items:**

- Configure the production catalog with owner-approved packages, prices, extras, and agent schedules; add Romanian names/descriptions/features for content that needs localization. The current live catalog has no active packages. Never reuse a development database for production.
- Confirm the service area, public contact details, and currency in Business Settings.
- Implement secure, expiring customer self-service links if customers must change or cancel requests online. The current public tracking lookup uses the booking reference and customer e-mail and is read-only.
- Complete live end-to-end tests for customer booking/contact, staff login, OTP provisioning and password reset, role permissions, and booking updates. The API health, catalog endpoint, CORS preflight, RPC grants, active Super Admin, and SSL setting have already been checked; migration history still needs reconciliation before future CLI migration use.
- Configure Resend with a verified sending domain, `RESEND_API_KEY`, and `MAIL_FROM`; test delivery and reply threading end-to-end.
- Confirm the existing Static Web App workflow publishes the current frontend and deploy only static frontend content; the existing hostname responds with HTTP 200. Do not deploy Azure Functions or provision additional Azure resources.
- Configure production monitoring/alerting, backup/restore, and operational support. SSL enforcement is enabled.
- Exercise distributed booking locks against the production database and expected concurrent load.

### Local setup

```bash
npm test
```

For a fresh local database, set `SEED_SUPERADMIN_PASSWORD` and start `npm run dev`. By default, local development seeds demo service content; turn it off with `SEED_DEMO_DATA=false` when you want an empty setup. Use the Super Admin portal to configure the real profile, packages, extras, agents, and accounts.

### Production Edge Function configuration

| Setting | Required value / guidance |
|---|---|
| `AUTH_SECRET` | At least 32 characters; keep it private |
| `SUPABASE_URL` | Existing Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEYS` | Service-role secret, configured in Supabase function secrets only |
| `CORS_ALLOWED_ORIGINS` | Optional comma-separated exact frontend origins |
| `SEED_SUPERADMIN_PASSWORD` | Set only for initial provisioning, then remove; the production Super Admin is already provisioned |
| `SEED_DEMO_DATA` | `false` |
| `RESEND_API_KEY` | Resend API key, configured as a Supabase function secret only |
| `MAIL_FROM` | Sender identity verified in Resend; configure as a Supabase function secret |
| `WORK_START` / `WORK_END` | Approved operating hours, e.g. `08:00` / `18:00` |
| `TOKEN_TTL_HOURS` | Staff session duration (default `12`) |

## Security notes

- Passwords are hashed with scrypt and per-user salt. Sessions are HMAC-signed tokens checked against the user record on every request. Failed sign-ins are throttled.
- The portal sends its token in an `X-Auth-Token` header.
- Every permission check runs on the server. The UI only hides what you can't use.
- Public booking and contact forms have honeypots and per-IP hourly limits. Login and public throttles are per process (in memory), so a production host needs an external rate-limit/WAF strategy.
- Static security headers and CSP are defined for the existing Static Web App; verify the live deployment after changing frontend configuration.
