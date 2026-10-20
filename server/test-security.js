// End-to-end checks of the security model against a running server, run with a fresh DATA_DIR: `npm test`.
const BASE = process.env.API_URL || 'http://127.0.0.1:3001';
const PASS = 'HealthGuard2026';
let failures = 0;
let total = 0;

async function call(method, path, body, cookie, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const set = res.headers.get('set-cookie');
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => ({})), cookie: set ? set.split(';')[0] : null, rawCookie: set };
}

const check = (name, ok, extra = '') => {
  total += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
  if (!ok) failures += 1;
};
const section = (t) => console.log(`\n== ${t}`);
const login = (email, portal, password = PASS) => call('POST', '/api/auth/login', { email, password, portal });

section('Public surface');
const health = await call('GET', '/api/health');
check('health endpoint responds', health.status === 200 && health.body.ok);
check('security headers set', health.headers.get('x-frame-options') === 'DENY' && /default-src 'self'/.test(health.headers.get('content-security-policy') || '') && health.headers.get('cache-control') === 'no-store');
check('no framework fingerprint header', !health.headers.get('x-powered-by'));
check('unknown API route is 404', (await call('GET', '/api/nope')).status === 404);
const card = await call('GET', '/api/xai/model-card');
check('model card is public and accurate enough', card.status === 200 && card.body.accuracy > 0.9 && card.body.features.length === 12, `acc ${card.body.accuracy?.toFixed(3)}`);
const tryIt = await call('POST', '/api/xai/try', { vitals: { temperature: 39, wbc: 17, crp: 120, coughDays: 7, heartRate: 105 } });
check('public sandbox explains without sign-in', tryIt.body.prediction?.key === 'bacterial', tryIt.body.prediction?.key);
const junk = await call('POST', '/api/xai/try', { vitals: { age: 'abc', bmi: 1e9, systolic: -5 } });
check('garbage readings are clamped, not crashed', junk.status === 200 && junk.body.missing.includes('Age'));
check('malformed JSON rejected cleanly', (await call('POST', '/api/auth/login', '{bad json')).status === 400);
check('oversized body rejected', (await call('POST', '/api/xai/try', { pad: 'x'.repeat(200000) })).status === 413);

section('Authentication');
const pat = await login('rohan@healthguard.demo', 'patient');
check('patient can sign in', pat.status === 200 && pat.cookie);
check('session cookie is httpOnly and SameSite=Strict', /HttpOnly/i.test(pat.rawCookie) && /SameSite=Strict/i.test(pat.rawCookie));
const doc = await login('arjun.mehta@healthguard.demo', 'clinician');
check('doctor signs in on hospital network', doc.status === 200);
const iyer = await login('kavya.iyer@healthguard.demo', 'clinician');
const adm = await login('security@healthguard.demo', 'clinician');
check('security officer signs in', adm.status === 200);
check('email is case-insensitive', (await login('ROHAN@HealthGuard.demo', 'patient')).status === 200);
check('patient refused at clinician portal', (await login('rohan@healthguard.demo', 'clinician')).status === 403);
check('doctor refused at patient portal', (await login('arjun.mehta@healthguard.demo', 'patient')).status === 403);
const wrong = await call('POST', '/api/auth/login', { email: 'meera@healthguard.demo', password: 'nope' });
const unknown = await call('POST', '/api/auth/login', { email: 'ghost@healthguard.demo', password: 'nope' });
check('wrong password and unknown account look identical', wrong.status === 401 && unknown.status === 401 && wrong.body.error === unknown.body.error);
check('missing credentials rejected', (await call('POST', '/api/auth/login', {})).status === 400);
check('no session is refused', (await call('GET', '/api/patient/records')).status === 401);
check('forged token is refused', (await call('GET', '/api/patient/records', undefined, 'hg_session=eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.')).status === 401);
const me = await call('GET', '/api/auth/me', undefined, pat.cookie);
check('/auth/me returns the user without secrets', me.body.user?.name === 'Rohan Deshpande' && !('passwordHash' in me.body.user) && !('pii' in me.body.user));

