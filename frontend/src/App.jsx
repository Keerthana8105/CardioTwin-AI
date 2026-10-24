
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  HeartPulse,
  Moon,
  Footprints,
  RefreshCw,
  ShieldAlert,
  BrainCircuit,
  Watch,
  CheckCircle,
  LayoutDashboard,
  Users,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import "./App.css";

const API_BASE_URL = "https://cardiotwin-ai-1.onrender.com";

// Make requests to the deployed Flask backend.
async function request(url, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${url}`, options);
  } catch {
    throw new Error(
      "Cannot connect to the backend. Check the Render service and CORS settings."
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || data.message || `Request failed: ${response.status}`
    );
  }

  return data;
}

function getNumber(data, keys, fallback = 0) {
  for (const key of keys) {
    const value = Number(data?.[key]);

    if (
      data?.[key] !== undefined &&
      data?.[key] !== null &&
      Number.isFinite(value)
    ) {
      return value;
    }
  }

  return fallback;
}

function getArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.readings)) return data.readings;
  if (Array.isArray(data?.wearable_readings)) {
    return data.wearable_readings;
  }
  if (Array.isArray(data?.history)) return data.history;
  if (Array.isArray(data?.data)) return data.data;

  return [];
}

function formatTimestamp(value, index) {
  if (!value) return `Reading ${index + 1}`;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState("1");
  const [patient, setPatient] = useState(null);
  const [readings, setReadings] = useState([]);
  const [prediction, setPrediction] = useState(null);

  const [form, setForm] = useState({
    heart_rate: "88",
    hrv: "42",
    sleep_hours: "7",
    steps: "1200",
  });

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load patient details, readings, and model prediction.
  const loadDashboard = useCallback(async (id = patientId) => {
    if (!id) return;

    setLoading(true);
    setError("");

    try {
      const [patientData, predictionData] = await Promise.all([
        request(`/api/patient/${id}`),
        request(`/api/predict/${id}`),
      ]);

      setPatient(patientData.patient || patientData);

      const history = getArray(patientData);

      const normalized = history
        .map((reading, index) => ({
          ...reading,

          heart_rate: getNumber(reading, [
            "heart_rate",
            "Heart_Rate",
            "HR",
            "heartRate",
          ]),

          hrv: getNumber(reading, ["hrv", "HRV"]),

          sleep_hours: getNumber(reading, [
            "sleep_hours",
            "Sleep_Hours",
            "sleep",
          ]),

          steps: getNumber(reading, ["steps", "Steps"]),

          timestamp:
            reading.timestamp ||
            reading.date ||
            reading.datetime ||
            `Reading ${index + 1}`,
        }))
        .sort((a, b) => {
          const timeA = new Date(a.timestamp).getTime();
          const timeB = new Date(b.timestamp).getTime();

          if (!Number.isFinite(timeA) || !Number.isFinite(timeB)) {
            return 0;
          }

          return timeA - timeB;
        });

      setReadings(normalized);
      setPrediction(predictionData);
    } catch (err) {
      setError(err.message || "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  // Load the available patient list.
  const loadPatients = useCallback(async () => {
    try {
      const data = await request("/api/patients");

      const list = Array.isArray(data)
        ? data
        : data.patients || [];

      setPatients(list);

      if (list.length > 0) {
        const firstId = String(
          list[0].patient_id ?? list[0].id ?? 1
        );

        setPatientId((current) =>
          list.some(
            (p) => String(p.patient_id ?? p.id) === current
          )
            ? current
            : firstId
        );
      }
    } catch (err) {
      setError(`Could not load patients: ${err.message}`);
    }
  }, []);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  useEffect(() => {
    if (patientId) {
      loadDashboard(patientId);
    }
  }, [patientId, loadDashboard]);

  // Update simulator form fields.
  const handleChange = (event) => {
    setForm((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
  };

  // Send a simulated wearable reading to Flask.
  const handleSubmit = async (event) => {
    event.preventDefault();

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        heart_rate: Number(form.heart_rate),
        hrv: Number(form.hrv),
        sleep_hours: Number(form.sleep_hours),
        steps: Number(form.steps),
      };

      const result = await request(
        `/api/patient/${patientId}/reading`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (
        result.prediction &&
        typeof result.prediction === "object"
      ) {
        setPrediction(result.prediction);
      }

      await loadDashboard(patientId);

      setSuccess(
        "Synthetic reading saved. Patient history and prediction refreshed."
      );
    } catch (err) {
      setError(
        err.message || "Could not add the wearable reading."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const latest = readings.length
    ? readings[readings.length - 1]
    : null;

  const probability = getNumber(
    prediction,
    [
      "synthetic_strain_probability",
      "probability",
      "risk_probability",
      "strain_probability",
      "risk_score",
    ],
    NaN
  );

  const displayProbability = Number.isFinite(probability)
    ? `${Math.round(
        probability <= 1 ? probability * 100 : probability
      )}%`
    : "--";

  const predictionLabel =
    prediction?.prediction_label ||
    prediction?.label ||
    (prediction?.prediction === 1
      ? "Synthetic strain flag"
      : prediction?.prediction === 0
        ? "No synthetic strain flag"
        : prediction?.risk_level) ||
    "Awaiting prediction";

  const patientName =
    patient?.name ||
    patient?.patient_name ||
    `Patient ${patientId}`;

  const chartData = readings.slice(-30).map(
    (reading, index) => ({
      ...reading,
      label: formatTimestamp(reading.timestamp, index),
    })
  );

  const navItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
    },
    {
      id: "monitoring",
      label: "Patient Monitoring",
      icon: HeartPulse,
    },
    {
      id: "predictions",
      label: "AI Predictions",
      icon: BrainCircuit,
    },
  ];

  const refreshButton = (
    <button
      className="refresh"
      type="button"
      onClick={() => loadDashboard(patientId)}
      disabled={loading}
    >
      <RefreshCw size={16} />
      {loading ? "Refreshing..." : "Refresh"}
    </button>
  );

  const patientSelector = (
    <div className="toolbar">
      <label htmlFor="patient-select">
        Select patient
      </label>

      <select
        id="patient-select"
        value={patientId}
        onChange={(event) =>
          setPatientId(event.target.value)
        }
      >
        {patients.length === 0 && (
          <option value={patientId}>
            {`Patient ${patientId}`}
          </option>
        )}

        {patients.map((p) => {
          const id = p.patient_id ?? p.id;

          return (
            <option key={id} value={String(id)}>
              {p.name ||
                p.patient_name ||
                `Patient ${id}`}
            </option>
          );
        })}
      </select>

      <span>{patientName}</span>
    </div>
  );

  // Heart-rate chart.
  const heartRateChart = (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <h3>Wearable Heart Rate Trend</h3>
          <p>Latest readings returned by the backend</p>
        </div>

        <span className="chart-tag">SYNTHETIC DATA</span>
      </div>

      <div className="chart">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid
                stroke="#26384b"
                strokeDasharray="3 3"
              />

              <XAxis
                dataKey="label"
                stroke="#8395ab"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />

              <YAxis
                stroke="#8395ab"
                tick={{ fontSize: 10 }}
              />

              <Tooltip
                contentStyle={{
                  background: "#0e1a2a",
                  border: "1px solid #30445a",
                  borderRadius: 8,
                  color: "#eaf1fb",
                }}
              />

              <Line
                type="monotone"
                dataKey="heart_rate"
                name="Heart Rate"
                stroke="#42d6c5"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#42d6c5" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty">
            {loading
              ? "Loading readings..."
              : "No readings returned by the API"}
          </div>
        )}
      </div>
    </div>
  );

  // Prediction summary.
  const predictionPanel = (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <h3>Model Prediction</h3>
          <p>Experimental synthetic-data output</p>
        </div>

        <BrainCircuit color="#42d6c5" />
      </div>

      <div className="prediction-circle">
        <div>
          <strong>{displayProbability}</strong>
          <span>Model probability</span>
        </div>
      </div>

      <div className="prediction-label">
        {String(predictionLabel)}
      </div>

      <p className="horizon">
        {prediction?.prediction_horizon ||
          "Prediction horizon: next six hours"}
      </p>

      {prediction?.model && (
        <p className="horizon">
          Model: {prediction.model}
        </p>
      )}

      <button
        className="primary-button"
        type="button"
        onClick={() => loadDashboard(patientId)}
        disabled={loading}
      >
        <RefreshCw size={15} />
        Refresh Prediction
      </button>
    </div>
  );

  // Patient information.
  const patientInfoPanel = (
    <div className="panel patient-panel">
      <div className="panel-heading">
        <div>
          <h3>Patient Information</h3>
          <p>Synthetic patient profile returned by the API</p>
        </div>

        <Users color="#42d6c5" />
      </div>

      <div className="patient-details">
        {Object.entries(patient || {})
          .filter(
            ([, value]) =>
              value === null || typeof value !== "object"
          )
          .slice(0, 12)
          .map(([key, value]) => (
            <div className="detail" key={key}>
              <span>{key.replaceAll("_", " ")}</span>
              <strong>{String(value ?? "--")}</strong>
            </div>
          ))}

        {(!patient ||
          Object.keys(patient).length === 0) && (
          <p className="empty">
            Patient information unavailable.
          </p>
        )}
      </div>
    </div>
  );

  // Wearable simulator form.
  const wearableSimulator = (
    <section className="panel simulator-panel">
      <div className="panel-heading">
        <div>
          <h3>Wearable Simulator</h3>
          <p>Submit a synthetic reading for {patientName}</p>
        </div>

        <Watch color="#42d6c5" />
      </div>

      <form
        className="simulator-form"
        onSubmit={handleSubmit}
      >
        <label className="simulator-field">
          Heart Rate (BPM)
          <input
            type="number"
            name="heart_rate"
            min="25"
            max="250"
            required
            value={form.heart_rate}
            onChange={handleChange}
          />
        </label>

        <label className="simulator-field">
          HRV (ms)
          <input
            type="number"
            name="hrv"
            min="0"
            max="300"
            required
            value={form.hrv}
            onChange={handleChange}
          />
        </label>

        <label className="simulator-field">
          Sleep Hours
          <input
            type="number"
            name="sleep_hours"
            min="0"
            max="24"
            step="0.5"
            required
            value={form.sleep_hours}
            onChange={handleChange}
          />
        </label>

        <label className="simulator-field">
          Steps
          <input
            type="number"
            name="steps"
            min="0"
            max="100000"
            required
            value={form.steps}
            onChange={handleChange}
          />
        </label>

        <button
          className="primary-button"
          type="submit"
          disabled={submitting || loading}
        >
          <Activity size={16} />
          {submitting
            ? "Saving and refreshing..."
            : "Add Reading & Refresh Twin"}
        </button>
      </form>

      {success && (
        <p className="success-message">
          <CheckCircle size={14} /> {success}
        </p>
      )}
    </section>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <HeartPulse size={25} />
          </div>

          <div>
            <h2>CardioTwin AI</h2>
            <span>DIGITAL HEALTH TWIN</span>
          </div>
        </div>

        <p className="nav-label">WORKSPACE</p>

        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className={`nav-item ${
              activePage === id ? "active" : ""
            }`}
            onClick={() => setActivePage(id)}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}

        <div className="sidebar-note">
          <span className="live-dot" />
          Synthetic demo environment
          <p>
            Wearable readings are simulated and are not
            medical measurements.
          </p>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              HEALTH INTELLIGENCE PLATFORM
            </p>

            <h1>
              {activePage === "dashboard"
                ? "Digital Twin Dashboard"
                : activePage === "monitoring"
                  ? "Patient Monitoring"
                  : "AI Predictions"}
            </h1>

            <p className="subtitle">
              {activePage === "dashboard"
                ? "Overview of synthetic patient data and experimental model output."
                : activePage === "monitoring"
                  ? "Explore patient profiles and submit simulated wearable readings."
                  : "Review the model's synthetic strain probability and prediction details."}
            </p>
          </div>

          {refreshButton}
        </header>

        {patientSelector}

        {error && (
          <div className="error">{error}</div>
        )}

        {activePage === "dashboard" && (
          <>
            <section className="stats">
              <div className="stat-card">
                <div className="stat-top">
                  Latest Heart Rate <HeartPulse />
                </div>
                <strong>
                  {latest ? `${latest.heart_rate} ` : "--"}
                  <small>BPM</small>
                </strong>
                <small>Most recent saved reading</small>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  Latest HRV <Activity />
                </div>
                <strong>
                  {latest ? `${latest.hrv} ` : "--"}
                  <small>ms</small>
                </strong>
                <small>Variability in synthetic data</small>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  Latest Sleep <Moon />
                </div>
                <strong>
                  {latest ? `${latest.sleep_hours} ` : "--"}
                  <small>hrs</small>
                </strong>
                <small>Most recent simulated sleep value</small>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  Latest Steps <Footprints />
                </div>
                <strong>
                  {latest ? latest.steps : "--"}
                </strong>
                <small>Most recent simulated step count</small>
              </div>
            </section>

            <section className="content-grid">
              {heartRateChart}
              {predictionPanel}
            </section>
          </>
        )}

        {activePage === "monitoring" && (
          <>
            <section className="stats">
              <div className="stat-card">
                <div className="stat-top">
                  Patient ID <Users />
                </div>
                <strong>
                  {patient?.patient_id ?? patientId}
                </strong>
                <small>Selected synthetic patient</small>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  Latest Heart Rate <HeartPulse />
                </div>
                <strong>
                  {latest ? `${latest.heart_rate} ` : "--"}
                  <small>BPM</small>
                </strong>
                <small>Most recent saved reading</small>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  Latest HRV <Activity />
                </div>
                <strong>
                  {latest ? `${latest.hrv} ` : "--"}
                  <small>ms</small>
                </strong>
                <small>Most recent simulated value</small>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  Total Readings <Watch />
                </div>
                <strong>{readings.length}</strong>
                <small>
                  Historical and live readings returned by API
                </small>
              </div>
            </section>

            {heartRateChart}
            {patientInfoPanel}
            {wearableSimulator}

            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Recent Wearable Readings</h3>
                  <p>Latest 10 records in the returned history</p>
                </div>
              </div>

              <div className="table-wrap">
                <table className="readings-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Heart Rate</th>
                      <th>HRV</th>
                      <th>Sleep (hrs)</th>
                      <th>Steps</th>
                    </tr>
                  </thead>

                  <tbody>
                    {readings
                      .slice(-10)
                      .reverse()
                      .map((reading, index) => (
                        <tr
                          key={`${reading.timestamp}-${index}`}
                        >
                          <td>
                            {formatTimestamp(
                              reading.timestamp,
                              index
                            )}
                          </td>
                          <td>{reading.heart_rate}</td>
                          <td>{reading.hrv}</td>
                          <td>{reading.sleep_hours}</td>
                          <td>{reading.steps}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>

                {!readings.length && (
                  <p className="empty">
                    No readings available.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {activePage === "predictions" && (
          <>
            <section className="content-grid">
              {predictionPanel}

              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Prediction Details</h3>
                    <p>
                      Values returned by the Flask prediction endpoint
                    </p>
                  </div>
                  <BrainCircuit color="#42d6c5" />
                </div>

                <div className="patient-details">
                  <div className="detail">
                    <span>Patient ID</span>
                    <strong>
                      {prediction?.patient_id ?? patientId}
                    </strong>
                  </div>

                  <div className="detail">
                    <span>Predicted class</span>
                    <strong>
                      {prediction?.prediction ?? "--"}
                    </strong>
                  </div>

                  <div className="detail">
                    <span>Probability</span>
                    <strong>{displayProbability}</strong>
                  </div>

                  <div className="detail">
                    <span>Prediction horizon</span>
                    <strong>
                      {prediction?.prediction_horizon ||
                        "Next six hours"}
                    </strong>
                  </div>

                  <div className="detail">
                    <span>Model</span>
                    <strong>
                      {prediction?.model || "--"}
                    </strong>
                  </div>
                </div>

                <p className="horizon">
                  Class 0 or 1 represents the model's artificial
                  label, not a clinical diagnosis.
                </p>

                <button
                  className="primary-button"
                  type="button"
                  onClick={() => loadDashboard(patientId)}
                  disabled={loading}
                >
                  <RefreshCw size={15} />
                  Recalculate Prediction
                </button>
              </div>
            </section>

            {wearableSimulator}
          </>
        )}

        <div className="disclaimer">
          <ShieldAlert size={22} />

          <div>
            <strong>
              Research Prototype — Not for Clinical Use
            </strong>

            <p>
              This project uses synthetic data and artificial
              labels. Predictions are experimental and are not
              a diagnosis or a clinically validated cardiovascular
              risk estimate.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
