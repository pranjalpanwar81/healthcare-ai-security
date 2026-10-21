"""
HealthGuard model training pipeline.

For each condition (diabetes on the Pima Indians Diabetes data, heart disease on the UCI
Cleveland data):
  1. Clean the data (biologically impossible zeros and '?' become missing values).
  2. Hold out a stratified 20% test set.
  3. Compare Logistic Regression, Random Forest, XGBoost and a neural network (MLP) with nested,
     stratified 5-fold cross-validation (inner grid search on ROC-AUC).
  4. Select the model with the best mean cross-validated ROC-AUC, refit it on the training split
     and evaluate it once on the held-out test set (ROC-AUC, F1, recall, precision, accuracy, Brier).
  5. Check fairness (metrics by sex and age group), compute SHAP global importance, and save plots.
  6. Export the selected model and the logistic-regression baseline as JSON that the Node server
     evaluates without Python, plus parity cases proving the export reproduces scikit-learn exactly.

Run:  ml/.venv/Scripts/python ml/scripts/train.py
"""
import json
import math
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap
from sklearn.base import clone
from sklearn.calibration import calibration_curve
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, brier_score_loss, f1_score, precision_score,
                             recall_score, roc_auc_score, roc_curve)
from sklearn.model_selection import GridSearchCV, StratifiedKFold, cross_val_predict, train_test_split
from sklearn.neural_network import MLPClassifier
from xgboost import XGBClassifier

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "ml" / "data"
REPORTS = ROOT / "ml" / "reports"
OUT = ROOT / "server" / "models"
SEED = 2026
REPORTS.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

# ---------- Dataset definitions ----------
# kind: "num" (continuous), "bin" (0/1), "cat" (categorical codes, one-hot encoded for linear/MLP models)
DIABETES = {
    "key": "diabetes",
    "label": "Type 2 diabetes",
    "source": "Pima Indians Diabetes Database (National Institute of Diabetes and Digestive and Kidney Diseases; UCI / Kaggle mirror), 768 patients, all women aged 21+",
    "file": "pima-indians-diabetes.csv",
    "features": [
        {"key": "pregnancies", "label": "Number of pregnancies", "unit": "", "kind": "num", "normal": [0, 6], "min": 0, "max": 17, "modifiable": False},
        {"key": "glucose", "label": "Plasma glucose (2 h OGTT)", "unit": "mg/dL", "kind": "num", "normal": [70, 139], "min": 40, "max": 250, "modifiable": True},
        {"key": "bloodPressure", "label": "Diastolic blood pressure", "unit": "mmHg", "kind": "num", "normal": [60, 80], "min": 30, "max": 130, "modifiable": True},
        {"key": "skinThickness", "label": "Triceps skinfold thickness", "unit": "mm", "kind": "num", "normal": [10, 30], "min": 5, "max": 100, "modifiable": True},
        {"key": "insulin", "label": "2-hour serum insulin", "unit": "µU/mL", "kind": "num", "normal": [16, 166], "min": 10, "max": 900, "modifiable": True},
        {"key": "bmi", "label": "Body mass index", "unit": "kg/m²", "kind": "num", "normal": [18.5, 24.9], "min": 15, "max": 70, "modifiable": True},
        {"key": "pedigree", "label": "Diabetes pedigree (family history)", "unit": "", "kind": "num", "normal": [0, 0.5], "min": 0.05, "max": 2.5, "modifiable": False},
        {"key": "age", "label": "Age", "unit": "years", "kind": "num", "normal": [21, 45], "min": 18, "max": 90, "modifiable": False},
    ],
    "missing_zero": ["glucose", "bloodPressure", "skinThickness", "insulin", "bmi"],
    "groups": {"Age under 35": lambda d: d["age"] < 35, "Age 35 and over": lambda d: d["age"] >= 35},
}