section('Registration');
check('weak password rejected', (await call('POST', '/api/auth/register', { name: 'T', email: 't1@x.io', password: 'short' })).status === 400);
check('invalid email rejected', (await call('POST', '/api/auth/register', { name: 'T', email: 'not-an-email', password: 'GoodPassword1' })).status === 400);
check('duplicate email rejected', (await call('POST', '/api/auth/register', { name: 'T', email: 'rohan@healthguard.demo', password: 'GoodPassword1' })).status === 400);
check('clinician account needs a registration code', (await call('POST', '/api/auth/register', { role: 'doctor', name: 'Dr X', email: 'drx@x.io', password: 'GoodPassword1' })).status === 400);
const reg = await call('POST', '/api/auth/register', { name: 'Test Patient', email: 'new.patient@x.io', password: 'GoodPassword1', bloodGroup: 'O+' });
check('new patient can register and is signed in', reg.status === 201 && reg.cookie && reg.body.user.role === 'patient');
check('role cannot be escalated at registration', (await call('POST', '/api/auth/register', { role: 'admin', name: 'E', email: 'esc@x.io', password: 'GoodPassword1' })).body.user?.role === 'patient');
check('new patient starts with an empty care team', (await call('GET', '/api/patient/care-team', undefined, reg.cookie)).body.consents?.length === 0);

section('Lockout');
for (let i = 0; i < 5; i += 1) await call('POST', '/api/auth/login', { email: 'new.patient@x.io', password: 'WrongPassword1' });
check('account locks after 5 wrong passwords', (await call('POST', '/api/auth/login', { email: 'new.patient@x.io', password: 'GoodPassword1' })).status === 423);

section('Patient data');
const recs = await call('GET', '/api/patient/records', undefined, pat.cookie);
check('patient reads own decrypted records', recs.status === 200 && recs.body.records.length === 2);
check('patient sees an explained health check', (await call('GET', '/api/patient/explanation', undefined, pat.cookie)).body.prediction?.key === 'hypertension');
check('patient cannot use doctor API', (await call('GET', '/api/doctor/patients', undefined, pat.cookie)).status === 403);
check('patient cannot use admin API', (await call('GET', '/api/admin/overview', undefined, pat.cookie)).status === 403);

section('Care team is assigned by the hospital, not the patient');
const team = await call('GET', '/api/patient/care-team', undefined, pat.cookie);
check('patient can see their care team', team.body.consents.length === 2 && team.body.consents.every((c) => c.assignedBy));
const doctors = (await call('GET', '/api/doctors', undefined, pat.cookie)).body.doctors;
const iyerId = doctors.find((d) => d.name === 'Dr. Kavya Iyer').id;
const mehtaId = doctors.find((d) => d.name === 'Dr. Arjun Mehta').id;
check('patient cannot add a doctor', [404, 405].includes((await call('POST', '/api/patient/consents', { doctorId: iyerId }, pat.cookie)).status));
check('patient cannot remove a doctor', [404, 405].includes((await call('DELETE', `/api/patient/consents/${iyerId}`, undefined, pat.cookie)).status));
check('doctor cannot assign themselves', (await call('POST', '/api/admin/care-teams', { patientId: 'x', doctorId: mehtaId }, doc.cookie)).status === 403);

const list = await call('GET', '/api/doctor/patients', undefined, doc.cookie);
check('doctor sees assigned patients only', list.status === 200 && list.body.patients.length === 3, `${list.body.patients?.length}`);
const rohanId = list.body.patients.find((p) => p.name === 'Rohan Deshpande').id;
const farhan = await call('GET', '/api/doctor/search?email=farhan@healthguard.demo', undefined, doc.cookie);
check('doctor can find a patient by email (blind index)', farhan.body.found === true);
check('search for unknown email finds nothing', (await call('GET', '/api/doctor/search?email=nobody@x.io', undefined, doc.cookie)).body.found === false);
const fid = farhan.body.patient.id;
check('unassigned doctor is denied the chart', (await call('GET', `/api/doctor/patients/${fid}`, undefined, doc.cookie)).status === 403);
check('unassigned doctor cannot write a record', (await call('POST', `/api/doctor/patients/${fid}/records`, { title: 'x' }, doc.cookie)).status === 403);
check('unassigned doctor cannot run a risk check on the patient', (await call('POST', `/api/doctor/patients/${fid}/explain`, { vitals: {} }, doc.cookie)).status === 403);

