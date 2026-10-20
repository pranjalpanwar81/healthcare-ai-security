import { Fragment, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { Activity, ArrowRight, FileText, HeartPulse, History, Home, Pill, Share2, ShieldCheck, Siren, UserMinus, UserPlus } from 'lucide-react';
import { api } from '../../api.js';
import { Badge, Empty, Field, Loading, Modal, Notice, Tabs, TopBar, fmtDate, fmtDateTime, initials, useAsync, usePageTitle, useSession, useToast } from '../../ui.jsx';
import Explanation from '../../components/Explanation.jsx';
import AccessLedger, { IntegritySeal } from '../../components/AccessLedger.jsx';

const TABS = [
  { to: '/patient', label: 'Overview', icon: Home, end: true },
  { to: '/patient/records', label: 'My records', icon: FileText },
  { to: '/patient/health', label: 'Health check', icon: HeartPulse },
  { to: '/patient/sharing', label: 'Who can see my records', icon: Share2 },
  { to: '/patient/activity', label: 'Access history', icon: History },
];

export default function PatientApp() {
  return (
    <>
      <TopBar />
      <Tabs items={TABS} label="Patient sections" />
      <main id="main" className="container">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="records" element={<Records />} />
          <Route path="health" element={<HealthCheck />} />
          <Route path="sharing" element={<Sharing />} />
          <Route path="activity" element={<ActivityLog />} />
        </Routes>
      </main>
    </>
  );
}

const ErrorNotice = ({ error, retry }) => (
  <Notice tone="error" title="Could not load this page">{error.message} {retry && <button className="btn btn-sm" onClick={retry} style={{ marginLeft: 8 }}>Try again</button>}</Notice>
);

function Overview() {
  usePageTitle('Overview');
  const { user } = useSession();
  const data = useAsync(() => Promise.all([api('/patient/records'), api('/patient/consents'), api('/patient/access-log'), api('/patient/explanation')]), []);
  if (data.loading) return <Loading />;
  if (data.error) return <ErrorNotice error={data.error} retry={data.reload} />;
  const [rec, cons, log, xai] = data.data;
  const latest = rec.records[0];
  const meds = [...new Set(rec.records.slice(0, 1).flatMap((r) => r.medications || []))];
  const recentEmergency = cons.emergencies.find((e) => e.active) || cons.emergencies[0];
  const tone = xai.available ? (xai.prediction.tone === 'ok' ? 'ok' : xai.prediction.tone === 'alert' ? 'alert' : 'warn') : 'neutral';

  return (
    <div className="stack" style={{ '--stack': '24px' }}>
      <div className="page-head">
        <h1>Hello, {user.name.split(' ')[0]}</h1>
        <p>Here is a summary of your health record and who has access to it.</p>
      </div>

      {recentEmergency && (
        <Notice tone={recentEmergency.active ? 'alert' : 'warn'} title={recentEmergency.active ? 'Emergency access is active on your record' : 'Emergency access was used on your record'}>
          {recentEmergency.doctorName} opened your record on {fmtDateTime(recentEmergency.startedAt)}. Reason given: “{recentEmergency.reason}”. <Link to="/patient/activity">See details</Link>
        </Notice>
      )}

      <div className="grid-2">
        <section className="card stack" aria-labelledby="ov-latest">
          <div className="card-head"><div><h2 id="ov-latest">Latest visit</h2><p>{latest ? fmtDate(latest.createdAt) : 'No visits yet'}</p></div></div>
          {latest ? (
            <>
              <h3 style={{ margin: 0 }}>{latest.title}</h3>
              {latest.diagnosis && <p style={{ margin: 0 }}><strong>{latest.diagnosis}</strong></p>}
              <p className="muted" style={{ margin: 0 }}>{latest.notes}</p>
              <p className="small muted" style={{ margin: 0 }}>Written by {latest.authorName}</p>
              <Link to="/patient/records" className="btn btn-sm" style={{ alignSelf: 'flex-start' }}>All records <ArrowRight size={16} aria-hidden="true" /></Link>
            </>
          ) : <Empty icon={FileText} title="No records yet">When a doctor adds a visit, it will appear here.</Empty>}
        </section>

        <section className="card stack" aria-labelledby="ov-health">
          <div className="card-head"><div><h2 id="ov-health">Health check</h2><p>Based on your most recent readings</p></div></div>
          {xai.available ? (
            <>
              <div><Badge tone={tone}>{xai.prediction.label}</Badge></div>
              <p style={{ margin: 0 }}>{xai.summary}</p>
              <Link to="/patient/health" className="btn btn-sm" style={{ alignSelf: 'flex-start' }}>See why <ArrowRight size={16} aria-hidden="true" /></Link>
            </>
          ) : <Empty icon={HeartPulse} title="No readings yet" />}
        </section>

        <section className="card stack" aria-labelledby="ov-meds">
          <div className="card-head"><div><h2 id="ov-meds">Current medicines</h2><p>From your latest prescription</p></div></div>
          {meds.length ? (
            <ul className="list">{meds.map((m) => <li key={m} className="row"><Pill size={18} aria-hidden="true" />{m}</li>)}</ul>
          ) : <p className="muted" style={{ margin: 0 }}>No medicines listed.</p>}
        </section>

        <section className="card stack" aria-labelledby="ov-share">
          <div className="card-head"><div><h2 id="ov-share">Your privacy</h2><p>{cons.consents.length} doctor{cons.consents.length === 1 ? '' : 's'} can see your records</p></div></div>
          <ul className="list">{cons.consents.map((c) => <li key={c.doctorId} className="row"><span className="avatar" aria-hidden="true">{initials(c.doctorName)}</span><span><strong>{c.doctorName}</strong><br /><span className="small muted">{c.specialty}</span></span></li>)}</ul>
          <IntegritySeal integrity={log.integrity} />
          <Link to="/patient/sharing" className="btn btn-sm" style={{ alignSelf: 'flex-start' }}>Manage access <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>
      </div>
    </div>
  );
}

function Records() {
  usePageTitle('My records');
  const data = useAsync(() => api('/patient/records'), []);
  return (
    <div className="stack" style={{ '--stack': '20px' }}>
      <div className="page-head"><h1>My records</h1><p>Every visit, test and prescription in your file. Stored encrypted; decrypted only for you.</p></div>
      {data.loading && <Loading />}
      {data.error && <ErrorNotice error={data.error} retry={data.reload} />}
      {data.data && (data.data.records.length === 0 ? <Empty icon={FileText} title="No records yet" /> : data.data.records.map((r) => <RecordCard key={r.id} r={r} />))}
    </div>
  );
}

export function RecordCard({ r }) {
  const v = r.vitals || {};
  const shown = [['Blood pressure', v.systolic && v.diastolic ? `${v.systolic}/${v.diastolic} mmHg` : null], ['Heart rate', v.heartRate && `${v.heartRate} bpm`], ['Temperature', v.temperature && `${v.temperature} °C`], ['Fasting glucose', v.glucose && `${v.glucose} mg/dL`], ['HbA1c', v.hba1c && `${v.hba1c}%`], ['BMI', v.bmi && `${v.bmi}`]].filter(([, x]) => x);
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
    <div className="stack" style={{ '--stack': '20px' }}>
      <div className="page-head"><h1>Health check</h1><p>What your latest readings suggest, and exactly why. Use this to start a conversation with your doctor.</p></div>
      {data.loading && <Loading label="Running your health check" />}
      {data.error && <ErrorNotice error={data.error} retry={data.reload} />}
      {data.data && !data.data.available && <Empty icon={Activity} title="No readings yet">Your doctor adds readings during a visit.</Empty>}
      {data.data?.available && <div style={{ maxWidth: 820 }}><Explanation result={data.data} audience="patient" /></div>}
      <p className="small"><Link to="/how-it-works">How does the health check work?</Link></p>
    </div>
  );
}

