// HealthGuard API: secure electronic health records with explainable risk assessment.
import 'dotenv/config';
import express from 'express';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as store from './lib/store.js';
import * as audit from './lib/audit.js';
import { seal, open, rewrap, rotateKek, activeKekVersion, restoreKekVersion, blindIndex, hashPassword, verifyPassword, randomId, jwtSecret } from './lib/crypto.js';
import { checkNetwork, enrollNetwork, trustedNetworks, removeNetwork } from './lib/network.js';
import { explain, modelCard, FEATURES } from './lib/xai.js';
import { explainAll, neuralCard } from './lib/neural.js';
import { startMonitoring } from './lib/anomaly.js';
import { seedDemo, syncSeedPasswords } from './seed.js';

const PORT = Number(process.env.PORT || 3001);
const PROD = process.env.NODE_ENV?.trim() === 'production' || Boolean(process.env.VERCEL);
const ENROLL_CODE = process.env.HOSPITAL_ENROLL_CODE?.trim() || (PROD ? null : 'HOSPITAL-IT-2026');
const DOCTOR_CODE = process.env.DOCTOR_REGISTRATION_CODE?.trim() || (PROD ? null : 'DOCTOR-2026');
const SESSION_MINUTES = { patient: 120, doctor: 30, admin: 30 };
const COOKIE = 'hg_session';

store.load();
startMonitoring();
if (!store.usesSharedStore()) {
  restoreKekVersion(store.data().meta.kekVersion || 1);
  if (store.isEmpty()) seedDemo();
}

const app = express();
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
app.disable('x-powered-by');

// Shared store (Vercel Blob): load the latest copy before each API request and write
// any changes back before the response leaves, because the function may freeze afterwards.
app.use('/api', async (req, res, next) => {
  if (!store.usesSharedStore()) return next();
  try {
    await store.refresh();
    if (store.isEmpty()) seedDemo();
    restoreKekVersion(store.data().meta.kekVersion || 1);
    syncSeedPasswords();
  } catch (err) {
    console.error('[store] refresh failed', err);
    return res.status(503).json({ error: 'The service is briefly unavailable. Please try again.' });
  }
  const send = res.json.bind(res);
  res.json = (body) => {
    store.flush().then(() => send(body), (err) => {
      console.error('[store] flush failed', err);
      res.status(503);
      send({ error: 'Your change could not be saved. Please try again.' });
    });
    return res;
  };
  return next();
});

app.use(express.json({ limit: '100kb' }));

// Security headers.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});

// Simple fixed-window rate limiter.
const buckets = new Map();
const limit = (name, max, windowMs) => (req, res, next) => {
  const key = `${name}:${req.ip}`;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start > windowMs) { buckets.set(key, { start: now, count: 1 }); return next(); }
  b.count += 1;
  if (b.count > max) {
    res.setHeader('Retry-After', Math.ceil((b.start + windowMs - now) / 1000));
    return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
  }
  return next();
};
app.use('/api/', limit('api', 300, 60 * 1000));

const db = store.data;
// On Vercel the edge sets x-real-ip to the true client address and strips any client-supplied value.
const ipOf = (req) => (process.env.VERCEL ? String(req.headers['x-real-ip'] || req.ip) : req.ip);
const findUser = (id) => db().users.find((u) => u.id === id);
const publicUser = (u) => {
  const pii = open(u.pii, u.id);
  return { id: u.id, role: u.role, name: u.name, email: pii.email, specialty: u.specialty ?? null, profile: u.role === 'patient' ? pii : undefined };
};
const fail = (res, status, error, extra = {}) => res.status(status).json({ error, ...extra });

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function issueSession(res, user) {
  const minutes = SESSION_MINUTES[user.role];
  const jti = randomId('ses');
  const token = jwt.sign({ sub: user.id, role: user.role, jti }, jwtSecret, { algorithm: 'HS256', expiresIn: `${minutes}m`, issuer: 'healthguard' });
  res.cookie(COOKIE, token, { httpOnly: true, secure: PROD, sameSite: 'strict', maxAge: minutes * 60 * 1000, path: '/' });
  return { expiresAt: new Date(Date.now() + minutes * 60 * 1000).toISOString() };
}

