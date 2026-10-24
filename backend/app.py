
import os
from datetime import datetime, timezone

import joblib
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=[
    "https://cardio-twin-ccmlijrml-keerthanakatumala-gmailcoms-projects.vercel.app"
])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
MODEL_PATH = os.path.join(
    BASE_DIR, "backend", "model", "cardiotwin_model.pkl"
)
LIVE_PATH = os.path.join(DATA_DIR, "live_readings.csv")

bundle = joblib.load(MODEL_PATH)
model = bundle["model"]
FEATURES = bundle["features"]

patients = pd.read_csv(os.path.join(DATA_DIR, "patients.csv"))
readings = pd.read_csv(
    os.path.join(DATA_DIR, "wearable_readings.csv")
)

LIVE_COLUMNS = [
    "patient_id", "timestamp", "heart_rate",
    "hrv", "sleep_hours", "steps"
]

if not os.path.exists(LIVE_PATH):
    pd.DataFrame(columns=LIVE_COLUMNS).to_csv(
        LIVE_PATH, index=False
    )


def get_all_readings(patient_id):
    """Combine original readings with incoming simulated readings."""
    live = pd.read_csv(LIVE_PATH)

    original = readings[
        readings["patient_id"] == patient_id
    ].copy()

    incoming = live[
        live["patient_id"] == patient_id
    ].copy()

    history = pd.concat(
        [original, incoming], ignore_index=True
    )

    history["timestamp"] = pd.to_datetime(
        history["timestamp"], utc=True, errors="coerce"
    )
    history = history.dropna(subset=["timestamp"])
    history = history.sort_values("timestamp")

    return history.reset_index(drop=True)


def make_prediction(patient_id):
    patient_rows = patients[
        patients["patient_id"] == patient_id
    ]

    if patient_rows.empty:
        return {"error": "Patient not found"}, 404

    history = get_all_readings(patient_id).tail(6)

    if len(history) < 6:
        return {
            "error": "At least six readings are required"
        }, 400

    p = patient_rows.iloc[0]

    features = {
        "age": p["age"],
        "bmi": p["bmi"],
        "hypertension": p["hypertension"],
        "diabetes": p["diabetes"],
        "heart_rate_mean_6h": history["heart_rate"].mean(),
        "heart_rate_std_6h": history["heart_rate"].std(),
        "heart_rate_latest": history["heart_rate"].iloc[-1],
        "hrv_mean_6h": history["hrv"].mean(),
        "hrv_latest": history["hrv"].iloc[-1],
        "sleep_mean_6h": history["sleep_hours"].mean(),
        "steps_mean_6h": history["steps"].mean()
    }

    X = pd.DataFrame([features], columns=FEATURES)

    probability = float(model.predict_proba(X)[0, 1])
    prediction = int(model.predict(X)[0])

    return {
        "patient_id": patient_id,
        "prediction": prediction,
        "synthetic_strain_probability": round(probability, 4),
        "prediction_horizon": "Next six hours",
        "model": bundle["model_name"],
        "disclaimer": (
            "Experimental synthetic-data output, not a clinical "
            "risk score, diagnosis, or emergency prediction."
        )
    }, 200


@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "project": "CardioTwin AI",
        "status": "running",
        "note": "Research prototype using synthetic data"
    })


@app.route("/api/patients", methods=["GET"])
def get_patients():
    return jsonify(
        patients.head(100).to_dict(orient="records")
    )


@app.route("/api/patient/<int:patient_id>", methods=["GET"])
def get_patient(patient_id):
    patient = patients[
        patients["patient_id"] == patient_id
    ]

    if patient.empty:
        return jsonify({"error": "Patient not found"}), 404

    history = get_all_readings(patient_id).copy()
    history["timestamp"] = history["timestamp"].astype(str)

    return jsonify({
        "patient": patient.iloc[0].to_dict(),
        "readings": history.to_dict(orient="records")
    })


@app.route("/api/predict/<int:patient_id>", methods=["GET"])
def predict(patient_id):
    result, status = make_prediction(patient_id)
    return jsonify(result), status


@app.route(
    "/api/patient/<int:patient_id>/reading",
    methods=["POST"]
)
def add_reading(patient_id):
    patient = patients[
        patients["patient_id"] == patient_id
    ]

    if patient.empty:
        return jsonify({"error": "Patient not found"}), 404

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Send a valid JSON object"}), 400

    required = ["heart_rate", "hrv", "sleep_hours", "steps"]
    missing = [key for key in required if key not in data]

    if missing:
        return jsonify({
            "error": "Missing required fields",
            "fields": missing
        }), 400

    try:
        values = {
            key: float(data[key])
            for key in required
        }
    except (TypeError, ValueError):
        return jsonify({
            "error": "All reading fields must be numeric"
        }), 400

    if not all(
        pd.notna(value) and abs(value) != float("inf")
        for value in values.values()
    ):
        return jsonify({
            "error": "Values must be finite numbers"
        }), 400

    if not (
        25 <= values["heart_rate"] <= 250
        and 0 <= values["hrv"] <= 300
        and 0 <= values["sleep_hours"] <= 24
        and 0 <= values["steps"] <= 100000
    ):
        return jsonify({
            "error": "Values are outside the accepted demo ranges"
        }), 400

    new_reading = {
        "patient_id": patient_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **values
    }

    pd.DataFrame(
        [new_reading], columns=LIVE_COLUMNS
    ).to_csv(
        LIVE_PATH,
        mode="a",
        header=False,
        index=False
    )

    prediction_result, prediction_status = make_prediction(
        patient_id
    )

    return jsonify({
        "message": "Synthetic wearable reading added successfully",
        "reading": new_reading,
        "prediction": prediction_result,
        "prediction_status": prediction_status
    }), 201


if __name__ == "__main__":
    app.run(debug=True, port=5000)
