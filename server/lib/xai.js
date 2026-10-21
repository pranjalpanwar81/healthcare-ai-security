// Explainable risk model.
// A multinomial logistic regression trained at start-up on a seeded synthetic cohort.
// Because the model is additive in its inputs, each feature's contribution to a prediction
// can be computed exactly (this is what SHAP values reduce to for linear models), so the
// explanation is the model itself rather than an approximation of it.

export const FEATURES = [
  { key: 'age', label: 'Age', unit: 'years', min: 1, max: 100, normal: [18, 60] },
  { key: 'bmi', label: 'Body mass index', unit: 'kg/m²', min: 12, max: 50, normal: [18.5, 24.9] },
  { key: 'systolic', label: 'Systolic blood pressure', unit: 'mmHg', min: 80, max: 220, normal: [90, 120] },
  { key: 'diastolic', label: 'Diastolic blood pressure', unit: 'mmHg', min: 40, max: 140, normal: [60, 80] },
  { key: 'heartRate', label: 'Heart rate', unit: 'bpm', min: 35, max: 180, normal: [60, 100] },
  { key: 'temperature', label: 'Temperature', unit: '°C', min: 34, max: 42, normal: [36.1, 37.2] },
  { key: 'glucose', label: 'Fasting glucose', unit: 'mg/dL', min: 50, max: 400, normal: [70, 99] },
  { key: 'hba1c', label: 'HbA1c', unit: '%', min: 3.5, max: 15, normal: [4, 5.6] },
  { key: 'wbc', label: 'White blood cell count', unit: '×10⁹/L', min: 1, max: 30, normal: [4, 11] },
  { key: 'crp', label: 'C-reactive protein', unit: 'mg/L', min: 0, max: 300, normal: [0, 10] },
  { key: 'coughDays', label: 'Days with cough', unit: 'days', min: 0, max: 30, normal: [0, 0] },
  { key: 'fatigue', label: 'Fatigue', unit: '/10', min: 0, max: 10, normal: [0, 3] },
];

export const CLASSES = [
  { key: 'healthy', label: 'No condition flagged', tone: 'ok' },
  { key: 'hypertension', label: 'Hypertension risk', tone: 'warn' },
  { key: 'diabetes', label: 'Diabetes risk', tone: 'warn' },
  { key: 'bacterial', label: 'Possible bacterial infection', tone: 'alert' },
  { key: 'viral', label: 'Possible viral infection', tone: 'warn' },
];

// Mean and spread of each feature for each class in the synthetic cohort.
const PROFILES = {
  healthy:      { age: [38, 13], bmi: [23, 2.6], systolic: [116, 9], diastolic: [75, 6], heartRate: [72, 8], temperature: [36.7, 0.3], glucose: [88, 9], hba1c: [5.1, 0.35], wbc: [7, 1.5], crp: [3, 2.5], coughDays: [0.3, 0.8], fatigue: [2, 1.5] },
  hypertension: { age: [57, 11], bmi: [28.5, 3.8], systolic: [150, 13], diastolic: [94, 8], heartRate: [80, 10], temperature: [36.7, 0.3], glucose: [100, 14], hba1c: [5.6, 0.5], wbc: [7.4, 1.6], crp: [5, 3.5], coughDays: [0.4, 1], fatigue: [4, 2] },
  diabetes:     { age: [54, 12], bmi: [31, 4.2], systolic: [131, 13], diastolic: [83, 8], heartRate: [80, 10], temperature: [36.7, 0.3], glucose: [160, 35], hba1c: [7.9, 1.1], wbc: [7.8, 1.7], crp: [6, 4], coughDays: [0.4, 1], fatigue: [5, 2] },
  bacterial:    { age: [42, 17], bmi: [25, 3.8], systolic: [120, 12], diastolic: [77, 8], heartRate: [102, 12], temperature: [38.8, 0.6], glucose: [104, 16], hba1c: [5.3, 0.5], wbc: [15.5, 3], crp: [95, 40], coughDays: [6, 3.5], fatigue: [7, 1.6] },
  viral:        { age: [34, 15], bmi: [24, 3.4], systolic: [118, 10], diastolic: [76, 7], heartRate: [91, 10], temperature: [38.1, 0.5], glucose: [94, 12], hba1c: [5.2, 0.4], wbc: [5.6, 1.6], crp: [16, 10], coughDays: [4, 2.6], fatigue: [6, 1.8] },
};
const PRIORS = { healthy: 0.32, hypertension: 0.18, diabetes: 0.14, bacterial: 0.14, viral: 0.22 };

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

