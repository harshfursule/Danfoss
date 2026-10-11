# Industrial Hydraulic Press AI, Predictive Maintenance & 3D Digital Twin

A production-grade Industry 4.0 IoT & Machine Learning application built for industrial hydraulic press monitoring, component prognostics, cycle phase recognition, and 3D digital-twin telemetry visualization.

## 🚀 System Architecture & Tech Stack

- **Backend:** Python + FastAPI, Uvicorn
- **Frontend:** React (Vite), Tailwind CSS, Lucide Icons
- **3D Physics Digital Twin:** Three.js, OrbitControls (`twin3d.js`)
- **Machine Learning & Prognostics:**
  - **Random Forest Classifier:** Real-time 4-phase operating cycle classification (`FAST_DOWN`, `WORKING`, `HOLDING`, `FAST_UP`, `IDLE`).
  - **Random Forest Regressor:** Continuous Prognostic Health Index ($0\text{--}100\%$) and Remaining Useful Life (RUL) cycle estimation.
  - **Isolation Forest:** Unsupervised anomaly detection flagging pressure shocks, cavitation flutter, and cylinder seal bypass leakage.
  - **Multi-Parameter Excursion Warnings:** Real-time limit checking for pressure overloads ($>345\text{ bar}$), pressure loss during pressing, holding phase seal leakage, and stroke travel limits.

---

## 📂 Repository Structure

```
hydraulic_press_app/
├── backend/
│   ├── main.py              # FastAPI server with ML pipelines and telemetry ingestion
│   └── telemetry.csv        # Time-synchronized physical press telemetry (140 rows)
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Interactive dashboard (Twin, PdM, Models, Creativity)
│   │   ├── twin3d.js        # Three.js 3D Digital Twin with collision-aware annotations
│   │   ├── main.jsx         # React application entry point
│   │   └── index.css        # Clean reset styles
│   ├── index.html           # HTML5 boilerplate & annotation badge styling
│   ├── package.json         # Frontend dependencies (React, Three, Lucide)
│   └── vite.config.js       # Vite configuration with API proxy to localhost:8000
├── .gitignore               # Strict secret and dependency exclusion
└── README.md                # System documentation
```

---

## 🛠️ Getting Started

### 1. Prerequisites
- **Python 3.10+**
- **Node.js 18+** & npm

### 2. Backend Setup
```bash
cd backend
pip install fastapi uvicorn scikit-learn pandas numpy pydantic
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```
API Documentation will be available at `http://127.0.0.1:8000/docs`.

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## 💡 Key Features
- **Interactive 3D Digital Twin:** Dynamic stroke kinematics, V-die sheet forming animation, active fluid particle streamlines, pressure gauge needle deflection, and collision-aware sensor labels.
- **Predictive Maintenance Dashboard:** Component-level degradation tracking for Cylinder Seals, Main Pump, 4/3 DCV Spool, and Hydraulic Fluid.
- **Interactive What-If Simulation:** Test model predictions in real time by tweaking sensor parameters.
- **Custom CSV Upload:** Upload any industrial telemetry CSV to dynamically retrain models and update the 3D twin in real time.
- **5 Creativity Value-Adds:** Virtual oil viscosity sensor, acoustic cavitation wavelet fingerprinting, generative failure diffusion, grounded GenAI copilot, and Scope-2 real-time carbon footprint accounting.
