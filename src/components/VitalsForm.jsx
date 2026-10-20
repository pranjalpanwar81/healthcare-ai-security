import { useEffect, useState } from 'react';
import { api } from '../api.js';

let featureCache = null;
export function useFeatures() {
  const [features, setFeatures] = useState(featureCache);
  useEffect(() => {
    if (featureCache) return;
    api('/xai/model-card').then((c) => { featureCache = c.features; setFeatures(c.features); }).catch(() => {});
  }, []);
  return features;
}

/** Grid of labelled number inputs for the twelve model measurements. */
export default function VitalsForm({ value, onChange, idPrefix = 'v' }) {
  const features = useFeatures();
  if (!features) return null;
  return (
    <div className="form-grid">
      {features.map((f) => (
        <div className="field" key={f.key}>
          <label htmlFor={`${idPrefix}-${f.key}`}>{f.label} <span className="muted small">({f.unit})</span></label>
          <input id={`${idPrefix}-${f.key}`} className="input" type="number" inputMode="decimal" step="any"
            min={f.min} max={f.max} value={value[f.key] ?? ''} aria-describedby={`${idPrefix}-${f.key}-n`}
            onChange={(e) => onChange({ ...value, [f.key]: e.target.value === '' ? '' : e.target.value })} />
          <span className="hint small muted" id={`${idPrefix}-${f.key}-n`}>Usual: {f.normal[0]}–{f.normal[1]}</span>
        </div>
      ))}
    </div>
  );
}

export const toNumbers = (v) => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x != null).map(([k, x]) => [k, Number(x)]));
