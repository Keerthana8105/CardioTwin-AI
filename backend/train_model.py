
import os
import joblib
import numpy as np
import pandas as pd

from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    roc_auc_score
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
MODEL_DIR = os.path.join(BASE_DIR, "backend", "model")

os.makedirs(MODEL_DIR, exist_ok=True)

patients = pd.read_csv(os.path.join(DATA_DIR, "patients.csv"))
readings = pd.read_csv(
    os.path.join(DATA_DIR, "wearable_readings.csv")
)

readings["timestamp"] = pd.to_datetime(readings["timestamp"])
readings = readings.sort_values(["patient_id", "timestamp"])

# Combine historical patient information with sensor readings.
data = readings.merge(patients, on="patient_id", how="inner")

samples = []

for patient_id, group in data.groupby("patient_id"):
    group = group.sort_values("timestamp").reset_index(drop=True)

    # Six past hours are required for features.
    # Six future hours are required to define the outcome.
    for t in range(6, len(group) - 6):
        past = group.iloc[t - 6:t]
        future = group.iloc[t:t + 6]
        patient = group.iloc[t]

        # Synthetic outcome: elevated strain indicator in
        # the following six hours. These thresholds are for
        # software demonstration only, not clinical cutoffs.
        future_mean_hr = future["heart_rate"].mean()
        future_mean_hrv = future["hrv"].mean()

        elevated_strain = int(
            future_mean_hr > 80 or future_mean_hrv < 40
        )

        samples.append({
            "patient_id": patient_id,
            "age": patient["age"],
            "bmi": patient["bmi"],
            "hypertension": patient["hypertension"],
            "diabetes": patient["diabetes"],
            "heart_rate_mean_6h": past["heart_rate"].mean(),
            "heart_rate_std_6h": past["heart_rate"].std(),
            "heart_rate_latest": past["heart_rate"].iloc[-1],
            "hrv_mean_6h": past["hrv"].mean(),
            "hrv_latest": past["hrv"].iloc[-1],
            "sleep_mean_6h": past["sleep_hours"].mean(),
            "steps_mean_6h": past["steps"].mean(),
            "target": elevated_strain
        })

dataset = pd.DataFrame(samples)

feature_columns = [
    "age",
    "bmi",
    "hypertension",
    "diabetes",
    "heart_rate_mean_6h",
    "heart_rate_std_6h",
    "heart_rate_latest",
    "hrv_mean_6h",
    "hrv_latest",
    "sleep_mean_6h",
    "steps_mean_6h"
]

X = dataset[feature_columns]
y = dataset["target"]
groups = dataset["patient_id"]

print("Training samples:", len(dataset))
print("Outcome distribution:")
print(y.value_counts().sort_index())
print("Positive outcome rate:", round(y.mean() * 100, 2), "%")

if y.nunique() < 2:
    raise ValueError(
        "Only one outcome class was generated. "
        "Review the synthetic label thresholds."
    )

# Keep each patient's samples entirely in either train or test.
splitter = GroupShuffleSplit(
    n_splits=1, test_size=0.2, random_state=42
)
train_idx, test_idx = next(splitter.split(X, y, groups))

X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]

models = {
    "Logistic Regression": Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("model", LogisticRegression(
            class_weight="balanced", max_iter=1000
        ))
    ]),
    "Random Forest": Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("model", RandomForestClassifier(
            n_estimators=200,
            max_depth=8,
            min_samples_leaf=5,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1
        ))
    ])
}

results = []

for name, model in models.items():
    model.fit(X_train, y_train)

    predictions = model.predict(X_test)
    probabilities = model.predict_proba(X_test)[:, 1]

    auc = (
        roc_auc_score(y_test, probabilities)
        if y_test.nunique() == 2 else float("nan")
    )

    print(f"\n===== {name} =====")
    print(classification_report(
        y_test, predictions, zero_division=0
    ))
    print("Confusion matrix:")
    print(confusion_matrix(y_test, predictions))
    print("ROC-AUC:", round(auc, 4))

    results.append((name, model, auc))

# Choose using ROC-AUC on held-out patients.
valid_results = [
    item for item in results if np.isfinite(item[2])
]

if not valid_results:
    raise ValueError("ROC-AUC unavailable; check test labels.")

best_name, best_model, best_auc = max(
    valid_results, key=lambda item: item[2]
)

joblib.dump(
    {
        "model": best_model,
        "features": feature_columns,
        "model_name": best_name,
        "target_definition": (
            "Synthetic elevated-strain indicator over the "
            "next six hours; not a clinical risk assessment."
        )
    },
    os.path.join(MODEL_DIR, "cardiotwin_model.pkl")
)

print("\nBest baseline:", best_name)
print("Held-out patient ROC-AUC:", round(best_auc, 4))
print("Model saved to:", os.path.join(
    MODEL_DIR, "cardiotwin_model.pkl"
))
print("Note: synthetic labels do not demonstrate clinical validity.")