// Authentication: the session lives in an httpOnly, SameSite=Strict cookie that scripts cannot read.
function auth(req, res, next) {
  const token = readCookie(req, COOKIE);
  if (!token) return fail(res, 401, 'Please sign in.');
  try {
    const claims = jwt.verify(token, jwtSecret, { algorithms: ['HS256'], issuer: 'healthguard' });
    if (db().revokedTokens.some((t) => t.jti === claims.jti)) return fail(res, 401, 'Your session has ended. Please sign in again.');
    const user = findUser(claims.sub);
    if (!user || user.role !== claims.role) return fail(res, 401, 'Please sign in.');
    req.user = user;
    req.session = claims;
    return next();
  } catch {
    return fail(res, 401, 'Your session has expired. Please sign in again.');
  }
}

const role = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    audit.record({ actor: req.user, action: 'access.forbidden', target: req.path, outcome: 'denied', ip: ipOf(req) });
    return fail(res, 403, 'You do not have permission to do that.');
  }
  return next();
};

// Clinical staff must be on a hospital network for every request, not just at sign-in.
function hospitalNetwork(req, res, next) {
  const status = checkNetwork(ipOf(req));
  if (!status.trusted) {
    audit.record({ actor: req.user, action: 'network.blocked', target: req.path, outcome: 'denied', ip: status.ip });
    return fail(res, 403, 'Clinical access is only available on the hospital network.', { code: 'NETWORK_REQUIRED', ip: status.ip });
  }
  req.network = status;
  return next();
}

const clinical = [auth, role('doctor', 'admin'), hospitalNetwork];

// Care-team access: a doctor may open a chart only when hospital administration has assigned them, or during an active emergency override.
function accessFor(doctorId, patientId) {
  const now = Date.now();
  const consent = db().consents.find((c) => c.doctorId === doctorId && c.patientId === patientId
    && (!c.expiresAt || Date.parse(c.expiresAt) > now));
  if (consent) return { allowed: true, basis: 'consent', until: consent.expiresAt };
  const bg = db().breakGlass.find((b) => b.doctorId === doctorId && b.patientId === patientId && Date.parse(b.expiresAt) > now);
  if (bg) return { allowed: true, basis: 'emergency', until: bg.expiresAt };
  return { allowed: false };
}

const requireStr = (v, name, max = 200) => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`${name} is required.`);
  if (v.length > max) throw new Error(`${name} is too long.`);
  return v.trim();
};
const strongPassword = (p) => typeof p === 'string' && p.length >= 10 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p);

const recordView = (r) => ({ id: r.id, createdAt: r.createdAt, authorName: r.authorName, ...open(r.sealed, r.patientId) });
const patientRecords = (patientId) => db().records.filter((r) => r.patientId === patientId)
  .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(recordView);
const latestVitals = (records) => records.find((r) => r.vitals && Object.keys(r.vitals).length)?.vitals ?? null;

// ---------- Public ----------
app.get('/api/health', (req, res) => res.json({ ok: true, ledgerEntries: db().audit.length }));

app.get('/api/network/status', (req, res) => {
  const s = checkNetwork(ipOf(req));
  res.json({ ip: s.ip, trusted: s.trusted, network: s.network });
});

app.post('/api/network/enroll', limit('enroll', 5, 15 * 60 * 1000), (req, res) => {
  const { code, label } = req.body || {};
  if (!ENROLL_CODE || typeof code !== 'string' || code.trim() !== ENROLL_CODE) {
    audit.record({ action: 'network.enroll', outcome: 'denied', ip: ipOf(req), detail: { reason: 'bad code' } });
    return fail(res, 403, 'That enrolment code is not valid. Ask hospital IT for the current code.');
  }
  const cidr = enrollNetwork(ipOf(req), typeof label === 'string' ? label.slice(0, 60) : 'Hospital Wi-Fi');
  audit.record({ action: 'network.enroll', target: cidr, outcome: 'success', ip: ipOf(req) });
  return res.json({ ok: true, cidr });
});

app.get('/api/xai/model-card', (req, res) => res.json({ ...modelCard(), features: FEATURES, neural: neuralCard() }));

