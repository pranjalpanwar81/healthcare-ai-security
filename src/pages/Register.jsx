import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, UserPlus, X } from 'lucide-react';
import { api } from '../api.js';
import { Field, Notice, PasswordInput, TopBar, homeFor, useSession, usePageTitle } from '../ui.jsx';

const RULES = [
  { test: (p) => p.length >= 10, text: 'At least 10 characters' },
  { test: (p) => /[A-Z]/.test(p) && /[a-z]/.test(p), text: 'Upper and lower case letters' },
  { test: (p) => /\d/.test(p), text: 'At least one number' },
];

export default function Register() {
  usePageTitle('Create an account');
  const session = useSession();
  const navigate = useNavigate();
  const [f, setF] = useState({ role: 'patient', name: '', email: '', password: '', dob: '', gender: '', bloodGroup: '', allergies: '', phone: '', specialty: '', registrationCode: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const passOk = RULES.every((r) => r.test(f.password));

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!f.name || !f.email || !passOk) { setError('Please complete your name, email and a password that meets all three rules.'); return; }
    setBusy(true);
    try {
      const data = await api('/auth/register', { method: 'POST', body: f });
      session.signedIn(data);
      navigate(homeFor(data.user.role), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar />
      <main id="main" className="auth-wrap">
        <div className="auth-card stack" style={{ '--stack': '20px', maxWidth: 560 }}>
          <div>
            <h1>Create an account</h1>
            <p className="muted" style={{ margin: 0 }}>Your details are encrypted before they are stored.</p>
          </div>
          <form className="card stack" onSubmit={submit} noValidate>
            <fieldset>
              <legend>Account type</legend>
              <div className="segmented">
                <label><input type="radio" name="role" checked={f.role === 'patient'} onChange={() => setF({ ...f, role: 'patient' })} /><strong>Patient</strong><span>Anyone</span></label>
                <label><input type="radio" name="role" checked={f.role === 'doctor'} onChange={() => setF({ ...f, role: 'doctor' })} /><strong>Clinician</strong><span>Needs hospital code</span></label>
              </div>
            </fieldset>
            <Field label="Full name">{(p) => <input {...p} className="input" autoComplete="name" value={f.name} onChange={set('name')} />}</Field>
            <Field label="Email address">{(p) => <input {...p} className="input" type="email" autoComplete="email" value={f.email} onChange={set('email')} />}</Field>
            <Field label="Password">
              {(p) => (
                <>
                  <PasswordInput {...p} autoComplete="new-password" value={f.password} onChange={set('password')} />
                  <ul className="list small" aria-label="Password rules" style={{ marginTop: 4 }}>
                    {RULES.map((r) => {
                      const ok = r.test(f.password);
                      return (
                        <li key={r.text} style={{ padding: '2px 0', border: 0, color: ok ? 'var(--ok)' : 'var(--ink-2)', display: 'flex', gap: 6, alignItems: 'center' }}>
                          {ok ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}{r.text}<span className="sr-only">{ok ? ' (done)' : ' (not yet)'}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </Field>

            {f.role === 'patient' ? (
              <div className="form-grid">
                <Field label="Date of birth">{(p) => <input {...p} className="input" type="date" value={f.dob} onChange={set('dob')} />}</Field>
                <Field label="Gender">{(p) => (
                  <select {...p} className="input" value={f.gender} onChange={set('gender')}>
                    <option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Other</option>
                  </select>)}</Field>
                <Field label="Blood group">{(p) => (
                  <select {...p} className="input" value={f.bloodGroup} onChange={set('bloodGroup')}>
                    <option value="">Not known</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => <option key={g}>{g}</option>)}
                  </select>)}</Field>
                <Field label="Phone (optional)">{(p) => <input {...p} className="input" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} />}</Field>
                <Field label="Allergies (optional)">{(p) => <input {...p} className="input" value={f.allergies} onChange={set('allergies')} />}</Field>
              </div>
            ) : (
              <div className="form-grid">
                <Field label="Speciality">{(p) => <input {...p} className="input" value={f.specialty} onChange={set('specialty')} />}</Field>
                <Field label="Hospital registration code" hint="Issued by hospital administration">{(p) => <input {...p} className="input" value={f.registrationCode} onChange={set('registrationCode')} autoComplete="off" />}</Field>
              </div>
            )}

            {error && <Notice tone="error" title="Could not create the account">{error}</Notice>}
            <button className="btn btn-primary btn-block" disabled={busy}><UserPlus size={18} aria-hidden="true" />{busy ? 'Creating…' : 'Create account'}</button>
            <p className="small" style={{ margin: 0 }}>Already have an account? <Link to="/signin">Sign in</Link></p>
          </form>
        </div>
      </main>
    </>
  );
}
