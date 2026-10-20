import { Fragment, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { Activity, ArrowRight, CalendarDays, Eye, FileText, Flag, HeartPulse, History, Home, Pill, ShieldCheck, Siren, Stethoscope, Users } from 'lucide-react';
import { api } from '../../api.js';
import { AppShell, Badge, Empty, Field, Loading, Modal, Notice, fmtDate, fmtDateTime, initials, useAsync, usePageTitle, useSession, useToast } from '../../ui.jsx';
import Explanation from '../../components/Explanation.jsx';
import AccessLedger, { IntegritySeal } from '../../components/AccessLedger.jsx';

const NAV = [
  { to: '/patient', label: 'Overview', short: 'Home', icon: Home, end: true },
  { to: '/patient/records', label: 'My records', short: 'Records', icon: FileText },
  { to: '/patient/health', label: 'Health check', short: 'Health', icon: HeartPulse },
  { to: '/patient/care-team', label: 'My care team', short: 'Care team', icon: Users },
  { to: '/patient/activity', label: 'Access history', short: 'History', icon: History },
];

export default function PatientApp() {
  return (
    <AppShell nav={NAV} label="Patient sections">
      <Routes>
        <Route index element={<Overview />} />
        <Route path="records" element={<Records />} />
        <Route path="health" element={<HealthCheck />} />
        <Route path="care-team" element={<CareTeam />} />
        <Route path="activity" element={<ActivityLog />} />
      </Routes>
    </AppShell>
  );
}

const ErrorNotice = ({ error, retry }) => (
  <Notice tone="error" title="Could not load this page">{error.message} {retry && <button className="btn btn-sm" onClick={retry} style={{ marginLeft: 8 }}>Try again</button>}</Notice>
);

const toneOf = (prediction) => (prediction.tone === 'ok' ? 'ok' : prediction.tone === 'alert' ? 'alert' : 'warn');
const advice = { ok: 'Nothing flagged', warn: 'Worth discussing with your doctor', alert: 'Please contact your doctor soon' };

function Overview() {
  usePageTitle('Overview');
  const { user } = useSession();
  const data = useAsync(() => Promise.all([api('/patient/records'), api('/patient/care-team'), api('/patient/access-log'), api('/patient/explanation')]), []);
  if (data.loading) return <Loading />;
  if (data.error) return <ErrorNotice error={data.error} retry={data.reload} />;
  const [rec, team, log, xai] = data.data;
  const latest = rec.records[0];
  const meds = [...new Set((latest?.medications) || [])];
  const recentEmergency = team.emergencies.find((e) => e.active) || team.emergencies[0];
  const monthAgo = Date.now() - 30 * 86400000;
  const opens = log.entries.filter((e) => (e.action === 'record.read' || e.action === 'record.write') && Date.parse(e.ts) > monthAgo).length;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="stack" style={{ '--stack': '22px' }}>
      <section className="status-banner" aria-labelledby="greet">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 id="greet">{greet}, {user.name.split(' ')[0]}</h1>
          <p>Your record is encrypted, and only your care team can open it. Every access is listed in your history.</p>
        </div>
        {xai.available ? (
          <div className="status-card">
            <p className="label-kicker">Latest health check</p>
            <strong className="result">{xai.prediction.label}</strong>
            <div><Badge tone={toneOf(xai.prediction)}>{advice[toneOf(xai.prediction)]}</Badge></div>
            <Link to="/patient/health" className="btn btn-sm btn-primary" style={{ justifySelf: 'start' }}>See why <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        ) : (
          <div className="status-card"><p className="label-kicker">Latest health check</p><span>No readings yet. Your doctor adds them during a visit.</span></div>
        )}
      </section>

      {recentEmergency && (
        <Notice tone={recentEmergency.active ? 'alert' : 'warn'} title={recentEmergency.active ? 'Emergency access is active on your record' : 'Emergency access was used on your record'}>
          {recentEmergency.doctorName} opened your record on {fmtDateTime(recentEmergency.startedAt)}. Reason given: “{recentEmergency.reason}”. <Link to="/patient/activity">Review it</Link>
        </Notice>
      )}

      <dl className="stats">
        <div className="stat"><span className="stat-icon" aria-hidden="true"><CalendarDays size={20} /></span><div><dt>Last visit</dt><dd>{latest ? fmtDate(latest.createdAt) : 'None yet'}</dd></div></div>
        <div className="stat"><span className="stat-icon" aria-hidden="true"><Users size={20} /></span><div><dt>Care team</dt><dd>{team.consents.length} doctor{team.consents.length === 1 ? '' : 's'}</dd></div></div>
        <div className="stat"><span className="stat-icon" aria-hidden="true"><Eye size={20} /></span><div><dt>Opened this month</dt><dd>{opens} time{opens === 1 ? '' : 's'}</dd></div></div>
        <div className="stat"><span className="stat-icon" aria-hidden="true"><ShieldCheck size={20} /></span><div><dt>History check</dt><dd>{log.integrity.valid ? 'Intact' : 'Altered'}</dd></div></div>
      </dl>

      <div className="grid-2">
        <section className="card stack" aria-labelledby="ov-latest">
          <div className="card-head"><div><h2 id="ov-latest">Latest visit</h2><p>{latest ? `${fmtDate(latest.createdAt)} · ${latest.authorName}` : 'No visits yet'}</p></div></div>
          {latest ? (
            <>
              <h3 style={{ margin: 0 }}>{latest.title}</h3>
              {latest.diagnosis && <p style={{ margin: 0 }}><strong>{latest.diagnosis}</strong></p>}
              <p className="muted" style={{ margin: 0 }}>{latest.notes}</p>
              <Link to="/patient/records" className="btn btn-sm" style={{ alignSelf: 'flex-start' }}>All records <ArrowRight size={16} aria-hidden="true" /></Link>
            </>
          ) : <Empty icon={FileText} title="No records yet">When a doctor adds a visit, it will appear here.</Empty>}
        </section>

        <section className="card stack" aria-labelledby="ov-meds">
          <div className="card-head"><div><h2 id="ov-meds">Current medicines</h2><p>From your latest visit</p></div></div>
          {meds.length ? (
            <ul className="list">{meds.map((m) => <li key={m} className="row"><span className="stat-icon" aria-hidden="true" style={{ width: 36, height: 36 }}><Pill size={18} /></span>{m}</li>)}</ul>
          ) : <p className="muted" style={{ margin: 0 }}>No medicines listed.</p>}
        </section>
      </div>
    </div>
  );
}

