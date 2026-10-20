// End-to-end checks of the security model against a running server: `npm test`.
const BASE = process.env.API_URL || 'http://127.0.0.1:3001';
const PASS = 'HealthGuard2026';
let failures = 0;

async function call(method, path, body, cookie, headers = {}) {
  const res = await fetch(BASE + path, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  return { status: res.status, body: await res.json().catch(() => ({})), cookie: set ? set.split(';')[0] : null };
}

const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
  if (!ok) failures += 1;
};

const login = async (email, portal) => call('POST', '/api/auth/login', { email, password: PASS, portal });

const pat = await login('rohan@healthguard.demo', 'patient');
check('patient can sign in', pat.status === 200 && pat.cookie);
const doc = await login('arjun.mehta@healthguard.demo', 'clinician');
check('doctor signs in on hospital network', doc.status === 200);
const iyer = await login('kavya.iyer@healthguard.demo', 'clinician');
const adm = await login('security@healthguard.demo', 'clinician');
check('security officer signs in', adm.status === 200);

check('wrong portal is refused', (await login('rohan@healthguard.demo', 'clinician')).status === 403);
check('wrong password is refused', (await call('POST', '/api/auth/login', { email: 'meera@healthguard.demo', password: 'nope' })).status === 401);
check('no session is refused', (await call('GET', '/api/patient/records')).status === 401);
check('forged token is refused', (await call('GET', '/api/patient/records', null, 'hg_session=eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.')).status === 401);

const recs = await call('GET', '/api/patient/records', null, pat.cookie);
check('patient reads own decrypted records', recs.status === 200 && recs.body.records.length === 2);
check('patient cannot use doctor API', (await call('GET', '/api/doctor/patients', null, pat.cookie)).status === 403);

const list = await call('GET', '/api/doctor/patients', null, doc.cookie);
check('doctor sees consented patients only', list.status === 200 && list.body.patients.length === 3, `${list.body.patients?.length}`);
const farhan = await call('GET', '/api/doctor/search?email=farhan@healthguard.demo', null, doc.cookie);
check('doctor can find a patient by email (blind index)', farhan.body.found === true);
const fid = farhan.body.patient.id;
check('doctor without consent is denied', (await call('GET', `/api/doctor/patients/${fid}`, null, doc.cookie)).status === 403);
check('short emergency reason rejected', (await call('POST', '/api/doctor/break-glass', { patientId: fid, reason: 'urgent' }, doc.cookie)).status === 400);
const bg = await call('POST', '/api/doctor/break-glass', { patientId: fid, reason: 'Patient unconscious in emergency department, needs history' }, doc.cookie);
check('emergency access is granted with a reason', bg.status === 201);
const chart = await call('GET', `/api/doctor/patients/${fid}`, null, doc.cookie);
check('emergency access opens the chart', chart.status === 200 && chart.body.access.basis === 'emergency');

const rohanId = list.body.patients.find((p) => p.name === 'Rohan Deshpande').id;
const add = await call('POST', `/api/doctor/patients/${rohanId}/records`, { title: 'Phone consultation', notes: 'Feeling better.', vitals: { systolic: 138, diastolic: 88 } }, doc.cookie);
check('doctor writes a sealed record', add.status === 201 && add.body.record.title === 'Phone consultation');

// Consent revocation takes effect immediately.
const iyerId = (await call('GET', '/api/doctors', null, pat.cookie)).body.doctors.find((d) => d.name === 'Dr. Kavya Iyer').id;
check('Dr. Iyer can read Rohan before revocation', (await call('GET', `/api/doctor/patients/${rohanId}`, null, iyer.cookie)).status === 200);
await call('DELETE', `/api/patient/consents/${iyerId}`, null, pat.cookie);
check('revoked consent blocks Dr. Iyer immediately', (await call('GET', `/api/doctor/patients/${rohanId}`, null, iyer.cookie)).status === 403);

const xai = await call('POST', '/api/xai/explain', { vitals: { systolic: 160, diastolic: 100, age: 60, bmi: 30 } }, pat.cookie);
check('explanation returns prediction and attributions', xai.body.prediction?.key === 'hypertension' && xai.body.contributions?.length === 12, xai.body.prediction?.key);

const log = await call('GET', '/api/patient/access-log', null, pat.cookie);
check('patient sees who opened their record', log.body.entries.some((e) => e.who === 'Dr. Arjun Mehta'));
check('ledger verifies as intact', log.body.integrity.valid === true, `${log.body.integrity.checked} entries`);

const tamper = await call('POST', '/api/admin/audit/simulate-tamper', null, adm.cookie);
check('tampering is detected', tamper.body.result?.valid === false, tamper.body.result?.reason);
const rot = await call('POST', '/api/admin/keys/rotate', null, adm.cookie);
check('key rotation re-wraps every data key', rot.body.ok === true, `v${rot.body.version}`);
check('records still open after rotation', (await call('GET', '/api/patient/records', null, pat.cookie)).body.records.length === 3);
check('doctor cannot use admin API', (await call('GET', '/api/admin/overview', null, doc.cookie)).status === 403);
const ov = await call('GET', '/api/admin/overview', null, adm.cookie);
check('emergency access raised an alert', ov.body.alerts.some((a) => a.rule === 'break-glass'));

const out = await call('POST', '/api/auth/logout', null, pat.cookie);
check('logout succeeds', out.status === 200);
check('old session token is revoked', (await call('GET', '/api/patient/records', null, pat.cookie)).status === 401);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
