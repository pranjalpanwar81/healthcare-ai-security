import { Link } from 'react-router-dom';
import { ArrowRight, Fingerprint, LockKeyhole, ScrollText, Stethoscope, User, Wifi } from 'lucide-react';
import { TopBar, usePageTitle } from '../ui.jsx';

export default function Landing() {
  usePageTitle();
  return (
    <>
      <TopBar><Link to="/how-it-works" className="btn btn-ghost btn-sm">How it works</Link></TopBar>
      <main id="main">
        <section className="container hero">
          <div className="hero-grid">
            <div>
              <h1>Your health record, private by default and clear about every decision.</h1>
              <p className="lead">
                HealthGuard keeps medical records encrypted, lets you decide which doctors can see them, shows you every time
                someone opens them, and explains every risk result in plain words.
              </p>
              <div className="row" style={{ marginTop: 24 }}>
                <Link to="/signin?portal=patient" className="btn btn-primary">Sign in as a patient <ArrowRight size={18} aria-hidden="true" /></Link>
                <Link to="/register" className="btn">Create an account</Link>
              </div>
            </div>
            <div className="stack" style={{ '--stack': '14px' }}>
              <Link to="/signin?portal=patient" className="portal-card">
                <h3><User size={22} aria-hidden="true" />I am a patient</h3>
                <span className="muted">See your records, choose who can access them and check your health results. Works from anywhere.</span>
                <span className="row small" style={{ color: 'var(--brand)', fontWeight: 700 }}>Patient sign-in <ArrowRight size={16} aria-hidden="true" /></span>
              </Link>
              <Link to="/signin?portal=clinician" className="portal-card">
                <h3><Stethoscope size={22} aria-hidden="true" />I work at the hospital</h3>
                <span className="muted">Doctors and security staff. Sign-in only works on the hospital network.</span>
                <span className="row small" style={{ color: 'var(--brand)', fontWeight: 700 }}>Clinician sign-in <ArrowRight size={16} aria-hidden="true" /></span>
              </Link>
            </div>
          </div>
        </section>

        <section className="container" aria-labelledby="how-title" style={{ paddingBottom: 56 }}>
          <h2 id="how-title">How your record is protected</h2>
          <div className="grid-3" style={{ marginTop: 16 }}>
            <div className="pillar">
              <h3><LockKeyhole size={22} aria-hidden="true" />Locked with its own key</h3>
              <p className="muted">Every record is encrypted with a unique AES-256 key. Those keys are themselves locked by a master key that can be rotated without touching your data.</p>
            </div>
            <div className="pillar">
              <h3><Fingerprint size={22} aria-hidden="true" />You decide who sees it</h3>
              <p className="muted">Doctors only see your record after you allow it, and you can take that back at any moment. Emergency access is possible but always recorded and reviewed.</p>
            </div>
            <div className="pillar">
              <h3><ScrollText size={22} aria-hidden="true" />A history that cannot be rewritten</h3>
              <p className="muted">Each access is written to a linked ledger. If anyone edits or deletes an entry, the chain breaks and the change is detected.</p>
            </div>
            <div className="pillar">
              <h3><Wifi size={22} aria-hidden="true" />Hospital network only for staff</h3>
              <p className="muted">Clinician accounts only work from approved hospital networks, checked by the server on every request, so a stolen password alone is not enough.</p>
            </div>
          </div>
          <p style={{ marginTop: 12 }}><Link to="/how-it-works">Read how the risk check explains its results <ArrowRight size={14} aria-hidden="true" /></Link></p>
        </section>
      </main>
      <footer className="footer"><div className="container spread"><span>HealthGuard · Secure and explainable health records</span><span>Demo system. Not for real medical use.</span></div></footer>
    </>
  );
}
