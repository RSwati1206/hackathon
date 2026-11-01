import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
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
import { Activity, AlertTriangle, CheckCircle, ShieldAlert, Plus, MapPin, X, Trash2, Filter } from 'lucide-react';
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

// User Location Icon
const userLocationIcon = L.divIcon({
  className: 'user-marker',
  html: `<div style="width: 16px; height: 16px; border-radius: 50%; background-color: #3b82f6; border: 3px solid white; box-shadow: 0 0 10px rgba(59, 130, 246, 0.8);"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11]
});

// Custom Leaflet Icons
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

function App() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  
  // Map style toggle
  const [mapStyle, setMapStyle] = useState('dark');
  const tileLayers = {
    dark: {
      url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    },
    light: {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }
  };

  // New State
  const [reportedIssues, setReportedIssues] = useState(() => {
    const saved = localStorage.getItem('reportedIssues');
    return saved ? JSON.parse(saved) : [
      {
        id: 'seed-1',
        name: 'Main St Water Leak',
        type: 'pipeline',
        status: 'critical',
        lat: 12.9716,
        lng: 77.5946,
        description: 'Large pipe burst near the intersection. Water pressure dropping in sector 4.',
        severity: 'High',
        reporter: 'System Admin',
        timestamp: new Date().toISOString()
      },
      {
        id: 'seed-2',
        name: 'Outer Ring Road Pothole',
        type: 'road',
        status: 'watch',
        lat: 12.9250,
        lng: 77.6750,
        description: 'Large pothole forming on the fast lane. Risk of vehicle damage.',
        severity: 'Medium',
        reporter: 'User-422',
        timestamp: new Date().toISOString()
      },
      {
        id: 'seed-3',
        name: 'NH44 Highway Bridge',
        type: 'bridge',
        status: 'stable',
        lat: 13.0200,
        lng: 77.5500,
        description: 'Regular inspection passed. Structural integrity confirmed.',
        severity: 'Low',
        reporter: 'Inspection Unit',
        timestamp: new Date().toISOString()
      },
      {
        id: 'seed-4',
        name: 'Hebbal Flyover',
        type: 'bridge',
        status: 'stable',
        lat: 13.0350,
        lng: 77.5970,
        description: 'All systems normal. Load capacity within limits.',
        severity: 'Low',
        reporter: 'Auto-Sensor',
        timestamp: new Date().toISOString()
      },
      {
        id: 'seed-5',
        name: 'Whitefield Water Main',
        type: 'pipeline',
        status: 'stable',
        lat: 12.9698,
        lng: 77.7500,
        description: 'Flow rate and pressure normal. No leaks detected.',
        severity: 'Low',
        reporter: 'Sensor-WF-7',
        timestamp: new Date().toISOString()
      },
      {
        id: 'seed-6',
        name: 'Koramangala Road Sector',
        type: 'road',
        status: 'stable',
        lat: 12.9352,
        lng: 77.6245,
        description: 'Surface condition good. No maintenance required.',
        severity: 'Low',
        reporter: 'Road Dept.',
        timestamp: new Date().toISOString()
      }
    ];
  });
  const [reportMode, setReportMode] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [newIssue, setNewIssue] = useState({
    name: '',
    type: 'bridge',
    severity: 'Medium',
    description: '',
    reporter: ''
  });

  // Fetch Data & User Location
  useEffect(() => {
    const fetchData = async (lat, lng) => {
      try {
        const adjustedAssets = rawAssets.map(asset => ({
          ...asset,
          lat: lat + (asset.lat - 40.78),
          lng: lng + (asset.lng - (-73.9))
        }));

        const response = await fetch('http://localhost:5000/api/predict_all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assets: adjustedAssets })
        });
        const data = await response.json();
        setAssets(data);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation([latitude, longitude]);
          fetchData(latitude, longitude);
        },
        (error) => {
          console.error("Error getting location:", error);
          setUserLocation([40.78, -73.9]);
          fetchData(40.78, -73.9);
        }
      );
    } else {
      setUserLocation([40.78, -73.9]);
      fetchData(40.78, -73.9);
    }
  }, []);

  // Persist Reported Issues
  useEffect(() => {
    localStorage.setItem('reportedIssues', JSON.stringify(reportedIssues));
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
  
  const filteredAssets = activeFilter === 'all' 
    ? allAssets 
    : allAssets.filter(a => a.status === activeFilter);

  const criticalAssets = allAssets.filter(a => a.status === 'critical');
  const watchAssets = allAssets.filter(a => a.status === 'watch');
  const stableAssets = allAssets.filter(a => a.status === 'stable');

  const alerts = allAssets.filter(a => a.status !== 'stable')
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  const chartData = {
    labels: ['Bridges', 'Roads', 'Pipelines'],
    datasets: [
      {
        label: 'Average Health Index',
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
        </div>
        <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-muted)', alignItems: 'center' }}>
          <span><Activity size={18} style={{ verticalAlign: 'middle', marginRight: '5px' }} /> Live Diagnostics</span>
          <span>{new Date().toLocaleDateString()}</span>
        </div>
      </header>

      <div className="main-content">
        <div className="map-section">
          <div className="map-controls">
            <button 
              className={`control-btn ${reportMode ? 'active' : ''}`}
              onClick={() => setReportMode(!reportMode)}
            >
              {reportMode ? <X size={18} /> : <Plus size={18} />}
              {reportMode ? 'Cancel Reporting' : 'Report Incident'}
            </button>
            <button className="control-btn" onClick={() => setActiveFilter('all')}>
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
            <div className="legend-item"><div className="dot" style={{ background: 'var(--color-critical)' }}></div> Critical Risk</div>
            <div className="legend-item"><div className="dot" style={{ background: 'var(--color-watch)' }}></div> Warning / Watch</div>
            <div className="legend-item"><div className="dot" style={{ background: 'var(--color-stable)' }}></div> Stable / Clear</div>
            <div className="legend-item"><div className="dot" style={{ background: 'var(--accent)' }}></div> Your Location</div>
          </div>

          {loading || !userLocation ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)' }}>
              Loading Map Data & Location...
            </div>
          ) : (
            <MapContainer center={userLocation} zoom={11} style={{ height: '100%', width: '100%' }}>
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
                        {(asset.id.includes('seed') || !isNaN(asset.id)) ? (
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
