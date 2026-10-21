// Black-box model with post-hoc explanations, run beside the interpretable model in xai.js.
//
// Model: a multilayer perceptron (12 -> 32 -> 16 -> 5, ReLU, softmax) trained with Adam on the
// same synthetic cohort as the logistic regression.
//
// Explanations:
//  - Shapley values (SHAP), computed exactly over all 2^12 feature coalitions against a fixed
//    background sample of patients (interventional Shapley). By construction they add up to
//    f(x) - E[f(background)], which is checked and reported for every explanation.
//  - Integrated gradients from an "average patient" baseline, a gradient-based second opinion
//    whose completeness error is also reported.
//  - Agreement with the interpretable model: same outcome, and overlap of the top factors.
import { FEATURES, CLASSES, explain as explainLinear, cohort, linearProbs, linearAttributions, cleanInput } from './xai.js';

const D = FEATURES.length;
const K = CLASSES.length;
const H1 = 32;
const H2 = 16;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Network ----------
function init(seed) {
  const rand = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
  const layer = (nIn, nOut) => {
    const w = new Float64Array(nIn * nOut);
    const scale = Math.sqrt(2 / nIn);
    for (let i = 0; i < w.length; i += 1) w[i] = gauss() * scale;
    return { w, b: new Float64Array(nOut), nIn, nOut };
  };
  return [layer(D, H1), layer(H1, H2), layer(H2, K)];
}

function dense(L, x, out) {
  for (let o = 0; o < L.nOut; o += 1) {
    let s = L.b[o];
    const base = o * L.nIn;
    for (let i = 0; i < L.nIn; i += 1) s += L.w[base + i] * x[i];
    out[o] = s;
  }
  return out;
}

function softmaxInPlace(v) {
  let m = -Infinity;
  for (let i = 0; i < v.length; i += 1) if (v[i] > m) m = v[i];
  let s = 0;
  for (let i = 0; i < v.length; i += 1) { v[i] = Math.exp(v[i] - m); s += v[i]; }
  for (let i = 0; i < v.length; i += 1) v[i] /= s;
  return v;
}

/** Forward pass. Returns every activation so training and gradients can reuse them. */
function forward(net, x) {
  const z1 = dense(net[0], x, new Float64Array(H1));
  const a1 = z1.map((v) => (v > 0 ? v : 0));
  const z2 = dense(net[1], a1, new Float64Array(H2));
  const a2 = z2.map((v) => (v > 0 ? v : 0));
  const p = softmaxInPlace(dense(net[2], a2, new Float64Array(K)));
  return { x, z1, a1, z2, a2, p };
}

// Allocation-free probability for the hot Shapley loop.
const s1 = new Float64Array(H1);
const s2 = new Float64Array(H2);
const s3 = new Float64Array(K);
function probOf(net, x, c) {
  dense(net[0], x, s1);
  for (let i = 0; i < H1; i += 1) if (s1[i] < 0) s1[i] = 0;
  dense(net[1], s1, s2);
  for (let i = 0; i < H2; i += 1) if (s2[i] < 0) s2[i] = 0;
  dense(net[2], s2, s3);
  return softmaxInPlace(s3)[c];
}

