import { useEffect, useState } from 'react';
import { api } from '../api.js';

let cardCache = null;
let pending = null;
/** The model cards, fetched once: they define which readings each model uses. */
export function useModelCards() {
  const [cards, setCards] = useState(cardCache);
  useEffect(() => {
    if (cardCache) return;
    pending ??= api('/xai/model-card').then((c) => { cardCache = c; return c; });
    pending.then(setCards).catch(() => { pending = null; });
  }, []);
  return cards;
}

const SHARED = ['age', 'sex'];

/** Readings grouped as General (used by both models), then one group per condition. */
export function groupFeatures(cards) {
  if (!cards) return [];
  const all = new Map();
  cards.conditions.forEach((c) => c.features.forEach((f) => { if (!all.has(f.key)) all.set(f.key, f); }));
  const groups = [{ key: 'general', label: 'General', features: SHARED.map((k) => all.get(k)).filter(Boolean) }];
  cards.conditions.forEach((c) => groups.push({ key: c.key, label: c.label, features: c.features.filter((f) => !SHARED.includes(f.key)) }));
  return groups;
}

export const featureLabels = (cards) => {
  const map = {};
  cards?.conditions.forEach((c) => c.features.forEach((f) => { map[f.key] = f; }));
  return map;
};

export function formatReading(f, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (f.kind === 'num') return `${Number.isInteger(v) ? v : Number(v).toFixed(1)}${f.unit ? ` ${f.unit}` : ''}`;
  return f.options?.[String(v)] ?? String(v);
}

export default function VitalsForm({ value, onChange, idPrefix = 'v', only }) {
  const cards = useModelCards();
  if (!cards) return null;
  const groups = groupFeatures(cards).filter((g) => !only || g.key === 'general' || g.key === only);
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="stack" style={{ '--stack': '20px' }}>
      {groups.map((g) => (
        <fieldset key={g.key} className="reading-group">
          <legend>{g.label}</legend>
          <div className="form-grid">
            {g.features.map((f) => {
              const id = `${idPrefix}-${f.key}`;
              return (
                <div className="field" key={f.key}>
                  <label htmlFor={id}>{f.label}{f.unit ? <span className="muted small"> ({f.unit})</span> : null}</label>
                  {f.kind === 'num' ? (
                    <>
                      <input id={id} className="input" type="number" inputMode="decimal" step="any" min={f.min} max={f.max}
                        value={value[f.key] ?? ''} aria-describedby={f.normal ? `${id}-n` : undefined}
                        onChange={(e) => set(f.key, e.target.value)} />
                      {f.normal && <span className="hint small muted" id={`${id}-n`}>Usual: {f.normal[0]}–{f.normal[1]}</span>}
                    </>
                  ) : (
                    <select id={id} className="input" value={value[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
                      <option value="">Not recorded</option>
                      {Object.entries(f.options).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export const toNumbers = (v) => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x != null).map(([k, x]) => [k, Number(x)]));
