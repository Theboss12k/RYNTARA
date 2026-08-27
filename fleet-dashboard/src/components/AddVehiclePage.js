import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Radar, Server, Settings, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { useTheme } from '../context/ThemeContext';
import GlobalSearchBar from './GlobalSearchBar';

export default function AddVehiclePage() {
  const navigate = useNavigate();
  const { theme } = useTheme();

  const [step, setStep] = useState(1);
  const [adapters, setAdapters] = useState([]);
  const [selectedAdapter, setSelectedAdapter] = useState("");
  const [adapterPort, setAdapterPort] = useState(null);
  const [existingConfigs, setExistingConfigs] = useState([]);

  // Streaming State
  const [isScanning, setIsScanning] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState([]);
  const terminalRef = useRef(null);

  // Post-Scan State
  const [scanAttempted, setScanAttempted] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState([]);
  const [newVehicles, setNewVehicles] = useState({});
  const [expandedId, setExpandedId] = useState(null);

  // Global Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isAiSearch, setIsAiSearch] = useState(false);

  const isDark = theme === 'dark';
  const bgMain = isDark ? 'var(--app-bg, #050505)' : '#f4f4f5';
  const bgCard = isDark ? '#111' : '#fff';
  const bgInput = isDark ? '#0a0a0a' : '#fafafa';
  const borderColor = isDark ? '#333' : '#e4e4e7';
  const textColor = isDark ? '#fff' : '#111';
  const subtextColor = isDark ? '#888' : '#71717a';

  useEffect(() => {
    // 1. Fetch available adapters (Returns array of strings)
    fetch('http://localhost:8080/api/discovery/adapters')
      .then(res => res.json())
      .then(data => {
        setAdapters(data);
        if (data.length > 0) {
            setSelectedAdapter(data[0]);
        }
      });

    // 2. Fetch existing configs
    fetch('http://localhost:8080/api/discovery/configs')
      .then(res => res.json())
      .then(data => setExistingConfigs(data))
      .catch(() => setExistingConfigs([]));
  }, []);

  // 3. Auto-extract port from Python script to satisfy backend quietly
  useEffect(() => {
    if (!selectedAdapter) return;

    fetch(`http://localhost:8080/api/studio/adapters/${selectedAdapter}`)
      .then(res => res.json())
      .then(data => {
        if (data.code) {
          const match = data.code.match(/default=(\d+)/);
          if (match && match[1]) {
            setAdapterPort(Number(match[1]));
          } else {
            console.warn("Could not detect a default port in the adapter code.");
            setAdapterPort(null);
          }
        }
      })
      .catch(err => console.error("Failed to fetch adapter code:", err));
  }, [selectedAdapter]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  const handleScan = async (e) => {
    e.preventDefault();
    if (!selectedAdapter) return;

    setStep(2);
    setIsScanning(true);
    setScanAttempted(true);
    setTerminalLogs([
      "Connecting to Ground Station Adapter...",
      `Mounting adapter: ${selectedAdapter}`
    ]);

    try {
      const payload = { adapter: selectedAdapter };
      if (adapterPort) {
        payload.port = adapterPort;
      }

      const res = await fetch('http://localhost:8080/api/discovery/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalData = null;
      let scanCompletedSuccessfully = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (let line of lines) {
          if (!line.trim()) continue;

          if (line.includes('---SCAN_COMPLETE---')) {
            scanCompletedSuccessfully = true;
            continue;
          }

          if (line.trim().startsWith('[') && line.trim().endsWith(']')) {
            try { finalData = JSON.parse(line); } catch (e) {}
          } else {
            setTerminalLogs(prev => [...prev, line]);
          }
        }
      }

      if (scanCompletedSuccessfully) {
        processScanResults(finalData || []);
      } else {
        setTerminalLogs(prev => [...prev, ">> UI ERROR: Scan aborted prematurely. Check Python logs above."]);
        setIsScanning(false);
        setStep(3);
      }

    } catch (err) {
      setTerminalLogs(prev => [...prev, `>> HTTP ERROR: ${err.message}`]);
      setIsScanning(false);
      setStep(3);
    }
  };

  const processScanResults = (scanData) => {
    const existingIds = existingConfigs.map(c => c.id);
    const existing = [];
    const novel = {};

    scanData.forEach(vehicle => {
      if (existingIds.includes(vehicle.vehicleId)) {
        existing.push(vehicle.vehicleId);
      } else {
        novel[vehicle.vehicleId] = {
          name: '',
          category: 'UAV',
          selectedParams: vehicle.detectedParameters,
          allParams: vehicle.detectedParameters,
          selected: true
        };
      }
    });

    setAlreadyRegistered(existing);
    setNewVehicles(novel);
    setStep(3);
  };

  const updateNewVehicle = (id, field, value) => {
    setNewVehicles(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }));
  };

  const toggleParam = (id, param) => {
    setNewVehicles(prev => {
      const v = prev[id];
      const nextParams = v.selectedParams.includes(param)
        ? v.selectedParams.filter(p => p !== param)
        : [...v.selectedParams, param];
      return { ...prev, [id]: { ...v, selectedParams: nextParams } };
    });
  };

  const handleRegister = async () => {
    try {
      for (const [id, data] of Object.entries(newVehicles)) {
        if (data.selected && data.name) {
          const payload = {
            id,
            name: data.name,
            category: data.category,
            monitoredParameters: data.selectedParams,
            adapter: selectedAdapter // Included selectedAdapter in configuration save
          };

          // 1. Save config to vehicle_configs.json
          const configRes = await fetch('http://localhost:8080/api/discovery/configs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!configRes.ok) throw new Error(`Config save failed for ${id}`);

          // 2. Save vehicle to PostgreSQL
          const vehicleRes = await fetch('http://localhost:8080/api/fleet/vehicles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name: data.name, category: data.category })
          });

          if (!vehicleRes.ok) {
            const errText = await vehicleRes.text();
            throw new Error(`Database registration failed for ${id}: ${errText}`);
          }
        }
      }
      navigate('/manage');
    } catch (err) {
      console.error("Registration error:", err);
      alert(`Registration Error: ${err.message}`);
    }
  };

  const handleCommandSubmit = (event) => {
    event.preventDefault();
    if (!searchQuery.trim()) return;
    console.log('Command submitted:', searchQuery.trim());
    setSearchQuery('');
  };

  const hasSelectedNew = Object.values(newVehicles).some(v => v.selected && v.name.trim() !== "");

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: bgMain, color: textColor, padding: '40px 20px', transition: 'background 0.3s' }}>
      <div style={{ width: '100%', maxWidth: step === 3 ? '680px' : '460px', padding: '30px', background: bgCard, border: `1px solid ${borderColor}`, borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.1)', transition: 'max-width 0.3s ease' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <button type="button" onClick={() => navigate('/')} style={{ background: 'transparent', border: 'none', color: subtextColor, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: 0, fontSize: '13px', fontWeight: '500' }}>
            <ArrowLeft size={14} /> Back to Portal
          </button>
          <ThemeToggle />
        </div>

        <h2 style={{ margin: '0 0 20px 0', fontWeight: '600', fontSize: '20px' }}>
          {step === 1 && "Vehicle Auto-Discovery"}
          {step === 2 && "Scanning Frequency Spectrum..."}
          {step === 3 && "Fleet Integration"}
        </h2>

        {/* STEP 1 */}
        {step === 1 && (
          <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
            <div style={{ textAlign: 'center', marginBottom: '32px', marginTop: '10px' }}>
              <div style={{
                display: 'inline-flex', padding: '16px',
                background: isDark ? 'rgba(0, 229, 255, 0.1)' : '#e0f7fa',
                borderRadius: '50%', marginBottom: '16px',
                border: `1px solid ${isDark ? 'rgba(0, 229, 255, 0.2)' : '#b2ebf2'}`,
                boxShadow: '0 0 20px rgba(0, 229, 255, 0.15)'
              }}>
                <Radar size={32} color="#00E5FF" />
              </div>
              <p style={{ color: subtextColor, fontSize: '14px', lineHeight: '1.6', margin: 0, padding: '0 10px' }}>
                Initialize the edge firewall to scan the local frequency spectrum for unassigned UDP telemetry broadcasts.
              </p>
            </div>

            <form onSubmit={handleScan} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ background: bgInput, padding: '20px', borderRadius: '12px', border: `1px solid ${borderColor}` }}>
                <label style={{ fontSize: '11px', color: subtextColor, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '12px', fontWeight: '700' }}>
                  Communication Protocol
                </label>

                <div style={{ position: 'relative' }}>
                  <Server size={18} color={subtextColor} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />

                  <select
                    value={selectedAdapter}
                    onChange={(e) => setSelectedAdapter(e.target.value)}
                    style={{
                      width: '100%', padding: '14px 40px 14px 44px', background: bgCard,
                      border: `1px solid ${borderColor}`, color: textColor, borderRadius: '8px',
                      outline: 'none', fontSize: '14px', cursor: 'pointer', appearance: 'none',
                      fontFamily: 'monospace', fontWeight: '500', transition: 'border-color 0.2s'
                    }}
                  >
                    {adapters.length === 0 ? (
                      <option disabled value="">No adapters found</option>
                    ) : (
                      adapters.map(a => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))
                    )}
                  </select>

                  <div style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                    <ChevronDown size={16} color={subtextColor} />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={adapters.length === 0}
                style={{
                  padding: '16px', background: adapters.length === 0 ? bgInput : '#00E5FF',
                  color: adapters.length === 0 ? subtextColor : '#000', border: 'none',
                  borderRadius: '10px', cursor: adapters.length === 0 ? 'not-allowed' : 'pointer',
                  fontWeight: '700', fontSize: '15px', display: 'flex', justifyContent: 'center',
                  alignItems: 'center', gap: '10px', transition: 'all 0.2s ease',
                  boxShadow: adapters.length === 0 ? 'none' : '0 4px 15px rgba(0, 229, 255, 0.3)'
                }}
              >
                <Radar size={18} /> Initiate Network Probe
              </button>
            </form>
          </div>
        )}

        {/* STEP 2 */}
        <div style={{ display: step === 2 ? 'block' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Radar size={18} color="#00E5FF" style={{ animation: isScanning ? 'spin 2s linear infinite' : 'none' }} />
            <span style={{ fontSize: '13px', color: '#00E5FF', fontWeight: '600' }}>Intercepting UDP Packets</span>
          </div>
          <div ref={terminalRef} style={{ background: '#0a0a0a', border: '1px solid #222', borderRadius: '8px', padding: '12px', height: '240px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '11px', color: '#00ff00', lineHeight: '1.5' }}>
            {terminalLogs.map((log, i) => (
              <div key={i} style={{ opacity: log.includes('ERROR') ? 1 : 0.8, color: log.includes('ERROR') ? '#ff3b30' : '#00ff00' }}>{log}</div>
            ))}
          </div>
        </div>

        {/* STEP 3 */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Already Registered */}
            {alreadyRegistered.length > 0 && (
              <div>
                <h3 style={{ fontSize: '11px', color: subtextColor, textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.5px' }}>Present in Database</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {alreadyRegistered.map(id => (
                    <span key={id} style={{ background: bgInput, border: `1px solid ${borderColor}`, padding: '4px 12px', borderRadius: '20px', fontSize: '12px', color: subtextColor, fontFamily: 'monospace' }}>
                      {id.substring(0, 8)}...
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* New Vehicles / Empty State Handler */}
            {Object.keys(newVehicles).length > 0 ? (
              <div>
                <h3 style={{ fontSize: '11px', color: subtextColor, textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.5px' }}>New Vehicles Detected</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {Object.entries(newVehicles).map(([id, data]) => (
                    <div key={id} style={{ background: bgInput, border: `1px solid ${data.selected ? '#00E5FF' : borderColor}`, borderRadius: '8px', overflow: 'hidden', transition: 'border 0.2s' }}>

                      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input type="checkbox" checked={data.selected} onChange={(e) => updateNewVehicle(id, 'selected', e.target.checked)} style={{ cursor: 'pointer', accentColor: '#00E5FF', width: '16px', height: '16px' }} />

                        <div style={{ display: 'flex', flexDirection: 'column', width: '100px' }}>
                          <span style={{ fontSize: '10px', color: subtextColor, textTransform: 'uppercase' }}>Hardware ID</span>
                          <span style={{ fontSize: '13px', fontWeight: '600', fontFamily: 'monospace', color: data.selected ? textColor : subtextColor }}>{id.substring(0, 8)}</span>
                        </div>

                        <input type="text" placeholder="Assign Name..." value={data.name} onChange={(e) => updateNewVehicle(id, 'name', e.target.value)} disabled={!data.selected} style={{ flex: 1, padding: '8px 12px', background: bgCard, border: `1px solid ${borderColor}`, color: textColor, borderRadius: '6px', fontSize: '13px', outline: 'none', opacity: data.selected ? 1 : 0.5 }} />

                        <select value={data.category} onChange={(e) => updateNewVehicle(id, 'category', e.target.value)} disabled={!data.selected} style={{ width: '100px', padding: '8px', background: bgCard, border: `1px solid ${borderColor}`, color: textColor, borderRadius: '6px', fontSize: '12px', outline: 'none', opacity: data.selected ? 1 : 0.5 }}>
                          <option value="UAV">UAV</option><option value="GROUND">GROUND</option>
                        </select>

                        <button type="button" onClick={() => setExpandedId(expandedId === id ? null : id)} disabled={!data.selected} style={{ background: 'transparent', border: 'none', color: expandedId === id ? '#00E5FF' : subtextColor, cursor: data.selected ? 'pointer' : 'not-allowed', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', opacity: data.selected ? 1 : 0.5 }}>
                          <Settings size={16} />
                          {expandedId === id ? <ChevronUp size={16} style={{ marginLeft: '4px' }}/> : <ChevronDown size={16} style={{ marginLeft: '4px' }}/>}
                        </button>
                      </div>

                      {expandedId === id && data.selected && (
                        <div style={{ padding: '16px', background: bgCard, borderTop: `1px solid ${borderColor}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{ fontSize: '11px', color: subtextColor, fontWeight: '600', textTransform: 'uppercase' }}>Telemetry Whitelist</span>
                            <span style={{ fontSize: '11px', color: '#00E5FF' }}>{data.selectedParams.length} / {data.allParams.length} Selected</span>
                          </div>

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {data.allParams.map(param => (
                              <button key={param} type="button" onClick={() => toggleParam(id, param)} style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '11px', cursor: 'pointer', background: data.selectedParams.includes(param) ? 'rgba(0, 229, 255, 0.1)' : 'transparent', border: `1px solid ${data.selectedParams.includes(param) ? '#00E5FF' : borderColor}`, color: data.selectedParams.includes(param) ? '#00E5FF' : subtextColor, transition: 'all 0.2s' }}>
                                {param}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', background: bgInput, borderRadius: '12px', border: `1px solid ${borderColor}` }}>
                <AlertCircle size={32} color="#ff3b30" style={{ margin: '0 auto 12px auto' }} />
                <p style={{ color: textColor, fontWeight: '500', fontSize: '14px', margin: '0 0 4px 0' }}>Zero Packets Intercepted</p>
                <p style={{ color: subtextColor, fontSize: '12px', margin: 0 }}>No novel vehicles were detected on the target port during the scan.</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
              <button type="button" onClick={() => setStep(1)} style={{ flex: 1, padding: '14px', background: 'transparent', color: textColor, border: `1px solid ${borderColor}`, borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>Scan Again</button>
              <button type="button" onClick={handleRegister} disabled={!hasSelectedNew} style={{ flex: 2, padding: '14px', background: textColor, color: bgCard, border: 'none', borderRadius: '8px', cursor: !hasSelectedNew ? 'not-allowed' : 'pointer', fontWeight: '600', opacity: !hasSelectedNew ? 0.5 : 1 }}>
                Register Selected Vehicles
              </button>
            </div>
          </div>
        )}

      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Global Search Bar Integration */}
      <GlobalSearchBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isAiSearch={isAiSearch}
        setIsAiSearch={setIsAiSearch}
        onCommandSubmit={handleCommandSubmit}
        placeholderNormal="Search RYNTARA fleet (Type '/' to navigate)..."
        placeholderAi="Ask RYNTARA AI to execute a command..."
        bottomOffset="26px"
      />
    </div>
  );
}