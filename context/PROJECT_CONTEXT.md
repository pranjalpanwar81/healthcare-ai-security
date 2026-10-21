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
- `server/lib/store.js`: a JSON file at `server/data/healthguard.json` locally (gitignored). On Vercel, the same document lives in the private Blob store `healthguard-data` at `healthguard/db.json` (`BLOB_READ_WRITE_TOKEN`), refreshed before each API request and flushed before each response. Seeds initial accounts on first boot (`server/seed.js`).
- Frontend `src/`: React 19 + React Router. Design world "Clinical Label" (UI-Lab niche world 18): Atkinson Hyperlegible, white/ink, teal brand, status = icon + word + colour. Text-size and dark-mode toggles, skip link, focus moved to h1 on navigation, 44px targets.

## Clinical models (since 2026-10-22; replaced the synthetic xai.js and neural.js)
- Training: `ml/scripts/train.py` (venv `ml/.venv`, gitignored, with --system-site-packages plus shap). Data in `ml/data` (Pima 768, Cleveland 303). Nested 5-fold CV over LR, RF, XGBoost and MLP. Selected by mean CV ROC-AUC. Youden threshold from out-of-fold training predictions. Fairness by sex and age. SHAP plots, ROC and calibration in `ml/reports`.
- Results: heart uses LR (test AUC 0.963, recall 82%) with RF as second opinion; diabetes uses XGBoost (test AUC 0.756, recall 69%) with LR as second opinion. Diabetes CV AUC is 0.86 versus test 0.76, a gap from one small split that is reported honestly. Pima is women only (a stated limitation).
- Export: `server/models/{heart,diabetes}.json` (preprocessing, both models, background, training ranges, card, parity cases). `server/lib/clinical.js` evaluates the models in JS (XGBoost splits compared in float32 via Math.fround). Exact interventional SHAP against the background. `quickRisk()` is used for record saving and seeding, which is fast.
- Integrity: `server/lib/integrity.js` verifies the Ed25519-signed `manifest.json` and `manifest.sig` with `signing-public.pem`. The private key is at `C:\Users\Harsh\Projects\.tools\healthguard-model-signing.pem` (never commit it). Re-sign after every retrain: `node server/scripts/sign-models.mjs`. Parity must be within 1e-6, or the model is refused.
- vercel.json `functions.api/index.js.includeFiles = server/models/**`.
- Readings are stored per record under feature keys. `latestVitals` merges the latest value of each key across records.
## Why the Wi-Fi check changed
v1 trusted an `x-wifi-ssid` header sent by the browser, which any client can forge, and browsers cannot read the SSID anyway. v2 uses the egress IP of the hospital network as seen by the server. Kalaza Care never implemented Wi-Fi auth (it stayed on that project's backlog), so there was no pattern to copy.

## Access model (changed 2026-10-21)
Patients do not choose their doctors. The security officer (hospital administration) assigns care teams under `/api/admin/care-teams`, stored in `consents` with `assignedBy`. Patients see their care team read-only and can report any access-history entry (`/api/patient/report-access`), which raises a high `patient-report` alert. Break-glass is unchanged.

## UI structure
`AppShell` in `src/ui.jsx`: sidebar on screens 1024px and wider, top bar plus bottom tabs below that. Public pages use `TopBar`, which shows My dashboard and Sign out when signed in. The landing hero uses the real `label-card` and `AccessLedger` components with sample data.

## Roles and initial accounts (passwords: `SEED_PASSWORDS` secret on Vercel, held by Harsh; the local dev fallback is in seed.js)
- Patient: rohan@, ananya@, farhan@, meera@healthguard.demo
- Doctor: arjun.mehta@, kavya.iyer@healthguard.demo
- Security officer (admin): security@healthguard.demo

## Environment variables
`NODE_ENV=production`, `MASTER_KEY` (32 bytes base64, required in production), `JWT_SECRET` (optional), `HOSPITAL_ENROLL_CODE`, `DOCTOR_REGISTRATION_CODE`, `HOSPITAL_NETWORKS` (comma-separated CIDRs), `HOSPITAL_TIMEZONE` (default Asia/Kolkata), `TRUST_PROXY_HOPS` (default 1), `DATA_DIR`.
Dev defaults: enrol code `HOSPITAL-IT-2026`, doctor code `DOCTOR-2026`.

## Run locally
`npm install && npm --prefix server install`, then `npm --prefix server start` (API on 3001) and `npm run dev` (Vite on 5173, proxies /api). Security test suite: `npm --prefix server test` (91 checks; run against a fresh DATA_DIR on another port).

## Deployment
Vercel (see the next section). Render config was removed.

## Vercel deployment (current)
- `vercel.json`: Vite static build to `dist`; `api/index.js` exports the Express app as one function; `/api/*` is rewritten to it and other paths to `index.html`.
- Data is shared across instances through Vercel Blob (since 2026-10-21; it was per-instance `/tmp` before, which lost created accounts). Concurrent writes are last-write-wins, which is acceptable at prototype traffic. Supabase was not used because the free 2-project limit was reached.`n- Trusted networks: `HOSPITAL_NETWORKS` env (`cidr=Label`, comma-separated). LHBC_Students egress addresses: 103.68.38.66, 122.15.132.69, 202.71.156.66 (the campus spreads traffic across several links). Cloudflare WARP must be off.
- The client address comes from the `x-real-ip` header set by Vercel's edge.
- Environment variables in the Vercel project: `MASTER_KEY`, `HOSPITAL_ENROLL_CODE`, `DOCTOR_REGISTRATION_CODE`, `NODE_ENV=production` (build tools are regular dependencies, so the build still has Vite).

## Open items / next
- Persistent database (Postgres) instead of the JSON file.
- TOTP second factor for clinicians.
- Optional: an LLM layer (e.g. Gemini) for plain-language narratives on top of the exact model numbers. v1's LangChain code and the `ml/` TensorFlow pipeline were removed on 2026-10-21 and remain in git history and the `baseline-original` tag.

## Log
- 2026-10-21: Premium visual layer (v3 block at the end of styles.css): Fraunces display headings, warm ivory canvas, evergreen and brass, dark sidebar, dark landing hero, entrance motion.
- 2026-10-21: Care teams assigned by hospital, patient reporting, app shell redesign, 78-check suite, fixed malformed-JSON 500 and public top bar showing Sign in while signed in.
- 2026-10-22: Real-data models (Pima, Cleveland) with nested CV selection, tuned thresholds, fairness, signed model integrity and parity checks; synthetic models removed.
- 2026-10-21: Neural network with SHAP and integrated gradients beside the interpretable model; agreement banner and model switch in the UI; dead code removed (LangChain service, ml/, old CSS and the Tabs component; server deps cut to 4).
- 2026-10-21: Easy passwords set at Harsh's request (in the SEED_PASSWORDS secret). `syncSeedPasswords()` re-applies the secret to the listed accounts whenever it changes.
- 2026-10-21: Shared Blob store, per-account seed passwords via secret, demo panel removed, LHBC networks trusted.`n- 2026-10-21: Deployed to Vercel (serverless API, stable ids).
- 2026-10-21: v2 rebuild. Security core, explainable model, patient/clinic/security UIs, deploy.
