// Behavioural access monitoring. Runs on every audit entry and raises alerts for
// patterns that often signal misuse: bulk record reads, out-of-hours access,
// repeated denials, credential stuffing, emergency overrides and new network enrolments.
import { onAudit } from './audit.js';
import { data, save } from './store.js';
import { randomId } from './crypto.js';

const MIN = 60 * 1000;
const RULES = {
  bulkReads: { windowMs: 10 * MIN, threshold: 12 },
  denials: { windowMs: 10 * MIN, threshold: 3 },
  failedLogins: { windowMs: 15 * MIN, threshold: 4 },
};

function recent(filter, windowMs) {
  const since = Date.now() - windowMs;
  return data().audit.filter((e) => Date.parse(e.ts) >= since && filter(e));
}

function raise(entry, { rule, severity, title, detail }) {
  const alerts = data().alerts;
  // One open alert per rule and actor at a time, so a burst does not flood the console.
  const dupe = alerts.find((a) => a.rule === rule && a.actorId === entry.actorId && a.status === 'open'
    && Date.now() - Date.parse(a.ts) < 30 * MIN);
  if (dupe) { dupe.count += 1; dupe.lastSeq = entry.seq; save(); return; }
  alerts.unshift({
    id: randomId('alr'), ts: entry.ts, rule, severity, title, detail,
    actorId: entry.actorId, actorName: entry.actorName, actorRole: entry.actorRole,
    patientId: entry.patientId, ip: entry.ip, seq: entry.seq, lastSeq: entry.seq, count: 1, status: 'open',
  });
  save();
}

function hourInHospitalZone(ts) {
  const tz = process.env.HOSPITAL_TIMEZONE || 'Asia/Kolkata';
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz }).format(new Date(ts)));
}

export function startMonitoring() {
  onAudit((e) => {
    if (e.action === 'record.read' && e.actorRole === 'doctor') {
      const patients = new Set(recent((x) => x.actorId === e.actorId && x.action === 'record.read', RULES.bulkReads.windowMs).map((x) => x.patientId));
      if (patients.size >= RULES.bulkReads.threshold) {
        raise(e, { rule: 'bulk-read', severity: 'high', title: 'Unusually many patient records opened',
          detail: `${patients.size} different patients opened within 10 minutes.` });
      }
      const hour = hourInHospitalZone(e.ts);
      if (hour >= 23 || hour < 6) {
        raise(e, { rule: 'off-hours', severity: 'medium', title: 'Record opened outside normal hours',
          detail: `Access at ${String(hour).padStart(2, '0')}:00 hospital time.` });
      }
    }
    if (e.outcome === 'denied' && e.actorId) {
      const n = recent((x) => x.actorId === e.actorId && x.outcome === 'denied', RULES.denials.windowMs).length;
      if (n >= RULES.denials.threshold) {
        raise(e, { rule: 'repeated-denials', severity: 'high', title: 'Repeated attempts to open records without permission',
          detail: `${n} denied requests within 10 minutes.` });
      }
    }
    if (e.action === 'auth.login' && e.outcome === 'failed') {
      const n = recent((x) => x.action === 'auth.login' && x.outcome === 'failed' && x.ip === e.ip, RULES.failedLogins.windowMs).length;
      if (n >= RULES.failedLogins.threshold) {
        raise(e, { rule: 'credential-stuffing', severity: 'high', title: 'Many failed sign-ins from one address',
          detail: `${n} failed sign-ins from ${e.ip} within 15 minutes.` });
      }
    }
    if (e.action === 'auth.login' && e.outcome === 'denied' && e.detail?.reason === 'network') {
      raise(e, { rule: 'off-network-login', severity: 'medium', title: 'Clinician sign-in from outside the hospital network',
        detail: `Blocked sign-in from ${e.ip}.` });
    }
    if (e.action === 'breakglass.start') {
      raise(e, { rule: 'break-glass', severity: 'high', title: 'Emergency access used',
        detail: `Reason given: "${e.detail?.reason ?? 'not stated'}". Review within 24 hours.` });
    }
    if (e.action === 'network.enroll' && e.outcome === 'success') {
      raise(e, { rule: 'network-enrolled', severity: 'low', title: 'New hospital network registered',
        detail: `${e.target} was added to the trusted networks.` });
    }
  });
}
