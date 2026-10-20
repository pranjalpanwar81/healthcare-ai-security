import { useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { CheckCircle2, FlaskConical, Gauge, KeyRound, ListChecks, RefreshCw, ScrollText, ShieldAlert, ShieldCheck, Trash2, UserMinus, UserPlus, Users, Wifi } from 'lucide-react';
import { api } from '../../api.js';
import { AppShell, Badge, Empty, Field, Loading, Notice, fmtDate, fmtDateTime, initials, useAsync, usePageTitle, useToast } from '../../ui.jsx';
import { IntegritySeal } from '../../components/AccessLedger.jsx';
import { NetworkLock, isNetworkError } from '../clinic/ClinicApp.jsx';

const NAV = [
  { to: '/security', label: 'Overview', short: 'Overview', icon: Gauge, end: true },
  { to: '/security/alerts', label: 'Alerts', short: 'Alerts', icon: ShieldAlert },
  { to: '/security/care-teams', label: 'Care teams', short: 'Care teams', icon: Users },
  { to: '/security/networks', label: 'Hospital networks', short: 'Networks', icon: Wifi },
  { to: '/security/ledger', label: 'Audit ledger', short: 'Ledger', icon: ListChecks },
];
const SEV = { high: 'alert', medium: 'warn', low: 'info' };

export default function SecurityConsole() {
  return (
    <AppShell nav={NAV} label="Security sections" network="Hospital network">
      <Routes>
        <Route index element={<Overview />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="care-teams" element={<CareTeams />} />
        <Route path="networks" element={<Networks />} />
        <Route path="ledger" element={<Ledger />} />
      </Routes>
    </AppShell>
  );
}

function Failure({ error }) {
  return isNetworkError(error) ? <NetworkLock error={error} /> : <Notice tone="error" title="Could not load this page">{error.message}</Notice>;
}

function useBusy() {
  const [busy, setBusy] = useState(null);
  const [toast, toastNode] = useToast();
  const act = async (name, fn) => {
    setBusy(name);
    try { await fn(); } catch (e) { toast(e.message); } finally { setBusy(null); }
  };
  return { busy, act, toast, toastNode };
}

function Overview() {
  usePageTitle('Security overview');
  const ov = useAsync(() => api('/admin/overview'), []);
  const { busy, act, toast, toastNode } = useBusy();
  const [tamper, setTamper] = useState(null);
  if (ov.loading) return <Loading />;
  if (ov.error) return <Failure error={ov.error} />;
  const o = ov.data;
  const verify = () => act('verify', async () => { const r = await api('/admin/audit/verify', { method: 'POST' }); toast(r.valid ? `Verified ${r.checked} entries. Ledger intact.` : `Ledger broken at entry ${r.brokenAt}`); ov.reload(); });
  const simulate = () => act('tamper', async () => setTamper(await api('/admin/audit/simulate-tamper', { method: 'POST' })));
  const rotate = () => act('rotate', async () => { const r = await api('/admin/keys/rotate', { method: 'POST' }); toast(`Master key rotated to version ${r.version}. ${r.rewrapped} data keys re-wrapped.`); ov.reload(); });

  return (
    <div className="stack" style={{ '--stack': '22px' }}>
      {toastNode}
      <div className="page-head"><h1>Security overview</h1><p>Integrity, encryption and unusual activity across the hospital record system.</p></div>
      <dl className="stats three">
        {[['Patients', o.counts.patients, Users], ['Encrypted records', o.counts.records, KeyRound], ['Ledger entries', o.counts.ledger, ScrollText], ['Open alerts', o.counts.openAlerts, ShieldAlert], ['Active emergency access', o.counts.activeEmergencies, ShieldAlert], ['Clinicians', o.counts.doctors, Users]].map(([k, v, Icon]) => (
          <div key={k} className="stat"><span className="stat-icon" aria-hidden="true"><Icon size={20} /></span><div><dt>{k}</dt><dd>{v}</dd></div></div>
        ))}
      </dl>
      <div className="grid-2">
        <section className="card stack" aria-labelledby="sc-int">
          <div className="card-head"><div><h2 id="sc-int">Audit ledger integrity</h2><p>Each entry is signed with HMAC-SHA256 and linked to the one before it.</p></div></div>
          <IntegritySeal integrity={o.integrity} />
          {o.integrity.head && <p className="small muted" style={{ margin: 0 }}>Chain head: <span className="mono">{o.integrity.head.slice(0, 32)}…</span></p>}
          <div className="row">
            <button className="btn" onClick={verify} disabled={busy === 'verify'}><RefreshCw size={16} aria-hidden="true" />Verify now</button>
            <button className="btn" onClick={simulate} disabled={busy === 'tamper'}><FlaskConical size={16} aria-hidden="true" />Simulate tampering</button>
          </div>
          {tamper?.result && (
            <Notice tone="alert" title={`Tampering detected at entry ${tamper.result.brokenAt}`}>
              On a copy of the ledger, entry {tamper.tamperedIndex} was changed from “{tamper.originalAction}”. Verification failed: {tamper.result.reason}. The real ledger was not modified.
            </Notice>
          )}
          {tamper?.error && <Notice tone="info">{tamper.error}</Notice>}
        </section>
        <section className="card stack" aria-labelledby="sc-enc">
          <div className="card-head"><div><h2 id="sc-enc">Encryption</h2><p>{o.encryption.algorithm}</p></div></div>
          <dl className="kv">
            <dt>Active master key</dt><dd>Version {o.encryption.activeKeyVersion}</dd>
            <dt>Sealed records</dt><dd>{o.encryption.sealedRecords}</dd>
            <dt>Sealed profiles</dt><dd>{o.encryption.sealedProfiles}</dd>
            <dt>Email lookup</dt><dd>HMAC blind index</dd>
          </dl>
          <p className="small muted" style={{ margin: 0 }}>Rotation re-wraps every per-record data key under a new master key. Record contents are never decrypted during rotation.</p>
          <button className="btn" onClick={rotate} disabled={busy === 'rotate'} style={{ alignSelf: 'flex-start' }}><KeyRound size={16} aria-hidden="true" />Rotate master key</button>
        </section>
      </div>
      <AlertList alerts={o.alerts.filter((a) => a.status === 'open').slice(0, 5)} onChange={ov.reload} title="Latest open alerts" />
    </div>
  );
}

function AlertList({ alerts, onChange, title }) {
  const { busy, act, toastNode } = useBusy();
  const resolve = (id) => act(id, async () => { await api(`/admin/alerts/${id}/resolve`, { method: 'POST' }); onChange(); });
  return (
    <section className="card" aria-labelledby="al-title">
      {toastNode}
      <div className="card-head"><div><h2 id="al-title">{title}</h2><p>Raised automatically from access patterns and patient reports</p></div></div>
      {alerts.length === 0 ? <Empty icon={ShieldCheck} title="No alerts here" /> : (
        <ul className="list">{alerts.map((a) => (
          <li key={a.id} className="spread" style={{ alignItems: 'flex-start' }}>
            <span style={{ flex: '1 1 320px' }}>
              <span className="row" style={{ gap: 8 }}><Badge tone={SEV[a.severity]}>{a.severity === 'high' ? 'High' : a.severity === 'medium' ? 'Medium' : 'Low'}</Badge><strong>{a.title}</strong></span>
              <span className="small muted">{a.detail} · {a.actorName || 'Unknown'} · {fmtDateTime(a.ts)}{a.count > 1 ? ` · seen ${a.count} times` : ''}</span>
            </span>
            {a.status === 'open'
              ? <button className="btn btn-sm" onClick={() => resolve(a.id)} disabled={busy === a.id}><CheckCircle2 size={16} aria-hidden="true" />Mark reviewed</button>
              : <Badge tone="ok">Reviewed by {a.resolvedBy}</Badge>}
          </li>))}
        </ul>
      )}
    </section>
  );
}

function Alerts() {
  usePageTitle('Alerts');
  const ov = useAsync(() => api('/admin/overview'), []);
  if (ov.loading) return <Loading />;
  if (ov.error) return <Failure error={ov.error} />;
  return (
    <div className="stack" style={{ '--stack': '22px' }}>
      <div className="page-head"><h1>Alerts</h1><p>Review every alert. Emergency access and patient reports should be checked within 24 hours.</p></div>
      <AlertList alerts={ov.data.alerts} onChange={ov.reload} title="All alerts" />
    </div>
  );
}

function CareTeams() {
  usePageTitle('Care teams');
  const ct = useAsync(() => api('/admin/care-teams'), []);
  const { busy, act, toast, toastNode } = useBusy();
  const [form, setForm] = useState({ patientId: '', doctorId: '', days: '' });
  if (ct.loading) return <Loading />;
  if (ct.error) return <Failure error={ct.error} />;
  const { patients, doctors } = ct.data;
  const assign = (e) => {
    e.preventDefault();
    if (!form.patientId || !form.doctorId) { toast('Choose a patient and a clinician.'); return; }
    act('assign', async () => { await api('/admin/care-teams', { method: 'POST', body: form }); toast('Clinician assigned.'); setForm({ patientId: '', doctorId: '', days: '' }); ct.reload(); });
  };
  const remove = (patientId, doctorId) => act(`${patientId}:${doctorId}`, async () => { await api('/admin/care-teams', { method: 'DELETE', body: { patientId, doctorId } }); toast('Clinician removed from the care team.'); ct.reload(); });

  return (
    <div className="stack" style={{ '--stack': '22px' }}>
      {toastNode}
      <div className="page-head"><h1>Care teams</h1><p>Clinicians can only open the records of patients assigned to them. Every change is written to the ledger and shown to the patient.</p></div>
      <form className="card stack" onSubmit={assign} aria-labelledby="ct-add">
        <h2 id="ct-add" style={{ fontSize: 'var(--step-1)', margin: 0 }}>Assign a clinician</h2>
        <div className="form-grid">
          <Field label="Patient">{(p) => (
            <select {...p} className="input" value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
              <option value="">Choose a patient</option>{patients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>)}</Field>
          <Field label="Clinician">{(p) => (
            <select {...p} className="input" value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}>
              <option value="">Choose a clinician</option>{doctors.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.specialty}</option>)}
            </select>)}</Field>
          <Field label="For how long">{(p) => (
            <select {...p} className="input" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })}>
              <option value="">Ongoing</option><option value="7">1 week</option><option value="30">30 days</option><option value="90">90 days</option>
            </select>)}</Field>
        </div>
        <button className="btn btn-primary" disabled={busy === 'assign'} style={{ alignSelf: 'flex-start' }}><UserPlus size={18} aria-hidden="true" />Assign</button>
      </form>
      <section className="card" aria-labelledby="ct-list">
        <div className="card-head"><div><h2 id="ct-list">Current care teams</h2><p>{patients.length} patients</p></div></div>
        <ul className="list">
          {patients.map((p) => (
            <li key={p.id} className="spread" style={{ alignItems: 'flex-start' }}>
              <span className="row"><span className="avatar" aria-hidden="true">{initials(p.name)}</span><strong>{p.name}</strong></span>
              <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {p.team.length === 0 && <span className="muted small">No clinicians assigned</span>}
                {p.team.map((t) => (
                  <span key={t.doctorId} className="badge tone-neutral" style={{ gap: 8 }}>
                    {t.doctorName}{t.expiresAt ? ` · until ${fmtDate(t.expiresAt)}` : ''}
                    <button type="button" className="btn btn-ghost btn-sm icon-btn" style={{ minHeight: 28, minWidth: 28 }} aria-label={`Remove ${t.doctorName} from ${p.name}'s care team`}
                      onClick={() => remove(p.id, t.doctorId)} disabled={busy === `${p.id}:${t.doctorId}`}><UserMinus size={14} aria-hidden="true" /></button>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Networks() {
  usePageTitle('Hospital networks');
  const ov = useAsync(() => api('/admin/overview'), []);
  const { busy, act } = useBusy();
  if (ov.loading) return <Loading />;
  if (ov.error) return <Failure error={ov.error} />;
  const o = ov.data;
  const removeNet = (cidr) => act(cidr, async () => { await api('/admin/networks', { method: 'DELETE', body: { cidr } }); ov.reload(); });
  return (
    <div className="stack" style={{ '--stack': '22px' }}>
      <div className="page-head"><h1>Hospital networks</h1><p>Clinicians can only sign in and work from these addresses. You are on <span className="mono">{o.you?.ip}</span>.</p></div>
      <section className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">Address range</th><th scope="col">Name</th><th scope="col">Source</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{o.networks.map((n) => (
              <tr key={n.cidr + n.source}><td className="mono">{n.cidr}</td><td>{n.label}</td><td>{({ env: 'Server configuration', enrolled: 'Enrolled by IT', dev: 'Development' })[n.source]}</td>
                <td>{n.source === 'enrolled' && <button className="btn btn-sm" onClick={() => removeNet(n.cidr)} disabled={busy === n.cidr} aria-label={`Remove ${n.cidr}`}><Trash2 size={16} aria-hidden="true" />Remove</button>}</td></tr>))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Ledger() {
  usePageTitle('Audit ledger');
  const log = useAsync(() => api('/admin/audit?limit=200'), []);
  if (log.loading) return <Loading />;
  if (log.error) return <Failure error={log.error} />;
  return (
    <div className="stack" style={{ '--stack': '22px' }}>
      <div className="page-head"><h1>Audit ledger</h1><p>The 200 most recent entries, newest first. Each hash depends on every entry before it.</p></div>
      <section className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">#</th><th scope="col">Time</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Result</th><th scope="col">Address</th><th scope="col">Hash</th></tr></thead>
            <tbody>{log.data.entries.map((e) => (
              <tr key={e.seq}><td>{e.seq}</td><td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.ts)}</td><td>{e.actorName || '—'}<br /><span className="muted">{e.actorRole}</span></td><td className="mono">{e.action}</td>
                <td><Badge tone={e.outcome === 'success' ? 'ok' : e.outcome === 'denied' || e.outcome === 'failed' ? 'alert' : 'neutral'}>{e.outcome}</Badge></td><td className="mono">{e.ip || '—'}</td><td className="mono">{e.hash.slice(0, 12)}…</td></tr>))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