// Public sandbox: explains sample readings. Nothing is stored and no identity is attached.
app.post('/api/xai/try', limit('xai-try', 30, 60 * 1000), (req, res) => res.json(explainAll(req.body?.vitals || {})));

// ---------- Auth ----------
app.post('/api/auth/register', limit('register', 10, 60 * 60 * 1000), (req, res) => {
  try {
    const b = req.body || {};
    const name = requireStr(b.name, 'Name', 80);
    const email = requireStr(b.email, 'Email', 120).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address.');
    if (!strongPassword(b.password)) throw new Error('Password needs at least 10 characters, with upper and lower case letters and a number.');
    const wantRole = b.role === 'doctor' ? 'doctor' : 'patient';
    if (wantRole === 'doctor') {
      if (!DOCTOR_CODE || b.registrationCode !== DOCTOR_CODE) throw new Error('A valid hospital registration code is required for clinician accounts.');
      if (!checkNetwork(ipOf(req)).trusted) return fail(res, 403, 'Clinician accounts can only be created on the hospital network.', { code: 'NETWORK_REQUIRED' });
    }
    const emailIndex = blindIndex(email);
    if (db().users.some((u) => u.emailIndex === emailIndex)) throw new Error('An account with this email already exists.');
    const id = randomId(wantRole === 'doctor' ? 'doc' : 'pat');
    const user = {
      id, role: wantRole, name, emailIndex, passwordHash: hashPassword(b.password),
      specialty: wantRole === 'doctor' ? (b.specialty || 'General Medicine').slice(0, 60) : undefined,
      pii: seal({ email, phone: b.phone || '', dob: b.dob || '', gender: b.gender || '', bloodGroup: b.bloodGroup || '', allergies: b.allergies || '' }, id),
      createdAt: new Date().toISOString(), failedLogins: 0, lockedUntil: null,
    };
    db().users.push(user);
    store.save();
    audit.record({ actor: user, action: 'auth.register', outcome: 'success', ip: ipOf(req) });
    const session = issueSession(res, user);
    return res.status(201).json({ user: publicUser(user), ...session });
  } catch (err) {
    return fail(res, 400, err.message);
  }
});

app.post('/api/auth/login', limit('login', 20, 15 * 60 * 1000), (req, res) => {
  const { email, password, portal } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') return fail(res, 400, 'Enter your email and password.');
  const user = db().users.find((u) => u.emailIndex === blindIndex(email));
  const generic = 'That email and password do not match.';
  if (!user) {
    audit.record({ action: 'auth.login', outcome: 'failed', ip: ipOf(req), detail: { reason: 'unknown account' } });
    return fail(res, 401, generic);
  }
  if (user.lockedUntil && Date.parse(user.lockedUntil) > Date.now()) {
    audit.record({ actor: user, action: 'auth.login', outcome: 'denied', ip: ipOf(req), detail: { reason: 'locked' } });
    return fail(res, 423, 'This account is locked for 15 minutes after several wrong passwords.');
  }
  if (!verifyPassword(password, user.passwordHash)) {
    user.failedLogins = (user.failedLogins || 0) + 1;
    if (user.failedLogins >= 5) { user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString(); user.failedLogins = 0; }
    store.save();
    audit.record({ actor: user, action: 'auth.login', outcome: 'failed', ip: ipOf(req), detail: { reason: 'wrong password' } });
    return fail(res, 401, generic);
  }
  const portalRole = portal === 'clinician' ? ['doctor', 'admin'] : ['patient'];
  if (portal && !portalRole.includes(user.role)) {
    return fail(res, 403, user.role === 'patient' ? 'This is a patient account. Please use the patient sign-in.' : 'This is a clinician account. Please use the clinician sign-in.');
  }
  if (user.role !== 'patient') {
    const net = checkNetwork(ipOf(req));
    if (!net.trusted) {
      audit.record({ actor: user, action: 'auth.login', outcome: 'denied', ip: net.ip, detail: { reason: 'network' } });
      return fail(res, 403, 'Clinicians can only sign in from the hospital network.', { code: 'NETWORK_REQUIRED', ip: net.ip });
    }
  }
  user.failedLogins = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date().toISOString();
  store.save();
  audit.record({ actor: user, action: 'auth.login', outcome: 'success', ip: ipOf(req) });
  const session = issueSession(res, user);
  return res.json({ user: publicUser(user), ...session });
});

