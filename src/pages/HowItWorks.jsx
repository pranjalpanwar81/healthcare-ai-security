import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, Play, ShieldCheck, ShieldX } from 'lucide-react';
import { api } from '../api.js';
import { Loading, Notice, TopBar, usePageTitle } from '../ui.jsx';
import Explanation from '../components/Explanation.jsx';
import VitalsForm, { toNumbers, useModelCards } from '../components/VitalsForm.jsx';

const SAMPLES = {
  'Chest pain on exercise': { age: 62, sex: 1, chestPain: 4, restingBP: 150, cholesterol: 270, fastingSugar: 0, restingECG: 2, maxHeartRate: 118, exerciseAngina: 1, stDepression: 2.2, stSlope: 2, vessels: 2, thal: 7 },
  'High blood sugar': { age: 48, pregnancies: 3, glucose: 182, bloodPressure: 84, skinThickness: 34, insulin: 220, bmi: 35.2, pedigree: 0.8 },
  'Healthy adult': { age: 34, sex: 0, chestPain: 3, restingBP: 116, cholesterol: 182, fastingSugar: 0, restingECG: 0, maxHeartRate: 182, exerciseAngina: 0, stDepression: 0, stSlope: 1, vessels: 0, thal: 3, pregnancies: 1, glucose: 92, bloodPressure: 70, skinThickness: 22, insulin: 90, bmi: 22.4, pedigree: 0.25 },
};

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const auc = (m) => `${m.mean.toFixed(3)} ± ${m.sd.toFixed(3)}`;