/** Backpropagate dL/dlogits = g3 through the network. Accumulates weight gradients and returns dL/dx. */
function backward(net, f, g3, grads) {
  const [L1, L2, L3] = net;
  const g2 = new Float64Array(H2);
  for (let o = 0; o < K; o += 1) {
    const base = o * H2;
    if (grads) grads[2].b[o] += g3[o];
    for (let i = 0; i < H2; i += 1) {
      if (grads) grads[2].w[base + i] += g3[o] * f.a2[i];
      g2[i] += L3.w[base + i] * g3[o];
    }
  }
  for (let i = 0; i < H2; i += 1) if (f.z2[i] <= 0) g2[i] = 0;
  const g1 = new Float64Array(H1);
  for (let o = 0; o < H2; o += 1) {
    const base = o * H1;
    if (grads) grads[1].b[o] += g2[o];
    for (let i = 0; i < H1; i += 1) {
      if (grads) grads[1].w[base + i] += g2[o] * f.a1[i];
      g1[i] += L2.w[base + i] * g2[o];
    }
  }
  for (let i = 0; i < H1; i += 1) if (f.z1[i] <= 0) g1[i] = 0;
  const gx = new Float64Array(D);
  for (let o = 0; o < H1; o += 1) {
    const base = o * D;
    if (grads) grads[0].b[o] += g1[o];
    for (let i = 0; i < D; i += 1) {
      if (grads) grads[0].w[base + i] += g1[o] * f.x[i];
      gx[i] += L1.w[base + i] * g1[o];
    }
  }
  return gx;
}

