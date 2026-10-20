import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Info, LogOut, Moon, ShieldAlert, Sun, Type, XCircle } from 'lucide-react';

export const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);

const TONE_ICON = { ok: CheckCircle2, warn: AlertTriangle, alert: ShieldAlert, info: Info, neutral: Info, error: XCircle };

export function Badge({ tone = 'neutral', children, icon: IconOverride }) {
  const Icon = IconOverride || TONE_ICON[tone];
  return <span className={`badge tone-${tone}`}><Icon size={14} aria-hidden="true" />{children}</span>;
}

export function Notice({ tone = 'info', title, children, role }) {
  const Icon = TONE_ICON[tone];
  const t = tone === 'error' ? 'alert' : tone;
  return (
    <div className={`notice tone-${t}`} role={role || (tone === 'error' || tone === 'alert' ? 'alert' : 'status')}>
      <Icon size={20} aria-hidden="true" />
      <div className="notice-body">
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children, id: forcedId }) {
  const auto = useId();
  const id = forcedId || auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && <span className="hint" id={hintId}>{hint}</span>}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? 'true' : undefined })}
      {error && <span className="field-error" id={errId}><XCircle size={16} aria-hidden="true" />{error}</span>}
    </div>
  );
}

export function PasswordInput(props) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-wrap">
      <input {...props} className="input" type={show ? 'text' : 'password'} />
      <button type="button" className="btn btn-ghost btn-sm icon-btn" onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
        {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  );
}

export function Loading({ label = 'Loading' }) {
  return <div className="loading" role="status"><span className="spinner" aria-hidden="true" />{label}…</div>;
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && <Icon size={40} aria-hidden="true" />}
      <p><strong>{title}</strong></p>
      {children && <div className="small">{children}</div>}
    </div>
  );
}

export function Logo() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <path d="M16 6l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V9z" fill="var(--bg)" />
      <path d="M14.5 11h3v3.5H21v3h-3.5V21h-3v-3.5H11v-3h3.5z" fill="var(--brand)" />
    </svg>
  );
}

function usePreference(key, initial) {
  const [value, setValue] = useState(() => {
    try { return localStorage.getItem(key) || initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } }, [key, value]);
  return [value, setValue];
}

export function DisplayControls() {
  const [text, setText] = usePreference('hg-text', 'normal');
  const [theme, setTheme] = usePreference('hg-theme', 'auto');
  useEffect(() => {
    document.documentElement.dataset.text = text;
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [text, theme]);
  const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  return (
    <>
      <button type="button" className="btn btn-ghost icon-btn" aria-pressed={text === 'large'}
        aria-label={text === 'large' ? 'Use normal text size' : 'Use larger text'} title="Text size"
        onClick={() => setText(text === 'large' ? 'normal' : 'large')}>
        <Type size={20} aria-hidden="true" />
      </button>
      <button type="button" className="btn btn-ghost icon-btn" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title="Colour mode"
        onClick={() => setTheme(dark ? 'light' : 'dark')}>
        {dark ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
      </button>
    </>
  );
}

export function TopBar({ children }) {
  const session = useSession();
  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <Link to={session?.user ? homeFor(session.user.role) : '/'} className="brand"><Logo />HealthGuard</Link>
        <div className="topbar-tools">
          {children}
          <DisplayControls />
          {session?.user && (
            <>
              <div className="user-chip"><strong>{session.user.name}</strong><span>{roleLabel(session.user.role)}</span></div>
              <button type="button" className="btn btn-sm" onClick={session.signOut}><LogOut size={16} aria-hidden="true" />Sign out</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function Tabs({ items, label }) {
  return (
    <nav className="tabs" aria-label={label}>
      <div className="container tabs-inner">
        {items.map(({ to, label: text, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="tab"><Icon size={18} aria-hidden="true" />{text}</NavLink>
        ))}
      </div>
    </nav>
  );
}

export function Modal({ open, onClose, title, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} aria-labelledby="modal-title">
      <div className="modal-body stack">
        <h2 id="modal-title">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

export function useToast() {
  const [msg, setMsg] = useState(null);
  const show = useCallback((m) => { setMsg(m); setTimeout(() => setMsg(null), 3500); }, []);
  const node = <div aria-live="polite" className="sr-only-container">{msg && <div className="toast" role="status">{msg}</div>}</div>;
  return [show, node];
}

export const homeFor = (role) => (role === 'patient' ? '/patient' : role === 'admin' ? '/security' : '/clinic');
export const roleLabel = (role) => ({ patient: 'Patient', doctor: 'Clinician', admin: 'Security officer' }[role] || role);

export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
export const initials = (name = '') => name.replace(/^Dr\.\s*/, '').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export function useAsync(fn, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    return fn().then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState({ loading: false, data: null, error }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

export function usePageTitle(title) {
  useEffect(() => { document.title = title ? `${title} · HealthGuard` : 'HealthGuard · Secure health records'; }, [title]);
}