HEART = {
    "key": "heart",
    "label": "Coronary heart disease",
    "source": "UCI Heart Disease, Cleveland Clinic Foundation (Detrano et al., 1989), 303 patients",
    "file": "cleveland-heart.csv",
    "features": [
        {"key": "age", "label": "Age", "unit": "years", "kind": "num", "normal": [29, 55], "min": 18, "max": 90, "modifiable": False},
        {"key": "sex", "label": "Sex", "unit": "", "kind": "bin", "options": {"0": "Female", "1": "Male"}, "normal": [0, 1], "modifiable": False},
        {"key": "chestPain", "label": "Chest pain type", "unit": "", "kind": "cat", "options": {"1": "Typical angina", "2": "Atypical angina", "3": "Non-anginal pain", "4": "No symptoms"}, "modifiable": False},
        {"key": "restingBP", "label": "Resting systolic blood pressure", "unit": "mmHg", "kind": "num", "normal": [90, 129], "min": 80, "max": 220, "modifiable": True},
        {"key": "cholesterol", "label": "Serum cholesterol", "unit": "mg/dL", "kind": "num", "normal": [125, 199], "min": 100, "max": 600, "modifiable": True},
        {"key": "fastingSugar", "label": "Fasting blood sugar over 120 mg/dL", "unit": "", "kind": "bin", "options": {"0": "No", "1": "Yes"}, "normal": [0, 0], "modifiable": True},
        {"key": "restingECG", "label": "Resting ECG", "unit": "", "kind": "cat", "options": {"0": "Normal", "1": "ST-T wave abnormality", "2": "Left ventricular hypertrophy"}, "modifiable": False},
        {"key": "maxHeartRate", "label": "Maximum heart rate on exercise test", "unit": "bpm", "kind": "num", "normal": [140, 202], "min": 60, "max": 220, "modifiable": True},
        {"key": "exerciseAngina", "label": "Chest pain on exercise", "unit": "", "kind": "bin", "options": {"0": "No", "1": "Yes"}, "normal": [0, 0], "modifiable": False},
        {"key": "stDepression", "label": "ST depression on exercise", "unit": "mm", "kind": "num", "normal": [0, 1], "min": 0, "max": 7, "modifiable": False},
        {"key": "stSlope", "label": "ST segment slope", "unit": "", "kind": "cat", "options": {"1": "Upsloping", "2": "Flat", "3": "Downsloping"}, "modifiable": False},
        {"key": "vessels", "label": "Major vessels coloured by fluoroscopy", "unit": "", "kind": "num", "normal": [0, 0], "min": 0, "max": 3, "modifiable": False},
        {"key": "thal", "label": "Thallium stress test", "unit": "", "kind": "cat", "options": {"3": "Normal", "6": "Fixed defect", "7": "Reversible defect"}, "modifiable": False},
    ],
    "missing_zero": [],
    "groups": {"Women": lambda d: d["sex"] == 0, "Men": lambda d: d["sex"] == 1,
               "Age under 55": lambda d: d["age"] < 55, "Age 55 and over": lambda d: d["age"] >= 55},
}


def load(spec):
    keys = [f["key"] for f in spec["features"]]
    df = pd.read_csv(DATA / spec["file"], header=None, na_values="?")
    df.columns = keys + ["target"]
    for k in spec["missing_zero"]:
        df.loc[df[k] == 0, k] = np.nan
    df["target"] = (df["target"] > 0).astype(int)
    return df[keys], df["target"].to_numpy()


# ---------- Preprocessing that the server reproduces exactly ----------
class Prep:
    """Median imputation; for linear/MLP models also one-hot encoding of categoricals and standard scaling."""

    def __init__(self, spec):
        self.spec = spec

    def fit(self, X):
        self.medians = {c: float(X[c].median()) for c in X.columns}
        self.cats = {f["key"]: [float(v) for v in sorted(map(float, f["options"]))] for f in self.spec["features"] if f["kind"] == "cat"}
        dense = self.expand(self.impute(X))
        self.mean = dense.mean(axis=0)
        self.scale = dense.std(axis=0, ddof=0)
        self.scale[self.scale == 0] = 1.0
        return self

    def impute(self, X):
        return X.fillna(self.medians)

    def expand(self, X):
        cols = []
        for f in self.spec["features"]:
            k = f["key"]
            if f["kind"] == "cat":
                for v in self.cats[k]:
                    cols.append((X[k].to_numpy() == v).astype(float))
            else:
                cols.append(X[k].to_numpy(dtype=float))
        return np.column_stack(cols)

    def linear(self, X):
        return (self.expand(self.impute(X)) - self.mean) / self.scale

    def tree(self, X):
        return self.impute(X).to_numpy(dtype=float)

    def export(self):
        return {"medians": self.medians, "categories": self.cats, "mean": self.mean.tolist(), "scale": self.scale.tolist()}