app.post('/api/auth/logout', auth, (req, res) => {
  db().revokedTokens.push({ jti: req.session.jti, exp: req.session.exp });
  const now = Date.now() / 1000;
  db().revokedTokens = db().revokedTokens.filter((t) => t.exp > now);
  store.save();
  audit.record({ actor: req.user, action: 'auth.logout', ip: ipOf(req) });
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', auth, (req, res) => {
  const net = checkNetwork(ipOf(req));
  res.json({ user: publicUser(req.user), network: net, expiresAt: new Date(req.session.exp * 1000).toISOString() });
});

// ---------- Explainable assessment (any signed-in user) ----------
app.post('/api/xai/explain', auth, (req, res) => {
  const result = explainAll(req.body?.vitals || {});
  audit.record({ actor: req.user, action: 'xai.explain', patientId: req.user.role === 'patient' ? req.user.id : null, outcome: 'success', ip: ipOf(req), detail: { result: result.prediction.key } });
  res.json(result);
});

// ---------- Patient ----------
const patientOnly = [auth, role('patient')];

app.get('/api/patient/records', patientOnly, (req, res) => {
  const records = patientRecords(req.user.id);
  audit.record({ actor: req.user, action: 'record.read.self', patientId: req.user.id, ip: ipOf(req) });
  res.json({ records, latestVitals: latestVitals(records) });
});

app.get('/api/patient/explanation', patientOnly, (req, res) => {
  const vitals = latestVitals(patientRecords(req.user.id));
  if (!vitals) return res.json({ available: false });
  return res.json({ available: true, vitals, ...explainAll(vitals) });
});

app.get('/api/patient/access-log', patientOnly, (req, res) => {
  const entries = db().audit.filter((e) => e.patientId === req.user.id && e.actorId !== req.user.id)
    .slice(-200).reverse()
    .map((e) => ({ seq: e.seq, ts: e.ts, who: e.actorName || 'System', role: e.actorRole, action: e.action, outcome: e.outcome, detail: e.detail, hash: e.hash }));
  res.json({ entries, integrity: audit.verify() });
});

app.get('/api/doctors', auth, (req, res) => {
  res.json({ doctors: db().users.filter((u) => u.role === 'doctor').map((u) => ({ id: u.id, name: u.name, specialty: u.specialty })) });
});

app.get('/api/patient/care-team', patientOnly, (req, res) => {
  const now = Date.now();
  const consents = db().consents.filter((c) => c.patientId === req.user.id && (!c.expiresAt || Date.parse(c.expiresAt) > now))
    .map((c) => ({ ...c, doctorName: findUser(c.doctorId)?.name, specialty: findUser(c.doctorId)?.specialty }));
  const emergencies = db().breakGlass.filter((b) => b.patientId === req.user.id).slice(-20).reverse()
    .map((b) => ({ ...b, doctorName: findUser(b.doctorId)?.name, active: Date.parse(b.expiresAt) > now }));
  res.json({ consents, emergencies });
});

// Patients cannot change their care team (the hospital assigns it), but they can flag any access they do not recognise.
app.post('/api/patient/report-access', patientOnly, limit('report', 10, 60 * 60 * 1000), (req, res) => {
  const seq = Number(req.body?.seq);
  const entry = db().audit[seq];
  if (!Number.isInteger(seq) || !entry || entry.patientId !== req.user.id) return fail(res, 404, 'That access entry was not found.');
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : '';
  audit.record({ actor: req.user, action: 'access.reported', patientId: req.user.id, target: String(seq), ip: ipOf(req),
    detail: { reportedActor: entry.actorName, reportedAction: entry.action, reportedAt: entry.ts, note } });
  res.status(201).json({ ok: true });
});