function Records() {
  usePageTitle('My records');
  const data = useAsync(() => api('/patient/records'), []);
  return (
    <div className="stack" style={{ '--stack': '18px' }}>
      <div className="page-head"><h1>My records</h1><p>Every visit, test and prescription in your file. Stored encrypted and decrypted only for you and your care team.</p></div>
      {data.loading && <Loading />}
      {data.error && <ErrorNotice error={data.error} retry={data.reload} />}
      {data.data && (data.data.records.length === 0 ? <Empty icon={FileText} title="No records yet" /> : data.data.records.map((r) => <RecordCard key={r.id} r={r} />))}
    </div>
  );
}

export function RecordCard({ r }) {
  const v = r.vitals || {};
  const shown = [['Blood pressure', v.systolic && v.diastolic ? `${v.systolic}/${v.diastolic} mmHg` : v.systolic ? `${v.systolic} mmHg systolic` : null], ['Heart rate', v.heartRate && `${v.heartRate} bpm`], ['Temperature', v.temperature && `${v.temperature} °C`], ['Fasting glucose', v.glucose && `${v.glucose} mg/dL`], ['HbA1c', v.hba1c && `${v.hba1c}%`], ['BMI', v.bmi && `${v.bmi}`]].filter(([, x]) => x);
  return (
    <article className="card stack" aria-labelledby={`r-${r.id}`}>
      <div className="spread">
        <div>
          <h2 id={`r-${r.id}`} style={{ fontSize: 'var(--step-1)', margin: 0 }}>{r.title}</h2>
          <span className="small muted">{fmtDate(r.createdAt)} · {r.authorName}</span>
        </div>
        <Badge tone="neutral" icon={FileText}>{({ visit: 'Visit', lab: 'Lab result', prescription: 'Prescription', note: 'Note' })[r.type] || 'Visit'}</Badge>
      </div>
      {r.diagnosis && <p style={{ margin: 0 }}><strong>Diagnosis:</strong> {r.diagnosis}</p>}
      {r.notes && <p style={{ margin: 0 }}>{r.notes}</p>}
      {r.medications?.length > 0 && <p style={{ margin: 0 }}><strong>Medicines:</strong> {r.medications.join('; ')}</p>}
      {shown.length > 0 && <dl className="kv small">{shown.map(([k, val]) => <Fragment key={k}><dt>{k}</dt><dd>{val}</dd></Fragment>)}</dl>}
    </article>
  );
}

function HealthCheck() {
  usePageTitle('Health check');
  const data = useAsync(() => api('/patient/explanation'), []);
  return (
    <div className="stack" style={{ '--stack': '18px' }}>
      <div className="page-head"><h1>Health check</h1><p>What your latest readings suggest, and exactly why. Use it to start a conversation with your doctor.</p></div>
      {data.loading && <Loading label="Running your health check" />}
      {data.error && <ErrorNotice error={data.error} retry={data.reload} />}
      {data.data && !data.data.available && <Empty icon={Activity} title="No readings yet">Your doctor adds readings during a visit.</Empty>}
      {data.data?.available && <div style={{ maxWidth: 820 }}><Explanation result={data.data} audience="patient" /></div>}
      <p className="small"><Link to="/how-it-works">How does the health check work?</Link></p>
    </div>
  );
}

