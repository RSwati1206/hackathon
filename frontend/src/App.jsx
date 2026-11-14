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
  ShieldAlert, 
  Plus, 
  MapPin, 
  X, 
  Trash2, 
  Filter,
  Layers,
  Radio,
  Navigation,
  RefreshCw,
  Map,
  Gauge,
  ArrowLeft,
  Sliders
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
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);
    return () => clearTimeout(timer);
  }, [center, zoom, map]);

  useEffect(() => {
    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [map]);

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
  
  // Dashboard active view: 'map' | 'dispatch' | 'telemetry'
  const [activeView, setActiveView] = useState('map');

  // Map style toggle (Uses 100% free OpenStreetMap tiles without API key requirements)
  const [mapStyle, setMapStyle] = useState('dark');

  // Realistic Bengaluru Seeded Incidents
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
  const [dispatchFilter, setDispatchFilter] = useState('all');
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

  // Dispatch items data
  const dispatchItems = [
    {
      id: 'disp-1',
      badge: 'DISPATCHED',
      badgeClass: 'dispatched',
      node: 'ORR-WTR-01',
      title: 'Outer Ring Road Water Main Rupture',
      desc: 'Rapid Action Unit #4 deployed to Bellandur ORR pipeline breach. High-volume pressure diversion active to prevent roadway flooding.',
      location: 'Bellandur Sector 2, Outer Ring Rd',
      lat: 12.9352,
      lng: 77.6881,
      time: 'Just now',
      squad: 'BWSSB Rapid Action Squad 4',
      status: 'En Route',
      priority: 'Urgent'
    },
    {
      id: 'disp-2',
      badge: 'INVESTIGATING',
      badgeClass: 'warning',
      node: 'EJP-ROD-02',
      title: 'Ejipura Inner Ring Road Asphalt Cavitation',
      desc: 'BBMP road inspection squad assessing inner ring road cave-in near flyover support column. Heavy vehicle diversion in effect.',
      location: 'Ejipura Corridor, Koramangala Link',
      lat: 12.9412,
      lng: 77.6279,
      time: '7m ago',
      squad: 'BBMP Zone 5 Road Ops',
      status: 'On Site',
      priority: 'High'
    },
    {
      id: 'disp-3',
      badge: 'MONITORING',
      badgeClass: 'nominal',
      node: 'HBL-BRG-01',
      title: 'Hebbal Flyover Deck Expansion Joint Telemetry',
      desc: 'Hebbal flyover deck harmonic sensors operating within nominal peak-hour tolerance limits. Real-time vibration damping continuous.',
      location: 'Hebbal Flyover North Ramp',
      lat: 13.0421,
      lng: 77.5912,
      time: '14m ago',
      squad: 'Sensor Array S-04 Auto-Telemetry',
      status: 'Active Diagnostics',
      priority: 'Medium'
    },
    {
      id: 'disp-4',
      badge: 'VERIFIED',
      badgeClass: 'resolved',
      node: 'IND-GAS-03',
      title: 'Indiranagar 100ft Road Gas Conduit Pulse Check',
      desc: 'Indiranagar 100ft road gas conduit ultrasonic pulse telemetry confirmed nominal and stable. Valve pressure regulated at 4.2 Bar.',
      location: '100ft Road Indiranagar / 12th Main',
      lat: 12.9734,
      lng: 77.6415,
      time: '26m ago',
      squad: 'GAIL Tech Crew Bangalore East',
      status: 'Complete & Nominal',
      priority: 'Low'
    },
    {
      id: 'disp-5',
      badge: 'STANDBY',
      badgeClass: 'nominal',
      node: 'KNG-ROB-04',
      title: 'Kengeri Rail Overbridge Approach Ramp',
      desc: 'Routine asphalt scanning squad placed on alert for upcoming pre-monsoon surface seal maintenance schedule.',
      location: 'Kengeri Satellite Town Flyover',
      lat: 12.9082,
      lng: 77.4841,
      time: '42m ago',
      squad: 'PWD Traffic Division West',
      status: 'Scheduled',
      priority: 'Medium'
    }
  ];

  const filteredDispatches = dispatchItems.filter(item => {
    if (dispatchFilter === 'all') return true;
    return item.badgeClass === dispatchFilter;
  });

  const jumpToLocationOnMap = (lat, lng) => {
    setMapCenter([lat, lng]);
    setMapZoom(14);
    setActiveView('map');
  };

  return (
    <div className="dashboard-container">
      <header className="header">
        <div className="logo-container">
          <span className="logo-icon">⬢</span>
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
          {/* Health & Grid Overview */}
          <div className="card left-card overview-card">
            <div className="card-top-meta">
              <span className="live-status-pill">
                <span className="pulse-dot"></span> BBMP GRID LIVE
              </span>
              <span className="region-pill">BENGALURU</span>
            </div>

            <div className="health-hero">
              <div className="health-score-ring">
                <span 
                  className="health-number" 
                  style={{ 
                    color: healthScore >= 75 ? 'var(--color-stable)' : (healthScore >= 50 ? 'var(--color-watch)' : 'var(--color-critical)') 
                  }}
                >
                  {healthScore}
                </span>
                <span className="health-percent">%</span>
              </div>
              <div className="health-hero-text">
                <h4>Grid Health Index</h4>
                <p>Autonomous AI Diagnostic</p>
              </div>
            </div>

            <div className="health-mini-bar">
              <div 
                className="health-bar-fill" 
                style={{ 
                  width: `${healthScore}%`,
                  background: healthScore >= 75 
                    ? 'linear-gradient(90deg, #10b981, #34d399)' 
                    : (healthScore >= 50 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #ef4444, #f87171)')
                }}
              ></div>
            </div>

            <div className="health-chips-row">
              <span 
                className={`health-chip chip-critical ${activeFilter === 'critical' ? 'selected' : ''}`}
                onClick={() => { setActiveFilter(activeFilter === 'critical' ? 'all' : 'critical'); if (activeView !== 'map') setActiveView('map'); }}
              >
                ● {criticalAssets.length} Critical
              </span>
              <span 
                className={`health-chip chip-watch ${activeFilter === 'watch' ? 'selected' : ''}`}
                onClick={() => { setActiveFilter(activeFilter === 'watch' ? 'all' : 'watch'); if (activeView !== 'map') setActiveView('map'); }}
              >
                ● {watchAssets.length} Watch
              </span>
              <span 
                className={`health-chip chip-stable ${activeFilter === 'stable' ? 'selected' : ''}`}
                onClick={() => { setActiveFilter(activeFilter === 'stable' ? 'all' : 'stable'); if (activeView !== 'map') setActiveView('map'); }}
              >
                ● {stableAssets.length} Stable
              </span>
            </div>
          </div>

          {/* Dashboard Navigation Menu */}
          <div className="card left-card dashboard-nav-card">
            <div className="card-section-label">
              <Sliders size={13} /> DASHBOARD VIEWS
            </div>
            <div className="dashboard-nav-list">
              <button 
                className={`nav-tab-btn ${activeView === 'map' ? 'active' : ''}`}
                onClick={() => setActiveView('map')}
              >
                <div className="nav-tab-icon-wrap">
                  <Map size={16} />
                </div>
                <div className="nav-tab-content">
                  <span className="nav-tab-title">Live Map View</span>
                  <span className="nav-tab-sub">Geospatial Grid Monitor</span>
                </div>
                <span className="nav-tab-badge">{allAssets.length} Nodes</span>
              </button>

              <button 
                className={`nav-tab-btn ${activeView === 'dispatch' ? 'active' : ''}`}
                onClick={() => setActiveView('dispatch')}
              >
                <div className="nav-tab-icon-wrap dispatch-icon">
                  <Radio size={16} />
                </div>
                <div className="nav-tab-content">
                  <span className="nav-tab-title">Live Dispatch Stream</span>
                  <span className="nav-tab-sub">Rapid Action & Sensor Activity</span>
                </div>
                <span className="nav-tab-badge pulse-badge">4 Active</span>
              </button>

              <button 
                className={`nav-tab-btn ${activeView === 'telemetry' ? 'active' : ''}`}
                onClick={() => setActiveView('telemetry')}
              >
                <div className="nav-tab-icon-wrap telemetry-icon">
                  <Gauge size={16} />
                </div>
                <div className="nav-tab-content">
                  <span className="nav-tab-title">Sensor Telemetry Matrix</span>
                  <span className="nav-tab-sub">Real-Time Sensor Diagnostics</span>
                </div>
                <span className="nav-tab-badge ok-badge">Nominal</span>
              </button>
            </div>
          </div>

          {/* Asset Category Selector */}
          <div className="card left-card">
            <div className="card-section-label">
              <Layers size={13} /> ASSET CATEGORIES
            </div>
            <div className="category-pill-group">
              <button 
                className={`cat-pill-btn ${typeFilter === 'all' ? 'active' : ''}`}
                onClick={() => { setTypeFilter('all'); if (activeView !== 'map') setActiveView('map'); }}
              >
                <span className="cat-name">All Infrastructure</span>
                <span className="cat-pill-count">{allAssets.length}</span>
              </button>

              <button 
                className={`cat-pill-btn ${typeFilter === 'bridge' ? 'active' : ''}`}
                onClick={() => { setTypeFilter(typeFilter === 'bridge' ? 'all' : 'bridge'); if (activeView !== 'map') setActiveView('map'); }}
              >
                <span className="cat-name"><span className="type-badge-dot bridge"></span> Bridges & Flyovers</span>
                <span className="cat-pill-count">{allAssets.filter(a => a.type === 'bridge').length}</span>
              </button>

              <button 
                className={`cat-pill-btn ${typeFilter === 'road' ? 'active' : ''}`}
                onClick={() => { setTypeFilter(typeFilter === 'road' ? 'all' : 'road'); if (activeView !== 'map') setActiveView('map'); }}
              >
                <span className="cat-name"><span className="type-badge-dot road"></span> Arterial Corridors</span>
                <span className="cat-pill-count">{allAssets.filter(a => a.type === 'road').length}</span>
              </button>

              <button 
                className={`cat-pill-btn ${typeFilter === 'pipeline' ? 'active' : ''}`}
                onClick={() => { setTypeFilter(typeFilter === 'pipeline' ? 'all' : 'pipeline'); if (activeView !== 'map') setActiveView('map'); }}
              >
                <span className="cat-name"><span className="type-badge-dot pipeline"></span> Water & Gas Mains</span>
                <span className="cat-pill-count">{allAssets.filter(a => a.type === 'pipeline').length}</span>
              </button>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="card left-card quick-actions-card">
            <div className="card-section-label">
              <Navigation size={13} /> QUICK VIEW CONTROLS
            </div>
            <div className="quick-actions-row">
              <button 
                className="action-chip"
                onClick={() => {
                  setActiveView('map');
                  setMapCenter([...defaultBengaluru]);
                  setMapZoom(11);
                }}
                title="Center on Central Bengaluru"
              >
                <MapPin size={13} /> Central Blr
              </button>

              <button 
                className={`action-chip ${activeFilter === 'critical' ? 'active-critical' : ''}`}
                onClick={() => {
                  setActiveFilter(activeFilter === 'critical' ? 'all' : 'critical');
                  if (activeView !== 'map') setActiveView('map');
                }}
                title="Filter critical incidents only"
              >
                <AlertTriangle size={13} color="var(--color-critical)" /> Critical
              </button>

              <button 
                className="action-chip"
                onClick={() => {
                  setActiveFilter('all');
                  setTypeFilter('all');
                  setActiveView('map');
                }}
                title="Reset all filters"
              >
                <RefreshCw size={13} /> Reset
              </button>
            </div>
          </div>
        </div>

        {/* Center Column: Dynamic Content based on activeView */}
        <div className="center-column">
          {/* VIEW 1: LIVE MAP VIEW */}
          {activeView === 'map' && (
            <div className="map-section full-center-map">
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
                    className={mapStyle === 'dark' ? 'dark-tiles' : ''}
                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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
          )}

          {/* VIEW 2: LIVE DISPATCH & ACTIVITY STREAM */}
          {activeView === 'dispatch' && (
            <div className="card detailed-view-card">
              <div className="detailed-view-header">
                <div className="header-left">
                  <button className="back-map-btn" onClick={() => setActiveView('map')}>
                    <ArrowLeft size={16} /> Back to Live Map
                  </button>
                  <div className="title-area">
                    <h2><Radio size={20} color="var(--color-stable)" /> Live Dispatch & Structural Sensor Activity Stream</h2>
                    <p className="subtitle">Real-time BBMP emergency response teams, telemetry pings, and repair logs</p>
                  </div>
                </div>
                <div className="header-right">
                  <span className="live-status-pill">
                    <span className="pulse-dot"></span> BBMP REAL-TIME LOG
                  </span>
                </div>
              </div>

              {/* Filter Tabs for Dispatch Stream */}
              <div className="stream-filter-bar">
                <button 
                  className={`stream-pill ${dispatchFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setDispatchFilter('all')}
                >
                  All Logs ({dispatchItems.length})
                </button>
                <button 
                  className={`stream-pill ${dispatchFilter === 'dispatched' ? 'active' : ''}`}
                  onClick={() => setDispatchFilter('dispatched')}
                >
                  Active Dispatches (1)
                </button>
                <button 
                  className={`stream-pill ${dispatchFilter === 'warning' ? 'active' : ''}`}
                  onClick={() => setDispatchFilter('warning')}
                >
                  Investigating (1)
                </button>
                <button 
                  className={`stream-pill ${dispatchFilter === 'nominal' ? 'active' : ''}`}
                  onClick={() => setDispatchFilter('nominal')}
                >
                  Nominal Monitoring (2)
                </button>
              </div>

              {/* Detailed Dispatch Cards */}
              <div className="dispatch-detailed-list">
                {filteredDispatches.map(item => (
                  <div key={item.id} className="dispatch-detail-item">
                    <div className="item-left-strip">
                      <span className={`dispatch-badge ${item.badgeClass}`}>{item.badge}</span>
                      <span className="node-id-tag">{item.node}</span>
                      <span className="priority-pill">{item.priority} Priority</span>
                    </div>
                    <div className="item-content">
                      <div className="item-title-row">
                        <h3>{item.title}</h3>
                        <span className="item-time-stamp">{item.time}</span>
                      </div>
                      <p className="item-description">{item.desc}</p>
                      <div className="item-meta-bar">
                        <span className="meta-info"><MapPin size={13} /> {item.location}</span>
                        <span className="meta-info squad"><Activity size={13} /> {item.squad}</span>
                        <span className="meta-info status-flag">Status: {item.status}</span>
                      </div>
                    </div>
                    <div className="item-actions">
                      <button 
                        className="btn-inspect-map"
                        onClick={() => jumpToLocationOnMap(item.lat, item.lng)}
                        title="View this incident location on Map"
                      >
                        <Map size={14} /> View On Map
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW 3: SENSOR TELEMETRY MATRIX */}
          {activeView === 'telemetry' && (
            <div className="card detailed-view-card">
              <div className="detailed-view-header">
                <div className="header-left">
                  <button className="back-map-btn" onClick={() => setActiveView('map')}>
                    <ArrowLeft size={16} /> Back to Live Map
                  </button>
                  <div className="title-area">
                    <h2><Gauge size={20} color="var(--accent)" /> Sensor Telemetry Matrix & Health Diagnostics</h2>
                    <p className="subtitle">High-frequency structural sensors, hydraulic piezometers, and acoustic harmonic monitors</p>
                  </div>
                </div>
                <div className="header-right">
                  <span className="live-status-pill">
                    <span className="pulse-dot"></span> 24 SENSORS STREAMING
                  </span>
                </div>
              </div>

              {/* Sensor Telemetry 6-Tile Grid */}
              <div className="telemetry-dashboard-grid">
                {/* Tile 1: Strain Gauges */}
                <div className="telemetry-card">
                  <div className="telemetry-card-top">
                    <span className="telemetry-card-title">Structural Strain Gauges</span>
                    <span className="telemetry-badge nominal">NOMINAL</span>
                  </div>
                  <div className="telemetry-card-value-row">
                    <span className="telemetry-main-value text-nominal">0.042 µε</span>
                    <span className="telemetry-threshold">Safe Limit: &lt; 0.10 µε</span>
                  </div>
                  <p className="telemetry-card-desc">Bridges & Flyovers: Microstrain gauges across Hebbal, Silk Board, and KR Puram deck girders operating in linear elastic range.</p>
                  <div className="telemetry-progress-bar">
                    <div className="progress-fill" style={{ width: '42%', background: 'var(--color-stable)' }}></div>
                  </div>
                  <div className="telemetry-card-footer">
                    <span>12 Active Gauges</span>
                    <span>Sampling: 100 Hz</span>
                  </div>
                </div>

                {/* Tile 2: Line Pressure */}
                <div className="telemetry-card">
                  <div className="telemetry-card-top">
                    <span className="telemetry-card-title">Hydraulic Line Pressure</span>
                    <span className="telemetry-badge nominal">OPTIMAL</span>
                  </div>
                  <div className="telemetry-card-value-row">
                    <span className="telemetry-main-value text-nominal">4.2 Bar</span>
                    <span className="telemetry-threshold">Nominal: 3.8 - 4.6 Bar</span>
                  </div>
                  <p className="telemetry-card-desc">Water & Gas Mains: Cauvery feeder line piezometers reporting constant hydraulic head with no rapid pressure surges.</p>
                  <div className="telemetry-progress-bar">
                    <div className="progress-fill" style={{ width: '65%', background: '#38bdf8' }}></div>
                  </div>
                  <div className="telemetry-card-footer">
                    <span>8 Pipeline Valves</span>
                    <span>Zero Cavitation</span>
                  </div>
                </div>

                {/* Tile 3: Vibration Harmonics */}
                <div className="telemetry-card">
                  <div className="telemetry-card-top">
                    <span className="telemetry-card-title">Vibration Harmonics</span>
                    <span className="telemetry-badge warning">ELEVATED</span>
                  </div>
                  <div className="telemetry-card-value-row">
                    <span className="telemetry-main-value text-warning">1.82 Hz</span>
                    <span className="telemetry-threshold">Normal: &lt; 1.50 Hz</span>
                  </div>
                  <p className="telemetry-card-desc">ORR & Silk Board Flyover: Peak traffic load inducing harmonic resonance. Structural damping systems active to minimize fatigue.</p>
                  <div className="telemetry-progress-bar">
                    <div className="progress-fill" style={{ width: '78%', background: 'var(--color-watch)' }}></div>
                  </div>
                  <div className="telemetry-card-footer">
                    <span>16 Accelerometers</span>
                    <span>Fatigue Rate: +1.2%</span>
                  </div>
                </div>

                {/* Tile 4: AI Prognostic Engine */}
                <div className="telemetry-card">
                  <div className="telemetry-card-top">
                    <span className="telemetry-card-title">AI Prognostic Engine</span>
                    <span className="telemetry-badge online">ONLINE</span>
                  </div>
                  <div className="telemetry-card-value-row">
                    <span className="telemetry-main-value text-online">99.4%</span>
                    <span className="telemetry-threshold">Model: Multi-Factor RUL v2.1</span>
                  </div>
                  <p className="telemetry-card-desc">Autonomous machine learning inference synthesizing sensor feeds, maintenance history, and traffic telemetry into Remaining Useful Life.</p>
                  <div className="telemetry-progress-bar">
                    <div className="progress-fill" style={{ width: '99%', background: 'linear-gradient(90deg, #3b82f6, #06b6d4)' }}></div>
                  </div>
                  <div className="telemetry-card-footer">
                    <span>25 Nodes Processed</span>
                    <span>Latency: 18ms</span>
                  </div>
                </div>

                {/* Tile 5: Acoustic Crack Detection */}
                <div className="telemetry-card">
                  <div className="telemetry-card-top">
                    <span className="telemetry-card-title">Acoustic Emission Piezos</span>
                    <span className="telemetry-badge nominal">CLEAR</span>
                  </div>
                  <div className="telemetry-card-value-row">
                    <span className="telemetry-main-value text-nominal">0 Events</span>
                    <span className="telemetry-threshold">Threshold: &gt; 5 / hr</span>
                  </div>
                  <p className="telemetry-card-desc">Sub-surface ultrasonic transducers listening for micro-fissure propagation in pre-stressed concrete pillars.</p>
                  <div className="telemetry-progress-bar">
                    <div className="progress-fill" style={{ width: '8%', background: 'var(--color-stable)' }}></div>
                  </div>
                  <div className="telemetry-card-footer">
                    <span>18 Transducers</span>
                    <span>Status: No Fissures</span>
                  </div>
                </div>

                {/* Tile 6: Thermal Gradient Expansion */}
                <div className="telemetry-card">
                  <div className="telemetry-card-top">
                    <span className="telemetry-card-title">Deck Thermal Gradients</span>
                    <span className="telemetry-badge nominal">NOMINAL</span>
                  </div>
                  <div className="telemetry-card-value-row">
                    <span className="telemetry-main-value text-nominal">31.4 °C</span>
                    <span className="telemetry-threshold">Range: 20°C - 48°C</span>
                  </div>
                  <p className="telemetry-card-desc">Asphalt surface thermocouple arrays measuring thermal expansion and contraction cycles across arterial bridges.</p>
                  <div className="telemetry-progress-bar">
                    <div className="progress-fill" style={{ width: '52%', background: '#f59e0b' }}></div>
                  </div>
                  <div className="telemetry-card-footer">
                    <span>Expansion Gap: 14mm</span>
                    <span>Safe Tolerance</span>
                  </div>
                </div>
              </div>
            </div>
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
                onClick={() => { setActiveFilter(activeFilter === 'stable' ? 'all' : 'stable'); if (activeView !== 'map') setActiveView('map'); }}
              >
                <div className="value" style={{ color: 'var(--color-stable)' }}>{stableAssets.length}</div>
                <div className="label">Stable</div>
              </div>
              <div 
                className={`stat-box ${activeFilter === 'watch' ? 'active' : ''}`} 
                style={{ borderLeft: '4px solid var(--color-watch)' }}
                onClick={() => { setActiveFilter(activeFilter === 'watch' ? 'all' : 'watch'); if (activeView !== 'map') setActiveView('map'); }}
              >
                <div className="value" style={{ color: 'var(--color-watch)' }}>{watchAssets.length}</div>
                <div className="label">Watch</div>
              </div>
              <div 
                className={`stat-box ${activeFilter === 'critical' ? 'active' : ''}`} 
                style={{ borderLeft: '4px solid var(--color-critical)' }}
                onClick={() => { setActiveFilter(activeFilter === 'critical' ? 'all' : 'critical'); if (activeView !== 'map') setActiveView('map'); }}
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
                  <div 
                    key={alert.id || idx} 
                    className={`alert-item ${alert.status}`}
                    onClick={() => {
                      if (alert.lat && alert.lng) {
                        jumpToLocationOnMap(alert.lat, alert.lng);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                    title="Click to view on Map"
                  >
                    <div className="alert-title">
                      <span>{alert.name}</span>
                      <span style={{ fontSize: '0.8rem', color: alert.status === 'critical' ? 'var(--color-critical)' : 'var(--color-watch)' }}>
                        {alert.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="alert-desc">{alert.explanation || (alert.estimated_rul ? `End of life in ${alert.estimated_rul}yr` : 'Critical issue reported')}</div>
                    <div style={{ fontSize: '0.7rem', marginTop: '0.25rem', opacity: 0.6 }}>
                      {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : 'AI Forecast'} • Click to view
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