// ---------- Care team assignment (security officer / hospital administration) ----------
function assign({ patientId, doctorId, days, by, ip }) {
  const patient = findUser(patientId);
  const doctor = findUser(doctorId);
  if (!patient || patient.role !== 'patient') throw Object.assign(new Error('Patient not found.'), { status: 404 });
  if (!doctor || doctor.role !== 'doctor') throw Object.assign(new Error('Doctor not found.'), { status: 404 });
  const d = Number(days);
  const expiresAt = Number.isFinite(d) && d > 0 ? new Date(Date.now() + Math.min(d, 365) * 86400000).toISOString() : null;
  db().consents = db().consents.filter((c) => !(c.patientId === patientId && c.doctorId === doctorId));
  db().consents.push({ patientId, doctorId, grantedAt: new Date().toISOString(), expiresAt, assignedBy: by.name });
  store.save();
  audit.record({ actor: by, action: 'careteam.assign', patientId, target: doctorId, ip, detail: { doctor: doctor.name, expiresAt } });
}

// ---------- Doctor ----------
app.get('/api/doctor/patients', clinical, role('doctor'), (req, res) => {
  const ids = new Set();
  const now = Date.now();
  db().consents.forEach((c) => { if (c.doctorId === req.user.id && (!c.expiresAt || Date.parse(c.expiresAt) > now)) ids.add(c.patientId); });
  db().breakGlass.forEach((b) => { if (b.doctorId === req.user.id && Date.parse(b.expiresAt) > now) ids.add(b.patientId); });
  const patients = [...ids].map(findUser).filter(Boolean).map((p) => {
    const records = db().records.filter((r) => r.patientId === p.id);
    const last = records.map((r) => r.createdAt).sort().pop() || null;
    return { id: p.id, name: p.name, access: accessFor(req.user.id, p.id), recordCount: records.length, lastVisit: last };
  });
  res.json({ patients, network: req.network });
});

app.get('/api/doctor/search', clinical, role('doctor'), (req, res) => {
  const q = String(req.query.email || '');
  const p = db().users.find((u) => u.role === 'patient' && u.emailIndex === blindIndex(q));
  audit.record({ actor: req.user, action: 'patient.search', outcome: p ? 'success' : 'not-found', ip: ipOf(req), patientId: p?.id ?? null });
  if (!p) return res.json({ found: false });
  return res.json({ found: true, patient: { id: p.id, name: p.name }, access: accessFor(req.user.id, p.id) });
});

app.get('/api/doctor/patients/:id', clinical, role('doctor'), (req, res) => {
  const p = findUser(req.params.id);
  if (!p || p.role !== 'patient') return fail(res, 404, 'Patient not found.');
  const access = accessFor(req.user.id, p.id);
  if (!access.allowed) {
    audit.record({ actor: req.user, action: 'record.read', patientId: p.id, outcome: 'denied', ip: ipOf(req), detail: { reason: 'no consent' } });
    return fail(res, 403, "You are not on this patient's care team.", { code: 'CONSENT_REQUIRED' });
  }
  const records = patientRecords(p.id);
  audit.record({ actor: req.user, action: 'record.read', patientId: p.id, ip: ipOf(req), detail: { basis: access.basis } });
  return res.json({ patient: publicUser(p), access, records, latestVitals: latestVitals(records) });
});

app.post('/api/doctor/patients/:id/records', clinical, role('doctor'), (req, res) => {
  const p = findUser(req.params.id);
  if (!p || p.role !== 'patient') return fail(res, 404, 'Patient not found.');
  const access = accessFor(req.user.id, p.id);
  if (!access.allowed) {
    audit.record({ actor: req.user, action: 'record.write', patientId: p.id, outcome: 'denied', ip: ipOf(req) });
    return fail(res, 403, "You are not on this patient's care team.", { code: 'CONSENT_REQUIRED' });
  }
  try {
    const b = req.body || {};
    const vitals = {};
    for (const f of FEATURES) {
      const v = Number(b.vitals?.[f.key]);
      if (b.vitals?.[f.key] !== '' && b.vitals?.[f.key] != null && Number.isFinite(v)) vitals[f.key] = v;
    }
    const body = {
      title: requireStr(b.title, 'Visit title', 120),
      type: ['visit', 'lab', 'prescription', 'note'].includes(b.type) ? b.type : 'visit',
      diagnosis: String(b.diagnosis || '').slice(0, 300),
      notes: String(b.notes || '').slice(0, 4000),
      medications: Array.isArray(b.medications) ? b.medications.map((m) => String(m).slice(0, 120)).slice(0, 20) : [],
      vitals,
      assessment: Object.keys(vitals).length ? explain(vitals).prediction : null,
    };
    const rec = { id: randomId('rec'), patientId: p.id, authorId: req.user.id, authorName: req.user.name, createdAt: new Date().toISOString(), sealed: seal(body, p.id) };
    db().records.push(rec);
    store.save();
    audit.record({ actor: req.user, action: 'record.write', patientId: p.id, target: rec.id, ip: ipOf(req), detail: { basis: access.basis } });
    return res.status(201).json({ record: recordView(rec) });
  } catch (err) {
    return fail(res, 400, err.message);
  }
});