function CareTeam() {
  usePageTitle('My care team');
  const data = useAsync(() => api('/patient/care-team'), []);
  if (data.loading) return <Loading />;
  if (data.error) return <ErrorNotice error={data.error} retry={data.reload} />;
  const { consents, emergencies } = data.data;
  return (
    <div className="stack" style={{ '--stack': '22px' }}>
      <div className="page-head"><h1>My care team</h1><p>The clinicians the hospital has assigned to your care. Only they can open your record.</p></div>
      <section className="card stack" aria-labelledby="ct-team">
        <div className="card-head"><div><h2 id="ct-team">Assigned clinicians</h2><p>Assigned by hospital administration. Changes are recorded in your access history.</p></div></div>
        {consents.length === 0 ? <Empty icon={Stethoscope} title="No clinicians assigned yet">The hospital assigns your care team when you are admitted or booked.</Empty> : (
          <div className="grid-2" style={{ gap: 12 }}>
            {consents.map((c) => (
              <div key={c.doctorId} className="team-card">
                <span className="avatar" aria-hidden="true">{initials(c.doctorName)}</span>
                <span><strong>{c.doctorName}</strong><br /><span className="small muted">{c.specialty}</span><br /><span className="small muted">{c.expiresAt ? `Until ${fmtDate(c.expiresAt)}` : 'Ongoing'} · assigned by {c.assignedBy || 'the hospital'}</span></span>
              </div>
            ))}
          </div>
        )}
      </section>

      <Notice tone="info" title="Something looks wrong?">
        If you do not recognise a clinician or an access, open your <Link to="/patient/activity">access history</Link> and press “I don’t recognise this”. The hospital’s security officer is alerted straight away.
      </Notice>

      <section className="card" aria-labelledby="ct-em">
        <div className="card-head"><div><h2 id="ct-em">Emergency access</h2><p>In an emergency, a clinician outside your care team can open your record for one hour. They must give a reason, you are told here, and the security officer reviews every use.</p></div></div>
        {emergencies.length === 0 ? <p className="muted" style={{ margin: 0 }}>Emergency access has never been used on your record.</p> : (
          <ul className="list">{emergencies.map((e) => (
            <li key={e.id} className="row" style={{ alignItems: 'flex-start' }}><Siren size={18} aria-hidden="true" style={{ color: 'var(--alert)', marginTop: 3 }} />
              <span><strong>{e.doctorName}</strong> · {fmtDateTime(e.startedAt)} {e.active && <Badge tone="alert">Active now</Badge>}<br /><span className="small muted">Reason: “{e.reason}”</span></span></li>))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ActivityLog() {
  usePageTitle('Access history');
  const data = useAsync(() => api('/patient/access-log'), []);
  const [toast, toastNode] = useToast();
  const [reporting, setReporting] = useState(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);

  async function report() {
    setErr(null);
    try {
      await api('/patient/report-access', { method: 'POST', body: { seq: reporting.seq, note } });
      setReporting(null); setNote('');
      toast('Reported. The security officer has been alerted.');
      data.reload();
    } catch (e) { setErr(e.message); }
  }

  return (
    <div className="stack" style={{ '--stack': '18px' }}>
      {toastNode}
      <div className="page-head"><h1>Access history</h1><p>Every time someone opened, changed or tried to open your record. The history is cryptographically linked, so it cannot be edited secretly.</p></div>
      {data.loading && <Loading />}
      {data.error && <ErrorNotice error={data.error} retry={data.reload} />}
      {data.data && (
        <>
          <IntegritySeal integrity={data.data.integrity} />
          <section className="card">
            {data.data.entries.length === 0 ? <Empty icon={History} title="Nobody has opened your record yet" /> : <AccessLedger entries={data.data.entries} onReport={setReporting} />}
          </section>
        </>
      )}
      <Modal open={Boolean(reporting)} onClose={() => setReporting(null)} title="Report this access">
        <p style={{ margin: 0 }}>{reporting?.who}, {fmtDateTime(reporting?.ts)}. The security officer will review it and may contact you.</p>
        <Field label="What looks wrong? (optional)">{(p) => <textarea {...p} className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />}</Field>
        {err && <Notice tone="error">{err}</Notice>}
        <div className="row"><button className="btn btn-danger" onClick={report}><Flag size={16} aria-hidden="true" />Send report</button><button className="btn" onClick={() => setReporting(null)}>Cancel</button></div>
      </Modal>
    </div>
  );
}
