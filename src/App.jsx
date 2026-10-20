import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, setUnauthorizedHandler } from './api.js';
import { SessionContext, Loading, homeFor } from './ui.jsx';
import Landing from './pages/Landing.jsx';
import SignIn from './pages/SignIn.jsx';
import Register from './pages/Register.jsx';
import HowItWorks from './pages/HowItWorks.jsx';
import PatientApp from './pages/patient/PatientApp.jsx';
import ClinicApp from './pages/clinic/ClinicApp.jsx';
import SecurityConsole from './pages/security/SecurityConsole.jsx';

function RequireRole({ session, roles, children }) {
  const location = useLocation();
  if (session.loading) return <main id="main" className="container"><Loading label="Checking your session" /></main>;
  if (!session.user) {
    const portal = roles.includes('patient') ? 'patient' : 'clinician';
    return <Navigate to={`/signin?portal=${portal}`} replace state={{ from: location.pathname }} />;
  }
  if (!roles.includes(session.user.role)) return <Navigate to={homeFor(session.user.role)} replace />;
  return children;
}

// Move focus to the page heading after navigation so screen reader users hear where they are.
function FocusOnNavigate() {
  const { pathname } = useLocation();
  useEffect(() => {
    const h1 = document.querySelector('main h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  const [state, setState] = useState({ loading: true, user: null, network: null, expiresAt: null });
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    try {
      const me = await api('/auth/me');
      setState({ loading: false, user: me.user, network: me.network, expiresAt: me.expiresAt });
    } catch {
      setState({ loading: false, user: null, network: null, expiresAt: null });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setState({ loading: false, user: null, network: null, expiresAt: null });
      navigate('/signin?expired=1');
    });
  }, [navigate]);

  // End the session on the client when the server-side session expires.
  useEffect(() => {
    if (!state.expiresAt) return undefined;
    const ms = Date.parse(state.expiresAt) - Date.now();
    const t = setTimeout(() => {
      setState({ loading: false, user: null, network: null, expiresAt: null });
      navigate('/signin?expired=1');
    }, Math.max(ms, 0));
    return () => clearTimeout(t);
  }, [state.expiresAt, navigate]);

  const session = useMemo(() => ({
    ...state,
    signedIn: (data) => setState({ loading: false, user: data.user, network: null, expiresAt: data.expiresAt }),
    signOut: async () => {
      try { await api('/auth/logout', { method: 'POST' }); } catch { /* already signed out */ }
      setState({ loading: false, user: null, network: null, expiresAt: null });
      navigate('/');
    },
    refresh,
  }), [state, navigate, refresh]);

  return (
    <SessionContext.Provider value={session}>
      <a className="skip-link" href="#main">Skip to main content</a>
      <FocusOnNavigate />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/register" element={<Register />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/patient/*" element={<RequireRole session={session} roles={['patient']}><PatientApp /></RequireRole>} />
        <Route path="/clinic/*" element={<RequireRole session={session} roles={['doctor']}><ClinicApp /></RequireRole>} />
        <Route path="/security/*" element={<RequireRole session={session} roles={['admin']}><SecurityConsole /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionContext.Provider>
  );
}
