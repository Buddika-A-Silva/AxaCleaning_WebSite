# Hosting Plan

## Status
Blocked — RPC and OTP migrations are applied and verified; function secrets, deployment, SSL verification, and live workflow checks remain outstanding

## Goal
Host the customer-facing AXA Cleaning frontend on the existing Azure Static Web App and port the API to Supabase Edge Functions using the existing Supabase project. Do not use Azure Functions or provision additional Azure resources. Staff authentication remains application-managed.

## 1. Project Overview
- **Path:** Modify existing app and hosting configuration.
- **API today:** `api/` contains the application router and local development server. The previous Azure Functions entry point/runtime files have been removed.
- **Public website:** `frontend/`; deploy to existing SWA resource `AxaClean-Web` (`yellow-mud-06abc5e10.6.azurestaticapps.net`), Free SKU, Central US, resource group `Test`.
- **API target:** Supabase Edge Function(s) in the existing Supabase project. Port existing endpoints and workflows; do not expose database credentials or service-role keys to browser code.
- **Data:** Supabase PostgreSQL project in Singapore; private `axa_private` schema, RLS tables, service-role-only RPCs, and staff OTP table are applied. The OTP table and representative RPC permissions were verified in the SQL Editor; verify all RPC grants and migration history after the dashboard issue clears.
- **Authentication:** Application-managed staff username/password; Supabase Auth is not used.
- **Email:** User selected Resend; the API now sends through its HTTP endpoint, but verified sender/domain and API-key secret configuration remain outstanding.

## 2. Requirements and Hosting Context
- **Classification:** Customer-facing launch preparation; existing SWA is Free.
- **Scale and monthly spend:** No new Azure resources requested; remain within the existing Free SWA and Supabase project plan limits. Confirm before any paid tier change.
- **Data residency:** Supabase project is Singapore; existing SWA resource is Central US. API/database traffic therefore crosses regions.
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
- Production seeding requires a compliant `SEED_SUPERADMIN_PASSWORD` (at least 12 characters with letters and numbers). The latest owner-provided temporary seed password meets the policy but has not been configured in Supabase; configure it only in the function secret settings.
- The Supabase dashboard still reports a technical issue. SQL Editor queries work, but the Edge Function secrets screen has not loaded its controls; no function secrets were configured and no function is deployed.
- Supabase CLI and Deno runtime are not installed locally.
- SSL enforcement is currently off. User authorized enabling it; Supabase warned this requires a database restart and several minutes of downtime. The dashboard currently reports a technical issue, and the authorized attempt did not change the setting.

## 4. Recipe and Architecture
- **Hosting target:** Existing Azure Static Web App; no new SWA resource.
- **Backend:** Supabase Edge Function API. Port the existing API behavior with server-side Supabase access and SQL RPCs for private document storage and cross-instance locks.
- **Frontend:** Update public site and staff portal to call the Edge Function endpoint. Configure explicit CORS origin allowlist for the production SWA hostname and local development.
- **Secrets:** Use Supabase Edge Function secrets for service-role credentials and application signing secret; do not place secrets in frontend code, GitHub workflow, or tracked files.
- **Deployment:** Existing GitHub SWA workflow deploys only `frontend/`. Edge Functions must be deployed independently through Supabase's authorized interface/CLI.

## 5. Provisioning Limits and Blockers
- No new Azure resources are proposed; Azure quota checks are not applicable to this modify-only plan.
- Supabase Edge Function plan limits must be verified in the dashboard before deployment; the incident banner persists.
- Local validation is complete: all 27 tests pass, the Edge Function bundle builds, the API dependency audit reports no vulnerabilities, and `git diff --check` passes.
- The generated Edge Function bundle has not been run on Deno or deployed; verify runtime compatibility and API behavior against Supabase before launch.
- Keep the current Supabase database password. Configure Supabase Edge Function secrets only through the project's secret settings; do not request secrets in chat.
- If the Supabase dashboard remains unavailable, stop before deploying functions or changing the database.

## Planned Scope
- In scope: port the API to Supabase Edge Functions; add service-role-only Postgres RPCs/migration, CORS and endpoint wiring; retain existing static-only SWA workflow; add Resend HTTP delivery; tests and documentation; retry SSL enforcement after Supabase dashboard recovery.
- Out of scope: Azure Functions, new Azure resource creation, Supabase database password reset, migration of existing app records, and creation of external Resend account/domain.

## Resources and Cost
No new Azure resource creation. Existing Azure Static Web App is Free. Supabase Edge Function usage is subject to current project plan limits; no paid upgrade is approved.

## Validation and Deployment
The user approved this plan. Implementation and local validation are complete; RPC and OTP migrations were applied through the SQL Editor and representative table/function privileges were confirmed. Deployment remains blocked until the Supabase Edge Function secrets and deployment interfaces work (or an authorized CLI path is available). Configure the required function secrets directly in Supabase, deploy the Edge Function, and verify the live API before changing the Static Web App endpoint. Then verify all RPC grants, migration history, SSL enforcement, sender identity, and live workflows. The existing SWA workflow uses a GitHub Actions secret; do not expose it.
