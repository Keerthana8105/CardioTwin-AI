# CardioTwin AI: An Explainable Cardiovascular Risk Digital Twin

## Overview
CardioTwin AI is an experimental digital health twin prototype that demonstrates how synthetic patient records and wearable readings can be used with machine learning to explore cardiovascular-related signals and generate model predictions.

**Important:** This project uses synthetic data and artificial labels. It is not clinically validated and must not be used for medical diagnosis or treatment decisions.

## Features
- Synthetic patient and wearable-data generation
- Patient selection and monitoring dashboard
- Heart rate, heart rate variability (HRV), sleep, and step inputs
- Machine-learning prediction endpoint
- Interactive wearable-reading simulator
- React-based dashboard connected to a Flask API
- Experimental prediction details and probability visualization

## Technology Stack
- Frontend: React, Vite, CSS, Recharts, Lucide React
- Backend: Python, Flask, Flask-CORS
- Machine learning: scikit-learn, pandas, joblib
- Data: Synthetic CSV datasets

## Project Structure
- `frontend/` — React user interface
- `backend/` — Flask API and model-training scripts
- `data/` — Synthetic patient and wearable datasets
- `docs/` — Architecture diagram and project presentation

## Running Locally
1. Generate the synthetic data using the backend data-generation script.
2. Train the model using the training script.
3. Install the backend dependencies and start the Flask server.
4. Install the frontend dependencies and start the Vite development server.
5. Open the local frontend URL and interact with the demo.

Use the dependency files and commands provided in the project. Keep credentials in environment variables and never commit secrets.

## Limitations
The dataset and target labels are synthetic. Model probabilities and classes reflect experimental model behavior, not validated clinical risk estimates.