function generate(n, seed) {
  const rand = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    let r = rand();
    let cls = CLASSES[0].key;
    for (const c of CLASSES) { r -= PRIORS[c.key]; if (r <= 0) { cls = c.key; break; } }
    const x = FEATURES.map((f) => {
      const [mu, sd] = PROFILES[cls][f.key];
      return Math.min(f.max, Math.max(f.min, mu + sd * gauss()));
    });
    rows.push({ x, y: CLASSES.findIndex((c) => c.key === cls) });
  }
  return rows;
}

const softmax = (logits) => {
  const m = Math.max(...logits);
  const e = logits.map((l) => Math.exp(l - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
};

function train() {
  const all = generate(6000, 20261021);
  const trainSet = all.slice(0, 4800);
  const testSet = all.slice(4800);
  const d = FEATURES.length;
  const k = CLASSES.length;

  const mean = Array(d).fill(0);
  const std = Array(d).fill(0);
  for (const r of trainSet) r.x.forEach((v, j) => { mean[j] += v / trainSet.length; });
  for (const r of trainSet) r.x.forEach((v, j) => { std[j] += (v - mean[j]) ** 2 / trainSet.length; });
  for (let j = 0; j < d; j += 1) std[j] = Math.sqrt(std[j]) || 1;
  const z = (x) => x.map((v, j) => (v - mean[j]) / std[j]);

  const W = Array.from({ length: k }, () => Array(d).fill(0));
  const b = Array(k).fill(0);
  const Z = trainSet.map((r) => z(r.x));
  const lr = 0.5;
  const l2 = 1e-3;
  for (let epoch = 0; epoch < 300; epoch += 1) {
    const gW = Array.from({ length: k }, () => Array(d).fill(0));
    const gb = Array(k).fill(0);
    for (let i = 0; i < Z.length; i += 1) {
      const p = softmax(W.map((w, c) => b[c] + w.reduce((s, wj, j) => s + wj * Z[i][j], 0)));
      for (let c = 0; c < k; c += 1) {
        const err = p[c] - (trainSet[i].y === c ? 1 : 0);
        gb[c] += err / Z.length;
        for (let j = 0; j < d; j += 1) gW[c][j] += (err * Z[i][j]) / Z.length;
      }
    }
    for (let c = 0; c < k; c += 1) {
      b[c] -= lr * gb[c];
      for (let j = 0; j < d; j += 1) W[c][j] -= lr * (gW[c][j] + l2 * W[c][j]);
    }
  }

  const model = { W, b, mean, std, z, trainSet, testSet };
  const confusion = Array.from({ length: k }, () => Array(k).fill(0));
  const absContrib = Array(d).fill(0);
  for (const r of testSet) {
    const zx = z(r.x);
    const p = probs(model, zx);
    const pred = p.indexOf(Math.max(...p));
    confusion[r.y][pred] += 1;
    for (let j = 0; j < d; j += 1) absContrib[j] += Math.abs(W[pred][j] * zx[j]) / testSet.length;
  }
  const correct = confusion.reduce((s, row, i) => s + row[i], 0);
  const perClass = CLASSES.map((c, i) => {
    const tp = confusion[i][i];
    const fp = confusion.reduce((s, row, r) => s + (r === i ? 0 : row[i]), 0);
    const fn = confusion[i].reduce((s, v, p) => s + (p === i ? 0 : v), 0);
    const precision = tp / (tp + fp || 1);
    const recall = tp / (tp + fn || 1);
    return { key: c.key, label: c.label, precision, recall, f1: (2 * precision * recall) / (precision + recall || 1), support: tp + fn };
  });
  const totalImp = absContrib.reduce((a, v) => a + v, 0);
  model.card = {
    type: 'Multinomial logistic regression (interpretable by design)',
    explanation: 'Exact additive feature attributions (linear SHAP)',
    trainedOn: `${trainSet.length} synthetic patient profiles`,
    testedOn: `${testSet.length} held-out profiles`,
    accuracy: correct / testSet.length,
    macroF1: perClass.reduce((s, c) => s + c.f1, 0) / k,
    perClass,
    confusion,
    classes: CLASSES.map((c) => c.label),
    globalImportance: FEATURES.map((f, j) => ({ key: f.key, label: f.label, share: absContrib[j] / totalImp }))
      .sort((a, c) => c.share - a.share),
    limitations: [
      'Trained on synthetic data, not real patients. For demonstration and decision support only.',
      'It never replaces a clinician. Every result must be reviewed by a doctor.',
      'Only the 12 listed measurements are considered; history, imaging and examination are not.',
    ],
  };
  return model;
}

function probs(model, zx) {
  return softmax(model.W.map((w, c) => model.b[c] + w.reduce((s, wj, j) => s + wj * zx[j], 0)));
}

const model = train();
export const modelCard = () => model.card;

// Shared with the neural model so both learn from and are tested on exactly the same cohort.
export const cohort = () => ({ train: model.trainSet, test: model.testSet, z: model.z, mean: model.mean });
export const linearProbs = (zx) => probs(model, zx);
/** Exact linear attributions for class c (contribution to that class's log-odds vs an average patient). */
export const linearAttributions = (zx, c) => FEATURES.map((_, j) => model.W[c][j] * zx[j]);

export function cleanInput(input) {
  return FEATURES.map((f) => {
    const raw = Number(input?.[f.key]);
    if (!Number.isFinite(raw)) return null;
    return Math.min(f.max, Math.max(f.min, raw));
  });
}

function describe(f, value) {
  const [lo, hi] = f.normal;
  if (value > hi) return 'above the usual range';
  if (value < lo) return 'below the usual range';
  return 'within the usual range';
}

/** Predict, explain and suggest the smallest single change that would alter the result. */
export function explain(input) {
  const values = cleanInput(input);
  const missing = FEATURES.filter((_, j) => values[j] === null).map((f) => f.label);
  // Missing measurements fall back to the population average, which contributes nothing.
  const x = values.map((v, j) => (v === null ? model.mean[j] : v));
  const zx = model.z(x);
  const p = probs(model, zx);
  const top = p.indexOf(Math.max(...p));

  const contributions = FEATURES.map((f, j) => ({
    key: f.key,
    label: f.label,
    unit: f.unit,
    value: values[j],
    normal: f.normal,
    status: values[j] === null ? 'not provided' : describe(f, values[j]),
    // Contribution to the log-odds of the predicted class relative to an average patient.
    impact: values[j] === null ? 0 : model.W[top][j] * zx[j],
  })).sort((a, c) => Math.abs(c.impact) - Math.abs(a.impact));

  const drivers = contributions.filter((c) => c.impact > 0.15).slice(0, 3);
  const against = contributions.filter((c) => c.impact < -0.15).slice(0, 2);
  const cls = CLASSES[top];
  const lower = (s) => s.split(' ').map((w) => (/[A-Z].*[A-Z]|^[A-Z][a-z]?\d|^[A-Z]-/.test(w) ? w : w.toLowerCase())).join(' ');
  let summary;
  if (cls.key === 'healthy') {
    summary = drivers.length
      ? `Nothing was flagged. The readings that most support this are ${drivers.map((d) => lower(d.label)).join(', ')}.`
      : 'Nothing was flagged. Your readings look close to an average healthy adult.';
  } else {
    // In plain words, name only the out-of-range readings; in-range ones still appear in the bars.
    const abnormal = contributions.filter((c) => c.impact > 0.15 && c.status !== 'within the usual range' && c.value !== null).slice(0, 3);
    const reasons = abnormal.length ? abnormal : drivers;
    summary = `${cls.label} was flagged mainly because ${reasons.map((d) => `${lower(d.label)} is ${d.status}`).join(', ') || 'of a combination of small differences'}.`;
    if (against.length) summary += ` ${against.map((d) => d.label).join(' and ')} pointed the other way.`;
  }

  // Counterfactual: move the strongest drivers toward their normal range, one at a time and
  // cumulatively, and report the smallest set of changes that alters the result.
  let counterfactual = null;
  if (cls.key !== 'healthy') {
    const trial = [...x];
    const changes = [];
    for (const c of contributions.filter((item) => item.impact > 0 && item.value !== null).slice(0, 4)) {
      const j = FEATURES.findIndex((f) => f.key === c.key);
      const f = FEATURES[j];
      if (c.value >= f.normal[0] && c.value <= f.normal[1]) continue;
      const target = c.value > f.normal[1] ? f.normal[1] : f.normal[0];
      let flipped = null;
      for (let step = 1; step <= 20 && !flipped; step += 1) {
        trial[j] = c.value + ((target - c.value) * step) / 20;
        const pt = probs(model, model.z(trial));
        const newTop = pt.indexOf(Math.max(...pt));
        if (newTop !== top) flipped = CLASSES[newTop].label;
      }
      changes.push({ feature: f.label, from: c.value, to: Math.round(trial[j] * 10) / 10, unit: f.unit });
      if (flipped) { counterfactual = { changes, newResult: flipped }; break; }
    }
  }
  return {
    prediction: { key: cls.key, label: cls.label, tone: cls.tone, confidence: p[top] },
    probabilities: CLASSES.map((c, i) => ({ key: c.key, label: c.label, probability: p[i] }))
      .sort((a, c) => c.probability - a.probability),
    contributions,
    summary,
    counterfactual,
    missing,
    disclaimer: 'Decision support only. Not a diagnosis. Please discuss any result with your doctor.',
  };
}

