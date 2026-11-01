import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  ShieldAlert, 
  Plus, 
  MapPin, 
  X, 
  Trash2, 
  Filter,
  Layers,
  Radio,
  Navigation,
  RefreshCw
} from 'lucide-react';
import rawAssets from './data.json';
import './index.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Map view controller component
function ChangeMapView({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom || 11);
    }
  }, [center, zoom, map]);
  return null;
}

// User Location Icon
const userLocationIcon = L.divIcon({
  className: 'user-marker',
  html: `<div style="width: 16px; height: 16px; border-radius: 50%; background-color: #3b82f6; border: 3px solid white; box-shadow: 0 0 10px rgba(59, 130, 246, 0.8);"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11]
});

// Custom Leaflet Icons with status colors
const createIcon = (status) => {
  const colorMap = {
    stable: 'var(--color-stable)',
    watch: 'var(--color-watch)',
    critical: 'var(--color-critical)'
  };
  
  return L.divIcon({
    className: `custom-marker marker-${status}`,
    html: `<div style="width: 20px; height: 20px; border-radius: 50%; background-color: ${colorMap[status]}; border: 2px solid white; ${status === 'critical' ? 'animation: pulse 2s infinite;' : ''}"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
};

// Fallback deterministic RUL prediction engine if backend is offline
const calculateLocalRul = (asset) => {
  const age = asset.age || 0;
  const load = asset.load || 0;
  const inspection_score = asset.inspection_score !== undefined ? asset.inspection_score : 100;
  const last_maintenance = asset.last_maintenance_years || 0;
  const asset_type = asset.type || 'bridge';

  const base_rul = asset_type === 'bridge' ? 50 : (asset_type === 'road' ? 40 : 30);

  const age_penalty = age * 0.5;
  const load_penalty = load * 0.2;
  const maintenance_penalty = last_maintenance * 2;
  const inspection_penalty = (100 - inspection_score) * 0.4;

  let estimated_rul = base_rul - age_penalty - load_penalty - maintenance_penalty - inspection_penalty;
  estimated_rul = Math.max(0, Math.round(estimated_rul * 10) / 10);

  let anomaly = false;
  const reasons = [];
  if (load > 80) {
    anomaly = true;
    reasons.push("High load");
  }
  if (last_maintenance >= 3) {
    anomaly = true;
    reasons.push(`${last_maintenance}yr since maintenance`);
  }
  if (inspection_score < 50) {
    anomaly = true;
    reasons.push("Poor inspection score");
  }
  if (age > (base_rul * 0.8)) {
    anomaly = true;
    reasons.push("Near end of design life");
  }
    
  let status = "stable";
  let explanation = "";
  if (estimated_rul <= 3 || anomaly) {
    status = "critical";
    if (reasons.length) {
      explanation = `${asset.name}: ${reasons.join(' + ')} → Failure risk in ~${Math.round(estimated_rul * 12)} months`;
    }
  } else if (estimated_rul <= 7) {
    status = "watch";
    explanation = `${asset.name}: Needs attention, ${last_maintenance}yr since maintenance → Evaluate in ~${Math.round((estimated_rul - 2) * 12)} months`;
  }

  return {
    ...asset,
    estimated_rul,
    anomaly,
    status,
    explanation
  };
};

function App() {
  const defaultBengaluru = [12.9716, 77.5946];
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const [mapCenter, setMapCenter] = useState(defaultBengaluru);
  const [mapZoom, setMapZoom] = useState(11);
  
  // Map style toggle
  const [mapStyle, setMapStyle] = useState('dark');
  const tileLayers = {
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
    },
    light: {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }
  };

  // Realistic Bengaluru Seeded Incidents (scattered across major urban corridors)
  const defaultSeeds = [
    {
      id: 'seed-blr-1',
      name: 'Outer Ring Road Water Main Rupture',
      type: 'pipeline',
      status: 'critical',
      lat: 12.9352,
      lng: 77.6881,
      description: 'Major underground pipeline breach near Bellandur junction. Substantial water accumulation on service lane.',
      severity: 'High',
      reporter: 'BWSSB Rapid Action',
      timestamp: new Date().toISOString()
    },
    {
      id: 'seed-blr-2',
      name: 'Ejipura Inner Ring Road Asphalt Sinkhole',
      type: 'road',
      status: 'critical',
      lat: 12.9412,
      lng: 77.6279,
      description: 'Cavitation and subsidence near flyover support column. Immediate diversion needed.',
      severity: 'High',
      reporter: 'BBMP Control Room',
      timestamp: new Date().toISOString()
    },
    {
      id: 'seed-blr-3',
      name: 'Hebbal Flyover Deck Expansion Joint Stress',
      type: 'bridge',
      status: 'watch',
      lat: 13.0421,
      lng: 77.5912,
      description: 'Sensor telemetry indicates accelerated vibration harmonics under peak hour freight traffic.',
      severity: 'Medium',
      reporter: 'Sensor Array S-04',
      timestamp: new Date().toISOString()
    },
    {
      id: 'seed-blr-4',
      name: 'Kengeri Rail Overbridge Pavement Distress',
      type: 'bridge',
      status: 'watch',
      lat: 12.9082,
      lng: 77.4841,
      description: 'Surface cracking along bridge ramp approach lane. Requires sealing prior to monsoon.',
      severity: 'Medium',
      reporter: 'Traffic Division West',
      timestamp: new Date().toISOString()
    },
    {
      id: 'seed-blr-5',
      name: 'Indiranagar 100ft Road Gas Duct Pressure Check',
      type: 'pipeline',
      status: 'stable',
      lat: 12.9734,
      lng: 77.6415,
      description: 'Preventive ultrasonic inspection completed. Secondary pressure valve nominal.',
      severity: 'Low',
      reporter: 'GAIL Tech Crew',
      timestamp: new Date().toISOString()
    }
  ];

  const [reportedIssues, setReportedIssues] = useState(() => {
    const saved = localStorage.getItem('reportedIssues_blr_v3');
    return saved ? JSON.parse(saved) : defaultSeeds;
  });

  const [reportMode, setReportMode] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [newIssue, setNewIssue] = useState({
    name: '',
    type: 'bridge',
    severity: 'Medium',
    description: '',
    reporter: ''
  });

  // Fetch Data & User Location with Bengaluru centering
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/predict_all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assets: rawAssets })
        });
        if (!response.ok) throw new Error('API server returned error');
        const data = await response.json();
        setAssets(data);
        setLoading(false);
      } catch (error) {
        console.warn("Backend API unavailable, using local deterministic predictive engine:", error);
        const localData = rawAssets.map(calculateLocalRul);
        setAssets(localData);
        setLoading(false);
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          // If within Karnataka / Bengaluru bounds, track location
          if (latitude >= 12.5 && latitude <= 13.5 && longitude >= 77.0 && longitude <= 78.0) {
            setUserLocation([latitude, longitude]);
            setMapCenter([latitude, longitude]);
          } else {
            setUserLocation(defaultBengaluru);
            setMapCenter(defaultBengaluru);
          }
          loadData();
        },
        (error) => {
          console.warn("Geolocation fallback to Bengaluru:", error);
          setUserLocation(defaultBengaluru);
          setMapCenter(defaultBengaluru);
          loadData();
        }
      );
    } else {
      setUserLocation(defaultBengaluru);
      setMapCenter(defaultBengaluru);
      loadData();
    }
  }, []);

  // Persist Reported Issues
  useEffect(() => {
    localStorage.setItem('reportedIssues_blr_v3', JSON.stringify(reportedIssues));
  }, [reportedIssues]);

  // Map Click Handler Component
  const MapEvents = () => {
    useMapEvents({
      click(e) {
        if (reportMode) {
          setSelectedCoords(e.latlng);
          setIsModalOpen(true);
          setReportMode(false);
        }
      },
    });
    return null;
  };

  const handleReportIssue = (e) => {
    e.preventDefault();
    const issue = {
      ...newIssue,
      id: Date.now().toString(),
      lat: selectedCoords.lat,
      lng: selectedCoords.lng,
      status: newIssue.severity === 'High' ? 'critical' : (newIssue.severity === 'Medium' ? 'watch' : 'stable'),
      timestamp: new Date().toISOString(),
      explanation: `${newIssue.name}: Reported issue - ${newIssue.description}`
    };
    setReportedIssues([issue, ...reportedIssues]);
    setIsModalOpen(false);
    setNewIssue({ name: '', type: 'bridge', severity: 'Medium', description: '', reporter: '' });
  };

  const deleteIssue = (id) => {
    setReportedIssues(reportedIssues.filter(i => i.id !== id));
  };

  const allAssets = [...assets, ...reportedIssues];
  
  // Combined filter for status and type
  const filteredAssets = allAssets.filter(asset => {
    const matchesStatus = activeFilter === 'all' || asset.status === activeFilter;
    const matchesType = typeFilter === 'all' || asset.type === typeFilter;
    return matchesStatus && matchesType;
  });

  const criticalAssets = allAssets.filter(a => a.status === 'critical');
  const watchAssets = allAssets.filter(a => a.status === 'watch');
  const stableAssets = allAssets.filter(a => a.status === 'stable');

  // Overall City Grid Health Index (0 - 100)
  const healthScore = allAssets.length > 0 
    ? Math.round(((stableAssets.length * 100) + (watchAssets.length * 60) + (criticalAssets.length * 20)) / allAssets.length)
    : 85;

  const alerts = allAssets
    .filter(a => a.status !== 'stable')
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  const chartData = {
    labels: ['Bridges', 'Roads', 'Pipelines'],
    datasets: [
      {
        label: 'Active Infrastructure Count',
        data: [
          allAssets.filter(a => a.type === 'bridge').length,
          allAssets.filter(a => a.type === 'road').length,
          allAssets.filter(a => a.type === 'pipeline').length,
        ],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        fill: true,
        tension: 0.4,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
        ticks: { color: '#94a3b8', stepSize: 1 }
      },
      x: {
        grid: { display: false },
        ticks: { color: '#94a3b8' }
      }
    }
  };

  return (
    <div className="dashboard-container">
      <header className="header">
        <div className="logo-container">
          <span className="logo-icon">⬡</span>
          <h1 className="logo-text">
            <span className="logo-infra">INFRA</span><span className="logo-watch">WATCH</span>
          </h1>
          <span className="logo-badge">LIVE</span>
          <span className="city-tag" style={{ marginLeft: '0.5rem' }}>BENGALURU</span>
        </div>
        <div style={{ display: 'flex', gap: '1.25rem', color: 'var(--text-muted)', alignItems: 'center', fontSize: '0.9rem' }}>
          <span><Activity size={18} style={{ verticalAlign: 'middle', marginRight: '5px' }} /> Live Diagnostics</span>
          <span>{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
      </header>

      <div className="main-content">
        {/* Left Dashboard Panel */}
        <div className="left-dashboard">
          {/* Executive Overview & Health Score */}
          <div className="card left-card">
            <div className="card-header-badge">
              <span className="live-indicator"><span className="pulse-dot"></span> LIVE MONITORING</span>
              <span className="city-tag">BBMP REGION</span>
            </div>
            <h2 className="overview-title">Urban Infrastructure Grid</h2>
            <p className="overview-subtitle">Real-time predictive health, sensor diagnostics, and failure risk estimation across Bengaluru</p>
            
            <div className="health-score-container">
              <div className="health-score-header">
                <span>Grid Health Index</span>
                <span 
                  className="health-score-value" 
                  style={{ 
                    color: healthScore >= 75 ? 'var(--color-stable)' : (healthScore >= 50 ? 'var(--color-watch)' : 'var(--color-critical)') 
                  }}
                >
                  {healthScore}%
                </span>
              </div>
              <div className="health-progress-bar">
                <div 
                  className="health-progress-fill" 
                  style={{ 
                    width: `${healthScore}%`,
                    background: healthScore >= 75 
                      ? 'linear-gradient(90deg, #10b981, #34d399)' 
                      : (healthScore >= 50 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #ef4444, #f87171)')
                  }}
                ></div>
              </div>
              <div className="health-stats-row">
                <span><strong style={{ color: 'var(--color-critical)' }}>{criticalAssets.length}</strong> Critical</span>
                <span><strong style={{ color: 'var(--color-watch)' }}>{watchAssets.length}</strong> Watch</span>
                <span><strong style={{ color: 'var(--color-stable)' }}>{stableAssets.length}</strong> Stable</span>
              </div>
            </div>
          </div>

          {/* Asset Category Filters */}
          <div className="card left-card">
            <h3><Layers size={18} /> Asset Categories</h3>
            <div className="category-filters">
              <button 
                className={`cat-btn ${typeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setTypeFilter('all')}
              >
                <div className="cat-icon-name">
                  <Activity size={16} /> All Monitored Nodes
                </div>
                <span className="cat-count">{allAssets.length}</span>
              </button>

              <button 
                className={`cat-btn ${typeFilter === 'bridge' ? 'active' : ''}`}
                onClick={() => setTypeFilter(typeFilter === 'bridge' ? 'all' : 'bridge')}
              >
                <div className="cat-icon-name">
                  <span className="type-badge-dot bridge"></span> Bridges & Flyovers
                </div>
                <span className="cat-count">{allAssets.filter(a => a.type === 'bridge').length}</span>
              </button>

              <button 
                className={`cat-btn ${typeFilter === 'road' ? 'active' : ''}`}
                onClick={() => setTypeFilter(typeFilter === 'road' ? 'all' : 'road')}
              >
                <div className="cat-icon-name">
                  <span className="type-badge-dot road"></span> Arterial Corridors
                </div>
                <span className="cat-count">{allAssets.filter(a => a.type === 'road').length}</span>
              </button>

              <button 
                className={`cat-btn ${typeFilter === 'pipeline' ? 'active' : ''}`}
                onClick={() => setTypeFilter(typeFilter === 'pipeline' ? 'all' : 'pipeline')}
              >
                <div className="cat-icon-name">
                  <span className="type-badge-dot pipeline"></span> Water & Gas Mains
                </div>
                <span className="cat-count">{allAssets.filter(a => a.type === 'pipeline').length}</span>
              </button>
            </div>
          </div>

          {/* Real-time Telemetry Sensors */}
          <div className="card left-card">
            <h3><Radio size={18} color="var(--accent)" /> Sensor Telemetry</h3>
            <div className="telemetry-list">
              <div className="telemetry-item">
                <div className="telemetry-meta">
                  <span className="tel-name">Structural Strain</span>
                  <span className="tel-val nominal">0.042 µε</span>
                </div>
                <div className="telemetry-status">Bridges Nominal (&lt; 0.10 µε)</div>
              </div>

              <div className="telemetry-item">
                <div className="telemetry-meta">
                  <span className="tel-name">Hydraulic Pressure</span>
                  <span className="tel-val nominal">4.2 Bar</span>
                </div>
                <div className="telemetry-status">Water Pipelines Flow Normal</div>
              </div>

              <div className="telemetry-item">
                <div className="telemetry-meta">
                  <span className="tel-name">Vibration Harmonics</span>
                  <span className="tel-val warning">1.82 Hz</span>
                </div>
                <div className="telemetry-status">Elevated near Silk Board & ORR</div>
              </div>

              <div className="telemetry-item">
                <div className="telemetry-meta">
                  <span className="tel-name">AI Predictive Engine</span>
                  <span className="tel-val online">ONLINE</span>
                </div>
                <div className="telemetry-status">Weighted RUL Multi-Factor v2.1</div>
              </div>
            </div>
          </div>

          {/* Quick Dispatch & Map Actions */}
          <div className="card left-card">
            <h3><Navigation size={18} /> Quick Dispatch & View</h3>
            <div className="quick-actions-grid">
              <button 
                className="quick-action-btn"
                onClick={() => {
                  setMapCenter([...defaultBengaluru]);
                  setMapZoom(11);
                }}
              >
                <MapPin size={15} /> Central Bengaluru
              </button>

              <button 
                className={`quick-action-btn ${activeFilter === 'critical' ? 'active-critical' : ''}`}
                onClick={() => setActiveFilter(activeFilter === 'critical' ? 'all' : 'critical')}
              >
                <AlertTriangle size={15} color="var(--color-critical)" /> Critical Only
              </button>

              <button 
                className="quick-action-btn"
                onClick={() => {
                  setActiveFilter('all');
                  setTypeFilter('all');
                }}
              >
                <RefreshCw size={15} /> Reset All Filters
              </button>
            </div>
          </div>
        </div>

        {/* Center Map Section */}
        <div className="map-section">
          <div className="map-controls">
            <button 
              className={`control-btn ${reportMode ? 'active' : ''}`}
              onClick={() => setReportMode(!reportMode)}
            >
              {reportMode ? <X size={18} /> : <Plus size={18} />}
              {reportMode ? 'Cancel Reporting' : 'Report Incident'}
            </button>
            <button 
              className="control-btn" 
              onClick={() => {
                setActiveFilter('all');
                setTypeFilter('all');
              }}
            >
              <Filter size={18} /> Reset Filters
            </button>
            <button
              className="control-btn map-toggle-btn"
              onClick={() => setMapStyle(mapStyle === 'dark' ? 'light' : 'dark')}
              title="Toggle map style"
            >
              {mapStyle === 'dark' ? '☀️ Light Map' : '🌙 Dark Map'}
            </button>
          </div>

          {reportMode && <div className="report-hint">Click anywhere on the map to mark an incident</div>}

          <div className="map-legend">
            <div className="legend-item"><div className="dot" style={{ background: 'var(--color-critical)' }}></div> Critical Risk ({criticalAssets.length})</div>
            <div className="legend-item"><div className="dot" style={{ background: 'var(--color-watch)' }}></div> Warning / Watch ({watchAssets.length})</div>
            <div className="legend-item"><div className="dot" style={{ background: 'var(--color-stable)' }}></div> Stable / Clear ({stableAssets.length})</div>
            <div className="legend-item"><div className="dot" style={{ background: 'var(--accent)' }}></div> Your Location</div>
          </div>

          {loading || !userLocation ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)' }}>
              Loading Map Data & Location...
            </div>
          ) : (
            <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '100%', width: '100%' }}>
              <ChangeMapView center={mapCenter} zoom={mapZoom} />
              <MapEvents />
              <TileLayer
                key={mapStyle}
                url={tileLayers[mapStyle].url}
                attribution={tileLayers[mapStyle].attribution}
              />
              <Marker position={userLocation} icon={userLocationIcon}>
                <Popup>Your Current Location</Popup>
              </Marker>
              {filteredAssets.map((asset) => (
                <Marker
                  key={asset.id}
                  position={[asset.lat, asset.lng]}
                  icon={createIcon(asset.status)}
                >
                  <Popup>
                    <div style={{ padding: '0.5rem' }}>
                      <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-main)', fontSize: '1.1rem' }}>{asset.name}</h3>
                      <p style={{ margin: '0 0 0.25rem 0', color: 'var(--text-muted)' }}>Type: {asset.type.toUpperCase()}</p>
                      {asset.description && <p style={{ margin: '0.5rem 0', fontSize: '0.85rem' }}>{asset.description}</p>}
                      <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--glass-border)' }}>
                        <span className={`status-badge badge-${asset.status}`}>{asset.status}</span>
                        {asset.estimated_rul !== undefined && <p style={{ marginTop: '0.5rem', fontWeight: 'bold' }}>Est. RUL: {asset.estimated_rul} years</p>}
                        {asset.severity && <p style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}>Severity: {asset.severity}</p>}
                        {(asset.id.toString().includes('seed') || !isNaN(asset.id)) ? (
                          <div className="issue-actions">
                            <button className="action-btn delete" onClick={() => deleteIssue(asset.id)}>
                              <Trash2 size={14} /> Remove Report
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}
        </div>

        {/* Right Side Panel */}
        <div className="side-panel">
          <div className="card" style={{ flex: 'none' }}>
            <h2><Activity size={20} /> Network Status</h2>
            <div className="stats-grid">
              <div 
                className={`stat-box ${activeFilter === 'stable' ? 'active' : ''}`} 
                style={{ borderLeft: '4px solid var(--color-stable)' }}
                onClick={() => setActiveFilter(activeFilter === 'stable' ? 'all' : 'stable')}
              >
                <div className="value" style={{ color: 'var(--color-stable)' }}>{stableAssets.length}</div>
                <div className="label">Stable</div>
              </div>
              <div 
                className={`stat-box ${activeFilter === 'watch' ? 'active' : ''}`} 
                style={{ borderLeft: '4px solid var(--color-watch)' }}
                onClick={() => setActiveFilter(activeFilter === 'watch' ? 'all' : 'watch')}
              >
                <div className="value" style={{ color: 'var(--color-watch)' }}>{watchAssets.length}</div>
                <div className="label">Watch</div>
              </div>
              <div 
                className={`stat-box ${activeFilter === 'critical' ? 'active' : ''}`} 
                style={{ borderLeft: '4px solid var(--color-critical)' }}
                onClick={() => setActiveFilter(activeFilter === 'critical' ? 'all' : 'critical')}
              >
                <div className="value" style={{ color: 'var(--color-critical)' }}>{criticalAssets.length}</div>
                <div className="label">Critical</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ flex: 'none' }}>
            <h2><Activity size={20} /> System Degradation Trend</h2>
            <div className="chart-container">
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>

          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2><ShieldAlert size={20} color="var(--color-critical)" /> Early Warning Feed</h2>
            <div className="warning-feed">
              <div className="feed-container">
                {alerts.length > 0 ? alerts.map((alert, idx) => (
                  <div key={alert.id || idx} className={`alert-item ${alert.status}`}>
                    <div className="alert-title">
                      <span>{alert.name}</span>
                      <span style={{ fontSize: '0.8rem', color: alert.status === 'critical' ? 'var(--color-critical)' : 'var(--color-watch)' }}>
                        {alert.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="alert-desc">{alert.explanation || (alert.estimated_rul ? `End of life in ${alert.estimated_rul}yr` : 'Critical issue reported')}</div>
                    <div style={{ fontSize: '0.7rem', marginTop: '0.25rem', opacity: 0.6 }}>
                      {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : 'AI Forecast'}
                    </div>
                  </div>
                )) : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    All systems clear
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Report Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Report Infrastructure Incident</h2>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleReportIssue}>
              <div className="form-group">
                <label>Incident Title</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. Bridge Pothole, Pipe Leak" 
                  required 
                  value={newIssue.name}
                  onChange={e => setNewIssue({...newIssue, name: e.target.value})}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Infrastructure Type</label>
                  <select 
                    className="form-control" 
                    value={newIssue.type}
                    onChange={e => setNewIssue({...newIssue, type: e.target.value})}
                  >
                    <option value="bridge">Bridge</option>
                    <option value="road">Road</option>
                    <option value="pipeline">Pipeline</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Severity</label>
                  <select 
                    className="form-control" 
                    value={newIssue.severity}
                    onChange={e => setNewIssue({...newIssue, severity: e.target.value})}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea 
                  className="form-control" 
                  rows="3" 
                  placeholder="Describe the issue..." 
                  required
                  value={newIssue.description}
                  onChange={e => setNewIssue({...newIssue, description: e.target.value})}
                ></textarea>
              </div>
              <div className="form-group">
                <label>Reporter Name (Optional)</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="Your name"
                  value={newIssue.reporter}
                  onChange={e => setNewIssue({...newIssue, reporter: e.target.value})}
                />
              </div>
              <div className="btn-group">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Submit Report</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
