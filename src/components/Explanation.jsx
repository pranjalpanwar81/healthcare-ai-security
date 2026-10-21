import { useState } from 'react';
import { ArrowRight, BrainCircuit, CheckCircle2, GitCompareArrows, Lightbulb, Scale, TriangleAlert } from 'lucide-react';
import { Badge } from '../ui.jsx';

const pct = (p) => `${Math.round(p * 100)}%`;
const fmt = (v) => (v === null || v === undefined ? '—' : Number.isInteger(v) ? v : Number(v).toFixed(1));
const toneOf = (prediction) => (prediction.tone === 'ok' ? 'ok' : prediction.tone === 'alert' ? 'alert' : 'warn');

function AgreementBanner({ agreement }) {
  if (!agreement) return null;
  const Icon = agreement.level === 'disagree' ? TriangleAlert : agreement.level === 'strong' ? CheckCircle2 : GitCompareArrows;
  const tone = agreement.level === 'disagree' ? 'alert' : agreement.level === 'strong' ? 'ok' : 'info';
  return (
    <div className={`agree tone-${tone}`} role="status">
      <Icon size={20} aria-hidden="true" />
      <div>
        <strong>{agreement.level === 'disagree' ? 'The two models disagree' : agreement.level === 'strong' ? 'Two independent models agree' : 'Both models give the same result'}</strong>
        <div className="small">{agreement.message}</div>
      </div>
    </div>
  );
}

function Factors({ items, unit, outcome }) {
  const shown = items.filter((c) => c.value !== null).slice(0, 8);
  const max = Math.max(unit === 'pts' ? 0.05 : 0.5, ...shown.map((c) => Math.abs(c.impact)));
  const show = (v) => (unit === 'pts' ? `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)} pts` : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`);
  return (
    <>
      <p className="small muted" style={{ marginTop: 4 }}>
        Bars to the right pushed toward <strong>{outcome.toLowerCase()}</strong>, bars to the left pushed away from it. Longer bars mattered more.
      </p>
      <div role="list">
        {shown.map((c) => (
          <div className="factor" role="listitem" key={c.key}
            aria-label={`${c.label}: ${fmt(c.value)} ${c.unit}, ${c.status}. ${c.impact >= 0 ? 'Raised' : 'Lowered'} the result by ${show(c.impact)}.`}>
            <div className="factor-name"><strong>{c.label}</strong><span>{fmt(c.value)} {c.unit} · {c.status}</span></div>
            <div className="factor-bar" aria-hidden="true"><i className={c.impact >= 0 ? 'up' : 'down'} style={{ width: `${(Math.abs(c.impact) / max) * 50}%` }} /></div>
            <div className="factor-val" aria-hidden="true">{show(c.impact)}</div>
          </div>
        ))}
      </div>
      <div className="factor-legend" aria-hidden="true"><span>← lowers</span><span>raises →</span></div>
    </>
  );
}

/**
 * The explanation label. "Interpretable" shows the logistic regression's exact attributions;
 * "Neural network" shows exact Shapley values for the black-box model, with its faithfulness check.
 */
export default function Explanation({ result, audience = 'patient' }) {
  const [view, setView] = useState('interpretable');
  if (!result) return null;
  const hasNeural = Boolean(result.neural);
  const active = view === 'neural' && hasNeural ? result.neural : result;
  const { prediction, probabilities } = active;
  const tone = toneOf(prediction);
  const clinician = audience === 'clinician';

  return (
    <article className="label-card" aria-labelledby="xai-title">
      <div className="label-top">
        <div>
          <div className="label-kicker">Risk check result</div>
          <h3 id="xai-title">{prediction.label}</h3>
          <div style={{ marginTop: 8 }}><Badge tone={tone}>{tone === 'ok' ? 'Nothing flagged' : tone === 'alert' ? 'See a doctor soon' : 'Worth discussing'}</Badge></div>
        </div>
        <div className="confidence"><strong>{pct(prediction.confidence)}</strong><span className="small muted">model confidence</span></div>
      </div>

      {hasNeural && (
        <div className="label-section stack" style={{ '--stack': '12px' }}>
          <AgreementBanner agreement={result.agreement} />
          <div className="model-switch" role="tablist" aria-label="Which model to explain">
            <button type="button" role="tab" aria-selected={view === 'interpretable'} onClick={() => setView('interpretable')}>
              <Scale size={16} aria-hidden="true" />Interpretable model
            </button>
            <button type="button" role="tab" aria-selected={view === 'neural'} onClick={() => setView('neural')}>
              <BrainCircuit size={16} aria-hidden="true" />Neural network
            </button>
          </div>
        </div>
      )}

      <div className="label-section">
        <div className="label-kicker" style={{ marginBottom: 6 }}>In plain words</div>
        <p style={{ margin: 0 }}>{active.summary}</p>
      </div>

      <div className="label-section">
        <div className="label-kicker">
          {view === 'neural' && hasNeural ? 'Why: Shapley values (SHAP) for the neural network' : 'Why: exact contributions in the interpretable model'}
        </div>
        <Factors items={active.contributions} unit={view === 'neural' && hasNeural ? 'pts' : 'logit'} outcome={prediction.label} />
        {view === 'neural' && hasNeural && (
          <p className="small muted" style={{ margin: '10px 0 0' }}>
            Values are percentage points of the predicted probability. They start from the average patient ({pct(active.baseValue)}) and add up to this result ({pct(active.outputValue)}).
            {' '}<strong>Faithfulness check:</strong> difference {active.faithfulness.error < 1e-9 ? 'below 0.000000001' : active.faithfulness.error.toExponential(1)}
            {clinician ? `; integrated gradients agree to within ${(active.faithfulness.integratedGradientsError * 100).toFixed(2)} pts` : ''}.
          </p>
        )}
        {view !== 'neural' && hasNeural && <p className="small muted" style={{ margin: '10px 0 0' }}>Values are each measurement's exact share of the model's score (log-odds) compared with an average patient.</p>}
      </div>

      {view !== 'neural' && result.counterfactual && (
        <div className="label-section">
          <div className="label-kicker" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Lightbulb size={16} aria-hidden="true" />What would change this</div>
          <ul style={{ margin: '8px 0 6px', paddingLeft: 20 }}>
            {result.counterfactual.changes.map((ch) => (
              <li key={ch.feature}>{ch.feature} from <strong>{fmt(ch.from)}</strong> <ArrowRight size={14} aria-label="to" /> <strong>{fmt(ch.to)}</strong> {ch.unit}</li>
            ))}
          </ul>
          <p className="small muted" style={{ margin: 0 }}>With {result.counterfactual.changes.length > 1 ? 'these changes' : 'this change'}, the result would become “{result.counterfactual.newResult}”.</p>
        </div>
      )}

      {clinician && (
        <div className="label-section">
          <div className="label-kicker">All outcomes considered</div>
          {probabilities.map((p) => (
            <div className="prob" key={p.key}>
              <span>{p.label}</span>
              <span className="prob-track" aria-hidden="true"><i style={{ width: pct(p.probability) }} /></span>
              <span style={{ textAlign: 'right' }}>{pct(p.probability)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="label-section small muted">
        {result.missing?.length > 0 && <p style={{ marginBottom: 6 }}>Not measured: {result.missing.join(', ')}. These were treated as average.</p>}
        <p style={{ margin: 0 }}><strong>{result.disclaimer}</strong></p>
      </div>
    </article>
  );
}
