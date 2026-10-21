# HealthGuard: secure, explainable electronic health records

HealthGuard is an electronic health record (EHR) system that combines layered security techniques with an explainable risk assessment model. Hospital administration assigns each patient's care team. Patients see who is on it and every access, and can report anything they do not recognise. Clinicians get risk results that explain themselves.

## Security techniques

| Technique | What it does | Where |
|---|---|---|
| **Envelope encryption** | Every record and every patient profile is encrypted with its own random AES-256-GCM data key. Data keys are wrapped by a versioned master key. The patient id is bound as authenticated data, so ciphertext cannot be moved to another patient's file. | `server/lib/crypto.js` |
| **Key rotation without decryption** | Rotating the master key re-wraps only the data keys. Record contents are never decrypted. | `POST /api/admin/keys/rotate` |
| **Blind index** | Emails are stored encrypted. Look-ups use an HMAC fingerprint, so the database never holds a searchable plain-text email. | `blindIndex()` |
| **Tamper-evident audit ledger** | Every access, change and denial is appended to a hash chain signed with HMAC-SHA256. Editing, deleting or reordering any entry breaks verification from that point on. Patients see their own slice of the ledger with a live integrity seal. | `server/lib/audit.js` |
| **Care-team access control** | Doctors can open a chart only when the security officer has assigned them to that patient's care team, optionally time-limited. Removal takes effect on the next request. | `accessFor()`, `/api/admin/care-teams` |
| **Patient reporting** | Patients can flag any entry in their access history. It raises a high-severity alert for the security officer. | `/api/patient/report-access` |
| **Break-glass emergency access** | One hour of access with a mandatory written reason. The patient is told, and an alert goes to the security officer. | `POST /api/doctor/break-glass` |
| **Hospital-network gate for clinicians** | Clinicians can sign in and work only from approved hospital network addresses, checked by the server on every request. Networks are registered by hospital IT with an enrolment code. | `server/lib/network.js` |
| **Behavioural anomaly detection** | Flags bulk record reads, out-of-hours access, repeated denied requests, failed sign-in bursts, off-network clinician sign-ins, emergency access and new networks. | `server/lib/anomaly.js` |
| **Hardened sessions** | Short-lived JWT in an httpOnly, SameSite=Strict, Secure cookie (30 min for clinicians, 2 h for patients). Revoked on sign-out. Account lock after 5 wrong passwords. scrypt password hashing. | `server/server.js` |
| **Defensive HTTP** | Strict Content-Security-Policy, HSTS, frame denial, no-store on API responses, rate limits, body size limits, generic error messages. | `server/server.js` |

Why the network check uses IP addresses: browsers cannot read the Wi-Fi name, and any header a browser sends can be forged. The address a request arrives from is the signal the server can actually trust, because hospital Wi-Fi leaves the building through known public addresses.

## Clinical risk models (trained on real data)

| Condition | Dataset | Selected model | Held-out ROC-AUC | Recall at tuned threshold | Second opinion |
|---|---|---|---|---|---|
| Coronary heart disease | UCI Heart Disease, Cleveland (303 patients) | Logistic regression | 0.963 | 82% | Random forest (0.959) |
| Type 2 diabetes | Pima Indians Diabetes (768 patients) | XGBoost | 0.756 | 69% | Logistic regression (0.769) |

- **Model selection.** Logistic regression, random forest, XGBoost and a neural network (MLP) are compared with nested, stratified 5-fold cross-validation (inner grid search on ROC-AUC). The best model per condition is refit and tested once on a 20% hold-out set.
- **Thresholds.** Alert thresholds come from out-of-fold training predictions (Youden's J), never from the test set. This lifts diabetes recall from 54% to 69%.
- **Explanations.** Exact interventional Shapley values (SHAP) of the predicted risk, over every combination of readings against a fixed background sample, verified to sum to the prediction on every request. Each result also includes a second opinion from a different model family, counterfactual suggestions ("what would lower this"), and a flag for readings outside the training range.
- **Fairness.** Held-out performance is reported by sex and age group on the model card.
- **Model integrity.** Model files are listed with SHA-256 hashes in a manifest signed with Ed25519. The server verifies the signature and hashes, then checks that its JavaScript evaluation reproduces the training library's predictions on stored parity cases. Tampered or mismatched models are never loaded.
- **Reproducibility.** `ml/scripts/train.py` rebuilds everything: data cleaning, comparison, plots (`ml/reports/`) and the exported models (`server/models/`). Sign new models with `node server/scripts/sign-models.mjs`.

Datasets: Pima Indians Diabetes Database (National Institute of Diabetes and Digestive and Kidney Diseases). Heart Disease (Cleveland), UCI Machine Learning Repository, Janosi, Steinbrunn, Pfisterer and Detrano (1988), CC BY 4.0. Decision support only; not a diagnosis and not a medical device.
## Roles

- **Patient**: records, health check with explanation, care team (read-only), emergency-access notices, access history with reporting.
- **Clinician**: assigned patient list, chart, add encrypted records, explained risk check, emergency access, personal alerts. Hospital network required.
- **Security officer**: care-team assignment, ledger verification and tamper simulation, key rotation, alert review, trusted networks, raw ledger. Hospital network required.

Initial accounts are created on first start. Their passwords come from the `SEED_PASSWORDS` secret (JSON map of email to password) and are never stored in the repository. Local development falls back to a development password.

## Run locally

```bash
npm install
npm --prefix server install
npm --prefix server start   # API on http://localhost:3001
npm run dev                 # app on http://localhost:5173
```

Local and private network addresses count as the hospital network in development. Run the security test suite against a running server with `npm --prefix server test`.

## Deploy

Deployed on Vercel: `vercel.json` serves the Vite build and runs `api/index.js` (the Express API) as a function. Set `MASTER_KEY` (32 random bytes, base64), `HOSPITAL_ENROLL_CODE` and `DOCTOR_REGISTRATION_CODE`. Optionally set `HOSPITAL_NETWORKS` to the hospital's public address ranges.

## Project layout

```
server/            Express API, security modules, explainable model, seed data, tests
src/               React app (patient, clinic and security consoles)
context/           Running project context and decisions
```