# ---------- Candidate models ----------
CANDIDATES = {
    "logistic": ("Logistic regression", "linear", LogisticRegression(max_iter=5000), {"C": [0.01, 0.1, 1.0, 10.0]}),
    "forest": ("Random forest", "tree", RandomForestClassifier(n_estimators=300, random_state=SEED, n_jobs=-1),
               {"max_depth": [3, 5, 8], "min_samples_leaf": [1, 5]}),
    "xgboost": ("XGBoost", "tree", XGBClassifier(n_estimators=200, random_state=SEED, eval_metric="logloss", n_jobs=4, verbosity=0),
                {"max_depth": [2, 3, 4], "learning_rate": [0.03, 0.1], "subsample": [0.8]}),
    "mlp": ("Neural network (MLP)", "linear", MLPClassifier(hidden_layer_sizes=(32, 16), max_iter=3000, early_stopping=True, random_state=SEED),
            {"alpha": [1e-3, 1e-2, 1e-1], "learning_rate_init": [1e-3, 1e-2]}),
}


def metrics(y, p, threshold=0.5):
    yhat = (p >= threshold).astype(int)
    return {
        "rocAuc": float(roc_auc_score(y, p)),
        "f1": float(f1_score(y, yhat)),
        "recall": float(recall_score(y, yhat)),
        "precision": float(precision_score(y, yhat, zero_division=0)),
        "accuracy": float(accuracy_score(y, yhat)),
        "brier": float(brier_score_loss(y, p)),
    }


def nested_cv(spec, X, y):
    outer = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    results = {}
    for key, (name, space, est, grid) in CANDIDATES.items():
        folds = []
        for tr, va in outer.split(X, y):
            prep = Prep(spec).fit(X.iloc[tr])
            Xt = prep.linear(X.iloc[tr]) if space == "linear" else prep.tree(X.iloc[tr])
            Xv = prep.linear(X.iloc[va]) if space == "linear" else prep.tree(X.iloc[va])
            gs = GridSearchCV(clone(est), grid, scoring="roc_auc", cv=StratifiedKFold(3, shuffle=True, random_state=SEED), n_jobs=1)
            gs.fit(Xt, y[tr])
            folds.append(metrics(y[va], gs.predict_proba(Xv)[:, 1]))
        summary = {m: {"mean": float(np.mean([f[m] for f in folds])), "sd": float(np.std([f[m] for f in folds]))} for m in folds[0]}
        results[key] = {"name": name, "cv": summary}
        print(f"  {name:22s} ROC-AUC {summary['rocAuc']['mean']:.3f} ± {summary['rocAuc']['sd']:.3f}  recall {summary['recall']['mean']:.3f}")
    return results


def fit_final(spec, key, X, y):
    name, space, est, grid = CANDIDATES[key]
    prep = Prep(spec).fit(X)
    Xt = prep.linear(X) if space == "linear" else prep.tree(X)
    gs = GridSearchCV(clone(est), grid, scoring="roc_auc", cv=StratifiedKFold(5, shuffle=True, random_state=SEED), n_jobs=1)
    gs.fit(Xt, y)
    # Decision threshold from out-of-fold training predictions (Youden's J), never from the test set.
    oof = cross_val_predict(clone(gs.best_estimator_), Xt, y, cv=StratifiedKFold(5, shuffle=True, random_state=SEED), method="predict_proba")[:, 1]
    fpr, tpr, thr = roc_curve(y, oof)
    threshold = float(min(max(thr[np.argmax(tpr - fpr)], 0.05), 0.95))
    return prep, gs.best_estimator_, gs.best_params_, threshold


# ---------- Export to JSON the server can evaluate ----------
def export_sklearn_tree(t):
    tree = t.tree_
    value = tree.value[:, 0, :]
    prob = (value[:, 1] / value.sum(axis=1)).tolist()
    return {"left": tree.children_left.tolist(), "right": tree.children_right.tolist(),
            "feature": tree.feature.tolist(), "threshold": tree.threshold.tolist(), "value": prob}


