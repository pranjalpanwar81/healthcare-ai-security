// Clinical risk models trained offline on real public datasets (see ml/scripts/train.py) and
// evaluated here in plain JavaScript, so the live service needs no Python.
//
// On load every model file must (1) pass the signed integrity manifest (see integrity.js) and
// (2) reproduce the probabilities scikit-learn produced for the stored parity cases. A model that
// fails either check is never used.
//
// Explanations are exact interventional Shapley values (SHAP) of the predicted probability,
// computed over every feature coalition against a fixed background sample from the training data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyModels } from './integrity.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'models');
const CONDITIONS = ['heart', 'diabetes'];
const sigmoid = (v) => 1 / (1 + Math.exp(-v));

// ---------- Model evaluation ----------
function linearRow(cond, row) {
  const { categories, mean, scale } = cond.preprocessing;
  const out = [];
  for (const f of cond.features) {
    if (f.kind === 'cat') for (const v of categories[f.key]) out.push(row[f.key] === v ? 1 : 0);
    else out.push(row[f.key]);
  }
  return out.map((v, i) => (v - mean[i]) / scale[i]);
}

function walk(tree, x, strictLess) {
  let n = 0;
  while (tree.left[n] !== -1) {
    const v = x[tree.feature[n]];
    // XGBoost compares in 32-bit floating point; scikit-learn trees in 64-bit.
    n = (strictLess ? Math.fround(v) < Math.fround(tree.threshold[n]) : v <= tree.threshold[n]) ? tree.left[n] : tree.right[n];
  }
  return tree.value[n];
}

function predict(cond, model, row) {
  if (model.space === 'linear') {
    const x = linearRow(cond, row);
    if (model.kind === 'logistic') return sigmoid(model.intercept + model.coef.reduce((s, c, i) => s + c * x[i], 0));
    let a = x;
    model.weights.forEach((W, l) => {
      const z = W.map((wRow, o) => model.biases[l][o] + wRow.reduce((s, w, i) => s + w * a[i], 0));
      a = l < model.weights.length - 1 ? z.map((v) => (v > 0 ? v : 0)) : z;
    });
    return sigmoid(a[0]);
  }
  const x = cond.features.map((f) => row[f.key]);
  if (model.kind === 'forest') return model.trees.reduce((s, t) => s + walk(t, x, false), 0) / model.trees.length;
  return sigmoid(model.trees.reduce((s, t) => s + walk(t, x, true), model.baseMargin));
}

// ---------- Exact Shapley values ----------
function shapley(cond, model, row, background) {
  const keys = cond.features.map((f) => f.key);
  const d = keys.length;
  const n = 1 << d;
  const fact = [1];
  for (let i = 1; i <= d; i += 1) fact[i] = fact[i - 1] * i;
  const weight = Array.from({ length: d }, (_, s) => (fact[s] * fact[d - s - 1]) / fact[d]);
  const value = new Float64Array(n);
  const mix = {};
  for (let mask = 0; mask < n; mask += 1) {
    let total = 0;
    for (const bg of background) {
      for (let j = 0; j < d; j += 1) mix[keys[j]] = (mask >> j) & 1 ? row[keys[j]] : bg[j];
      total += predict(cond, model, mix);
    }
    value[mask] = total / background.length;
  }
  const phi = new Array(d).fill(0);
  for (let mask = 0; mask < n; mask += 1) {
    let bits = 0;
    for (let v = mask; v; v &= v - 1) bits += 1;
    for (let j = 0; j < d; j += 1) if (!((mask >> j) & 1)) phi[j] += weight[bits] * (value[mask | (1 << j)] - value[mask]);
  }
  return { phi, base: value[0], full: value[n - 1] };
}

// ---------- Loading ----------
const state = { conditions: {}, integrity: null };

