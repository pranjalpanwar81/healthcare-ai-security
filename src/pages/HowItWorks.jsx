import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { api } from '../api.js';
import { Loading, Notice, TopBar, useAsync, usePageTitle } from '../ui.jsx';
import Explanation from '../components/Explanation.jsx';
import VitalsForm, { toNumbers } from '../components/VitalsForm.jsx';

const SAMPLES = {
  'High blood pressure': { age: 61, bmi: 29, systolic: 158, diastolic: 98, heartRate: 80, temperature: 36.7, glucose: 102, hba1c: 5.7, wbc: 7.2, crp: 4, coughDays: 0, fatigue: 4 },
  'Raised blood sugar': { age: 49, bmi: 32, systolic: 132, diastolic: 84, heartRate: 81, temperature: 36.8, glucose: 168, hba1c: 8.1, wbc: 7.6, crp: 6, coughDays: 0, fatigue: 5 },
  'Fever and cough': { age: 36, bmi: 24, systolic: 118, diastolic: 76, heartRate: 104, temperature: 38.9, glucose: 101, hba1c: 5.3, wbc: 16, crp: 110, coughDays: 7, fatigue: 7 },
  Healthy: { age: 30, bmi: 22, systolic: 114, diastolic: 74, heartRate: 70, temperature: 36.6, glucose: 86, hba1c: 5.0, wbc: 6.5, crp: 2, coughDays: 0, fatigue: 2 },
};

const pct = (x) => `${(x * 100).toFixed(1)}%`;

export default function HowItWorks() {
  usePageTitle('How it works');
  const card = useAsync(() => api('/xai/model-card'), []);
  const [vitals, setVitals] = useState(SAMPLES['High blood pressure']);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run(v = vitals) {
    setBusy(true); setError(null);
    try { setResult(await api('/xai/try', { method: 'POST', body: { vitals: toNumbers(v) } })); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="public">
      <TopBar><Link to="/signin" className="btn btn-sm">Sign in</Link></TopBar>
      <main id="main" className="container">
        <div className="page-head">
          <h1>How the risk check explains itself</h1>
          <p>The model is interpretable by design. Each result is broken down into exactly how much every measurement contributed, so doctors and patients can see why, not only what.</p>
        </div>

        <section className="split" aria-labelledby="try-title">
          <div className="card stack">
            <div className="card-head">
              <div><h2 id="try-title">Try it with sample readings</h2><p>Nothing you enter here is saved.</p></div>
            </div>
            <div className="row" role="group" aria-label="Sample patients">
              {Object.keys(SAMPLES).map((k) => (
                <button key={k} type="button" className="btn btn-sm" onClick={() => { setVitals(SAMPLES[k]); run(SAMPLES[k]); }}>{k}</button>
              ))}
            </div>
            <VitalsForm value={vitals} onChange={setVitals} idPrefix="try" />
            <button type="button" className="btn btn-primary" onClick={() => run()} disabled={busy}><Play size={18} aria-hidden="true" />{busy ? 'Checking…' : 'Run the risk check'}</button>
          </div>
          <div aria-live="polite">
            {error && <Notice tone="error">{error}</Notice>}
            {result ? <Explanation result={result} audience="clinician" /> : <div className="card soft"><p style={{ margin: 0 }}>Choose a sample or enter readings, then run the check to see the explanation here.</p></div>}
          </div>
        </section>

        <section style={{ marginTop: 40 }} aria-labelledby="card-title">
          <h2 id="card-title">Model card</h2>
          {card.loading && <Loading />}
          {card.data && (
            <div className="grid-2" style={{ marginTop: 12 }}>
              <div className="card stack">
                <dl className="kv">
                  <dt>Model</dt><dd>{card.data.type}</dd>
                  <dt>Explanations</dt><dd>{card.data.explanation}</dd>
                  <dt>Trained on</dt><dd>{card.data.trainedOn}</dd>
                  <dt>Tested on</dt><dd>{card.data.testedOn}</dd>
                  <dt>Accuracy</dt><dd>{pct(card.data.accuracy)}</dd>
                  <dt>Macro F1</dt><dd>{pct(card.data.macroF1)}</dd>
                </dl>
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">Results per outcome on held-out data</caption>
                    <thead><tr><th scope="col">Outcome</th><th scope="col">Precision</th><th scope="col">Recall</th><th scope="col">Cases</th></tr></thead>
                    <tbody>{card.data.perClass.map((c) => <tr key={c.key}><th scope="row">{c.label}</th><td>{pct(c.precision)}</td><td>{pct(c.recall)}</td><td>{c.support}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
              <div className="card stack">
                <h3>What the model relies on most</h3>
                <p className="small muted" style={{ margin: 0 }}>Average share of each measurement in the model's decisions across the test set.</p>
                {card.data.globalImportance.map((g) => (
                  <div className="prob" key={g.key}>
                    <span>{g.label}</span>
                    <span className="prob-track" aria-hidden="true"><i style={{ width: `${(g.share / card.data.globalImportance[0].share) * 100}%` }} /></span>
                    <span style={{ textAlign: 'right' }}>{Math.round(g.share * 100)}%</span>
                  </div>
                ))}
                <h3 style={{ marginTop: 12 }}>Limitations</h3>
                <ul style={{ margin: 0, paddingLeft: 20 }}>{card.data.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
