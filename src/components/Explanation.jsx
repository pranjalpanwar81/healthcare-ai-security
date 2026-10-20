import { ArrowRight, Lightbulb } from 'lucide-react';
import { Badge } from '../ui.jsx';

const pct = (p) => `${Math.round(p * 100)}%`;
const fmt = (v) => (v === null || v === undefined ? '—' : Number.isInteger(v) ? v : Number(v).toFixed(1));

/**
 * The explanation label. Every number comes straight from the model:
 * bars show each measurement's exact additive contribution to the predicted result.
 */
export default function Explanation({ result, audience = 'patient' }) {
  if (!result) return null;
  const { prediction, contributions, probabilities, summary, counterfactual, missing, disclaimer } = result;
  const shown = contributions.filter((c) => c.value !== null).slice(0, 8);
  const max = Math.max(0.5, ...shown.map((c) => Math.abs(c.impact)));
  const tone = prediction.tone === 'ok' ? 'ok' : prediction.tone === 'alert' ? 'alert' : 'warn';

  return (
    <article className="label-card" aria-labelledby="xai-title">
      <div className="label-top">
        <div>
          <div className="label-kicker">Risk check result</div>
          <h3 id="xai-title">{prediction.label}</h3>
          <div style={{ marginTop: 8 }}>
            <Badge tone={tone}>{tone === 'ok' ? 'Nothing flagged' : tone === 'alert' ? 'See a doctor soon' : 'Worth discussing'}</Badge>
          </div>
        </div>
        <div className="confidence">
          <strong>{pct(prediction.confidence)}</strong>
          <span className="small muted">model confidence</span>
        </div>
      </div>

      <div className="label-section">
        <div className="label-kicker" style={{ marginBottom: 6 }}>In plain words</div>
        <p style={{ margin: 0 }}>{summary}</p>
      </div>

      <div className="label-section">
        <div className="label-kicker">Why: what moved this result</div>
        <p className="small muted" style={{ marginTop: 4 }}>
          Bars to the right pushed toward <strong>{prediction.label.toLowerCase()}</strong>. Bars to the left pushed away from it.
          Longer bars mattered more.
        </p>
        <div role="list">
          {shown.map((c) => {
            const width = `${(Math.abs(c.impact) / max) * 50}%`;
            const dir = c.impact >= 0 ? 'toward' : 'away from';
            return (
              <div className="factor" role="listitem" key={c.key}
                aria-label={`${c.label}: ${fmt(c.value)} ${c.unit}, ${c.status}. Pushed ${dir} the result by ${Math.abs(c.impact).toFixed(2)}.`}>
                <div className="factor-name">
                  <strong>{c.label}</strong>
                  <span>{fmt(c.value)} {c.unit} · {c.status}</span>
                </div>
                <div className="factor-bar" aria-hidden="true">
                  <i className={c.impact >= 0 ? 'up' : 'down'} style={{ width }} />
                </div>
                <div className="factor-val" aria-hidden="true">{c.impact >= 0 ? '+' : '−'}{Math.abs(c.impact).toFixed(2)}</div>
              </div>
            );
          })}
        </div>
        <div className="factor-legend" aria-hidden="true"><span>← lowers</span><span>raises →</span></div>
      </div>

      {counterfactual && (
        <div className="label-section">
          <div className="label-kicker" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Lightbulb size={16} aria-hidden="true" />What would change this</div>
          <ul style={{ margin: '8px 0 6px', paddingLeft: 20 }}>
            {counterfactual.changes.map((ch) => (
              <li key={ch.feature}>{ch.feature} from <strong>{fmt(ch.from)}</strong> <ArrowRight size={14} aria-label="to" /> <strong>{fmt(ch.to)}</strong> {ch.unit}</li>
            ))}
          </ul>
          <p className="small muted" style={{ margin: 0 }}>With {counterfactual.changes.length > 1 ? 'these changes' : 'this change'}, the result would become “{counterfactual.newResult}”.</p>
        </div>
      )}

      {audience === 'clinician' && (
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
        {missing?.length > 0 && <p style={{ marginBottom: 6 }}>Not measured: {missing.join(', ')}. These were treated as average.</p>}
        <p style={{ margin: 0 }}><strong>{disclaimer}</strong></p>
      </div>
    </article>
  );
}