function train() {
  const { train: trainSet, z } = cohort();
  const X = trainSet.map((r) => Float64Array.from(z(r.x)));
  const Y = trainSet.map((r) => r.y);
  const net = init(42);
  const zeros = () => net.map((L) => ({ w: new Float64Array(L.w.length), b: new Float64Array(L.b.length) }));
  const m = zeros();
  const v = zeros();
  const lr = 0.006;
  const beta1 = 0.9;
  const beta2 = 0.999;
  const l2 = 1e-4;
  const batch = 64;
  const rand = rng(7);
  const order = X.map((_, i) => i);
  let step = 0;
  for (let epoch = 0; epoch < 20; epoch += 1) {
    for (let i = order.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (let start = 0; start < order.length; start += batch) {
      const grads = zeros();
      const idx = order.slice(start, start + batch);
      for (const n of idx) {
        const f = forward(net, X[n]);
        const g3 = Float64Array.from(f.p, (p, c) => (p - (Y[n] === c ? 1 : 0)) / idx.length);
        backward(net, f, g3, grads);
      }
      step += 1;
      const c1 = 1 - beta1 ** step;
      const c2 = 1 - beta2 ** step;
      net.forEach((L, li) => {
        for (const key of ['w', 'b']) {
          const P = L[key]; const G = grads[li][key]; const M = m[li][key]; const V = v[li][key];
          for (let i = 0; i < P.length; i += 1) {
            const g = G[i] + (key === 'w' ? l2 * P[i] : 0);
            M[i] = beta1 * M[i] + (1 - beta1) * g;
            V[i] = beta2 * V[i] + (1 - beta2) * g * g;
            P[i] -= (lr * (M[i] / c1)) / (Math.sqrt(V[i] / c2) + 1e-8);
          }
        }
      });
    }
  }
  return net;
}

const net = train();

// Fixed background: 16 patients spread across the training cohort.
const BACKGROUND = (() => {
  const { train: t, z } = cohort();
  return Array.from({ length: 16 }, (_, i) => Float64Array.from(z(t[Math.floor((i * t.length) / 16)].x)));
})();

const FACT = [1];
for (let i = 1; i <= D; i += 1) FACT[i] = FACT[i - 1] * i;
const WEIGHT = Array.from({ length: D }, (_, s) => (FACT[s] * FACT[D - s - 1]) / FACT[D]);
const popcount = (n) => { let c = 0; for (let v = n; v; v &= v - 1) c += 1; return c; };
const POP = Array.from({ length: 1 << D }, (_, mask) => popcount(mask));

/** Exact interventional Shapley values of P(class c) for one patient. */
function shapley(x, c) {
  const n = 1 << D;
  const value = new Float64Array(n);
  const mix = new Float64Array(D);
  for (let mask = 0; mask < n; mask += 1) {
    let total = 0;
    for (const bg of BACKGROUND) {
      for (let j = 0; j < D; j += 1) mix[j] = (mask >> j) & 1 ? x[j] : bg[j];
      total += probOf(net, mix, c);
    }
    value[mask] = total / BACKGROUND.length;
  }
  const phi = new Float64Array(D);
  for (let mask = 0; mask < n; mask += 1) {
    const w = WEIGHT[POP[mask]];
    for (let j = 0; j < D; j += 1) {
      if ((mask >> j) & 1) continue;
      phi[j] += w * (value[mask | (1 << j)] - value[mask]);
    }
  }
  return { phi: Array.from(phi), base: value[0], full: value[n - 1] };
}

/** Integrated gradients of P(class c) from the average patient (all zeros after scaling). */
function integratedGradients(x, c, steps = 48) {
  const total = new Float64Array(D);
  for (let s = 1; s <= steps; s += 1) {
    const a = (s - 0.5) / steps;
    const xi = Float64Array.from(x, (v) => v * a);
    const f = forward(net, xi);
    // d p_c / d logits = p_c (1[c] - p)
    const g3 = Float64Array.from(f.p, (p, k) => f.p[c] * ((k === c ? 1 : 0) - p));
    const gx = backward(net, f, g3, null);
    for (let j = 0; j < D; j += 1) total[j] += gx[j] / steps;
  }
  const ig = Array.from(total, (g, j) => g * x[j]);
  const fx = forward(net, x).p[c];
  const f0 = forward(net, new Float64Array(D)).p[c];
  return { ig, gap: Math.abs(ig.reduce((a, b) => a + b, 0) - (fx - f0)) };
}

const topKeys = (scores, n = 3) => scores.map((s, j) => [Math.abs(s), j]).sort((a, b) => b[0] - a[0]).slice(0, n).map(([, j]) => j);

// ---------- Model card for the neural network and the cross-model comparison ----------
const card = (() => {
  const { test, z } = cohort();
  const confusion = Array.from({ length: K }, () => Array(K).fill(0));
  let agree = 0;
  for (const r of test) {
    const zx = Float64Array.from(z(r.x));
    const p = forward(net, zx).p;
    const pred = p.indexOf(Math.max(...p));
    confusion[r.y][pred] += 1;
    const lp = linearProbs(Array.from(zx));
    if (lp.indexOf(Math.max(...lp)) === pred) agree += 1;
  }
  // Explanation agreement and global importance, measured on 120 held-out patients with integrated gradients.
  const sample = test.filter((_, i) => i % 10 === 0);
  const imp = new Float64Array(D);
  let overlap = 0;
  for (const r of sample) {
    const zx = Float64Array.from(z(r.x));
    const p = forward(net, zx).p;
    const c = p.indexOf(Math.max(...p));
    const { ig } = integratedGradients(zx, c, 16);
    ig.forEach((v, j) => { imp[j] += Math.abs(v); });
    const a = topKeys(ig);
    const b = topKeys(linearAttributions(Array.from(zx), c));
    overlap += a.filter((j) => b.includes(j)).length / 3;
  }
  const correct = confusion.reduce((s, row, i) => s + row[i], 0);
  const perClass = CLASSES.map((cl, i) => {
    const tp = confusion[i][i];
    const fp = confusion.reduce((s, row, r) => s + (r === i ? 0 : row[i]), 0);
    const fn = confusion[i].reduce((s, val, p) => s + (p === i ? 0 : val), 0);
    const precision = tp / (tp + fp || 1);
    const recall = tp / (tp + fn || 1);
    return { key: cl.key, label: cl.label, precision, recall, f1: (2 * precision * recall) / (precision + recall || 1), support: tp + fn };
  });
  const totalImp = imp.reduce((a, b) => a + b, 0) || 1;
  return {
    type: 'Neural network (multilayer perceptron, 12 → 32 → 16 → 5, ReLU)',
    explanation: 'Exact Shapley values (SHAP) over all 4,096 feature coalitions, with integrated gradients as a cross-check',
    parameters: net.reduce((s, L) => s + L.w.length + L.b.length, 0),
    accuracy: correct / test.length,
    macroF1: perClass.reduce((s, c) => s + c.f1, 0) / K,
    perClass,
    confusion,
    globalImportance: FEATURES.map((f, j) => ({ key: f.key, label: f.label, share: imp[j] / totalImp })).sort((a, b) => b.share - a.share),
    comparison: {
      outcomeAgreement: agree / test.length,
      topFactorOverlap: overlap / sample.length,
      measuredOn: `${test.length} held-out patients (outcomes) and ${sample.length} (explanations)`,
    },
  };
})();

export const neuralCard = () => card;

const STATUS = (f, v) => (v > f.normal[1] ? 'above the usual range' : v < f.normal[0] ? 'below the usual range' : 'within the usual range');
const lower = (s) => s.split(' ').map((w) => (/[A-Z].*[A-Z]|^[A-Z][a-z]?\d|^[A-Z]-/.test(w) ? w : w.toLowerCase())).join(' ');

function explainNeural(input) {
  const values = cleanInput(input);
  const { z, mean } = cohort();
  const x = Float64Array.from(z(values.map((v, j) => (v === null ? mean[j] : v))));
  const p = forward(net, x).p;
  const top = p.indexOf(Math.max(...p));
  const cls = CLASSES[top];
  const { phi, base, full } = shapley(x, top);
  const { ig, gap } = integratedGradients(x, top);
  const contributions = FEATURES.map((f, j) => ({
    key: f.key, label: f.label, unit: f.unit, value: values[j], normal: f.normal,
    status: values[j] === null ? 'not provided' : STATUS(f, values[j]),
    impact: phi[j], ig: ig[j],
  })).sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  const drivers = contributions.filter((c) => c.impact > 0.01 && c.value !== null);
  const abnormal = drivers.filter((c) => c.status !== 'within the usual range').slice(0, 3);
  const reasons = (abnormal.length ? abnormal : drivers).slice(0, 3);
  const summary = cls.key === 'healthy'
    ? 'The neural network flags nothing for these readings.'
    : `The neural network flags ${lower(cls.label)} mainly because ${reasons.map((d) => `${lower(d.label)} is ${d.status}`).join(', ') || 'of several small differences'}.`;
  const shapSum = phi.reduce((a, b) => a + b, 0);
  return {
    prediction: { key: cls.key, label: cls.label, tone: cls.tone, confidence: p[top] },
    probabilities: CLASSES.map((c, i) => ({ key: c.key, label: c.label, probability: p[i] })).sort((a, b) => b.probability - a.probability),
    contributions,
    summary,
    method: 'Exact Shapley values of the predicted probability, against 16 background patients',
    baseValue: base,
    outputValue: full,
    faithfulness: { shapSum, expected: full - base, error: Math.abs(shapSum - (full - base)), integratedGradientsError: gap },
  };
}

/** Both models, both explanations, and whether they agree. */
export function explainAll(input) {
  const linear = explainLinear(input);
  const neural = explainNeural(input);
  const topLinear = linear.contributions.filter((c) => c.value !== null).slice(0, 3).map((c) => c.key);
  const topNeural = neural.contributions.filter((c) => c.value !== null).slice(0, 3).map((c) => c.key);
  const shared = topLinear.filter((k) => topNeural.includes(k));
  const sameOutcome = linear.prediction.key === neural.prediction.key;
  return {
    ...linear,
    neural,
    agreement: {
      sameOutcome,
      sharedTopFactors: shared.map((k) => FEATURES.find((f) => f.key === k).label),
      level: sameOutcome && shared.length >= 2 ? 'strong' : sameOutcome ? 'partial' : 'disagree',
      message: sameOutcome
        ? `Both models agree: ${linear.prediction.label.toLowerCase()}.${shared.length ? ` Shared main factors: ${shared.map((k) => lower(FEATURES.find((f) => f.key === k).label)).join(', ')}.` : ''}`
        : `The models disagree (${linear.prediction.label} vs ${neural.prediction.label}). Treat this result with extra caution and review it with a clinician.`,
    },
  };
}