function Sharing() {
  usePageTitle('Who can see my records');
  const [toast, toastNode] = useToast();
  const data = useAsync(() => Promise.all([api('/patient/consents'), api('/doctors')]), []);
  const [confirm, setConfirm] = useState(null);
  const [grant, setGrant] = useState({ doctorId: '', days: '' });
  const [err, setErr] = useState(null);

  if (data.loading) return <Loading />;
  if (data.error) return <ErrorNotice error={data.error} retry={data.reload} />;
  const [cons, docs] = data.data;
  const sharedIds = new Set(cons.consents.map((c) => c.doctorId));
  const available = docs.doctors.filter((d) => !sharedIds.has(d.id));

  async function revoke(c) {
    setConfirm(null);
    try { await api(`/patient/consents/${c.doctorId}`, { method: 'DELETE' }); toast(`${c.doctorName} can no longer see your records.`); data.reload(); } catch (e) { setErr(e.message); }
  }
  async function give(e) {
    e.preventDefault();
    setErr(null);
    if (!grant.doctorId) { setErr('Choose a doctor first.'); return; }
    try {
      await api('/patient/consents', { method: 'POST', body: grant });
      toast('Access given.');
      setGrant({ doctorId: '', days: '' });
      data.reload();
    } catch (e2) { setErr(e2.message); }
  }

  return (
    <div className="stack" style={{ '--stack': '24px' }}>
      {toastNode}
      <div className="page-head"><h1>Who can see my records</h1><p>Doctors can only open your record if you allow it. Changes take effect immediately.</p></div>
      {err && <Notice tone="error">{err}</Notice>}
      <div className="split">
        <section className="card" aria-labelledby="sh-now">
          <div className="card-head"><div><h2 id="sh-now">Doctors with access</h2><p>{cons.consents.length} right now</p></div></div>
          {cons.consents.length === 0 ? <Empty icon={ShieldCheck} title="Nobody has access">Your records are private.</Empty> : (
            <ul className="list">
              {cons.consents.map((c) => (
                <li key={c.doctorId} className="spread">
                  <span className="row"><span className="avatar" aria-hidden="true">{initials(c.doctorName)}</span>
                    <span><strong>{c.doctorName}</strong><br /><span className="small muted">{c.specialty} · {c.expiresAt ? `until ${fmtDate(c.expiresAt)}` : 'no end date'}</span></span></span>
                  <button className="btn btn-sm" onClick={() => setConfirm(c)}><UserMinus size={16} aria-hidden="true" />Remove access</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="sh-add">
          <div className="card-head"><div><h2 id="sh-add">Give a doctor access</h2><p>You can remove it at any time</p></div></div>
          <form className="stack" onSubmit={give}>
            <Field label="Doctor">{(p) => (
              <select {...p} className="input" value={grant.doctorId} onChange={(e) => setGrant({ ...grant, doctorId: e.target.value })}>
                <option value="">Choose a doctor</option>
                {available.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.specialty}</option>)}
              </select>)}</Field>
            <Field label="For how long">{(p) => (
              <select {...p} className="input" value={grant.days} onChange={(e) => setGrant({ ...grant, days: e.target.value })}>
                <option value="">Until I remove it</option><option value="1">1 day</option><option value="7">1 week</option><option value="30">30 days</option><option value="90">90 days</option>
              </select>)}</Field>
            <button className="btn btn-primary" disabled={!available.length}><UserPlus size={18} aria-hidden="true" />Give access</button>
            {!available.length && <p className="small muted" style={{ margin: 0 }}>Every doctor already has access.</p>}
          </form>
        </section>
      </div>

      <section className="card" aria-labelledby="sh-em">
        <div className="card-head"><div><h2 id="sh-em">Emergency access</h2><p>In an emergency a doctor can open your record without your permission for one hour. They must give a reason, you are told, and the security team reviews it.</p></div></div>
        {cons.emergencies.length === 0 ? <p className="muted" style={{ margin: 0 }}>Emergency access has never been used on your record.</p> : (
          <ul className="list">{cons.emergencies.map((e) => (
            <li key={e.id} className="row"><Siren size={18} aria-hidden="true" style={{ color: 'var(--alert)' }} />
              <span><strong>{e.doctorName}</strong> · {fmtDateTime(e.startedAt)} {e.active && <Badge tone="alert">Active now</Badge>}<br /><span className="small muted">Reason: “{e.reason}”</span></span></li>))}
          </ul>
        )}
      </section>

      <Modal open={Boolean(confirm)} onClose={() => setConfirm(null)} title="Remove access?">
        <p>{confirm?.doctorName} will no longer be able to open your records. Notes they already wrote stay in your file.</p>
        <div className="row"><button className="btn btn-danger" onClick={() => revoke(confirm)}>Remove access</button><button className="btn" onClick={() => setConfirm(null)}>Keep access</button></div>
      </Modal>
    </div>
  );
}

function ActivityLog() {
  usePageTitle('Access history');
  const data = useAsync(() => api('/patient/access-log'), []);
  return (
    <div className="stack" style={{ '--stack': '20px' }}>
      <div className="page-head"><h1>Access history</h1><p>Every time someone opened, changed or tried to open your record. This history is linked so it cannot be edited secretly.</p></div>
      {data.loading && <Loading />}
      {data.error && <ErrorNotice error={data.error} retry={data.reload} />}
      {data.data && (
        <>
          <IntegritySeal integrity={data.data.integrity} />
          <section className="card">
            {data.data.entries.length === 0 ? <Empty icon={History} title="Nobody has opened your record yet" /> : <AccessLedger entries={data.data.entries} />}
          </section>
        </>
      )}
    </div>
  );
}
