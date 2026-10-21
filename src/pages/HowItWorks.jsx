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

        <section style={{ marginTop: 48 }} aria-labelledby="card-title">
          <div className="section-head">
            <h2 id="card-title">Two models, two kinds of explanation</h2>
            <p>An interpretable model explained exactly, and a neural network explained with Shapley values.</p>
          </div>
          {card.loading && <Loading />}
          {card.data && (() => {
            const lin = card.data;
            const nn = card.data.neural;
            return (
              <div className="stack" style={{ '--stack': '20px' }}>
                <div className="card">
                  <div className="table-wrap">
                    <table className="compare-table">
                      <caption className="sr-only">Comparison of the two models on held-out data</caption>
                      <thead><tr><th scope="col"> </th><th scope="col">Interpretable model</th><th scope="col">Neural network</th></tr></thead>
                      <tbody>
                        <tr><th scope="row">Model</th><td>Multinomial logistic regression</td><td>Multilayer perceptron, 12 → 32 → 16 → 5</td></tr>
                        <tr><th scope="row">Parameters</th><td>{lin.features.length * lin.classes.length + lin.classes.length}</td><td>{nn.parameters.toLocaleString('en-IN')}</td></tr>
                        <tr><th scope="row">How it is explained</th><td>Exact weights × measurements</td><td>Exact Shapley values (SHAP), checked with integrated gradients</td></tr>
                        <tr><th scope="row">Accuracy</th><td>{pct(lin.accuracy)}</td><td>{pct(nn.accuracy)}</td></tr>
                        <tr><th scope="row">Macro F1</th><td>{pct(lin.macroF1)}</td><td>{pct(nn.macroF1)}</td></tr>
                        {lin.perClass.map((c, i) => (
                          <tr key={c.key}><th scope="row">Recall: {c.label}</th><td>{pct(c.recall)}</td><td>{pct(nn.perClass[i].recall)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="small muted" style={{ margin: '12px 0 0' }}>{lin.trainedOn}; tested on {lin.testedOn}. Both models use exactly the same data.</p>
                </div>

                <dl className="stats">
                  <div className="stat"><div><dt>Same outcome from both models</dt><dd>{pct(nn.comparison.outcomeAgreement)}</dd></div></div>
                  <div className="stat"><div><dt>Shared top-3 factors</dt><dd>{pct(nn.comparison.topFactorOverlap)}</dd></div></div>
                  <div className="stat"><div><dt>SHAP faithfulness</dt><dd>Exact</dd></div></div>
                </dl>

                <div className="grid-2">
                  {[['What the interpretable model relies on', lin.globalImportance], ['What the neural network relies on', nn.globalImportance]].map(([title, list]) => (
                    <div className="card stack" key={title}>
                      <h3>{title}</h3>
                      <p className="small muted" style={{ margin: 0 }}>Average share of each measurement in the model's decisions on held-out patients.</p>
                      {list.map((g) => (
                        <div className="prob" key={g.key}>
                          <span>{g.label}</span>
                          <span className="prob-track" aria-hidden="true"><i style={{ width: `${(g.share / list[0].share) * 100}%` }} /></span>
                          <span style={{ textAlign: 'right' }}>{Math.round(g.share * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="card stack">
                  <h3>Why two models?</h3>
                  <p style={{ margin: 0 }}>The interpretable model's explanation is the model itself, so it is exact but limited to straight-line effects. The neural network can learn combinations, such as high CRP together with high white cells, but cannot be read directly. Shapley values split its prediction fairly among the measurements and always add up exactly to what it predicted. When the two models disagree, the result is flagged for extra care.</p>
                  <h3 style={{ marginTop: 8 }}>Limitations</h3>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>{lin.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
                </div>
              </div>
            );
          })()}
        </section>
      </main>
    </div>
  );
}
