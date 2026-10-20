import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, LockKeyhole, LogIn, ScrollText, Stethoscope, User, WifiOff } from 'lucide-react';
import { api } from '../api.js';
import { Field, Notice, PasswordInput, TopBar, homeFor, useSession, usePageTitle } from '../ui.jsx';
import NetworkEnroll from '../components/NetworkEnroll.jsx';

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
      setError({ message: err.message, code: err.code });
      if (err.code === 'NETWORK_REQUIRED') setNetwork({ trusted: false, ip: err.body?.ip });
    } finally {
      setBusy(false);
    }
  }

  const clinician = portal === 'clinician';

  return (
    <div className="public">
      <TopBar />
      <main id="main" className="auth-split">
        <aside className="auth-side">
          <span className="eyebrow-line" style={{ color: 'var(--mint)', fontWeight: 700 }}>{clinician ? 'Clinical access' : 'Patient access'}</span>
          <h2>{clinician ? 'Charts open only on the hospital network.' : 'Your record. Locked, watched and explained.'}</h2>
          <ul>
            <li><LockKeyhole size={20} aria-hidden="true" />Every record is encrypted with its own key.</li>
            <li><Eye size={20} aria-hidden="true" />{clinician ? 'Every chart you open is written to the audit ledger.' : 'You can see every time someone opens your file.'}</li>
            <li><ScrollText size={20} aria-hidden="true" />The access history cannot be edited without detection.</li>
          </ul>
        </aside>

        <div className="auth-main">
          <div className="auth-card stack" style={{ '--stack': '22px' }}>
            <div>
              <h1 style={{ marginBottom: 6 }}>Welcome back</h1>
              <p className="muted" style={{ margin: 0 }}>{clinician ? 'Sign in with your hospital account.' : 'Sign in to see your records, care team and health checks.'}</p>
            </div>

            <fieldset>
              <legend className="sr-only">I am signing in as</legend>
              <div className="segmented">
                <label>
                  <input type="radio" name="portal" checked={!clinician} onChange={() => setParams({ portal: 'patient' })} />
                  <strong><User size={18} aria-hidden="true" />Patient</strong><span>From anywhere</span>
                </label>
                <label>
                  <input type="radio" name="portal" checked={clinician} onChange={() => setParams({ portal: 'clinician' })} />
                  <strong><Stethoscope size={18} aria-hidden="true" />Clinician</strong><span>Hospital network</span>
                </label>
              </div>
            </fieldset>

            {params.get('expired') && <Notice tone="info" title="You were signed out">For your safety, sessions end after a period of time. Please sign in again.</Notice>}

            {clinician && network && (
              network.trusted
                ? <Notice tone="ok" title={`Connected to ${network.network}`}>This network is approved for clinical access.</Notice>
                : <Notice tone="warn" title="This network is not approved">Clinician sign-in only works on hospital Wi-Fi. If you use a VPN, turn it off. Your connection: <span className="mono">{network.ip}</span></Notice>
            )}

            <form className="stack" onSubmit={submit} noValidate>
              <Field label="Email address">
                {(p) => <input {...p} className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />}
              </Field>
              <Field label="Password">
                {(p) => <PasswordInput {...p} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
              </Field>
              {error && <Notice tone="error" title={error.code === 'NETWORK_REQUIRED' ? 'Hospital network required' : 'Could not sign in'}>{error.message}</Notice>}
              <button className="btn btn-primary btn-block" disabled={busy}><LogIn size={18} aria-hidden="true" />{busy ? 'Signing in…' : 'Sign in'}</button>
            </form>

            {!clinician && <p className="small" style={{ margin: 0 }}>New to HealthGuard? <Link to="/register">Create a patient account</Link></p>}

            {clinician && network && !network.trusted && (
              <details className="card soft">
                <summary style={{ cursor: 'pointer', fontWeight: 700, minHeight: 32 }}><WifiOff size={16} aria-hidden="true" /> I am on hospital Wi-Fi but it is not recognised</summary>
                <div style={{ marginTop: 12 }}>
                  <NetworkEnroll onEnrolled={() => api('/network/status').then(setNetwork)} />
                </div>
              </details>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
