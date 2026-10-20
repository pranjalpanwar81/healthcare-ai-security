import { useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Bell, FilePlus2, HeartPulse, Lock, Search, Siren, Sparkles, Users, Wifi, WifiOff } from 'lucide-react';
import { api } from '../../api.js';
import { Badge, Empty, Field, Loading, Modal, Notice, Tabs, TopBar, fmtDate, fmtDateTime, initials, useAsync, usePageTitle, useSession, useToast } from '../../ui.jsx';
import Explanation from '../../components/Explanation.jsx';
import VitalsForm, { toNumbers } from '../../components/VitalsForm.jsx';
import { RecordCard } from '../patient/PatientApp.jsx';

const TABS = [
  { to: '/clinic', label: 'My patients', icon: Users, end: true },
  { to: '/clinic/find', label: 'Find a patient', icon: Search },
  { to: '/clinic/assess', label: 'Risk check', icon: Sparkles },
  { to: '/clinic/alerts', label: 'My alerts', icon: Bell },
];

export function NetworkLock({ error }) {
  const { signOut } = useSession();
  return (
    <div className="card stack" style={{ maxWidth: 640, margin: '24px auto' }} role="alert">
      <WifiOff size={40} aria-hidden="true" style={{ color: 'var(--alert)' }} />
      <h1>Hospital network required</h1>
      <p>Your session is paused because this device is no longer on an approved hospital network. Patient data stays hidden until you reconnect.</p>
      {error?.body?.ip && <p className="small muted">Current connection: <span className="mono">{error.body.ip}</span></p>}
      <div className="row"><button className="btn btn-primary" onClick={() => window.location.reload()}>I have reconnected</button><button className="btn" onClick={signOut}>Sign out</button></div>
    </div>
  );
}

export const isNetworkError = (e) => e?.code === 'NETWORK_REQUIRED';

function Failure({ error, retry }) {
  if (isNetworkError(error)) return <NetworkLock error={error} />;
  return <Notice tone="error" title="Could not load this page">{error.message} {retry && <button className="btn btn-sm" onClick={retry}>Try again</button>}</Notice>;
}

