import { Link } from 'react-router-dom';
import { ArrowRight, Fingerprint, KeyRound, LockKeyhole, Radar, ScrollText, ShieldCheck, Siren, Stethoscope, User, Wifi } from 'lucide-react';
import { Badge, TopBar, usePageTitle } from '../ui.jsx';
import AccessLedger from '../components/AccessLedger.jsx';

// Illustrative values for the hero composition, shaped exactly like real API output.
const SAMPLE_FACTORS = [
  { label: 'Systolic blood pressure', value: '156 mmHg', impact: 2.67 },
  { label: 'Diastolic blood pressure', value: '97 mmHg', impact: 2.32 },
  { label: 'Body mass index', value: '29.4', impact: 0.34 },
  { label: 'Fasting glucose', value: '108 mg/dL', impact: -0.41 },
];
const SAMPLE_LEDGER = [
  { seq: 41, ts: new Date(Date.now() - 2 * 3600e3).toISOString(), who: 'Dr. Arjun Mehta', action: 'record.read', outcome: 'success', detail: { basis: 'consent' }, hash: '9f2c4be81d7a03e65c1f' },
  { seq: 40, ts: new Date(Date.now() - 26 * 3600e3).toISOString(), who: 'Dr. Arjun Mehta', action: 'record.write', outcome: 'success', detail: {}, hash: '3ad07c51e9b2f4486e0a' },
];

const TECHNIQUES = [
  { icon: LockKeyhole, title: 'Envelope encryption', text: 'Every record is sealed with its own AES-256-GCM key, wrapped by a versioned master key and bound to its patient.', tag: 'AES-256-GCM' },
  { icon: KeyRound, title: 'Rotation without decryption', text: 'Master keys rotate by re-wrapping data keys. Record contents are never exposed during rotation.', tag: 'KEK / DEK' },
  { icon: ScrollText, title: 'Tamper-evident ledger', text: 'Every access is signed and chained to the one before it. Change one entry and verification fails from that point on.', tag: 'HMAC-SHA256 chain' },
  { icon: Fingerprint, title: 'Blind-indexed identity', text: 'Emails are stored encrypted and found through a keyed fingerprint, so the database holds nothing searchable in plain text.', tag: 'HMAC index' },
  { icon: Wifi, title: 'Hospital-network gate', text: 'Clinician sessions work only from approved hospital networks, checked by the server on every request.', tag: 'Egress allow-list' },
  { icon: Siren, title: 'Break-glass with review', text: 'Emergency access lasts one hour, needs a written reason, tells the patient and alerts the security officer.', tag: 'Time-boxed' },
  { icon: Radar, title: 'Behavioural monitoring', text: 'Bulk reads, out-of-hours access, repeated denials and patient reports raise alerts automatically.', tag: 'Rule engine' },
];