app.post('/api/doctor/patients/:id/explain', clinical, role('doctor'), (req, res) => {
  const p = findUser(req.params.id);
  if (!p || !accessFor(req.user.id, p.id).allowed) return fail(res, 403, 'No access to this patient.');
  const result = explainAll(req.body?.vitals || {});
  audit.record({ actor: req.user, action: 'xai.explain', patientId: p.id, ip: ipOf(req), detail: { result: result.prediction.key } });
  return res.json(result);
});

app.post('/api/doctor/break-glass', clinical, role('doctor'), (req, res) => {
  const { patientId, reason } = req.body || {};
  const p = findUser(patientId);
  if (!p || p.role !== 'patient') return fail(res, 404, 'Patient not found.');
  if (typeof reason !== 'string' || reason.trim().length < 15) return fail(res, 400, 'Describe the emergency in at least 15 characters. This is reviewed.');
  const entry = { id: randomId('bg'), doctorId: req.user.id, patientId: p.id, reason: reason.trim().slice(0, 300), startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
  db().breakGlass.push(entry);
  store.save();
  audit.record({ actor: req.user, action: 'breakglass.start', patientId: p.id, outcome: 'success', ip: ipOf(req), detail: { reason: entry.reason } });
  return res.status(201).json({ ok: true, expiresAt: entry.expiresAt });
});

app.get('/api/doctor/alerts', clinical, (req, res) => {
  res.json({ alerts: db().alerts.filter((a) => a.actorId === req.user.id).slice(0, 50) });
});

// ---------- Security officer ----------
const adminOnly = [...clinical, role('admin')];

app.get('/api/admin/overview', adminOnly, (req, res) => {
  const d = db();
  res.json({
    counts: {
      patients: d.users.filter((u) => u.role === 'patient').length,
      doctors: d.users.filter((u) => u.role === 'doctor').length,
      records: d.records.length,
      ledger: d.audit.length,
      openAlerts: d.alerts.filter((a) => a.status === 'open').length,
      activeEmergencies: d.breakGlass.filter((b) => Date.parse(b.expiresAt) > Date.now()).length,
    },
    integrity: audit.verify(),
    alerts: d.alerts.slice(0, 50),
    networks: trustedNetworks(),
    you: req.network,
    encryption: { algorithm: 'AES-256-GCM envelope encryption', activeKeyVersion: activeKekVersion(), sealedRecords: d.records.length, sealedProfiles: d.users.length },
  });
});

app.get('/api/admin/audit', adminOnly, (req, res) => {
  const n = Math.min(Number(req.query.limit) || 100, 500);
  res.json({ entries: db().audit.slice(-n).reverse() });
});

app.post('/api/admin/audit/verify', adminOnly, (req, res) => {
  const result = audit.verify();
  audit.record({ actor: req.user, action: 'ledger.verify', ip: ipOf(req), detail: { valid: result.valid } });
  res.json(result);
});

app.post('/api/admin/audit/simulate-tamper', adminOnly, (req, res) => res.json(audit.simulateTamper()));

app.post('/api/admin/alerts/:id/resolve', adminOnly, (req, res) => {
  const a = db().alerts.find((x) => x.id === req.params.id);
  if (!a) return fail(res, 404, 'Alert not found.');
  a.status = 'resolved';
  a.resolvedBy = req.user.name;
  a.resolvedAt = new Date().toISOString();
  store.save();
  audit.record({ actor: req.user, action: 'alert.resolve', target: a.id, ip: ipOf(req) });
  return res.json({ ok: true });
});

app.post('/api/admin/keys/rotate', adminOnly, (req, res) => {
  const version = rotateKek();
  const d = db();
  d.records.forEach((r) => { r.sealed = rewrap(r.sealed, r.patientId); });
  d.users.forEach((u) => { u.pii = rewrap(u.pii, u.id); });
  d.meta.kekVersion = version;
  store.save();
  audit.record({ actor: req.user, action: 'keys.rotate', ip: ipOf(req), detail: { version, rewrapped: d.records.length + d.users.length } });
  res.json({ ok: true, version, rewrapped: d.records.length + d.users.length });
});

app.get('/api/admin/care-teams', adminOnly, (req, res) => {
  const now = Date.now();
  const d = db();
  res.json({
    patients: d.users.filter((u) => u.role === 'patient').map((p) => ({
      id: p.id,
      name: p.name,
      removable: !p.demo,
      team: d.consents.filter((c) => c.patientId === p.id && (!c.expiresAt || Date.parse(c.expiresAt) > now))
        .map((c) => ({ doctorId: c.doctorId, doctorName: findUser(c.doctorId)?.name, expiresAt: c.expiresAt, assignedBy: c.assignedBy || null })),
    })),
    doctors: d.users.filter((u) => u.role === 'doctor').map((u) => ({ id: u.id, name: u.name, specialty: u.specialty })),
  });
});

app.post('/api/admin/care-teams', adminOnly, (req, res) => {
  try {
    assign({ ...req.body, by: req.user, ip: ipOf(req) });
    return res.status(201).json({ ok: true });
  } catch (err) {
    return fail(res, err.status || 400, err.message);
  }
});

app.delete('/api/admin/care-teams', adminOnly, (req, res) => {
  const { patientId, doctorId } = req.body || {};
  const before = db().consents.length;
  db().consents = db().consents.filter((c) => !(c.patientId === patientId && c.doctorId === doctorId));
  const removed = before - db().consents.length;
  store.save();
  if (removed) audit.record({ actor: req.user, action: 'careteam.remove', patientId, target: doctorId, ip: ipOf(req), detail: { doctor: findUser(doctorId)?.name } });
  res.json({ ok: true, removed });
});

// Remove a patient account and everything attached to it. Ledger entries stay, because the ledger is append-only.
app.delete('/api/admin/patients/:id', adminOnly, (req, res) => {
  const d = db();
  const p = findUser(req.params.id);
  if (!p || p.role !== 'patient') return fail(res, 404, 'Patient not found.');
  if (p.demo) return fail(res, 400, 'Initial accounts cannot be removed.');
  const counts = { records: d.records.filter((r) => r.patientId === p.id).length };
  d.users = d.users.filter((u) => u.id !== p.id);
  d.records = d.records.filter((r) => r.patientId !== p.id);
  d.consents = d.consents.filter((c) => c.patientId !== p.id);
  d.breakGlass = d.breakGlass.filter((b) => b.patientId !== p.id);
  store.save();
  audit.record({ actor: req.user, action: 'patient.delete', target: p.id, ip: ipOf(req), detail: { name: p.name, ...counts } });
  return res.json({ ok: true, removed: p.name, ...counts });
});

app.delete('/api/admin/networks', adminOnly, (req, res) => {
  const ok = removeNetwork(String(req.body?.cidr || ''));
  if (ok) audit.record({ actor: req.user, action: 'network.remove', target: req.body.cidr, ip: ipOf(req) });
  res.json({ ok });
});

app.use('/api', (req, res) => fail(res, 404, 'Not found.'));

// ---------- Front end ----------
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return fail(res, 400, 'The request could not be read.');
  if (err.type === 'entity.too.large') return fail(res, 413, 'The request is too large.');
  console.error('[error]', err);
  return fail(res, 500, 'Something went wrong. Please try again.');
});

if (!process.env.VERCEL) app.listen(PORT, () => console.log(`HealthGuard API listening on ${PORT}`));

export default app;