const assignR = await call('POST', '/api/admin/care-teams', { patientId: fid, doctorId: mehtaId, days: 7 }, adm.cookie);
check('security officer assigns a doctor to a care team', assignR.status === 201);
check('assignment grants access immediately', (await call('GET', `/api/doctor/patients/${fid}`, undefined, doc.cookie)).status === 200);
check('assignment rejects a non-doctor', (await call('POST', '/api/admin/care-teams', { patientId: fid, doctorId: fid }, adm.cookie)).status === 404);
await call('DELETE', '/api/admin/care-teams', { patientId: fid, doctorId: mehtaId }, adm.cookie);
check('removal blocks the doctor immediately', (await call('GET', `/api/doctor/patients/${fid}`, undefined, doc.cookie)).status === 403);
const farhanTeam = (await call('GET', '/api/admin/care-teams', undefined, adm.cookie)).body.patients.find((p) => p.id === fid);
check('care-team overview reflects the change', farhanTeam.team.length === 1 && farhanTeam.team[0].doctorName === 'Dr. Kavya Iyer');

section('Emergency access');
check('short emergency reason rejected', (await call('POST', '/api/doctor/break-glass', { patientId: fid, reason: 'urgent' }, doc.cookie)).status === 400);
check('emergency access for unknown patient rejected', (await call('POST', '/api/doctor/break-glass', { patientId: 'pat_nope', reason: 'Patient unconscious in emergency department' }, doc.cookie)).status === 404);
const bg = await call('POST', '/api/doctor/break-glass', { patientId: fid, reason: 'Patient unconscious in emergency department, needs history' }, doc.cookie);
check('emergency access is granted with a reason', bg.status === 201);
const chart = await call('GET', `/api/doctor/patients/${fid}`, undefined, doc.cookie);
check('emergency access opens the chart', chart.status === 200 && chart.body.access.basis === 'emergency');

section('Records');
check('record without a title rejected', (await call('POST', `/api/doctor/patients/${rohanId}/records`, { notes: 'x' }, doc.cookie)).status === 400);
const add = await call('POST', `/api/doctor/patients/${rohanId}/records`, { title: 'Phone consultation', notes: 'Feeling better.', vitals: { systolic: 138, diastolic: 88, age: 'x' }, medications: ['Amlodipine 5 mg'] }, doc.cookie);
check('doctor writes a sealed record with an assessment', add.status === 201 && add.body.record.title === 'Phone consultation' && add.body.record.assessment && !('age' in add.body.record.vitals));
check('patient sees the new record', (await call('GET', '/api/patient/records', undefined, pat.cookie)).body.records.length === 3);
const iyerChart = await call('GET', `/api/doctor/patients/${rohanId}`, undefined, iyer.cookie);
check('second care-team doctor sees the same record', iyerChart.status === 200 && iyerChart.body.records.length === 3);

section('Explainable assessment');
const xai = await call('POST', '/api/xai/explain', { vitals: { systolic: 160, diastolic: 100, age: 60, bmi: 30 } }, pat.cookie);
check('explanation returns prediction and attributions', xai.body.prediction?.key === 'hypertension' && xai.body.contributions?.length === 12, xai.body.prediction?.key);
const sumImpact = xai.body.contributions.reduce((s, c) => s + c.impact, 0);
check('attributions are finite numbers', Number.isFinite(sumImpact));
check('probabilities sum to one', Math.abs(xai.body.probabilities.reduce((s, p) => s + p.probability, 0) - 1) < 1e-6);
check('counterfactual offered for a flagged result', Array.isArray(xai.body.counterfactual?.changes));
check('healthy readings flag nothing', (await call('POST', '/api/xai/try', { vitals: { age: 30, bmi: 22, systolic: 114, diastolic: 74, heartRate: 70, temperature: 36.6, glucose: 86, hba1c: 5, wbc: 6.5, crp: 2, coughDays: 0, fatigue: 2 } })).body.prediction?.key === 'healthy');

