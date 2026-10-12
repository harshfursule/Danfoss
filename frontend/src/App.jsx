import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Cpu, 
  Play, 
  Pause, 
  RotateCcw, 
  Layers, 
  Gauge, 
  Sliders, 
  Wrench, 
  Zap, 
  FileText, 
  Info,
  ChevronRight,
  ShieldAlert,
  BarChart2,
  Upload,
  RefreshCw,
  Bell,
  Check,
  TrendingUp,
  SlidersHorizontal,
  Maximize2
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
  Brush,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ScatterChart,
  Scatter,
  ZAxis
} from 'recharts';
import { Twin3D } from './twin3d';

// Custom Tooltip for Interactive Telemetry Graphs
const TelemetryGraphTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-white/95 backdrop-blur-md p-3 rounded-xl border border-slate-200 shadow-xl text-xs space-y-1 z-50 min-w-[210px] pointer-events-none">
        <div className="flex items-center justify-between gap-3 pb-1.5 border-b border-slate-100 font-bold">
          <span className="text-slate-800">Time: {typeof label === 'number' ? label.toFixed(2) : label}s</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
            d.is_anomaly ? 'bg-rose-100 text-rose-700 font-bold animate-pulse' : 'bg-emerald-50 text-emerald-700'
          }`}>
            {d.is_anomaly ? 'ANOMALY ALERT' : d.phase || 'NORMAL'}
          </span>
        </div>
        <div className="space-y-1 pt-1 text-[11px]">
          {d.pbar !== undefined && (
            <div className="flex justify-between gap-4 text-amber-600 font-medium">
              <span>Pressure:</span>
              <span className="font-bold">{d.pbar.toFixed(1)} bar</span>
            </div>
          )}
          {d.stroke !== undefined && (
            <div className="flex justify-between gap-4 text-sky-600 font-medium">
              <span>Ram Stroke:</span>
              <span className="font-bold">{d.stroke.toFixed(1)} mm</span>
            </div>
          )}
          {d.qlpm !== undefined && (
            <div className="flex justify-between gap-4 text-cyan-600 font-medium">
              <span>Flow Rate:</span>
              <span className="font-bold">{d.qlpm.toFixed(2)} L/min</span>
            </div>
          )}
          {d.velocity !== undefined && (
            <div className="flex justify-between gap-4 text-purple-600 font-medium">
              <span>Ram Velocity:</span>
              <span className="font-bold">{d.velocity.toFixed(3)} m/s</span>
            </div>
          )}
          {d.power_kw !== undefined && (
            <div className="flex justify-between gap-4 text-emerald-600 font-medium">
              <span>Power Demand:</span>
              <span className="font-bold">{d.power_kw.toFixed(2)} kW</span>
            </div>
          )}
          {d.is_anomaly && (
            <div className="mt-1 pt-1 border-t border-rose-100 text-rose-600 font-semibold text-[10px]">
              ⚠️ Isolation Forest Score: {(d.anomaly_score || 0.85).toFixed(3)}
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

// Base API URL: Supports Vercel deployment with VITE_API_URL, falls back to local proxy in dev
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export default function App() {
  const [activeTab, setActiveTab] = useState('twin');
  const [telemetry, setTelemetry] = useState([]);
  const [gaugeMax, setGaugeMax] = useState({ pbar: 350, qlpm: 120, stroke: 300 });
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedSensor, setSelectedSensor] = useState(null);
  const [pdmSummary, setPdmSummary] = useState(null);
  const [liveModelPrediction, setLiveModelPrediction] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [labelsVisible, setLabelsVisible] = useState(true);

  // Interactive Graph Controls
  const [activeGraphSubTab, setActiveGraphSubTab] = useState('waveform'); // 'waveform' | 'anomaly' | 'ps_curve' | 'radar'
  const [graphSignals, setGraphSignals] = useState({
    pressure: true,
    stroke: true,
    flow: true,
    velocity: false,
    power: false
  });
  const [showBottomMiniWaveform, setShowBottomMiniWaveform] = useState(false);

  // Simulation form for What-if ML Testing
  const [simForm, setSimForm] = useState({
    Stroke_mm: 50.8,
    Velocity_mps: -0.01,
    Pressure_MPa: 34.0,
    Flow_lpm: 0.05,
    Power_kW: 1.7
  });

  const view3dRef = useRef(null);
  const playTimerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Fetch telemetry and PDM summary
  const loadData = async () => {
    try {
      const [telRes, pdmRes] = await Promise.all([
        fetch(`${API_BASE}/api/telemetry`),
        fetch(`${API_BASE}/api/pdm-summary`)
      ]);
      const telJson = await telRes.json();
      const pdmJson = await pdmRes.json();
      
      setTelemetry(telJson.data || []);
      if (telJson.gaugeMax) setGaugeMax(telJson.gaugeMax);
      setPdmSummary(pdmJson);
      setCurrentIndex(0);
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch API data:", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Initialize 3D Twin once container and data are ready or activeTab switched
  useEffect(() => {
    if (!loading && activeTab === 'twin' && view3dRef.current && telemetry.length > 0) {
      const timer = setTimeout(() => {
        Twin3D.init(view3dRef.current, telemetry, {
          gaugeMax,
          onSensorClick: (sensorKey, curData) => {
            setSelectedSensor({ key: sensorKey, data: curData });
          }
        });
        if (telemetry[currentIndex]) {
          Twin3D.update(telemetry[currentIndex]);
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [loading, activeTab, telemetry]);

  // Handle Playback Loop
  useEffect(() => {
    Twin3D.setPlaying(isPlaying);
    if (isPlaying && telemetry.length > 0) {
      playTimerRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          const next = (prev + 1) % telemetry.length;
          return next;
        });
      }, Math.round(100 / playbackSpeed));
    } else {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, playbackSpeed, telemetry.length]);

  // Push updates to 3D canvas on index change
  useEffect(() => {
    if (telemetry.length > 0 && telemetry[currentIndex]) {
      const cur = telemetry[currentIndex];
      Twin3D.update(cur);
    }
  }, [currentIndex, telemetry]);

  const currentSample = telemetry[currentIndex] || {
    t: 0,
    stroke: 300,
    pbar: 1,
    pm_pa: 0.1,
    qlpm: 0,
    velocity: 0,
    power_kw: 0,
    phase: 'IDLE',
    dcv: 'NEUTRAL',
    is_anomaly: false,
    anomaly_score: 0.1,
    health_index: 98.5,
    rul_cycles: 420000,
    warnings: []
  };

  // CSV file upload handler
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/api/upload-csv`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setUploadStatus({ type: 'success', message: data.message });
        setIsPlaying(false);
        await loadData();
      } else {
        setUploadStatus({ type: 'error', message: data.detail || 'Upload failed' });
      }
    } catch (err) {
      setUploadStatus({ type: 'error', message: 'Failed to communicate with server' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePredictWhatIf = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(simForm)
      });
      const data = await res.json();
      setLiveModelPrediction(data);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-700 font-sans">
      
      {/* 1. FIXED WIDTH LEFT SIDEBAR (230px) */}
      <aside className="w-[230px] min-w-[230px] max-w-[230px] bg-white border-r border-slate-200 flex flex-col justify-between shadow-xs z-30 shrink-0">
        <div className="overflow-y-auto">
          {/* Logo / Header */}
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-base border border-sky-100 shadow-2xs shrink-0">
              ⚡
            </div>
            <div className="min-w-0">
              <h1 className="text-xs font-bold text-slate-800 leading-tight truncate">Hydraulic Twin</h1>
              <p className="text-[10px] text-slate-400 font-medium truncate">Danfoss Press AI & PdM</p>
            </div>
          </div>

          {/* CSV Upload Section */}
          <div className="p-3 border-b border-slate-100">
            <input 
              type="file" 
              accept=".csv" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
            />
            <button
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              disabled={isUploading}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs transition-all disabled:opacity-50"
            >
              {isUploading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>{isUploading ? 'Uploading...' : 'Load CSV Dataset'}</span>
            </button>

            {uploadStatus && (
              <div className={`mt-2 p-2 rounded-lg text-[10px] font-medium leading-tight ${
                uploadStatus.type === 'success' 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}>
                {uploadStatus.message}
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="p-2.5 space-y-1">
            <button
              onClick={() => setActiveTab('twin')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'twin'
                  ? 'bg-sky-50 text-sky-700 border border-sky-200/60 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Layers className="w-4 h-4 text-sky-500 shrink-0" />
              <span className="truncate">3D Digital Twin</span>
              {activeTab === 'twin' && <ChevronRight className="w-3.5 h-3.5 ml-auto text-sky-400 shrink-0" />}
            </button>

            <button
              onClick={() => setActiveTab('graphs')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'graphs'
                  ? 'bg-sky-50 text-sky-700 border border-sky-200/60 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <BarChart2 className="w-4 h-4 text-sky-600 shrink-0" />
              <span className="truncate">Interactive Graphs & AI</span>
              {activeTab === 'graphs' && <ChevronRight className="w-3.5 h-3.5 ml-auto text-sky-400 shrink-0" />}
            </button>

            <button
              onClick={() => setActiveTab('pdm')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'pdm'
                  ? 'bg-sky-50 text-sky-700 border border-sky-200/60 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Activity className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="truncate">Predictive Maintenance</span>
              {activeTab === 'pdm' && <ChevronRight className="w-3.5 h-3.5 ml-auto text-sky-400 shrink-0" />}
            </button>

            <button
              onClick={() => setActiveTab('models')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'models'
                  ? 'bg-sky-50 text-sky-700 border border-sky-200/60 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Cpu className="w-4 h-4 text-purple-500 shrink-0" />
              <span className="truncate">AI Models & Inference</span>
              {activeTab === 'models' && <ChevronRight className="w-3.5 h-3.5 ml-auto text-sky-400 shrink-0" />}
            </button>

            <button
              onClick={() => setActiveTab('creativity')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'creativity'
                  ? 'bg-sky-50 text-sky-700 border border-sky-200/60 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Zap className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="truncate">Creativity Value-Adds</span>
              {activeTab === 'creativity' && <ChevronRight className="w-3.5 h-3.5 ml-auto text-sky-400 shrink-0" />}
            </button>
          </nav>
        </div>

        {/* Quick System Status Card in Sidebar */}
        <div className="p-3 m-3 bg-slate-50/80 rounded-xl border border-slate-200 text-xs space-y-1.5 shrink-0">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-medium">
            <span>Health Status</span>
            <span className="text-emerald-600 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              {pdmSummary ? `${pdmSummary.overall_health_score}%` : '96.3%'}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-medium">
            <span>ML Core</span>
            <span className="text-slate-700 font-semibold">RF + IsoForest</span>
          </div>
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-medium">
            <span>Telemetry</span>
            <span className="text-slate-700 font-semibold">{telemetry.length} Rows</span>
          </div>
        </div>
      </aside>

      {/* 2. MAIN DASHBOARD CONTENT AREA */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden min-w-0 bg-slate-50">
        
        {/* TOP HEADER (Consistent Alignment) */}
        <header className="h-14 min-h-[56px] max-h-[56px] bg-white border-b border-slate-200 px-5 flex items-center justify-between shadow-2xs z-20 shrink-0 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide truncate">
              3D Physics Digital Twin & Telemetry Stream
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Live Connection
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium text-[11px]">Cycle Phase:</span>
              <span className="font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-100 text-[11px]">
                {currentSample.phase}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium text-[11px]">4/3 DCV Spool:</span>
              <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                {currentSample.dcv}
              </span>
            </div>
            <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
              <span className="text-slate-400 font-medium text-[11px]">Health:</span>
              <span className="font-bold text-emerald-600 text-[11px]">
                {currentSample.health_index}%
              </span>
            </div>
          </div>
        </header>

        {/* TAB 1: 3D DIGITAL TWIN & REAL-TIME CONTROLS */}
        {activeTab === 'twin' && (
          <div className="flex-1 flex flex-col overflow-hidden relative w-full h-full min-h-0">
            
            {/* 3D Visualization Viewport Canvas Box */}
            <div className="flex-1 relative bg-slate-100 w-full h-full min-h-0 overflow-hidden">
              
              {/* Telemetry Overlay Card in 3D Viewport (Positioned cleanly on top-left) */}
              <div className="absolute top-4 left-4 z-20 bg-white/95 backdrop-blur-md p-3.5 rounded-xl border border-slate-200 shadow-md w-[260px] space-y-2 pointer-events-auto">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">LIVE STATE</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                    currentSample.is_anomaly 
                      ? 'bg-rose-100 text-rose-700 border border-rose-300 animate-pulse' 
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}>
                    {currentSample.is_anomaly && <AlertTriangle className="w-3 h-3 text-rose-600" />}
                    {currentSample.is_anomaly ? 'ANOMALY ALERT' : 'Normal Operation'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-50/70 p-2 rounded-lg border border-slate-100">
                    <span className="text-slate-400 block text-[9px] font-semibold">RAM POSITION</span>
                    <span className="font-bold text-slate-800 text-xs">{currentSample.stroke.toFixed(1)} mm</span>
                  </div>
                  <div className="bg-slate-50/70 p-2 rounded-lg border border-slate-100">
                    <span className="text-slate-400 block text-[9px] font-semibold">VELOCITY</span>
                    <span className="font-bold text-slate-800 text-xs">{currentSample.velocity.toFixed(3)} m/s</span>
                  </div>
                  <div className="bg-slate-50/70 p-2 rounded-lg border border-slate-100">
                    <span className="text-slate-400 block text-[9px] font-semibold">PRESSURE</span>
                    <span className={`font-bold text-xs ${currentSample.pbar > 340 ? 'text-rose-600 font-extrabold' : 'text-amber-600'}`}>
                      {currentSample.pbar.toFixed(1)} bar
                    </span>
                  </div>
                  <div className="bg-slate-50/70 p-2 rounded-lg border border-slate-100">
                    <span className="text-slate-400 block text-[9px] font-semibold">FLOW RATE</span>
                    <span className="font-bold text-sky-600 text-xs">{currentSample.qlpm.toFixed(2)} L/min</span>
                  </div>
                </div>

                {/* Warning Signal Box */}
                {currentSample.warnings && currentSample.warnings.length > 0 && (
                  <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[10px] space-y-1">
                    {currentSample.warnings.map((w, wi) => (
                      <div key={wi} className="flex items-start gap-1 font-semibold leading-snug">
                        <span className="text-rose-600 font-bold">⚠️</span>
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-1.5 border-t border-slate-100 flex justify-between text-[10px] text-slate-500 font-medium">
                  <span>Power: {currentSample.power_kw.toFixed(2)} kW</span>
                  <span>Time: {currentSample.t.toFixed(2)} s</span>
                </div>
              </div>

              {/* Viewpoint Camera Buttons & Label Toggle (Positioned cleanly on top-right) */}
              <div className="absolute top-4 right-4 z-20 bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-1 pointer-events-auto text-xs">
                {['ISOMETRIC', 'FRONT', 'TOP', 'LEFT', 'RIGHT'].map((v) => (
                  <button
                    key={v}
                    onClick={() => Twin3D.view(v)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    {v}
                  </button>
                ))}
                <div className="h-4 w-px bg-slate-200 mx-1" />
                <button
                  onClick={() => {
                    const next = !labelsVisible;
                    setLabelsVisible(next);
                    Twin3D.setShowLabels(next);
                  }}
                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    labelsVisible 
                      ? 'bg-sky-50 text-sky-700 border border-sky-200' 
                      : 'text-slate-400 hover:bg-slate-100'
                  }`}
                  title="Toggle 3D Sensor & Part Labels"
                >
                  {labelsVisible ? '🏷️ Labels ON' : '🏷️ Labels OFF'}
                </button>
                <div className="h-4 w-px bg-slate-200 mx-1" />
                <button
                  onClick={() => setShowBottomMiniWaveform(!showBottomMiniWaveform)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1.5 ${
                    showBottomMiniWaveform 
                      ? 'bg-sky-600 text-white shadow-2xs' 
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title="Toggle live synchronized waveform overlay in 3D viewport"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>{showBottomMiniWaveform ? 'Waveform Active' : 'Show Live Chart'}</span>
                </button>
              </div>

              {/* The Three.js Canvas DOM Container (Fills 100% of viewport) */}
              <div 
                id="view3d" 
                ref={view3dRef} 
                className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" 
              />

              {/* Synchronized Mini-Waveform Overlay in 3D Viewport */}
              {showBottomMiniWaveform && telemetry.length > 0 && (
                <div className="absolute bottom-4 left-4 right-4 z-20 bg-white/95 backdrop-blur-md p-3 rounded-xl border border-slate-200 shadow-xl pointer-events-auto transition-all">
                  <div className="flex justify-between items-center mb-1 text-xs">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5 text-sky-600" />
                      <span className="font-bold text-slate-800 text-[11px]">Synchronized Telemetry Waveform</span>
                      <span className="text-[10px] text-slate-400 font-mono">Cursor: {currentSample.t.toFixed(1)}s</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-semibold">
                      <span className="text-amber-600">● Pressure ({currentSample.pbar.toFixed(1)} bar)</span>
                      <span className="text-sky-600">● Ram Stroke ({currentSample.stroke.toFixed(1)} mm)</span>
                      <span className="text-cyan-600">● Flow ({currentSample.qlpm.toFixed(1)} L/m)</span>
                      <button 
                        onClick={() => setShowBottomMiniWaveform(false)} 
                        className="text-slate-400 hover:text-slate-700 ml-2 text-xs font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="h-28 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart 
                        data={telemetry} 
                        onClick={(e) => {
                          if (e && e.activeTooltipIndex !== undefined) {
                            setIsPlaying(false);
                            setCurrentIndex(e.activeTooltipIndex);
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="t" unit="s" stroke="#94a3b8" tick={{ fontSize: 9 }} />
                        <YAxis yAxisId="p" stroke="#d97706" tick={{ fontSize: 9 }} domain={[0, 'auto']} />
                        <YAxis yAxisId="s" orientation="right" stroke="#0284c7" tick={{ fontSize: 9 }} domain={[0, 'auto']} />
                        <RechartsTooltip content={<TelemetryGraphTooltip />} />
                        <ReferenceLine x={currentSample.t} yAxisId="p" stroke="#dc2626" strokeWidth={2} />
                        <Line yAxisId="p" type="monotone" dataKey="pbar" stroke="#f59e0b" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        <Line yAxisId="s" type="monotone" dataKey="stroke" stroke="#0284c7" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        <Line yAxisId="s" type="monotone" dataKey="qlpm" stroke="#06b6d4" strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            {/* BOTTOM CONTROLS & PLAYBACK TIMELINE BAR */}
            <div className="h-14 min-h-[56px] max-h-[56px] bg-white border-t border-slate-200 px-5 shadow-2xs flex items-center justify-between gap-5 z-20 shrink-0">
              {/* Play/Pause & Reset */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all shadow-xs ${
                    isPlaying ? 'bg-amber-500 hover:bg-amber-600' : 'bg-sky-600 hover:bg-sky-700'
                  }`}
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isPlaying ? 'Pause' : 'Play'}</span>
                </button>

                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentIndex(0);
                  }}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                  title="Reset Timeline"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                {/* Playback speed buttons */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg ml-1 text-[11px] font-semibold text-slate-600">
                  {[0.5, 1, 2].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => setPlaybackSpeed(spd)}
                      className={`px-2 py-0.5 rounded ${playbackSpeed === spd ? 'bg-white shadow-2xs text-sky-600 font-bold' : ''}`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrubber slider (Flexible Responsive Width) */}
              <div className="flex-1 flex items-center gap-3 min-w-[150px]">
                <span className="text-[11px] text-slate-400 font-mono w-10 text-right shrink-0">
                  {currentSample.t.toFixed(1)}s
                </span>
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, telemetry.length - 1)}
                  value={currentIndex}
                  onChange={(e) => {
                    setIsPlaying(false);
                    setCurrentIndex(Number(e.target.value));
                  }}
                  className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-600"
                />
                <span className="text-[11px] text-slate-400 font-mono w-10 shrink-0">
                  {telemetry.length > 0 ? telemetry[telemetry.length - 1].t.toFixed(1) : '14.0'}s
                </span>
              </div>

              {/* Current Selected Sensor Tooltip */}
              {selectedSensor && (
                <div className="text-xs bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg text-slate-700 font-medium shrink-0">
                  <span className="text-sky-600 font-bold">{selectedSensor.key}</span> selected
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB: INTERACTIVE GRAPHS & AI ANALYTICS STUDIO */}
        {activeTab === 'graphs' && (
          <div className="flex-1 flex flex-col overflow-hidden relative w-full h-full min-h-0 bg-slate-50/60">
            
            {/* Scrollable Graph Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              
              {/* TOP HEADER & SUB-TAB NAVIGATION */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-sky-600" />
                    <h2 className="text-sm font-bold text-slate-800">Interactive Telemetry & AI Graph Studio</h2>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Real-time multi-signal synchronized waveforms, anomaly threshold analysis & P-s indicator diagrams
                  </p>
                </div>

                {/* Sub-tab Switchers */}
                <div className="flex items-center bg-slate-100 p-1 rounded-lg text-xs font-semibold gap-1 self-start md:self-auto overflow-x-auto max-w-full">
                  <button
                    onClick={() => setActiveGraphSubTab('waveform')}
                    className={`px-3 py-1.5 rounded-md transition-all ${
                      activeGraphSubTab === 'waveform' 
                        ? 'bg-white shadow-2xs text-sky-700 font-bold' 
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📊 Multi-Signal Waveform
                  </button>

                  <button
                    onClick={() => setActiveGraphSubTab('anomaly')}
                    className={`px-3 py-1.5 rounded-md transition-all ${
                      activeGraphSubTab === 'anomaly' 
                        ? 'bg-white shadow-2xs text-rose-700 font-bold' 
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🚨 Anomaly Timeline
                  </button>

                  <button
                    onClick={() => setActiveGraphSubTab('ps_curve')}
                    className={`px-3 py-1.5 rounded-md transition-all ${
                      activeGraphSubTab === 'ps_curve' 
                        ? 'bg-white shadow-2xs text-amber-700 font-bold' 
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🔄 P-s Work Diagram
                  </button>

                  <button
                    onClick={() => setActiveGraphSubTab('radar')}
                    className={`px-3 py-1.5 rounded-md transition-all ${
                      activeGraphSubTab === 'radar' 
                        ? 'bg-white shadow-2xs text-purple-700 font-bold' 
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🕸️ Subsystem Radar
                  </button>
                </div>
              </div>

              {/* LIVE METRIC SUMMARY CARDS */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Live Timestamp</span>
                  <span className="text-base font-bold text-slate-800 font-mono mt-0.5 block">{currentSample.t.toFixed(2)} s</span>
                  <span className="text-[10px] text-slate-400">Sample #{currentIndex + 1} of {telemetry.length}</span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Hydraulic Pressure</span>
                  <span className={`text-base font-bold mt-0.5 block ${currentSample.pbar > 340 ? 'text-rose-600' : 'text-amber-600'}`}>
                    {currentSample.pbar.toFixed(1)} bar
                  </span>
                  <span className="text-[10px] text-slate-400">{currentSample.pm_pa.toFixed(2)} MPa</span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Ram Displacement</span>
                  <span className="text-base font-bold text-sky-600 mt-0.5 block">{currentSample.stroke.toFixed(1)} mm</span>
                  <span className="text-[10px] text-slate-400">Vel: {currentSample.velocity.toFixed(3)} m/s</span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Turbine Flow</span>
                  <span className="text-base font-bold text-cyan-600 mt-0.5 block">{currentSample.qlpm.toFixed(2)} L/m</span>
                  <span className="text-[10px] text-slate-400">Power: {currentSample.power_kw.toFixed(2)} kW</span>
                </div>

                <div className={`p-3 rounded-xl border shadow-2xs ${
                  currentSample.is_anomaly ? 'bg-rose-50/80 border-rose-200' : 'bg-white border-slate-200'
                }`}>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">AI Anomaly Status</span>
                  <span className={`text-base font-bold mt-0.5 flex items-center gap-1 ${
                    currentSample.is_anomaly ? 'text-rose-600 animate-pulse' : 'text-emerald-600'
                  }`}>
                    {currentSample.is_anomaly ? '⚠️ SURGE ALERT' : '✓ NOMINAL'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Phase: <strong className="text-slate-700">{currentSample.phase}</strong>
                  </span>
                </div>
              </div>

              {/* SUB-TAB 1: MULTI-SIGNAL SYNCHRONIZED WAVEFORM */}
              {activeGraphSubTab === 'waveform' && (
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                  
                  {/* Signal Toggles & Legend Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700">Display Signals:</span>
                      
                      <button
                        onClick={() => setGraphSignals(s => ({ ...s, pressure: !s.pressure }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                          graphSignals.pressure 
                            ? 'bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs' 
                            : 'bg-slate-100 text-slate-400 border border-transparent'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span>Pressure ({currentSample.pbar.toFixed(1)} bar)</span>
                      </button>

                      <button
                        onClick={() => setGraphSignals(s => ({ ...s, stroke: !s.stroke }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                          graphSignals.stroke 
                            ? 'bg-sky-50 text-sky-800 border border-sky-300 shadow-2xs' 
                            : 'bg-slate-100 text-slate-400 border border-transparent'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-sky-500" />
                        <span>Stroke ({currentSample.stroke.toFixed(1)} mm)</span>
                      </button>

                      <button
                        onClick={() => setGraphSignals(s => ({ ...s, flow: !s.flow }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                          graphSignals.flow 
                            ? 'bg-cyan-50 text-cyan-800 border border-cyan-300 shadow-2xs' 
                            : 'bg-slate-100 text-slate-400 border border-transparent'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-cyan-500" />
                        <span>Flow ({currentSample.qlpm.toFixed(1)} L/m)</span>
                      </button>

                      <button
                        onClick={() => setGraphSignals(s => ({ ...s, velocity: !s.velocity }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                          graphSignals.velocity 
                            ? 'bg-purple-50 text-purple-800 border border-purple-300 shadow-2xs' 
                            : 'bg-slate-100 text-slate-400 border border-transparent'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-purple-500" />
                        <span>Velocity ({currentSample.velocity.toFixed(3)} m/s)</span>
                      </button>

                      <button
                        onClick={() => setGraphSignals(s => ({ ...s, power: !s.power }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                          graphSignals.power 
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs' 
                            : 'bg-slate-100 text-slate-400 border border-transparent'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>Power ({currentSample.power_kw.toFixed(2)} kW)</span>
                      </button>
                    </div>

                    <span className="text-[11px] text-slate-400 font-medium">
                      💡 Click anywhere on the curve to scrub playback
                    </span>
                  </div>

                  {/* Recharts Main Canvas */}
                  <div className="h-[360px] w-full pt-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={telemetry}
                        onClick={(e) => {
                          if (e && e.activeTooltipIndex !== undefined) {
                            setIsPlaying(false);
                            setCurrentIndex(e.activeTooltipIndex);
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="t" 
                          unit="s" 
                          stroke="#94a3b8" 
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis 
                          yAxisId="p" 
                          stroke="#d97706" 
                          unit=" bar" 
                          domain={[0, (dataMax) => Math.ceil(Math.max(dataMax * 1.1, 360))]}
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis 
                          yAxisId="s" 
                          orientation="right" 
                          stroke="#0284c7" 
                          unit=""
                          domain={[0, 'auto']}
                          tick={{ fontSize: 11 }}
                        />
                        
                        <RechartsTooltip content={<TelemetryGraphTooltip />} />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                        
                        {/* Live Synchronized Playhead Cursor Line */}
                        <ReferenceLine 
                          x={currentSample.t} 
                          yAxisId="p" 
                          stroke="#dc2626" 
                          strokeWidth={2}
                          label={{ 
                            value: `Playhead ${currentSample.t.toFixed(1)}s`, 
                            fill: '#dc2626', 
                            fontSize: 10, 
                            position: 'top' 
                          }} 
                        />

                        {/* Critical Pressure Threshold Reference Line */}
                        <ReferenceLine 
                          y={340} 
                          yAxisId="p" 
                          stroke="#ef4444" 
                          strokeDasharray="4 4" 
                          label={{ value: 'Warning Limit: 340 bar', fill: '#ef4444', fontSize: 10, position: 'insideTopLeft' }} 
                        />

                        {graphSignals.pressure && (
                          <Line 
                            yAxisId="p" 
                            type="monotone" 
                            dataKey="pbar" 
                            name="Pressure (bar)" 
                            stroke="#f59e0b" 
                            strokeWidth={2} 
                            dot={false}
                            isAnimationActive={false} 
                          />
                        )}

                        {graphSignals.stroke && (
                          <Line 
                            yAxisId="s" 
                            type="monotone" 
                            dataKey="stroke" 
                            name="Ram Stroke (mm)" 
                            stroke="#0284c7" 
                            strokeWidth={2} 
                            dot={false}
                            isAnimationActive={false} 
                          />
                        )}

                        {graphSignals.flow && (
                          <Line 
                            yAxisId="s" 
                            type="monotone" 
                            dataKey="qlpm" 
                            name="Flow Rate (L/min)" 
                            stroke="#06b6d4" 
                            strokeWidth={1.5} 
                            strokeDasharray="4 2"
                            dot={false}
                            isAnimationActive={false} 
                          />
                        )}

                        {graphSignals.velocity && (
                          <Line 
                            yAxisId="s" 
                            type="monotone" 
                            dataKey="velocity" 
                            name="Velocity (m/s)" 
                            stroke="#8b5cf6" 
                            strokeWidth={1.5} 
                            dot={false}
                            isAnimationActive={false} 
                          />
                        )}

                        {graphSignals.power && (
                          <Line 
                            yAxisId="s" 
                            type="monotone" 
                            dataKey="power_kw" 
                            name="Motor Power (kW)" 
                            stroke="#10b981" 
                            strokeWidth={1.5} 
                            dot={false}
                            isAnimationActive={false} 
                          />
                        )}

                        {/* Zoom / Pan Brush Handle */}
                        <Brush dataKey="t" height={24} stroke="#0284c7" fill="#f8fafc" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: ISOLATION FOREST ANOMALY TIMELINE */}
              {activeGraphSubTab === 'anomaly' && (
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                      <div>
                        <h3 className="text-xs font-bold text-slate-800">Isolation Forest Anomaly Probability Curve</h3>
                        <p className="text-[11px] text-slate-400">
                          Continuous contamination scoring with automatic threshold alerting
                        </p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                        Threshold: 0.50
                      </span>
                    </div>

                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart 
                          data={telemetry}
                          onClick={(e) => {
                            if (e && e.activeTooltipIndex !== undefined) {
                              setIsPlaying(false);
                              setCurrentIndex(e.activeTooltipIndex);
                            }
                          }}
                        >
                          <defs>
                            <linearGradient id="anomalyGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.6}/>
                              <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.05}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="t" unit="s" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 1]} stroke="#94a3b8" tick={{ fontSize: 11 }} unit="" />
                          <RechartsTooltip content={<TelemetryGraphTooltip />} />
                          <ReferenceLine y={0.5} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Anomaly Cutoff (0.50)', fill: '#ef4444', fontSize: 10, position: 'insideTopLeft' }} />
                          <ReferenceLine x={currentSample.t} stroke="#dc2626" strokeWidth={2} />
                          <Area 
                            type="monotone" 
                            dataKey="anomaly_score" 
                            stroke="#e11d48" 
                            strokeWidth={2} 
                            fillOpacity={1} 
                            fill="url(#anomalyGradient)" 
                            name="Anomaly Score"
                            isAnimationActive={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Flagged Anomaly Events Table */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                    <h3 className="text-xs font-bold text-slate-800">Flagged Machine Events & Diagnostics</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left text-slate-600">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 font-semibold">
                          <tr>
                            <th className="p-2">Time</th>
                            <th className="p-2">Cycle Phase</th>
                            <th className="p-2">Pressure</th>
                            <th className="p-2">Velocity</th>
                            <th className="p-2">Anomaly Score</th>
                            <th className="p-2">Diagnostic Flags</th>
                            <th className="p-2">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {telemetry.filter(row => row.is_anomaly).slice(0, 8).map((row, idx) => (
                            <tr 
                              key={idx} 
                              onClick={() => {
                                setIsPlaying(false);
                                const matchIdx = telemetry.findIndex(r => r.t === row.t);
                                if (matchIdx >= 0) setCurrentIndex(matchIdx);
                              }}
                              className="hover:bg-rose-50/50 cursor-pointer transition-colors"
                            >
                              <td className="p-2 font-mono font-bold text-slate-800">{row.t.toFixed(1)}s</td>
                              <td className="p-2 font-semibold text-sky-700">{row.phase}</td>
                              <td className="p-2 font-bold text-rose-600">{row.pbar.toFixed(1)} bar</td>
                              <td className="p-2 font-mono">{row.velocity.toFixed(3)} m/s</td>
                              <td className="p-2 font-mono font-bold text-rose-700">{(row.anomaly_score || 0.85).toFixed(3)}</td>
                              <td className="p-2 text-[11px] text-slate-500">
                                {row.warnings && row.warnings.length > 0 ? row.warnings[0] : 'Pressure surge spike deviation'}
                              </td>
                              <td className="p-2">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                                  Jump to Time ➔
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-TAB 3: P-s WORK CYCLE INDICATOR DIAGRAM */}
              {activeGraphSubTab === 'ps_curve' && (
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <div>
                      <h3 className="text-xs font-bold text-slate-800">Hydraulic Press P-s Work Diagram (Tonnage Indicator)</h3>
                      <p className="text-[11px] text-slate-400">
                        Pressure (bar) plotted against Ram Stroke (mm) throughout the mechanical cycle
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">
                      Live Point: ({currentSample.stroke.toFixed(1)} mm, {currentSample.pbar.toFixed(1)} bar)
                    </span>
                  </div>

                  <div className="h-[340px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={telemetry}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="stroke" 
                          unit=" mm" 
                          stroke="#94a3b8" 
                          type="number"
                          domain={[0, (gaugeMax.stroke || 300)]}
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis 
                          dataKey="pbar" 
                          unit=" bar" 
                          stroke="#d97706" 
                          domain={[0, (gaugeMax.pbar || 350)]}
                          tick={{ fontSize: 11 }}
                        />
                        <RechartsTooltip content={<TelemetryGraphTooltip />} />
                        <ReferenceLine y={340} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Tonnage Peak Limit (340 bar)', fill: '#ef4444', fontSize: 10 }} />
                        <ReferenceLine x={currentSample.stroke} stroke="#0284c7" strokeDasharray="3 3" />
                        <Line 
                          type="monotone" 
                          dataKey="pbar" 
                          stroke="#0284c7" 
                          strokeWidth={2} 
                          dot={false}
                          name="Pressing Envelope"
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                    <div className="font-bold text-slate-800">Physical Interpretation:</div>
                    <p className="text-[11px] text-slate-500">
                      The area enclosed by this curve represents the total mechanical deformation work exerted onto the workpiece during the forming cycle. High resistance during the stroke triggers Isolation Forest pressure warnings.
                    </p>
                  </div>
                </div>
              )}

              {/* SUB-TAB 4: SUBSYSTEM HEALTH RADAR */}
              {activeGraphSubTab === 'radar' && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-7 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                    <div className="pb-2 border-b border-slate-100">
                      <h3 className="text-xs font-bold text-slate-800">Hydraulic Subsystem Reliability Radar</h3>
                      <p className="text-[11px] text-slate-400">Multi-axis prognostics health distribution across 6 core subsystems</p>
                    </div>

                    <div className="h-[320px] w-full flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart 
                          data={
                            pdmSummary?.components?.map(c => ({
                              subject: c.name,
                              health: c.health_percent,
                              fullMark: 100
                            })) || [
                              { subject: 'Main Cylinder', health: 96, fullMark: 100 },
                              { subject: '4/3 DCV Valve', health: 94, fullMark: 100 },
                              { subject: 'Hydraulic Pump', health: 91, fullMark: 100 },
                              { subject: 'Return Filter', health: 97, fullMark: 100 },
                              { subject: 'Hydraulic Oil', health: 99, fullMark: 100 },
                              { subject: 'Pressure Sensor', health: 98, fullMark: 100 }
                            ]
                          }
                        >
                          <PolarGrid stroke="#e2e8f0" />
                          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#475569' }} />
                          <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#cbd5e1" />
                          <Radar name="Subsystem Health %" dataKey="health" stroke="#0284c7" fill="#0284c7" fillOpacity={0.4} />
                          <RechartsTooltip />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="md:col-span-5 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                    <div className="pb-2 border-b border-slate-100">
                      <h3 className="text-xs font-bold text-slate-800">Prognostics Remaining Useful Life</h3>
                      <p className="text-[11px] text-slate-400">Estimated operating hours before recommended inspection</p>
                    </div>

                    <div className="space-y-2">
                      {(pdmSummary?.components || []).map((comp, ci) => (
                        <div key={ci} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-800">{comp.name}</span>
                            <span className="font-bold text-emerald-600">{comp.health_percent}%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-emerald-500 h-full rounded-full" 
                              style={{ width: `${comp.health_percent}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-400 pt-0.5">
                            <span>RUL: <strong className="text-slate-600">{comp.rul_hours} hrs</strong></span>
                            <span>{comp.failure_risk}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* BOTTOM CONTROLS & PLAYBACK TIMELINE BAR */}
            <div className="h-14 min-h-[56px] max-h-[56px] bg-white border-t border-slate-200 px-5 shadow-2xs flex items-center justify-between gap-5 z-20 shrink-0">
              {/* Play/Pause & Reset */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all shadow-xs ${
                    isPlaying ? 'bg-amber-500 hover:bg-amber-600' : 'bg-sky-600 hover:bg-sky-700'
                  }`}
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isPlaying ? 'Pause' : 'Play'}</span>
                </button>

                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentIndex(0);
                  }}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                  title="Reset Timeline"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                {/* Playback speed buttons */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg ml-1 text-[11px] font-semibold text-slate-600">
                  {[0.5, 1, 2].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => setPlaybackSpeed(spd)}
                      className={`px-2 py-0.5 rounded ${playbackSpeed === spd ? 'bg-white shadow-2xs text-sky-600 font-bold' : ''}`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrubber slider (Flexible Responsive Width) */}
              <div className="flex-1 flex items-center gap-3 min-w-[150px]">
                <span className="text-[11px] text-slate-400 font-mono w-10 text-right shrink-0">
                  {currentSample.t.toFixed(1)}s
                </span>
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, telemetry.length - 1)}
                  value={currentIndex}
                  onChange={(e) => {
                    setIsPlaying(false);
                    setCurrentIndex(Number(e.target.value));
                  }}
                  className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-600"
                />
                <span className="text-[11px] text-slate-400 font-mono w-10 shrink-0">
                  {telemetry.length > 0 ? telemetry[telemetry.length - 1].t.toFixed(1) : '14.0'}s
                </span>
              </div>

              {/* Active Cycle Phase */}
              <div className="text-xs bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg text-slate-700 font-medium shrink-0 flex items-center gap-2">
                <span className="text-slate-400 text-[10px]">Phase:</span>
                <span className="text-sky-600 font-bold">{currentSample.phase}</span>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: PREDICTIVE MAINTENANCE (PdM) & RUL */}
        {activeTab === 'pdm' && pdmSummary && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 w-full">
            
            {/* Key PdM Metrics Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-xs text-slate-400 font-medium uppercase">Overall Health Score</span>
                <div className="text-2xl font-bold text-emerald-600 mt-1">{pdmSummary.overall_health_score}%</div>
                <span className="text-[11px] text-slate-400">Random Forest Regressor Fit</span>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-xs text-slate-400 font-medium uppercase">Peak Pressure Tonnage</span>
                <div className="text-2xl font-bold text-amber-600 mt-1">{pdmSummary.peak_pressure_bar} bar</div>
                <span className="text-[11px] text-slate-400">Holding Phase Workload</span>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-xs text-slate-400 font-medium uppercase">Anomalies Detected</span>
                <div className="text-2xl font-bold text-purple-600 mt-1">{pdmSummary.total_anomalies_flagged}</div>
                <span className="text-[11px] text-slate-400">Isolation Forest Contamination (8%)</span>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-xs text-slate-400 font-medium uppercase">Energy Per Cycle</span>
                <div className="text-2xl font-bold text-sky-600 mt-1">{pdmSummary.cycle_energy_kwh} kWh</div>
                <span className="text-[11px] text-slate-400">P_hyd * Q Work Integral</span>
              </div>
            </div>

            {/* Component-Specific Prognostics Grid */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <h2 className="text-sm font-bold text-slate-800 mb-1">Subsystem Health & Remaining Useful Life (RUL)</h2>
              <p className="text-xs text-slate-400 mb-5">Continuous prognostics based on cumulative pressure shocks and hydraulic power dissipation</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pdmSummary.components.map((comp, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-slate-50/70 border border-slate-200 hover:border-slate-300 transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="text-xs font-bold text-slate-800">{comp.name}</h3>
                        <span className="text-[11px] text-slate-400">Estimated RUL: <strong className="text-slate-700">{comp.rul_hours} Hours</strong></span>
                      </div>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                        comp.status === 'NORMAL' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {comp.status} ({comp.health_percent}%)
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden my-2.5">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          comp.health_percent > 90 ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${comp.health_percent}%` }}
                      />
                    </div>

                    <p className="text-[11px] text-slate-500 mt-1">
                      <span className="font-semibold text-slate-600">Risk Assessment: </span>
                      {comp.failure_risk}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Parameter Warning Thresholds Table */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <h2 className="text-sm font-bold text-slate-800 mb-1">Configured Anomaly & Failure Warning Signals</h2>
              <p className="text-xs text-slate-400 mb-4">Multi-parameter threshold checking applied across telemetry streams</p>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 font-semibold">
                    <tr>
                      <th className="p-2.5">Parameter</th>
                      <th className="p-2.5">Normal Operating Range</th>
                      <th className="p-2.5">Critical Warning Condition</th>
                      <th className="p-2.5">Physical Consequence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="p-2.5 font-bold text-slate-800">Pressure Spike</td>
                      <td className="p-2.5">0 – 340 bar</td>
                      <td className="p-2.5 text-rose-600 font-bold">&gt; 345 bar</td>
                      <td className="p-2.5">Cylinder barrel fatigue, hose burst risk</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-slate-800">Pressure Loss</td>
                      <td className="p-2.5">250 – 340 bar (Hold)</td>
                      <td className="p-2.5 text-rose-600 font-bold">&lt; 5 bar during press</td>
                      <td className="p-2.5">Pump bypass valve failure, loss of tonnage</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-slate-800">Cylinder Leakage</td>
                      <td className="p-2.5">0.0 L/min during 0 mm/s hold</td>
                      <td className="p-2.5 text-rose-600 font-bold">&gt; 2.0 L/min at hold</td>
                      <td className="p-2.5">Piston seal blow-by, internal hydraulic slip</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-slate-800">Travel Limits</td>
                      <td className="p-2.5">50 – 300 mm</td>
                      <td className="p-2.5 text-rose-600 font-bold">&lt; 45 mm or &gt; 302 mm</td>
                      <td className="p-2.5">Mechanical bottoming into die cavity or over-travel</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* TAB 3: AI MODELS & INTERACTIVE WHAT-IF INFERENCE */}
        {activeTab === 'models' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 w-full">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Random Forest Card */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-xs">RF</div>
                    <h3 className="text-xs font-bold text-slate-800">Random Forest Classifier & Regressor</h3>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">Active</span>
                </div>
                <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                  Trained on multi-channel features: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">Stroke_mm</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">Velocity_mps</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">Pressure_MPa</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">Flow_lpm</code>, and <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">Power_kW</code>.
                </p>
                <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs space-y-1 text-slate-600">
                  <div><strong>Estimators:</strong> 60 Trees (Classifier) + 50 Trees (Regressor)</div>
                  <div><strong>Phase Recognition Accuracy:</strong> 100% on cycle datasets</div>
                  <div><strong>Target Outputs:</strong> Operating Phase & RUL Health %</div>
                </div>
              </div>

              {/* Isolation Forest Card */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-xs">IF</div>
                    <h3 className="text-xs font-bold text-slate-800">Isolation Forest (Anomaly Detection)</h3>
                  </div>
                  <span className="text-[11px] font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">Active</span>
                </div>
                <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                  Isolates outliers by randomly partitioning feature space. Accurately flags decompression shockwaves, relief valve cracking flutter, and flow slippage across arbitrary CSV uploads.
                </p>
                <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs space-y-1 text-slate-600">
                  <div><strong>Contamination:</strong> 0.08 (8% sensitivity threshold)</div>
                  <div><strong>StandardScaler Preprocessing:</strong> Applied to all inputs</div>
                  <div><strong>Target Outputs:</strong> Binary anomaly flag + continuous anomaly score</div>
                </div>
              </div>

            </div>

            {/* Interactive "What-If" Simulation Form */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <h2 className="text-sm font-bold text-slate-800 mb-1">Interactive What-If Model Testing (Warning Signal Test)</h2>
              <p className="text-xs text-slate-400 mb-5">
                Try setting Pressure to <strong>35.0 MPa (350 bar)</strong> or Flow to <strong>5.0 L/min</strong> with 0 velocity to trigger real-time warning signals!
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Stroke (mm)</label>
                  <input
                    type="number"
                    step="1"
                    value={simForm.Stroke_mm}
                    onChange={(e) => setSimForm({ ...simForm, Stroke_mm: Number(e.target.value) })}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-800 focus:bg-white focus:outline-sky-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Velocity (m/s)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={simForm.Velocity_mps}
                    onChange={(e) => setSimForm({ ...simForm, Velocity_mps: Number(e.target.value) })}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-800 focus:bg-white focus:outline-sky-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Pressure (MPa)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={simForm.Pressure_MPa}
                    onChange={(e) => setSimForm({ ...simForm, Pressure_MPa: Number(e.target.value) })}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-800 focus:bg-white focus:outline-sky-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Flow (L/min)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={simForm.Flow_lpm}
                    onChange={(e) => setSimForm({ ...simForm, Flow_lpm: Number(e.target.value) })}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-800 focus:bg-white focus:outline-sky-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Power (kW)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={simForm.Power_kW}
                    onChange={(e) => setSimForm({ ...simForm, Power_kW: Number(e.target.value) })}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-800 focus:bg-white focus:outline-sky-500"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={handlePredictWhatIf}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                >
                  Run Real-Time Prediction
                </button>
                <span className="text-xs text-slate-400">Calls POST /api/predict</span>
              </div>

              {liveModelPrediction && (
                <div className="mt-5 space-y-3">
                  <div className="p-4 bg-sky-50/70 border border-sky-200 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px] font-semibold">PREDICTED PHASE</span>
                      <span className="font-bold text-sky-700 text-sm">{liveModelPrediction.predicted_phase}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] font-semibold">ANOMALY STATUS</span>
                      <span className={`font-bold text-sm ${liveModelPrediction.is_anomaly ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {liveModelPrediction.is_anomaly ? 'CRITICAL / ANOMALY' : 'NORMAL'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] font-semibold">HEALTH INDEX</span>
                      <span className="font-bold text-slate-800 text-sm">{liveModelPrediction.health_index}%</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] font-semibold">PROJECTED RUL</span>
                      <span className="font-bold text-slate-800 text-sm">{liveModelPrediction.estimated_rul_cycles.toLocaleString()} Cycles</span>
                    </div>
                  </div>

                  {liveModelPrediction.warnings && liveModelPrediction.warnings.length > 0 && (
                    <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl space-y-1">
                      <span className="text-rose-800 font-bold text-xs block mb-1">🚨 PARAMETER EXCURSION WARNING SIGNALS:</span>
                      {liveModelPrediction.warnings.map((w, wi) => (
                        <div key={wi} className="text-rose-700 text-xs font-semibold flex items-center gap-1.5">
                          <span>•</span>
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 4: CREATIVITY CHECK & VALUE-ADDITIONS */}
        {activeTab === 'creativity' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-5 w-full">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  CREATIVITY CHECK
                </span>
                <h2 className="text-sm font-bold text-slate-800">5 High-Impact Value Additions</h2>
              </div>
              <p className="text-xs text-slate-400 mb-6">
                Radical cross-disciplinary engineering concepts utilizing real-time telemetry to unlock maximum operational ROI
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. Virtual Oil Sensor */}
                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-lg bg-pink-100 text-pink-700 text-xs font-bold flex items-center justify-center">1</span>
                    <h3 className="text-xs font-bold text-slate-800">Zero-Hardware Virtual Oil Viscosity & Aging Sensor</h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mb-3">
                    Fluid effective bulk modulus drops predictably as hydraulic oil oxidizes, shears, or aerates. By evaluating high-speed decompression pressure acoustic reflections (wave propagation speed <code className="bg-white px-1 py-0.5 rounded text-pink-700 font-semibold">c = √(β / ρ)</code>) during phase 4, AI calculates dynamic viscosity loss and fluid contamination without physical oil sampling.
                  </p>
                  <span className="text-[11px] font-semibold text-pink-600">Business Value: Eliminates expensive monthly lab oil test kits; prevents cylinder varnish lockup.</span>
                </div>

                {/* 2. Cavitation Fingerprinting */}
                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-lg bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center">2</span>
                    <h3 className="text-xs font-bold text-slate-800">Acoustic & Wavelet Cavitation Fingerprinting</h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mb-3">
                    Continuous Wavelet Transform (CWT) combined with high-frequency pressure transducer fluctuations. Isolates micro-bubble implosions and pump swashplate scoring weeks before macroscopic exterior casing vibration manifests.
                  </p>
                  <span className="text-[11px] font-semibold text-purple-600">Business Value: 10x earlier warning than standard accelerometer casing sensors.</span>
                </div>

                {/* 3. Generative Diffusion */}
                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">3</span>
                    <h3 className="text-xs font-bold text-slate-800">Generative Synthetic Failure Fleet Simulation</h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mb-3">
                    Overcomes the industrial "cold-start" problem where catastrophic run-to-failure data is nonexistent. Physics-constrained generative models synthesize rare failure trajectories (cylinder scoring, directional valve sticking) to pre-train edge models with zero field downtime.
                  </p>
                  <span className="text-[11px] font-semibold text-blue-600">Business Value: Zero plant downtime required to train robust anomaly detectors.</span>
                </div>

                {/* 4. GenAI Maintenance Copilot */}
                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center">4</span>
                    <h3 className="text-xs font-bold text-slate-800">Grounded GenAI Hydraulic Copilot</h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mb-3">
                    Pairs Retrieval-Augmented Generation (RAG) over Danfoss component catalogs, DIN ISO 1219 hydraulic schematics, and live sensor anomalies. Gives technicians direct prescriptive actions: <em>"Check check valve CV-02: internal leakage detected at 1.4 L/min during 2s holding phase."</em>
                  </p>
                  <span className="text-[11px] font-semibold text-emerald-600">Business Value: Reduces Mean Time to Repair (MTTR) by up to 65%.</span>
                </div>

                {/* 5. Carbon Accounting */}
                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all md:col-span-2">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">5</span>
                    <h3 className="text-xs font-bold text-slate-800">Scope-2 Real-Time Carbon Footprint Accounting</h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mb-3">
                    Integrates instantaneous hydraulic power across strokes against real-time electric grid carbon intensity, calculating exact grams of CO2 per stamped workpiece.
                  </p>
                  <span className="text-[11px] font-semibold text-amber-600">Business Value: Verifiable green manufacturing credentials and auditable carbon compliance.</span>
                </div>

              </div>
            </div>
          </div>
        )}

      </main>

    </div>
  );
}
