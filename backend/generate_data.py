
import os
import numpy as np
import pandas as pd

# Reproducible synthetic data
np.random.seed(42)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

NUM_PATIENTS = 300
DAYS = 7
READINGS_PER_DAY = 24

patients = []
readings = []

for patient_id in range(1, NUM_PATIENTS + 1):
    age = np.random.randint(25, 81)
    sex = np.random.choice(["Male", "Female"])
    bmi = round(np.random.normal(26, 4), 1)
    hypertension = np.random.choice([0, 1], p=[0.7, 0.3])
    diabetes = np.random.choice([0, 1], p=[0.8, 0.2])

    patients.append({
        "patient_id": patient_id,
        "age": age,
        "sex": sex,
        "bmi": max(16, bmi),
        "hypertension": hypertension,
        "diabetes": diabetes
    })

    baseline_hr = 70 + 0.15 * (age - 40) + 5 * hypertension
    baseline_hrv = max(15, 60 - 0.35 * age - 5 * hypertension)

    for hour in range(DAYS * READINGS_PER_DAY):
        timestamp = (
            pd.Timestamp("2026-01-01")
            + pd.Timedelta(hours=hour)
        )

        sleep_hours = np.random.normal(7, 1)
        steps = max(0, int(np.random.normal(3500, 1800)))
        heart_rate = np.random.normal(baseline_hr, 8)
        hrv = max(5, np.random.normal(baseline_hrv, 10))

        readings.append({
            "patient_id": patient_id,
            "timestamp": timestamp,
            "heart_rate": round(heart_rate, 1),
            "hrv": round(hrv, 1),
            "sleep_hours": round(
                np.clip(sleep_hours, 3, 12), 1
            ),
            "steps": steps
        })

patients_df = pd.DataFrame(patients)
readings_df = pd.DataFrame(readings)

patients_df.to_csv(
    os.path.join(DATA_DIR, "patients.csv"), index=False
)

readings_df.to_csv(
    os.path.join(DATA_DIR, "wearable_readings.csv"),
    index=False
)

print("Synthetic data generated successfully!")
print("Patients:", len(patients_df))
print("Wearable readings:", len(readings_df))
print("Saved to:", DATA_DIR)