def export_xgb(model):
    booster = model.get_booster()
    dumps = [json.loads(d) for d in booster.get_dump(dump_format="json")]
    cfg = json.loads(booster.save_config())
    base = cfg["learner"]["learner_model_param"]["base_score"]
    base = float(str(base).strip("[]"))
    trees = []
    for root in dumps:
        nodes = {}
        stack = [root]
        while stack:
            n = stack.pop()
            nodes[n["nodeid"]] = n
            stack.extend(n.get("children", []))
        size = max(nodes) + 1
        left, right, feat, thr, val = [-1] * size, [-1] * size, [-2] * size, [0.0] * size, [0.0] * size
        for i, n in nodes.items():
            if "leaf" in n:
                val[i] = n["leaf"]
            else:
                feat[i] = int(n["split"][1:]) if str(n["split"]).startswith("f") else int(n["split"])
                thr[i] = n["split_condition"]
                left[i], right[i] = n["yes"], n["no"]
        trees.append({"left": left, "right": right, "feature": feat, "threshold": thr, "value": val})
    return {"kind": "xgboost", "baseMargin": math.log(base / (1 - base)), "trees": trees, "strictLess": True}


def export_model(key, model):
    if key == "logistic":
        return {"kind": "logistic", "coef": model.coef_[0].tolist(), "intercept": float(model.intercept_[0])}
    if key == "forest":
        return {"kind": "forest", "trees": [export_sklearn_tree(t) for t in model.estimators_], "strictLess": False}
    if key == "xgboost":
        return export_xgb(model)
    if key == "mlp":
        return {"kind": "mlp", "weights": [w.T.tolist() for w in model.coefs_], "biases": [b.tolist() for b in model.intercepts_]}
    raise ValueError(key)