export default function Landing() {
  usePageTitle();
  const max = 2.67;
  return (
    <div className="public public-dark">
      <TopBar>
        <Link to="/how-it-works" className="btn btn-ghost btn-sm">How it works</Link>
        <Link to="/signin" className="btn btn-sm">Sign in</Link>
      </TopBar>
      <main id="main">
        <section className="hero-dark"><div className="container hero-v2">
          <div className="hero-grid">
            <div>
              <span className="eyebrow-line"><ShieldCheck size={18} aria-hidden="true" />Secure, explainable health records</span>
              <h1>Health records that are <em>locked</em>, watched and explained.</h1>
              <p className="lead">Every record is encrypted with its own key. Every access is written to a ledger that cannot be quietly changed. Every risk result tells you why.</p>
              <div className="row" style={{ marginTop: 28 }}>
                <Link to="/signin?portal=patient" className="btn btn-primary">I am a patient <ArrowRight size={18} aria-hidden="true" /></Link>
                <Link to="/signin?portal=clinician" className="btn"><Stethoscope size={18} aria-hidden="true" />I work at the hospital</Link>
              </div>
              <div className="trust-strip">
                <span><LockKeyhole size={16} aria-hidden="true" />AES-256-GCM per record</span>
                <span><ScrollText size={16} aria-hidden="true" />Tamper-evident ledger</span>
                <span><Wifi size={16} aria-hidden="true" />Hospital-network gate</span>
              </div>
              <p className="small muted" style={{ marginTop: 14 }}>Demo system with fictional patients. Not for real medical use.</p>
            </div>

            <div className="hero-stage" aria-label="Example of a risk check explanation and an access history">
              <article className="label-card stage-label">
                <div className="label-top">
                  <div>
                    <div className="label-kicker">Risk check result</div>
                    <h3>Hypertension risk</h3>
                    <div style={{ marginTop: 8 }}><Badge tone="warn">Worth discussing</Badge></div>
                  </div>
                  <div className="confidence"><strong>94%</strong><span className="small muted">confidence</span></div>
                </div>
                <div className="label-section">
                  <div className="label-kicker">Why: what moved this result</div>
                  {SAMPLE_FACTORS.map((f) => (
                    <div className="factor" key={f.label}>
                      <div className="factor-name"><strong>{f.label}</strong><span>{f.value}</span></div>
                      <div className="factor-bar" aria-hidden="true"><i className={f.impact >= 0 ? 'up' : 'down'} style={{ width: `${(Math.abs(f.impact) / max) * 50}%` }} /></div>
                      <div className="factor-val">{f.impact >= 0 ? '+' : '−'}{Math.abs(f.impact).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </article>
              <div className="stage-ledger">
                <div className="label-kicker" style={{ marginBottom: 10 }}>Who opened this record</div>
                <AccessLedger entries={SAMPLE_LEDGER} />
                <Badge tone="ok" icon={ShieldCheck}>Ledger verified</Badge>
              </div>
            </div>
          </div>
        </div></section>

        <section className="container" aria-labelledby="tech-title" style={{ paddingBlock: '88px 72px' }}>
          <div className="section-head">
            <h2 id="tech-title">Seven layers between a record and the wrong person</h2>
            <p>Each one is running in this demo. <Link to="/how-it-works">See the risk model</Link></p>
          </div>
          <div className="spec">
            {TECHNIQUES.map(({ icon: Icon, title, text, tag }) => (
              <div className="spec-row" key={title}>
                <h3><Icon size={22} aria-hidden="true" style={{ color: 'var(--brand)' }} />{title}</h3>
                <p>{text}</p>
                <code>{tag}</code>
              </div>
            ))}
          </div>
        </section>

        <section className="container" aria-labelledby="who-title" style={{ paddingBottom: 80 }}>
          <h2 id="who-title" className="sr-only">Who it is for</h2>
          <div className="audience">
            <div className="audience-card">
              <h3 style={{ display: 'flex', gap: 10, alignItems: 'center', margin: 0 }}><User size={22} aria-hidden="true" />For patients</h3>
              <ul>
                <li>Read your visits, results and medicines in plain words</li>
                <li>See exactly why a health check flagged something</li>
                <li>Know who is on your care team and every time they open your file</li>
                <li>Report any access you do not recognise in one tap</li>
              </ul>
              <Link to="/signin?portal=patient" className="btn btn-primary">Patient sign-in <ArrowRight size={18} aria-hidden="true" /></Link>
            </div>
            <div className="audience-card dark">
              <h3 style={{ display: 'flex', gap: 10, alignItems: 'center', margin: 0 }}><Stethoscope size={22} aria-hidden="true" />For clinicians and security staff</h3>
              <ul>
                <li>Charts for your assigned patients, on the hospital network only</li>
                <li>Risk checks with exact, auditable attributions</li>
                <li>Emergency access when it matters, with review built in</li>
                <li>Ledger verification, key rotation and live alerts</li>
              </ul>
              <Link to="/signin?portal=clinician" className="btn">Clinician sign-in <ArrowRight size={18} aria-hidden="true" /></Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="footer"><div className="container spread"><span>HealthGuard · Secure and explainable health records</span><span>Demo system. Not for real medical use.</span></div></footer>
    </div>
  );
}