function ModelCard({ c }) {
  const rows = Object.entries(c.card.comparison);
  return (
    <section className="card stack" aria-labelledby={`mc-${c.key}`}>
      <div className="card-head">
        <div>
          <h3 id={`mc-${c.key}`} style={{ fontFamily: 'var(--display)', fontSize: '1.5rem' }}>{c.label}</h3>
          <p><Database size={14} aria-hidden="true" /> {c.source}. {c.card.positives} of {c.card.patients} patients have the condition; {c.card.train} used for training, {c.card.test} held out for the final test.</p>
        </div>
      </div>

      <div className="table-wrap">
        <table className="compare-table">
          <caption className="sr-only">Nested cross-validation results for {c.label}</caption>
          <thead><tr><th scope="col">Model</th><th scope="col">ROC-AUC (5-fold, mean ± sd)</th><th scope="col">Recall</th><th scope="col">Brier score</th><th scope="col"><span className="sr-only">Role</span></th></tr></thead>
          <tbody>
            {rows.map(([key, r]) => (
              <tr key={key}>
                <th scope="row">{r.name}</th><td>{auc(r.cv.rocAuc)}</td><td>{pct(r.cv.recall.mean)}</td><td>{r.cv.brier.mean.toFixed(3)}</td>
                <td>{key === c.selected.key ? <strong style={{ color: 'var(--brand)' }}>Selected</strong> : key === c.secondOpinion.key ? 'Second opinion' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ margin: 0 }}>{c.card.selectionRule}. Recall in this table uses a 0.5 cut-off.</p>

      <dl className="stats three">
        <div className="stat"><div><dt>Held-out ROC-AUC</dt><dd>{c.selected.test.rocAuc.toFixed(3)}</dd></div></div>
        <div className="stat"><div><dt>Recall at tuned threshold ({pct(c.selected.threshold)})</dt><dd>{pct(c.selected.test.recall)}</dd></div></div>
        <div className="stat"><div><dt>Precision / Brier</dt><dd>{pct(c.selected.test.precision)} / {c.selected.test.brier.toFixed(3)}</dd></div></div>
      </dl>
      <p className="small muted" style={{ margin: 0 }}>
        The alert threshold comes from out-of-fold training predictions (Youden's J), never from the test set. At the default 0.5 cut-off, recall would be {pct(c.selected.testAtHalf.recall)}.
        Second opinion ({c.secondOpinion.name}): held-out ROC-AUC {c.secondOpinion.test.rocAuc.toFixed(3)}.
      </p>

      <div className="grid-2">
        <div className="stack" style={{ '--stack': '8px' }}>
          <h4 style={{ margin: 0 }}>What the model relies on (mean |SHAP|)</h4>
          {c.card.globalImportance.slice(0, 8).map((g) => (
            <div className="prob" key={g.key}>
              <span>{g.label}</span>
              <span className="prob-track" aria-hidden="true"><i style={{ width: `${(g.share / c.card.globalImportance[0].share) * 100}%` }} /></span>
              <span style={{ textAlign: 'right' }}>{Math.round(g.share * 100)}%</span>
            </div>
          ))}
        </div>
        <div className="stack" style={{ '--stack': '8px' }}>
          <h4 style={{ margin: 0 }}>Fairness: held-out results by group</h4>
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">Group</th><th scope="col">Patients</th><th scope="col">ROC-AUC</th><th scope="col">Recall</th></tr></thead>
              <tbody>{c.card.fairness.map((f) => <tr key={f.group}><th scope="row">{f.group}</th><td>{f.n}</td><td>{f.rocAuc.toFixed(2)}</td><td>{pct(f.recall)}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Small groups give wide uncertainty; gaps between groups are reported, not hidden.</p>
        </div>
      </div>
    </section>
  );
}

export default function HowItWorks() {
  usePageTitle('How it works');
  const cards = useModelCards();
  const [vitals, setVitals] = useState(SAMPLES['Chest pain on exercise']);
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
      <main id="main" className="container" style={{ paddingTop: 32 }}>
        <div className="page-head">
          <h1>Real clinical data, explained</h1>
          <p>Two risk models trained on public clinical research datasets, chosen by a fair comparison of four algorithms, explained patient by patient with Shapley values, and cryptographically signed so they cannot be swapped.</p>
        </div>

        <section className="split" aria-labelledby="try-title">
          <div className="card stack">
            <div className="card-head"><div><h2 id="try-title">Try it with sample readings</h2><p>Nothing you enter here is saved.</p></div></div>
            <div className="row" role="group" aria-label="Sample patients">
              {Object.keys(SAMPLES).map((k) => <button key={k} type="button" className="btn btn-sm" onClick={() => { setVitals(SAMPLES[k]); run(SAMPLES[k]); }}>{k}</button>)}
            </div>
            <VitalsForm value={vitals} onChange={setVitals} idPrefix="try" />
            <button type="button" className="btn btn-primary" onClick={() => run()} disabled={busy}><Play size={18} aria-hidden="true" />{busy ? 'Checking…' : 'Run the risk check'}</button>
          </div>
          <div aria-live="polite">
            {error && <Notice tone="error">{error}</Notice>}
            {result ? <Explanation result={result} audience="clinician" /> : <div className="card soft"><p style={{ margin: 0 }}>Choose a sample or enter readings, then run the check to see the explanation here.</p></div>}
          </div>
        </section>

        <section style={{ marginTop: 48 }} aria-labelledby="cards-title">
          <div className="section-head">
            <h2 id="cards-title">Model cards</h2>
            <p>How each model was chosen and how well it performs on patients it never saw.</p>
          </div>
          {!cards && <Loading />}
          {cards && (
            <div className="stack" style={{ '--stack': '22px' }}>
              <Notice tone={cards.integrity.ok ? 'ok' : 'alert'} title={cards.integrity.ok ? 'Models verified' : 'Model integrity check failed'}>
                {cards.integrity.ok
                  ? <>Every model file matches its SHA-256 hash in a manifest signed with Ed25519 (key {cards.integrity.keyFingerprint}, signed {new Date(cards.integrity.signedAt).toLocaleDateString('en-IN')}), and reproduces the training library's predictions to within 0.000001.</>
                  : cards.integrity.reason}
              </Notice>
              {cards.conditions.map((c) => <Fragment key={c.key}><ModelCard c={c} /></Fragment>)}
              <div className="card stack">
                <h3>Method in brief</h3>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  <li>Logistic regression, random forest, XGBoost and a neural network were compared with nested, stratified 5-fold cross-validation (inner grid search on ROC-AUC).</li>
                  <li>The best model per condition is refit on the training split and tested once on a 20% hold-out set. A model from a different family gives a second opinion on every result.</li>
                  <li>Explanations are exact Shapley values of the predicted risk, computed over every combination of readings against a fixed sample of training patients, and checked to add up to the prediction.</li>
                  <li>Readings outside the 1st to 99th percentile of the training data are flagged as less certain.</li>
                  <li>The Pima dataset contains only women, so diabetes estimates for men are less reliable. This is shown as a limitation, not hidden.</li>
                </ul>
                <p className="small muted" style={{ margin: 0 }}>{cards.integrity.ok ? <ShieldCheck size={14} aria-hidden="true" /> : <ShieldX size={14} aria-hidden="true" />} Decision support only. Not a diagnosis and not a medical device.</p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