def train_condition(spec):
    print(f"\n=== {spec['label']} ===")
    X, y = load(spec)
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, stratify=y, random_state=SEED)
    print(f"  {len(X)} patients, {int(y.sum())} positive ({y.mean():.0%}); train {len(Xtr)} / test {len(Xte)}")

    comparison = nested_cv(spec, Xtr, ytr)
    best = max(comparison, key=lambda k: comparison[k]["cv"]["rocAuc"]["mean"])
    # Second opinion: the interpretable baseline, or the best other family when logistic regression wins.
    second = "logistic" if best != "logistic" else max((k for k in comparison if k != "logistic"), key=lambda k: comparison[k]["cv"]["rocAuc"]["mean"])
    print(f"  selected: {comparison[best]['name']}; second opinion: {comparison[second]['name']}")

    exports, tests = {}, {}
    for key in (best, second):
        prep, model, params, threshold = fit_final(spec, key, Xtr, ytr)
        space = CANDIDATES[key][1]
        Xe = prep.linear(Xte) if space == "linear" else prep.tree(Xte)
        p = model.predict_proba(Xe)[:, 1]
        tests[key] = {"metrics": metrics(yte, p, threshold), "default": metrics(yte, p), "threshold": threshold, "p": p, "prep": prep, "model": model, "space": space}
        exports[key] = {"name": CANDIDATES[key][0], "space": space, "params": {k: (v if not isinstance(v, np.generic) else v.item()) for k, v in params.items()},
                        "test": tests[key]["metrics"], "testAtHalf": tests[key]["default"], "threshold": threshold, **export_model(key, model)}
        print(f"  test {CANDIDATES[key][0]:22s} ROC-AUC {tests[key]['metrics']['rocAuc']:.3f}  threshold {threshold:.2f}  recall {tests[key]['metrics']['recall']:.3f}  precision {tests[key]['metrics']['precision']:.3f}  Brier {tests[key]['metrics']['brier']:.3f}")

    sel = tests[best]
    prep = sel["prep"]

    # Fairness: the selected model's test metrics within each subgroup.
    fairness = []
    for gname, rule in spec["groups"].items():
        mask = rule(Xte).to_numpy()
        if mask.sum() >= 10 and len(set(yte[mask])) == 2:
            m = metrics(yte[mask], sel["p"][mask], sel["threshold"])
            fairness.append({"group": gname, "n": int(mask.sum()), **{k: m[k] for k in ("rocAuc", "recall", "precision", "accuracy")}})

    # Calibration curve.
    frac, mean_pred = calibration_curve(yte, sel["p"], n_bins=5, strategy="quantile")

    # SHAP global importance on the test set (explainer matched to model type), on original features.
    background = prep.impute(Xtr).sample(n=min(32, len(Xtr)), random_state=SEED)
    feats = [f["key"] for f in spec["features"]]

    def f_raw(arr):
        df = pd.DataFrame(arr, columns=feats)
        Xm = prep.linear(df) if sel["space"] == "linear" else prep.tree(df)
        return sel["model"].predict_proba(Xm)[:, 1]

    explainer = shap.Explainer(f_raw, background.to_numpy(), algorithm="exact")
    sv = explainer(prep.impute(Xte).to_numpy())
    imp = np.abs(sv.values).mean(axis=0)
    importance = sorted(({"key": k, "label": f["label"], "share": float(v / imp.sum())} for k, f, v in zip(feats, spec["features"], imp)), key=lambda r: -r["share"])

    # Plots for the report.
    plt.figure()
    shap.summary_plot(sv.values, prep.impute(Xte), feature_names=[f["label"] for f in spec["features"]], show=False)
    plt.tight_layout(); plt.savefig(REPORTS / f"{spec['key']}-shap-summary.png", dpi=160); plt.close("all")
    plt.figure(figsize=(5, 5))
    for key, t in tests.items():
        fpr, tpr, _ = roc_curve(yte, t["p"])
        plt.plot(fpr, tpr, label=f"{CANDIDATES[key][0]} (AUC {t['metrics']['rocAuc']:.2f})")
    plt.plot([0, 1], [0, 1], "--", color="grey"); plt.xlabel("False positive rate"); plt.ylabel("True positive rate")
    plt.title(f"{spec['label']}: ROC on held-out test set"); plt.legend(loc="lower right"); plt.tight_layout()
    plt.savefig(REPORTS / f"{spec['key']}-roc.png", dpi=160); plt.close("all")
    plt.figure(figsize=(5, 5))
    plt.plot(mean_pred, frac, "o-", label=CANDIDATES[best][0]); plt.plot([0, 1], [0, 1], "--", color="grey")
    plt.xlabel("Predicted risk"); plt.ylabel("Observed rate"); plt.title(f"{spec['label']}: calibration"); plt.legend(); plt.tight_layout()
    plt.savefig(REPORTS / f"{spec['key']}-calibration.png", dpi=160); plt.close("all")

    imputed_train = prep.impute(Xtr)
    out = {
        "key": spec["key"], "label": spec["label"], "source": spec["source"], "features": spec["features"],
        "preprocessing": prep.export(),
        "selected": best, "baseline": second,
        "models": exports,
        "background": background.to_numpy().tolist(),
        "trainingRange": {k: [float(imputed_train[k].quantile(0.01)), float(imputed_train[k].quantile(0.99))] for k in feats},
        "card": {
            "patients": len(X), "positives": int(y.sum()), "train": len(Xtr), "test": len(Xte),
            "comparison": comparison,
            "selectionRule": "Highest mean ROC-AUC in nested 5-fold cross-validation on the training split",
            "fairness": fairness,
            "calibration": {"predicted": mean_pred.tolist(), "observed": frac.tolist()},
            "globalImportance": importance,
        },
        # Parity cases: the server must reproduce these probabilities from the JSON alone.
        "parity": [{"input": {k: (None if pd.isna(v) else float(v)) for k, v in Xte.iloc[i].items()},
                    "expected": {key: float(t["p"][i]) for key, t in tests.items()}} for i in range(0, len(Xte), max(1, len(Xte) // 12))],
    }
    for f in spec["features"]:
        f.pop("kind_fn", None)
    (OUT / f"{spec['key']}.json").write_text(json.dumps(out, separators=(",", ":")))
    print(f"  exported server/models/{spec['key']}.json")
    return out


if __name__ == "__main__":
    summary = {}
    for spec in (DIABETES, HEART):
        res = train_condition(spec)
        summary[spec["key"]] = {"selected": res["models"][res["selected"]]["name"], "test": res["models"][res["selected"]]["test"],
                                "comparison": {k: v["cv"]["rocAuc"] for k, v in res["card"]["comparison"].items()}}
    (REPORTS / "summary.json").write_text(json.dumps(summary, indent=2))
    print("\nDone. Reports in ml/reports, models in server/models.")