function load() {
  state.integrity = verifyModels(DIR, CONDITIONS.map((c) => `${c}.json`));
  for (const key of CONDITIONS) {
    const file = path.join(DIR, `${key}.json`);
    const check = state.integrity.files[`${key}.json`];
    if (!check?.ok) continue;
    const cond = JSON.parse(fs.readFileSync(file, 'utf8'));
    cond.preprocessing.categories = Object.fromEntries(Object.entries(cond.preprocessing.categories).map(([k, v]) => [k, v.map(Number)]));
    // Parity: the JavaScript evaluation must match scikit-learn on every stored case.
    let worst = 0;
    for (const c of cond.parity) {
      const row = prepare(cond, c.input).row;
      for (const [m, expected] of Object.entries(c.expected)) worst = Math.max(worst, Math.abs(predict(cond, cond.models[m], row) - expected));
    }
    check.parityError = worst;
    if (worst > 1e-6) { check.ok = false; check.reason = `Parity check failed (difference ${worst.toExponential(2)})`; continue; }
    state.conditions[key] = cond;
  }
}

// ---------- Inputs ----------
function prepare(cond, input) {
  const row = {};
  const provided = [];
  const missing = [];
  for (const f of cond.features) {
    const raw = input?.[f.key];
    let v = raw === '' || raw === null || raw === undefined ? NaN : Number(raw);
    if (Number.isFinite(v)) {
      if (f.kind === 'num') v = Math.min(f.max, Math.max(f.min, v));
      else if (!Object.keys(f.options).map(Number).includes(v)) v = NaN;
    }
    if (Number.isFinite(v)) { row[f.key] = v; provided.push(f.key); } else { row[f.key] = cond.preprocessing.medians[f.key]; missing.push(f.label); }
  }
  return { row, provided, missing };
}

const display = (f, v) => (f.kind === 'num' ? `${Number.isInteger(v) ? v : Number(v).toFixed(1)}${f.unit ? ` ${f.unit}` : ''}` : f.options[String(v)] ?? String(v));
const statusOf = (f, v) => {
  if (f.kind === 'cat' || !f.normal) return '';
  if (v > f.normal[1]) return f.kind === 'bin' ? 'present' : 'above the usual range';
  if (v < f.normal[0]) return 'below the usual range';
  return f.kind === 'bin' ? 'absent' : 'within the usual range';
};
const levelOf = (risk, threshold) => (risk >= threshold ? 'high' : risk >= threshold * 0.6 ? 'borderline' : 'low');