export default function ClinicApp() {
  return (
    <>
      <TopBar />
      <Tabs items={TABS} label="Clinic sections" />
      <main id="main" className="container">
        <Routes>
          <Route index element={<PatientList />} />
          <Route path="find" element={<FindPatient />} />
          <Route path="assess" element={<Assess />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="patients/:id" element={<Chart />} />
        </Routes>
      </main>
    </>
  );
}

function PatientList() {
  usePageTitle('My patients');
  const { user } = useSession();
  const data = useAsync(() => api('/doctor/patients'), []);
  if (data.loading) return <Loading />;
  if (data.error) return <Failure error={data.error} retry={data.reload} />;
  const { patients, network } = data.data;
  return (
    <div className="stack" style={{ '--stack': '20px' }}>
      <div className="page-head spread">
        <div><h1>Good to see you, {user.name}</h1><p>Patients who have shared their records with you.</p></div>
        <Badge tone="ok" icon={Wifi}>{network?.network || 'Hospital network'}</Badge>
      </div>
      {patients.length === 0 ? <Empty icon={Users} title="No patients have shared their records yet"><Link to="/clinic/find">Find a patient</Link></Empty> : (
        <ul className="list grid" style={{ gap: 10 }}>
          {patients.map((p) => (
            <li key={p.id} style={{ border: 0, padding: 0 }}>
              <Link to={`/clinic/patients/${p.id}`} className="patient-row">
                <span className="avatar" aria-hidden="true">{initials(p.name)}</span>
                <span style={{ flex: 1, minWidth: 0 }}><strong>{p.name}</strong><br /><span className="small muted">{p.recordCount} record{p.recordCount === 1 ? '' : 's'} · last visit {fmtDate(p.lastVisit)}</span></span>
                {p.access.basis === 'emergency'
                  ? <Badge tone="alert" icon={Siren}>Emergency access</Badge>
                  : <Badge tone="ok">{p.access.until ? `Shared until ${fmtDate(p.access.until)}` : 'Shared'}</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FindPatient() {
  usePageTitle('Find a patient');
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [res, setRes] = useState(null);
  const [error, setError] = useState(null);
  const [bg, setBg] = useState(false);
  const [reason, setReason] = useState('');
  const [bgError, setBgError] = useState(null);

  async function search(e) {
    e.preventDefault();
    setError(null); setRes(null);
    try { setRes(await api(`/doctor/search?email=${encodeURIComponent(email)}`)); } catch (err) { setError(err); }
  }
  async function breakGlass() {
    setBgError(null);
    try {
      await api('/doctor/break-glass', { method: 'POST', body: { patientId: res.patient.id, reason } });
      navigate(`/clinic/patients/${res.patient.id}`);
    } catch (err) { setBgError(err.message); }
  }

  if (isNetworkError(error)) return <NetworkLock error={error} />;
  return (
    <div className="stack" style={{ '--stack': '20px', maxWidth: 720 }}>
      <div className="page-head"><h1>Find a patient</h1><p>Search by the exact email address the patient registered with. Emails are stored encrypted and matched with a secure fingerprint.</p></div>
      <form className="card row" onSubmit={search} style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 260px' }}>
          <Field label="Patient email">{(p) => <input {...p} className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}</Field>
        </div>
        <button className="btn btn-primary"><Search size={18} aria-hidden="true" />Search</button>
      </form>
      <div aria-live="polite">
        {error && <Notice tone="error">{error.message}</Notice>}
        {res && !res.found && <Notice tone="info" title="No patient found">Check the spelling, or ask the patient for the email on their account.</Notice>}
        {res?.found && (
          <div className="card stack">
            <div className="spread">
              <span className="row"><span className="avatar" aria-hidden="true">{initials(res.patient.name)}</span><strong>{res.patient.name}</strong></span>
              {res.access.allowed ? <Badge tone="ok">You have access</Badge> : <Badge tone="neutral" icon={Lock}>Not shared with you</Badge>}
            </div>
            {res.access.allowed
              ? <Link className="btn btn-primary" to={`/clinic/patients/${res.patient.id}`} style={{ alignSelf: 'flex-start' }}>Open record</Link>
              : (
                <>
                  <p style={{ margin: 0 }}>Ask the patient to share their record with you from their HealthGuard account. In a genuine emergency you can use emergency access.</p>
                  <button className="btn btn-danger" style={{ alignSelf: 'flex-start' }} onClick={() => setBg(true)}><Siren size={18} aria-hidden="true" />Emergency access</button>
                </>
              )}
          </div>
        )}
      </div>
      <Modal open={bg} onClose={() => setBg(false)} title="Use emergency access?">
        <Notice tone="warn" title="This is recorded and reviewed">You will get one hour of access. The patient is told, and the security officer reviews every use. Misuse is a disciplinary matter.</Notice>
        <Field label="Reason for emergency access" hint="At least 15 characters, for example: unconscious patient in A&E, need allergy history">
          {(p) => <textarea {...p} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        {bgError && <Notice tone="error">{bgError}</Notice>}
        <div className="row"><button className="btn btn-danger" onClick={breakGlass} disabled={reason.trim().length < 15}>Open record now</button><button className="btn" onClick={() => setBg(false)}>Cancel</button></div>
      </Modal>
    </div>
  );
}

const EMPTY_RECORD = { title: '', type: 'visit', diagnosis: '', notes: '', medications: '', vitals: {} };

function Chart() {
  const { id } = useParams();
  const data = useAsync(() => api(`/doctor/patients/${id}`), [id]);
  const [toast, toastNode] = useToast();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_RECORD);
  const [formError, setFormError] = useState(null);
  const [xai, setXai] = useState(null);
  const [xaiBusy, setXaiBusy] = useState(false);
  usePageTitle(data.data?.patient?.name || 'Patient record');

  if (data.loading) return <Loading />;
  if (data.error) {
    if (data.error.code === 'CONSENT_REQUIRED') return <Notice tone="warn" title="No access">This patient has not shared their record with you. <Link to="/clinic/find">Request emergency access</Link></Notice>;
    return <Failure error={data.error} retry={data.reload} />;
  }
  const { patient, access, records, latestVitals } = data.data;
  const pr = patient.profile || {};

  async function explainLatest() {
    setXaiBusy(true);
    try { setXai(await api(`/doctor/patients/${id}/explain`, { method: 'POST', body: { vitals: latestVitals } })); } catch (e) { toast(e.message); } finally { setXaiBusy(false); }
  }
  async function save(e) {
    e.preventDefault();
    setFormError(null);
    try {
      await api(`/doctor/patients/${id}/records`, { method: 'POST', body: { ...form, medications: form.medications.split('\n').map((m) => m.trim()).filter(Boolean), vitals: toNumbers(form.vitals) } });
      setAdding(false); setForm(EMPTY_RECORD); toast('Record saved and encrypted.'); data.reload(); setXai(null);
    } catch (err) { setFormError(err.message); }
  }

  return (
    <div className="stack" style={{ '--stack': '20px' }}>
      {toastNode}
      <Link to="/clinic" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}><ArrowLeft size={16} aria-hidden="true" />All patients</Link>
      <div className="page-head spread">
        <div className="row"><span className="avatar" aria-hidden="true" style={{ width: 56, height: 56, fontSize: 'var(--step-1)' }}>{initials(patient.name)}</span><div><h1 style={{ margin: 0 }}>{patient.name}</h1><p>{pr.gender || 'Gender not given'} · born {fmtDate(pr.dob)} · blood group {pr.bloodGroup || 'unknown'}</p></div></div>
        {access.basis === 'emergency' ? <Badge tone="alert" icon={Siren}>Emergency access until {fmtDateTime(access.until)}</Badge> : <Badge tone="ok">Shared by patient</Badge>}
      </div>
      {pr.allergies && pr.allergies !== 'None known' && <Notice tone="alert" title={`Allergy: ${pr.allergies}`} />}

      <div className="split">
        <section className="stack" aria-labelledby="ch-recs">
          <div className="spread"><h2 id="ch-recs" style={{ margin: 0 }}>Records</h2><button className="btn btn-primary" onClick={() => setAdding(true)}><FilePlus2 size={18} aria-hidden="true" />Add a record</button></div>
          {records.length === 0 ? <Empty icon={FilePlus2} title="No records yet" /> : records.map((r) => <RecordCard key={r.id} r={r} />)}
        </section>
        <section className="stack" aria-labelledby="ch-xai">
          <h2 id="ch-xai" style={{ margin: 0 }}>Explained risk check</h2>
          {!latestVitals ? <p className="muted">No readings recorded yet.</p> : xai ? <Explanation result={xai} audience="clinician" /> : (
            <div className="card soft stack">
              <p style={{ margin: 0 }}>Run the model on this patient's most recent readings and see which measurements drive the result.</p>
              <button className="btn btn-primary" onClick={explainLatest} disabled={xaiBusy} style={{ alignSelf: 'flex-start' }}><HeartPulse size={18} aria-hidden="true" />{xaiBusy ? 'Checking…' : 'Run risk check'}</button>
            </div>
          )}
        </section>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title={`New record for ${patient.name}`}>
        <form className="stack" onSubmit={save}>
          <div className="form-grid">
            <Field label="Title">{(p) => <input {...p} className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />}</Field>
            <Field label="Type">{(p) => (
              <select {...p} className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="visit">Visit</option><option value="lab">Lab result</option><option value="prescription">Prescription</option><option value="note">Note</option>
              </select>)}</Field>
          </div>
          <Field label="Diagnosis">{(p) => <input {...p} className="input" value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} />}</Field>
          <Field label="Notes">{(p) => <textarea {...p} className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}</Field>
          <Field label="Medicines" hint="One per line">{(p) => <textarea {...p} className="input" style={{ minHeight: 70 }} value={form.medications} onChange={(e) => setForm({ ...form, medications: e.target.value })} />}</Field>
          <details><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Readings (optional, used by the risk check)</summary><div style={{ marginTop: 12 }}><VitalsForm value={form.vitals} onChange={(v) => setForm({ ...form, vitals: v })} idPrefix="rec" /></div></details>
          {formError && <Notice tone="error">{formError}</Notice>}
          <div className="row"><button className="btn btn-primary">Save record</button><button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button></div>
        </form>
      </Modal>
    </div>
  );
}

function Assess() {
  usePageTitle('Risk check');
  const [vitals, setVitals] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  async function run(e) {
    e.preventDefault();
    setError(null);
    try { setResult(await api('/xai/explain', { method: 'POST', body: { vitals: toNumbers(vitals) } })); } catch (err) { setError(err); }
  }
  if (isNetworkError(error)) return <NetworkLock error={error} />;
  return (
    <div className="stack" style={{ '--stack': '20px' }}>
      <div className="page-head"><h1>Risk check</h1><p>Enter readings to get an explained assessment. This is not saved to any patient record.</p></div>
      <div className="split">
        <form className="card stack" onSubmit={run}>
          <VitalsForm value={vitals} onChange={setVitals} idPrefix="as" />
          <button className="btn btn-primary"><Sparkles size={18} aria-hidden="true" />Explain</button>
        </form>
        <div aria-live="polite">{error && <Notice tone="error">{error.message}</Notice>}{result ? <Explanation result={result} audience="clinician" /> : <div className="card soft"><p style={{ margin: 0 }}>The explanation will appear here.</p></div>}</div>
      </div>
    </div>
  );
}

function Alerts() {
  usePageTitle('My alerts');
  const data = useAsync(() => api('/doctor/alerts'), []);
  if (data.loading) return <Loading />;
  if (data.error) return <Failure error={data.error} retry={data.reload} />;
  return (
    <div className="stack" style={{ '--stack': '20px', maxWidth: 820 }}>
      <div className="page-head"><h1>My alerts</h1><p>Unusual activity on your account, flagged automatically and reviewed by the security officer.</p></div>
      {data.data.alerts.length === 0 ? <Empty icon={Bell} title="No alerts on your account" /> : (
        <ul className="list card">{data.data.alerts.map((a) => (
          <li key={a.id} className="row" style={{ alignItems: 'flex-start' }}><AlertTriangle size={20} aria-hidden="true" style={{ color: 'var(--warn)', marginTop: 2 }} />
            <span style={{ flex: 1 }}><strong>{a.title}</strong><br /><span className="small muted">{a.detail} · {fmtDateTime(a.ts)}</span></span>
            <Badge tone={a.status === 'open' ? 'warn' : 'ok'}>{a.status === 'open' ? 'Under review' : 'Resolved'}</Badge></li>))}
        </ul>
      )}
    </div>
  );
}
