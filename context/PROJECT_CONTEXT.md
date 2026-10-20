# HealthGuard: project context

Running record of state, decisions and open work. Update this file in every commit that changes the project.

## Topic
Innovative security techniques and explainable risk assessment for electronic health records (EHR).

## People and repo
- Repo: https://github.com/pranjalpanwar81/healthcare-ai-security (original author Pranjal Panwar; Harsh Salunkhe has push access and authors v2 commits).
- Repo rule: no mentions of AI assistants or code-generation tools anywhere (commits, comments, docs).
- `baseline-original` git tag = the v1 app (React + Firebase + LangChain + TensorFlow) before the v2 rebuild. Roll back with `git checkout baseline-original`.

## Architecture (v2, 2026-10-21)
One Node service. Express serves the API under `/api` and the built React app from `dist/`.
- `server/server.js`: routes, auth, consent checks, security headers, rate limits.
- `server/lib/crypto.js`: HKDF-derived sub-keys from `MASTER_KEY`; envelope encryption (per-value AES-256-GCM data key wrapped by a versioned KEK, owner id bound as AAD); key rotation re-wraps data keys only; HMAC blind index for email lookup; scrypt passwords.
- `server/lib/audit.js`: append-only ledger, every entry HMAC-SHA256 signed and linked to the previous hash; `verify()` finds the first broken entry; `simulateTamper()` runs on a copy.
- `server/lib/network.js`: hospital-network gate for clinicians, using the server-observed public IP checked against CIDR allow-lists (env `HOSPITAL_NETWORKS` plus networks enrolled with `HOSPITAL_ENROLL_CODE`). In non-production, loopback and RFC1918 ranges are trusted. Enforced at sign-in and on every clinical request.
- `server/lib/anomaly.js`: rules on every audit entry (bulk reads, off-hours in hospital timezone, repeated denials, failed-login bursts per IP, off-network clinician login, break-glass, network enrolment).
- `server/lib/xai.js`: multinomial logistic regression trained at start-up (~2 s) on a seeded synthetic cohort (6000 rows, 12 features, 5 classes; about 98% held-out accuracy). Exact additive attributions (linear SHAP), plain-language summary, cumulative counterfactual, model card.
- `server/lib/store.js`: JSON file at `server/data/healthguard.json` (gitignored). Seeds demo data on first boot (`server/seed.js`).
- Frontend `src/`: React 19 + React Router. Design world "Clinical Label" (UI-Lab niche world 18): Atkinson Hyperlegible, white/ink, teal brand, status = icon + word + colour. Text-size and dark-mode toggles, skip link, focus moved to h1 on navigation, 44px targets.

## Why the Wi-Fi check changed
v1 trusted an `x-wifi-ssid` header sent by the browser, which any client can forge, and browsers cannot read the SSID anyway. v2 uses the egress IP of the hospital network as seen by the server. Kalaza Care never implemented Wi-Fi auth (it stayed on that project's backlog), so there was no pattern to copy.

## Access model (changed 2026-10-21)
Patients do not choose their doctors. The security officer (hospital administration) assigns care teams under `/api/admin/care-teams`, stored in `consents` with `assignedBy`. Patients see their care team read-only and can report any access-history entry (`/api/patient/report-access`), which raises a high `patient-report` alert. Break-glass is unchanged.

## UI structure
`AppShell` in `src/ui.jsx`: sidebar on screens 1024px and wider, top bar plus bottom tabs below that. Public pages use `TopBar`, which shows My dashboard and Sign out when signed in. The landing hero uses the real `label-card` and `AccessLedger` components with sample data.

## Roles and demo accounts (password `HealthGuard2026`)
- Patient: rohan@, ananya@, farhan@, meera@healthguard.demo
- Doctor: arjun.mehta@, kavya.iyer@healthguard.demo
- Security officer (admin): security@healthguard.demo

## Environment variables
`NODE_ENV=production`, `MASTER_KEY` (32 bytes base64, required in production), `JWT_SECRET` (optional), `HOSPITAL_ENROLL_CODE`, `DOCTOR_REGISTRATION_CODE`, `HOSPITAL_NETWORKS` (comma-separated CIDRs), `HOSPITAL_TIMEZONE` (default Asia/Kolkata), `TRUST_PROXY_HOPS` (default 1), `DATA_DIR`.
Dev defaults: enrol code `HOSPITAL-IT-2026`, doctor code `DOCTOR-2026`.

## Run locally
`npm install && npm --prefix server install`, then `npm --prefix server start` (API on 3001) and `npm run dev` (Vite on 5173, proxies /api). Security test suite: `npm --prefix server test` (78 checks; run against a fresh DATA_DIR on another port).

## Deployment
Vercel (see the next section). Render config was removed.

## Vercel deployment (current)
- `vercel.json`: Vite static build to `dist`; `api/index.js` exports the Express app as one function; `/api/*` is rewritten to it and other paths to `index.html`.
- Data lives in `/tmp/healthguard` per function instance, so it resets on cold start and is not shared between instances. Demo accounts use stable ids, so sessions stay valid across instances. Runtime changes (new records, consents) can vanish. A real deployment needs a shared database.
- The client address comes from the `x-real-ip` header set by Vercel's edge.
- Environment variables in the Vercel project: `MASTER_KEY`, `HOSPITAL_ENROLL_CODE`, `DOCTOR_REGISTRATION_CODE`, `NODE_ENV=production` (build tools are regular dependencies, so the build still has Vite).

## Open items / next
- Persistent database (Postgres) instead of the JSON file.
- TOTP second factor for clinicians.
- Optional LLM features from v1 (`server/langchainService.js` kept, not wired into v2 routes).
- `ml/` holds the original TensorFlow pipeline from v1 (not used by the v2 server).

## Log
- 2026-10-21: Premium visual layer (v3 block at the end of styles.css): Fraunces display headings, warm ivory canvas, evergreen and brass, dark sidebar, dark landing hero, entrance motion.
- 2026-10-21: Care teams assigned by hospital, patient reporting, app shell redesign, 78-check suite, fixed malformed-JSON 500 and public top bar showing Sign in while signed in.
- 2026-10-21: Deployed to Vercel (serverless API, stable demo ids).
- 2026-10-21: v2 rebuild. Security core, explainable model, patient/clinic/security UIs, deploy.