// ---------- Explanation ----------
function explainCondition(cond, input) {
  const { row, provided, missing } = prepare(cond, input);
  if (provided.length < Math.ceil(cond.features.length / 2)) {
    return { condition: cond.key, label: cond.label, available: false, reason: `Needs at least ${Math.ceil(cond.features.length / 2)} of ${cond.features.length} readings (${provided.length} given).`, missing };
  }
  const main = cond.models[cond.selected];
  const second = cond.models[cond.baseline];
  const risk = predict(cond, main, row);
  const { phi, base, full } = shapley(cond, main, row, cond.background);
  const contributions = cond.features.map((f, j) => ({
    key: f.key, label: f.label, unit: f.unit, kind: f.kind, value: provided.includes(f.key) ? row[f.key] : null,
    display: provided.includes(f.key) ? display(f, row[f.key]) : 'not measured', status: provided.includes(f.key) ? statusOf(f, row[f.key]) : 'not measured', impact: phi[j],
  })).sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  // Second opinion from a different model family, explained on a smaller background to stay fast.
  const secondRisk = predict(cond, second, row);
  const secondShap = shapley(cond, second, row, cond.background.slice(0, second.space === 'tree' && second.kind === 'forest' ? 4 : 16));
  const top = (vals) => vals.map((v, j) => [Math.abs(v), cond.features[j].key]).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, k]) => k);
  const shared = top(phi).filter((k) => top(secondShap.phi).includes(k));
  const flagged = risk >= main.threshold;
  const secondFlagged = secondRisk >= second.threshold;

  // Readings outside what the model saw in training (1st to 99th percentile) make the result less reliable.
  const outOfRange = cond.features.filter((f) => f.kind === 'num' && provided.includes(f.key))
    .filter((f) => row[f.key] < cond.trainingRange[f.key][0] || row[f.key] > cond.trainingRange[f.key][1])
    .map((f) => ({ label: f.label, value: display(f, row[f.key]), range: `${cond.trainingRange[f.key][0]}–${cond.trainingRange[f.key][1]}` }));

  // Counterfactual: move modifiable readings that raise the risk toward their usual range until it drops below the threshold.
  let counterfactual = null;
  if (flagged) {
    const trial = { ...row };
    const changes = [];
    for (const c of contributions.filter((x) => x.impact > 0 && x.value !== null)) {
      const f = cond.features.find((ff) => ff.key === c.key);
      if (!f.modifiable || !f.normal) continue;
      const target = row[f.key] > f.normal[1] ? f.normal[1] : row[f.key] < f.normal[0] ? f.normal[0] : null;
      if (target === null) continue;
      let done = false;
      for (let s = 1; s <= 20 && !done; s += 1) {
        trial[f.key] = row[f.key] + ((target - row[f.key]) * s) / 20;
        if (f.kind !== 'num') trial[f.key] = target;
        done = predict(cond, main, trial) < main.threshold;
      }
      changes.push({ feature: f.label, from: display(f, row[f.key]), to: display(f, Math.round(trial[f.key] * 10) / 10) });
      if (done) { counterfactual = { changes, newRisk: predict(cond, main, trial) }; break; }
    }
  }

  const reasons = contributions.filter((c) => c.impact > 0.01 && c.value !== null && !/within|absent/.test(c.status)).slice(0, 3);
  const level = levelOf(risk, main.threshold);
  const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const summary = level === 'low'
    ? `${cond.label} risk is low for these readings.`
    : `${cond.label} risk is ${level === 'high' ? 'raised' : 'borderline'}${reasons.length ? `, mainly because of ${reasons.map((r) => `${lowerFirst(r.label)} (${r.display})`).join(', ')}` : ''}.`;

  return {
    condition: cond.key, label: cond.label, available: true,
    risk, threshold: main.threshold, level, flagged,
    model: { name: main.name, testRocAuc: main.test.rocAuc, testRecall: main.test.recall },
    summary, contributions, baseValue: base, outputValue: full,
    faithfulness: { shapSum: phi.reduce((a, b) => a + b, 0), error: Math.abs(phi.reduce((a, b) => a + b, 0) - (full - base)) },
    secondOpinion: {
      name: second.name, risk: secondRisk, flagged: secondFlagged, agree: flagged === secondFlagged,
      sharedTopFactors: shared.map((k) => cond.features.find((f) => f.key === k).label),
    },
    outOfRange, counterfactual, missing,
  };
}

export function assess(input) {
  const results = CONDITIONS.filter((k) => state.conditions[k]).map((k) => explainCondition(state.conditions[k], input));
  return {
    results,
    integrity: { ok: state.integrity.ok, checkedAt: state.integrity.checkedAt },
    disclaimer: 'Decision support only, not a diagnosis. Models trained on public research datasets. Please discuss any result with your doctor.',
  };
}

/** Risk only, without explanations: used when a record is saved. */
export function quickRisk(input) {
  return CONDITIONS.filter((k) => state.conditions[k]).map((k) => {
    const cond = state.conditions[k];
    const { row, provided } = prepare(cond, input);
    if (provided.length < Math.ceil(cond.features.length / 2)) return null;
    const main = cond.models[cond.selected];
    const risk = predict(cond, main, row);
    return { condition: cond.key, label: cond.label, risk, level: levelOf(risk, main.threshold) };
  }).filter(Boolean);
}

export function modelCards() {
  return {
    integrity: state.integrity,
    conditions: CONDITIONS.filter((k) => state.conditions[k]).map((k) => {
      const c = state.conditions[k];
      const sel = c.models[c.selected];
      const sec = c.models[c.baseline];
      return {
        key: c.key, label: c.label, source: c.source, features: c.features, card: c.card,
        selected: { key: c.selected, name: sel.name, params: sel.params, threshold: sel.threshold, test: sel.test, testAtHalf: sel.testAtHalf },
        secondOpinion: { key: c.baseline, name: sec.name, threshold: sec.threshold, test: sec.test },
      };
    }),
  };
}

export const allFeatures = () => {
  const seen = new Map();
  for (const k of CONDITIONS) for (const f of state.conditions[k]?.features || []) if (!seen.has(f.key)) seen.set(f.key, f);
  return [...seen.values()];
};

load();
