import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, Stethoscope, User, Wifi, WifiOff } from 'lucide-react';
import { api } from '../api.js';
import { Field, Notice, PasswordInput, TopBar, homeFor, useSession, usePageTitle } from '../ui.jsx';
import NetworkEnroll from '../components/NetworkEnroll.jsx';

const DEMO = {
  patient: [
    { email: 'rohan@healthguard.demo', who: 'Rohan Deshpande', note: 'Blood pressure follow-up' },
    { email: 'ananya@healthguard.demo', who: 'Ananya Rao', note: 'Recent viral infection' },
  ],
  clinician: [
    { email: 'arjun.mehta@healthguard.demo', who: 'Dr. Arjun Mehta', note: 'Internal Medicine' },
    { email: 'kavya.iyer@healthguard.demo', who: 'Dr. Kavya Iyer', note: 'Endocrinology' },
    { email: 'security@healthguard.demo', who: 'Neha Kulkarni', note: 'Security officer' },
  ],
};
const DEMO_PASSWORD = 'HealthGuard2026';

export default function SignIn() {
  const [params, setParams] = useSearchParams();
  const portal = params.get('portal') === 'clinician' ? 'clinician' : 'patient';
  usePageTitle(portal === 'clinician' ? 'Clinician sign-in' : 'Patient sign-in');
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [network, setNetwork] = useState(null);

  useEffect(() => {
    if (session.user) navigate(homeFor(session.user.role), { replace: true });
  }, [session.user, navigate]);

  useEffect(() => {
    if (portal !== 'clinician') return;
    api('/network/status').then(setNetwork).catch(() => setNetwork(null));
  }, [portal]);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!email || !password) { setError({ message: 'Enter your email and password.' }); return; }
    setBusy(true);
    try {
      const data = await api('/auth/login', { method: 'POST', body: { email, password, portal } });
      session.signedIn(data);
      navigate(location.state?.from || homeFor(data.user.role), { replace: true });
    } catch (err) {
      setError({ message: err.message, code: err.code, ip: err.body?.ip });
      if (err.code === 'NETWORK_REQUIRED') setNetwork({ trusted: false, ip: err.body?.ip });
    } finally {
      setBusy(false);
    }
  }

  const fillDemo = (d) => { setEmail(d.email); setPassword(DEMO_PASSWORD); setError(null); };

  return (
    <>
      <TopBar />
      <main id="main" className="auth-wrap">
        <div className="auth-card stack" style={{ '--stack': '20px' }}>
          <div>
            <h1>{portal === 'clinician' ? 'Clinician sign-in' : 'Patient sign-in'}</h1>
            <p className="muted" style={{ margin: 0 }}>{portal === 'clinician' ? 'For doctors and hospital security staff.' : 'See your records and control who can view them.'}</p>
          </div>

          <fieldset>
            <legend className="sr-only">I am signing in as</legend>
            <div className="segmented">
              <label>
                <input type="radio" name="portal" checked={portal === 'patient'} onChange={() => setParams({ portal: 'patient' })} />
                <strong><User size={18} aria-hidden="true" />Patient</strong><span>From anywhere</span>
              </label>
              <label>
                <input type="radio" name="portal" checked={portal === 'clinician'} onChange={() => setParams({ portal: 'clinician' })} />
                <strong><Stethoscope size={18} aria-hidden="true" />Clinician</strong><span>Hospital network</span>
              </label>
            </div>
          </fieldset>

          {params.get('expired') && <Notice tone="info" title="You were signed out">For your safety, sessions end after a period of time. Please sign in again.</Notice>}

          {portal === 'clinician' && network && (
            network.trusted
              ? <Notice tone="ok" title="You are on a hospital network">{network.network}</Notice>
              : <Notice tone="warn" title="You are not on a hospital network">Clinician sign-in only works from the hospital Wi-Fi. Your connection: <span className="mono">{network.ip}</span></Notice>
          )}

          <form className="card stack" onSubmit={submit} noValidate>
            <Field label="Email address">
              {(p) => <input {...p} className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>
            <Field label="Password">
              {(p) => <PasswordInput {...p} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
            </Field>
            {error && <Notice tone="error" title={error.code === 'NETWORK_REQUIRED' ? 'Hospital network required' : 'Could not sign in'}>{error.message}</Notice>}
            <button className="btn btn-primary btn-block" disabled={busy}><LogIn size={18} aria-hidden="true" />{busy ? 'Signing in…' : 'Sign in'}</button>
            {portal === 'patient' && <p className="small" style={{ margin: 0 }}>New here? <Link to="/register">Create a patient account</Link></p>}
          </form>

          {portal === 'clinician' && network && !network.trusted && (
            <details className="card soft">
              <summary style={{ cursor: 'pointer', fontWeight: 700, minHeight: 32 }}><WifiOff size={16} aria-hidden="true" /> I am on hospital Wi-Fi but it is not recognised</summary>
              <div style={{ marginTop: 12 }}>
                <NetworkEnroll onEnrolled={() => api('/network/status').then(setNetwork)} />
              </div>
            </details>
          )}

          <section className="card soft" aria-labelledby="demo-title">
            <h2 id="demo-title" style={{ fontSize: 'var(--step-1)' }}>Demo accounts</h2>
            <p className="small muted">Choose one to fill in the form, then press Sign in. Password: <span className="mono">{DEMO_PASSWORD}</span></p>
            <div className="demo-list">
              {DEMO[portal].map((d) => (
                <button type="button" key={d.email} className="btn" onClick={() => fillDemo(d)}>
                  <span><strong>{d.who}</strong> <span className="muted small">· {d.note}</span></span>
                  {portal === 'clinician' && <Wifi size={16} aria-hidden="true" />}
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
