import { ArrowRight, CheckCircle2, GitCompareArrows, HeartPulse, Lightbulb, ShieldCheck, ShieldX, TriangleAlert } from 'lucide-react';
import { Badge, Notice } from '../ui.jsx';

const pct = (p) => `${Math.round(p * 100)}%`;
const LEVEL = {
  high: { tone: 'alert', text: 'Raised risk', advice: 'Please discuss with your doctor soon' },
  borderline: { tone: 'warn', text: 'Borderline', advice: 'Worth discussing at your next visit' },
  low: { tone: 'ok', text: 'Low risk', advice: 'Nothing flagged' },
};

function Factors({ items, label }) {
  const shown = items.filter((c) => c.value !== null).slice(0, 8);
  const max = Math.max(0.04, ...shown.map((c) => Math.abs(c.impact)));
  const pts = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)} pts`;
  return (
    <>
      <p className="small muted" style={{ marginTop: 4 }}>Bars to the right raised the {label.toLowerCase()} risk, bars to the left lowered it. Longer bars mattered more.</p>
      <div role="list">
        {shown.map((c) => (
          <div className="factor" role="listitem" key={c.key}
            aria-label={`${c.label}: ${c.display}${c.status ? `, ${c.status}` : ''}. ${c.impact >= 0 ? 'Raised' : 'Lowered'} the risk by ${pts(c.impact)}.`}>
            <div className="factor-name"><strong>{c.label}</strong><span>{c.display}{c.status ? ` · ${c.status}` : ''}</span></div>
            <div className="factor-bar" aria-hidden="true"><i className={c.impact >= 0 ? 'up' : 'down'} style={{ width: `${(Math.abs(c.impact) / max) * 50}%` }} /></div>
            <div className="factor-val" aria-hidden="true">{pts(c.impact)}</div>
          </div>
        ))}
      </div>
      <div className="factor-legend" aria-hidden="true"><span>← lowers</span><span>raises →</span></div>
    </>
  );
}

function ConditionCard({ r, clinician }) {
  if (!r.available) {
    return (
      <article className="label-card" aria-label={r.label}>
        <div className="label-top"><div><div className="label-kicker">{r.label}</div><h3>Not enough readings</h3></div></div>
        <div className="label-section"><p className="small muted" style={{ margin: 0 }}>{r.reason}</p></div>
      </article>
    );
  }
  const lv = LEVEL[r.level];
  const so = r.secondOpinion;
  return (
    <article className="label-card" aria-labelledby={`risk-${r.condition}`}>
      <div className="label-top">
        <div>
          <div className="label-kicker">{r.label}</div>
          <h3 id={`risk-${r.condition}`}>{lv.text}</h3>
          <div style={{ marginTop: 8 }}><Badge tone={lv.tone}>{lv.advice}</Badge></div>
        </div>
        <div className="confidence"><strong>{pct(r.risk)}</strong><span className="small muted">estimated risk</span></div>
      </div>

      <div className="label-section stack" style={{ '--stack': '12px' }}>
        <p style={{ margin: 0 }}>{r.summary}</p>
        <div className={`agree tone-${so.agree ? 'ok' : 'alert'}`} role="status">
          {so.agree ? <CheckCircle2 size={20} aria-hidden="true" /> : <GitCompareArrows size={20} aria-hidden="true" />}
          <div>
            <strong>{so.agree ? 'Second opinion agrees' : 'Second opinion disagrees'}</strong>
            <div className="small">
              {so.name} estimates {pct(so.risk)} ({so.flagged ? 'raised' : 'not raised'}).
              {so.sharedTopFactors.length ? ` Shared main factors: ${so.sharedTopFactors.join(', ').toLowerCase()}.` : ''}
              {!so.agree && ' Treat this result with extra care.'}
            </div>
          </div>
        </div>
        {r.outOfRange.length > 0 && (
          <Notice tone="warn" title="Some readings are unusual for this model">
            {r.outOfRange.map((o) => `${o.label} ${o.value}`).join('; ')} {r.outOfRange.length > 1 ? 'are' : 'is'} outside the range the model learned from, so this result is less certain.
          </Notice>
        )}
      </div>

      <div className="label-section">
        <div className="label-kicker">Why: Shapley values (SHAP)</div>
        <Factors items={r.contributions} label={r.label} />
        <p className="small muted" style={{ margin: '10px 0 0' }}>
          Percentage points of risk, starting from a typical patient ({pct(r.baseValue)}) and adding up to this result ({pct(r.outputValue)}).
          {' '}<strong>Faithfulness check:</strong> {r.faithfulness.error < 1e-9 ? 'exact' : `difference ${r.faithfulness.error.toExponential(1)}`}.
        </p>
      </div>

      {r.counterfactual && (
        <div className="label-section">
          <div className="label-kicker" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Lightbulb size={16} aria-hidden="true" />What would lower this</div>
          <ul style={{ margin: '8px 0 6px', paddingLeft: 20 }}>
            {r.counterfactual.changes.map((c) => <li key={c.feature}>{c.feature} from <strong>{c.from}</strong> <ArrowRight size={14} aria-label="to" /> <strong>{c.to}</strong></li>)}
          </ul>
          <p className="small muted" style={{ margin: 0 }}>Estimated risk would fall to {pct(r.counterfactual.newRisk)}, below the alert level.</p>
        </div>
      )}

      {clinician && (
        <div className="label-section small muted">
          Model: {r.model.name}. Held-out ROC-AUC {r.model.testRocAuc.toFixed(2)}, recall {pct(r.model.testRecall)}. Alert threshold {pct(r.threshold)}, chosen to balance sensitivity and specificity.
          {r.missing.length > 0 && <> Not recorded: {r.missing.join(', ')} (filled with typical values).</>}
        </div>
      )}
    </article>
  );
}

/** Risk report for every condition the readings support, each explained with SHAP and checked by a second model. */
export default function Explanation({ result, audience = 'patient' }) {
  if (!result?.results) return null;
  const clinician = audience === 'clinician';
  return (
    <div className="stack" style={{ '--stack': '18px' }}>
      <div className="integrity-line small">
        {result.integrity?.ok
          ? <><ShieldCheck size={16} aria-hidden="true" /> Models verified: signed and unmodified</>
          : <><ShieldX size={16} aria-hidden="true" /> Model integrity check failed</>}
        <span className="muted"> · <HeartPulse size={14} aria-hidden="true" /> {result.results.filter((r) => r.available).length} of {result.results.length} conditions assessed</span>
      </div>
      {result.results.map((r) => <ConditionCard key={r.condition} r={r} clinician={clinician} />)}
      <p className="small muted" style={{ margin: 0 }}><TriangleAlert size={14} aria-hidden="true" /> {result.disclaimer}</p>
    </div>
  );
}
