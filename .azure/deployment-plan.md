# Hosting Plan

## Status
Blocked for customer launch — the Supabase API is deployed and healthy, database SSL enforcement is enabled, and the initial Super Admin is provisioned. Approved business content, verified email delivery, and end-to-end workflow checks remain outstanding.

## Goal
Host the customer-facing AXA Cleaning frontend on the existing Azure Static Web App and port the API to Supabase Edge Functions using the existing Supabase project. Do not use Azure Functions or provision additional Azure resources. Staff authentication remains application-managed.

## 1. Project Overview
- **Path:** Modify existing app and hosting configuration.
- **API today:** `api/` contains the application router and local development server. The previous Azure Functions entry point/runtime files have been removed.
- **Public website:** `frontend/`; deploy to existing SWA resource `AxaClean-Web` (`yellow-mud-06abc5e10.6.azurestaticapps.net`), Free SKU, Central US, resource group `Test`.
- **API:** Supabase Edge Function `axa-api` is deployed in the existing project. Live health returns 200 using Supabase storage; public packages and production-origin CORS preflight also return successfully.
- **Data:** The Supabase project is in `ap-northeast-1` (Tokyo), not Singapore. The private `axa_private` records, locks, and OTP tables exist. All 11 expected RPCs grant execute to `service_role` and not `anon`; tested direct SELECT/INSERT privileges are denied to both roles. The CLI migration-history table is absent because migrations were applied manually; do not reapply them blindly.
- **Authentication:** Application-managed staff username/password; Supabase Auth is not used.
- **Email:** User selected Resend. The API reports `mail: "log-only"` because a verified sender/domain and API key are not configured.

## 2. Requirements and Hosting Context
- **Classification:** Customer-facing launch preparation; existing SWA is Free.
- **Scale and monthly spend:** No new Azure resources requested; remain within the existing Free SWA and Supabase project plan limits. Confirm before any paid tier change.
- **Data residency:** Supabase project is in Tokyo (`ap-northeast-1`); existing SWA resource is in Central US. API/database traffic therefore crosses regions.
- **Azure subscription:** Arctic Technologies (`e79886c7-3904-4c4e-94bb-c9446c73efd7`), role Contributor, as observed in the signed-in portal.
- **Azure region:** Reuse the existing SWA location Central US; do not create a new Azure resource.
- **Azure Functions:** Explicitly excluded by the user's latest instruction.
- **Hosting direction:** User confirmed Azure Static Web Apps for frontend and Supabase Edge Functions for API.

## 3. Repository Scan
- No `azure.yaml` or `infra/` deployment configuration is present.
- Both existing SWA GitHub workflows now deploy only static frontend content; no Azure Functions API location is configured.
- The API uses the shared router locally and an esbuild-generated Deno Edge Function bundle in production. `api/` no longer includes Azure Functions or direct PostgreSQL/Table Storage backends.
- English and Romanian are supported by the customer frontend and staff portal, with a browser-stored preference, localized API errors and booking e-mail, language-specific dates/currency, and optional Romanian package/extra content fields.
- Staff accounts remain app-managed in the `users` collection of `axa_private.axa_records`. A separate `axa_private.axa_auth_otps` table stores salted OTP hashes, 10-minute expiry, and an attempt counter; the portal displays issued codes once. Super Admins alone can issue password-reset codes.
- Production requires `SUPABASE_URL`, a service-role secret, and an `AUTH_SECRET` of at least 32 characters; storage uses PostgREST RPCs.
- Production seeding requires a compliant `SEED_SUPERADMIN_PASSWORD` only until the first Super Admin is created. The active `superadmin` account was verified, and the seed secret has been removed from function secrets. `AUTH_SECRET` and the Supabase service credential remain configured as function secrets.
- The `public` schema has no application tables by design. The private tables and all 11 expected RPC grants were verified through read-only SQL. Direct SELECT/INSERT access is denied to `anon` and `service_role`; API access is through the granted RPCs.
- The Supabase CLI migration-history table is absent. The database objects exist from migrations previously applied manually; reconcile/baseline migration history before relying on CLI migration tracking. Do not apply the migrations again without checking for idempotency and current schema state.
- SSL enforcement is enabled and confirmed through the Supabase CLI. A new database query and live API health request both succeeded afterward.
- The existing Static Web App hostname responds with HTTP 200. No frontend deployment was performed in this task, so the live response is not proof that the current workspace frontend has been published.
- The API's live catalog currently has no active packages and default company contact fields are blank. Configure owner-approved packages, prices, Romanian translations, service area, phone, email, currency, and timezone before customer launch.
- Browser checks confirmed the existing customer site and staff portal load, and the staff portal renders in Romanian. Its live go-live checklist still flags the reply mailbox, public phone, service area, active packages, cleaning team, and Resend settings as incomplete. The current profile defaults to LKR and UTC+5:30; the owner must confirm those values. The owner asked to remove the privacy/terms checklist gate; no legal text was created or reviewed.
- The workspace now grants the `Admin` role CRUD access to packages/extras and cleaning-agent profiles/schedules, and adds a localized service-area scope dropdown. These latest UI/API changes are tested and built locally but have not been deployed; the existing Static Web App deployment remains explicitly out of scope for now.

