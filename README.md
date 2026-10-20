# HealthGuard: secure, explainable electronic health records

HealthGuard is an electronic health record (EHR) system that combines layered security techniques with an explainable risk assessment model. Patients control who can see their records and can watch every access. Clinicians get risk results that explain themselves.

## Security techniques

| Technique | What it does | Where |
|---|---|---|
| **Envelope encryption** | Every record and every patient profile is encrypted with its own random AES-256-GCM data key. Data keys are wrapped by a versioned master key. The patient id is bound as authenticated data, so ciphertext cannot be moved to another patient's file. | `server/lib/crypto.js` |
| **Key rotation without decryption** | Rotating the master key re-wraps only the data keys. Record contents are never decrypted. | `POST /api/admin/keys/rotate` |
| **Blind index** | Emails are stored encrypted. Look-ups use an HMAC fingerprint, so the database never holds a searchable plain-text email. | `blindIndex()` |
| **Tamper-evident audit ledger** | Every access, change and denial is appended to a hash chain signed with HMAC-SHA256. Editing, deleting or reordering any entry breaks verification from that point on. Patients see their own slice of the ledger with a live integrity seal. | `server/lib/audit.js` |
| **Patient-controlled consent** | Doctors can open a chart only with active, optionally time-limited consent. Revocation takes effect on the next request. | `accessFor()` in `server/server.js` |
| **Break-glass emergency access** | One hour of access with a mandatory written reason. The patient is told, and an alert goes to the security officer. | `POST /api/doctor/break-glass` |
| **Hospital-network gate for clinicians** | Clinicians can sign in and work only from approved hospital network addresses, checked by the server on every request. Networks are registered by hospital IT with an enrolment code. | `server/lib/network.js` |
| **Behavioural anomaly detection** | Flags bulk record reads, out-of-hours access, repeated denied requests, failed sign-in bursts, off-network clinician sign-ins, emergency access and new networks. | `server/lib/anomaly.js` |
| **Hardened sessions** | Short-lived JWT in an httpOnly, SameSite=Strict, Secure cookie (30 min for clinicians, 2 h for patients). Revoked on sign-out. Account lock after 5 wrong passwords. scrypt password hashing. | `server/server.js` |
| **Defensive HTTP** | Strict Content-Security-Policy, HSTS, frame denial, no-store on API responses, rate limits, body size limits, generic error messages. | `server/server.js` |

Why the network check uses IP addresses: browsers cannot read the Wi-Fi name, and any header a browser sends can be forged. The address a request arrives from is the signal the server can actually trust, because hospital Wi-Fi leaves the building through known public addresses.

## Explainable risk assessment

- **Interpretable by design.** A multinomial logistic regression over 12 routine measurements (age, BMI, blood pressure, heart rate, temperature, fasting glucose, HbA1c, white cell count, CRP, cough duration, fatigue) predicts one of five outcomes: no condition, hypertension risk, diabetes risk, possible bacterial infection, possible viral infection.
- **Exact attributions.** Because the model is additive, each measurement's contribution to a prediction is computed exactly (linear SHAP). It is not a post-hoc approximation.
- **Plain-language summary** naming the out-of-range readings that drove the result.
- **Counterfactuals.** The smallest set of changes toward normal ranges that would change the result.
- **Model card** with held-out accuracy, per-class precision and recall, global feature importance and limitations, published at `/how-it-works`.
- The model trains at server start-up on a seeded synthetic cohort, so results are reproducible and nothing depends on external services.

Decision support only. The model uses synthetic data and is not a medical device.

## Roles

- **Patient**: records, health check with explanation, sharing controls, emergency-access notices, access history.
- **Clinician**: consented patient list, chart, add encrypted records, explained risk check, emergency access, personal alerts. Hospital network required.
- **Security officer**: ledger verification and tamper simulation, key rotation, alert review, trusted networks, raw ledger. Hospital network required.

Demo accounts (password `HealthGuard2026`): `rohan@healthguard.demo` (patient), `arjun.mehta@healthguard.demo` (doctor), `security@healthguard.demo` (security officer). More are listed on the sign-in page.

## Run locally

```bash
npm install
npm --prefix server install
npm --prefix server start   # API on http://localhost:3001
npm run dev                 # app on http://localhost:5173
```

Local and private network addresses count as the hospital network in development. Run the security test suite against a running server with `npm --prefix server test`.

## Deploy

`render.yaml` describes a single Render web service. Set `MASTER_KEY` (32 random bytes, base64), `HOSPITAL_ENROLL_CODE` and `DOCTOR_REGISTRATION_CODE`. Optionally set `HOSPITAL_NETWORKS` to the hospital's public address ranges.

## Project layout

```
server/            Express API, security modules, explainable model, seed data, tests
src/               React app (patient, clinic and security consoles)
context/           Running project context and decisions
ml/                Original TensorFlow research pipeline (v1)
```