section('Transparency and reporting');
const log = await call('GET', '/api/patient/access-log', undefined, pat.cookie);
check('patient sees who opened their record', log.body.entries.some((e) => e.who === 'Dr. Arjun Mehta' && e.action === 'record.read'));
check('patient sees care-team assignments', log.body.entries.some((e) => e.action === 'careteam.assign'));
check('ledger verifies as intact', log.body.integrity.valid === true, `${log.body.integrity.checked} entries`);
const target = log.body.entries.find((e) => e.action === 'record.read');
check('patient can report an access', (await call('POST', '/api/patient/report-access', { seq: target.seq, note: 'I do not know this doctor' }, pat.cookie)).status === 201);
const otherSeq = (await call('GET', '/api/admin/audit?limit=500', undefined, adm.cookie)).body.entries.find((e) => e.patientId && e.patientId !== me.body.user.id)?.seq;
check("patient cannot report another patient's entry", (await call('POST', '/api/patient/report-access', { seq: otherSeq }, pat.cookie)).status === 404);

section('Security officer');
const ov = await call('GET', '/api/admin/overview', undefined, adm.cookie);
check('patient report raised a high alert', ov.body.alerts.some((a) => a.rule === 'patient-report' && a.severity === 'high'));
check('emergency access raised an alert', ov.body.alerts.some((a) => a.rule === 'break-glass'));
check('doctor cannot use admin API', (await call('GET', '/api/admin/overview', undefined, doc.cookie)).status === 403);
const alert = ov.body.alerts.find((a) => a.status === 'open');
check('alert can be resolved', (await call('POST', `/api/admin/alerts/${alert.id}/resolve`, undefined, adm.cookie)).status === 200);
check('doctor sees own alerts', (await call('GET', '/api/doctor/alerts', undefined, doc.cookie)).body.alerts.some((a) => a.rule === 'break-glass'));
const tamper = await call('POST', '/api/admin/audit/simulate-tamper', undefined, adm.cookie);
check('tampering is detected', tamper.body.result?.valid === false, tamper.body.result?.reason);
check('real ledger untouched by the simulation', (await call('POST', '/api/admin/audit/verify', undefined, adm.cookie)).body.valid === true);
const rot = await call('POST', '/api/admin/keys/rotate', undefined, adm.cookie);
check('key rotation re-wraps every data key', rot.body.ok === true, `v${rot.body.version}`);
check('records still open after rotation', (await call('GET', '/api/patient/records', undefined, pat.cookie)).body.records.length === 3);
check('enrolment with a wrong code is refused', (await call('POST', '/api/network/enroll', { code: 'guess' })).status === 403);

section('Account removal');
const teams = (await call('GET', '/api/admin/care-teams', undefined, adm.cookie)).body.patients;
const testP = teams.find((p) => p.name === 'Test Patient');
check('initial accounts are protected', (await call('DELETE', `/api/admin/patients/${rohanId}`, undefined, adm.cookie)).status === 400);
check('doctor cannot remove accounts', (await call('DELETE', `/api/admin/patients/${testP.id}`, undefined, doc.cookie)).status === 403);
check('security officer removes a test account', (await call('DELETE', `/api/admin/patients/${testP.id}`, undefined, adm.cookie)).status === 200);
check('removed account can no longer sign in', (await call('POST', '/api/auth/login', { email: 'new.patient@x.io', password: 'GoodPassword1' })).status === 401);
check('ledger still verifies after removal', (await call('POST', '/api/admin/audit/verify', undefined, adm.cookie)).body.valid === true);

section('Sign-out');
check('logout succeeds', (await call('POST', '/api/auth/logout', undefined, pat.cookie)).status === 200);
check('old session token is revoked', (await call('GET', '/api/patient/records', undefined, pat.cookie)).status === 401);

console.log(failures ? `\n${failures} of ${total} check(s) failed` : `\nAll ${total} checks passed`);
process.exit(failures ? 1 : 0);