## 4. Recipe and Architecture
- **Hosting target:** Existing Azure Static Web App; no new SWA resource.
- **Backend:** Supabase Edge Function API. Port the existing API behavior with server-side Supabase access and SQL RPCs for private document storage and cross-instance locks.
- **Frontend:** Update public site and staff portal to call the Edge Function endpoint. Configure explicit CORS origin allowlist for the production SWA hostname and local development.
- **Secrets:** Use Supabase Edge Function secrets for service-role credentials and application signing secret; do not place secrets in frontend code, GitHub workflow, or tracked files.
- **Deployment:** Existing GitHub SWA workflow deploys only `frontend/`. The API is deployed independently through the Supabase CLI. Deploy the frontend only after business content and end-to-end workflows are approved and verified.

## 5. Provisioning Limits and Blockers
- No new Azure resources are proposed; Azure quota checks are not applicable to this modify-only plan.
- Local validation is complete: all 28 tests pass, the Edge Function bundle builds, the API dependency audit reports no vulnerabilities, and `git diff --check` passes.
- The generated Edge Function bundle is deployed and the live health endpoint returns HTTP 200 with `storage: "supabase-edge"`. The live health endpoint reports `mail: "log-only"`.
- Keep the current Supabase database password. Configure secrets only through the project's secret settings; do not request or record secret values in chat or source control. `RESEND_API_KEY` and `MAIL_FROM` remain unconfigured; do not enable Resend delivery until the sender is verified.
- The production API has not yet had complete staff sign-in, booking, OTP/reset, and email workflows exercised end-to-end.

## Planned Scope
- In scope: Supabase Edge Function API, private Postgres RPCs, CORS and endpoint wiring; retain existing static-only SWA workflow; Resend HTTP delivery; tests and documentation.
- Out of scope: Azure Functions, new Azure resource creation, Supabase database password reset, migration of existing app records, and creation of external Resend account/domain.

## Resources and Cost
No new Azure resource creation. Existing Azure Static Web App is Free. Supabase Edge Function usage is subject to current project plan limits; no paid upgrade is approved.

## Validation and Deployment
The user approved this plan. Local validation is complete (29 tests, Edge Function bundle build, API audit with no reported vulnerabilities, and `git diff --check`). The `axa-api` Edge Function is deployed; live health, catalog route, CORS preflight, database RPC grants, active Super Admin, and SSL enforcement were verified. The one-time seed secret was removed after confirming the active Super Admin. Migration tracking is not present in the database, so future CLI migration workflows need reconciliation before use. The owner requested no privacy/terms checklist gate; no legal text was created or reviewed. Launch is blocked on owner-approved business content, verified Resend sender/key and delivery tests, end-to-end staff/customer workflow tests, and operational readiness (monitoring, backup/restore, and concurrency testing). The existing Static Web App hostname responds, but no frontend deployment was made. Do not deploy Azure Functions or provision Azure resources; do not expose the existing SWA GitHub Actions secret.
