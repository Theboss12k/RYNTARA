import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { FlyToInterpolator } from '@deck.gl/core';

import {
  ArrowLeft, Plane, Truck, SatelliteDish,
  Route, Camera, X, Layers, Navigation, Search, MapPin
} from 'lucide-react';

import ThemeToggle from '../components/ThemeToggle';
import { useTheme } from '../context/ThemeContext';
import FleetMap from '../components/FleetMap';
import GlobalSearchBar from '../components/GlobalSearchBar';

const HIDDEN_KEYS = ['id', 'vehicleId', 'vehicle_id', 'timestamp', 'metrics', 'additionalProperties', 'latitude', 'longitude'];
const FAB_SIZE = 44;
const FAB_MARGIN = 8;
const MAX_MAP_PITCH = 85;

const VEHICLE_COLORS = ['#FF3366', '#00E5FF', '#00E676', '#FF9100', '#D500F9', '#FFEA00', '#2979FF'];

export const getVehicleColor = (vId) => {
  let hash = 0;
  for (let i = 0; i < (vId || '').length; i++) hash = vId.charCodeAt(i) + ((hash << 5) - hash);
  return VEHICLE_COLORS[Math.abs(hash) % VEHICLE_COLORS.length];
};

const getDistance = (lon1, lat1, lon2, lat2) => {
  const R = 6371e3;
  const toRad = (v) => (v * Math.PI) / 180;
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

function DraggableFAB({ children, initialTop, initialLeft, initialRight, onClick, visible, hudBg, borderColor, textColor }) {
  const [pos, setPos] = useState({ top: initialTop, left: initialLeft, right: initialRight });
  const [isDragging, setIsDragging] = useState(false);
  const nodeRef = useRef(null);
  const dragRef = useRef({ startX: 0, startY: 0, startTop: initialTop, startLeft: initialLeft, startRight: initialRight, hasMoved: false });
  const posRef = useRef(pos);
  posRef.current = pos;

  const clamp = (top, left, right) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxTop = vh - FAB_SIZE - FAB_MARGIN;
    const clampedTop = Math.min(Math.max(top, FAB_MARGIN), maxTop);
    let clampedLeft = left;
    let clampedRight = right;
    if (left !== undefined) clampedLeft = Math.min(Math.max(left, FAB_MARGIN), vw - FAB_SIZE - FAB_MARGIN);
    if (right !== undefined) clampedRight = Math.min(Math.max(right, FAB_MARGIN), vw - FAB_SIZE - FAB_MARGIN);
    return { top: clampedTop, left: clampedLeft, right: clampedRight };
  };

  const handlePointerDown = (event) => {
    if (!visible) return;
    event.preventDefault();
    try { nodeRef.current?.setPointerCapture(event.pointerId); } catch {}
    setIsDragging(true);
    dragRef.current = { startX: event.clientX, startY: event.clientY, startTop: posRef.current.top, startLeft: posRef.current.left ?? 0, startRight: posRef.current.right ?? 0, hasMoved: false };
  };

  const handlePointerMove = (event) => {
    if (!isDragging) return;
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.hasMoved = true;
    const nextTop = dragRef.current.startTop + dy;
    const nextLeft = posRef.current.left !== undefined ? dragRef.current.startLeft + dx : undefined;
    const nextRight = posRef.current.right !== undefined ? dragRef.current.startRight - dx : undefined;
    setPos(clamp(nextTop, nextLeft, nextRight));
  };

  const handlePointerUp = () => { setIsDragging(false); try { nodeRef.current?.releasePointerCapture(); } catch {} };

  return (
    <div ref={nodeRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
      onClick={(e) => { e.stopPropagation(); if (!dragRef.current.hasMoved) onClick(); }}
      style={{ position: 'absolute', top: pos.top, ...(pos.left !== undefined ? { left: pos.left } : {}), ...(pos.right !== undefined ? { right: pos.right } : {}), background: hudBg, border: `1px solid ${borderColor}`, borderRadius: '50%', width: `${FAB_SIZE}px`, height: `${FAB_SIZE}px`, display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: isDragging ? 'grabbing' : 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 15, color: textColor, opacity: visible ? 1 : 0, transform: visible ? 'scale(1)' : 'scale(0.8)', pointerEvents: visible ? 'auto' : 'none', touchAction: 'none', userSelect: 'none', outline: 'none', transition: isDragging ? 'none' : 'opacity 0.3s ease, transform 0.3s ease' }}>
      {children}
    </div>
  );
}

const normalizeBearing = (value) => ((Number(value) % 360) + 360) % 360;
function isBearingActive(current, target) { return Math.abs(normalizeBearing(current) - normalizeBearing(target)) < 2 || Math.abs(normalizeBearing(current) - normalizeBearing(target)) > 358; }

function RotatingCompass({ bearing, setBearing, subtextColor, borderColor, isDark }) {
  const compassRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const getBearingFromPointer = (event) => {
    if (!compassRef.current) return bearing;
    const rect = compassRef.current.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    let angle = Math.atan2(dx, -dy) * (180 / Math.PI);
    return Math.round(angle > 180 ? angle - 360 : angle < -180 ? angle + 360 : angle);
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    try { compassRef.current?.setPointerCapture(event.pointerId); } catch {}
    setIsDragging(true); setBearing(getBearingFromPointer(event));
  };

  const handlePointerMove = (event) => { if (isDragging) setBearing(getBearingFromPointer(event)); };
  const handlePointerUp = () => setIsDragging(false);

  const normalized = normalizeBearing(bearing);
  const ticks = Array.from({ length: 72 }, (_, index) => index * 5);
  const cardinalPoints = [{ label: 'N', angle: 0, color: '#f72585' }, { label: 'E', angle: 90, color: '#4cc9f0' }, { label: 'S', angle: 180, color: '#4895ef' }, { label: 'W', angle: 270, color: '#3a0ca3' }];

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2px 0 0' }}>
      <div ref={compassRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
        style={{ width: '160px', height: '160px', position: 'relative', borderRadius: '50%', cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', background: isDark ? 'radial-gradient(circle at center, rgba(255,255,255,0.065), rgba(255,255,255,0.015) 58%, rgba(0,0,0,0.22))' : 'radial-gradient(circle at center, rgba(0,0,0,0.035), rgba(0,0,0,0.01) 58%, rgba(0,0,0,0.055))', border: `1px solid ${borderColor}`, boxShadow: 'inset 0 0 30px rgba(0,0,0,0.12), 0 10px 25px rgba(0,0,0,0.10)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: '6px', borderRadius: '50%', transform: `rotate(${-normalized}deg)`, transition: isDragging ? 'none' : 'transform 160ms ease-out' }}>
          <div style={{ position: 'absolute', inset: '2px', borderRadius: '50%', border: `1px solid ${borderColor}` }} />
          {ticks.map((angle) => {
            const isMajor = angle % 30 === 0, isMedium = angle % 10 === 0;
            return <div key={angle} style={{ position: 'absolute', left: '50%', top: '50%', width: isMajor ? '2px' : '1px', height: isMajor ? '9px' : isMedium ? '6px' : '3px', borderRadius: '2px', background: isMajor ? subtextColor : `${subtextColor}75`, transformOrigin: '50% 72px', transform: `translate(-50%, -72px) rotate(${angle}deg)` }} />;
          })}
          {cardinalPoints.map(({ label, angle, color }) => (
            <div key={label} style={{ position: 'absolute', left: '50%', top: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `translate(calc(-50% + ${Math.sin(angle * Math.PI/180)*56}px), calc(-50% + ${-Math.cos(angle * Math.PI/180)*56}px)) rotate(${normalized}deg)`, fontSize: label === 'N' ? '12px' : '10px', fontWeight: '800', color, textShadow: `0 0 8px ${color}55` }}>{label}</div>
          ))}
        </div>
        <div style={{ position: 'absolute', top: '4px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, pointerEvents: 'none' }}><div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '10px solid #f72585', filter: 'drop-shadow(0 0 6px rgba(247,37,133,0.75))' }} /></div>
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: '42px', height: '42px', transform: 'translate(-50%, -50%)', borderRadius: '50%', background: isDark ? 'rgba(8,10,15,0.92)' : 'rgba(255,255,255,0.94)', border: `1px solid ${borderColor}`, boxShadow: '0 7px 22px rgba(0,0,0,0.24)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 8, pointerEvents: 'none' }}><Navigation size={20} strokeWidth={2.1} color="#00E5FF" fill="rgba(0,229,255,0.12)" style={{ transform: `rotate(${bearing - 45}deg)`, transition: isDragging ? 'none' : 'transform 120ms ease-out', filter: 'drop-shadow(0 0 7px rgba(0,229,255,0.65))' }} /></div>
      </div>
    </div>
  );
}

export default function ManageFleetPage() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [vehicles, setVehicles] = useState([]);
  const [telemetryData, setTelemetryData] = useState({});
  const [command, setCommand] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [activeTraces, setActiveTraces] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isAiSearch, setIsAiSearch] = useState(false);
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
  const [isHudExpanded, setIsHudExpanded] = useState(true);

  const [cameraLock, setCameraLock] = useState(false);
  const [showAllManifests, setShowAllManifests] = useState(false);

  const [viewState, setViewState] = useState({
    longitude: -122.4194, latitude: 37.7749, zoom: 15, pitch: 60, bearing: -20, maxZoom: 22, minZoom: 2,
  });

  const [showMapTiles, setShowMapTiles] = useState(true);
  const [goToLat, setGoToLat] = useState(viewState.latitude);
  const [goToLon, setGoToLon] = useState(viewState.longitude);

  // SEARCH DROPDOWN STATE
  const [manifestSearch, setManifestSearch] = useState('');
  const [showManifestDropdown, setShowManifestDropdown] = useState(false);
  const [viewingManifestId, setViewingManifestId] = useState(null);

  const [dbTraffic, setDbTraffic] = useState([]);
  const [dbManifests, setDbManifests] = useState([]);

  const isLOD = viewState.zoom < 13.5;

  const flyTo = useCallback((targetLon, targetLat, targetZoom = 16.5) => {
    setViewState(prev => ({ ...prev, longitude: targetLon, latitude: targetLat, zoom: targetZoom, transitionDuration: 1200, transitionInterpolator: new FlyToInterpolator({ curve: 1.5 }) }));
  }, []);

  const fetchAtcData = useCallback(async () => {
    try {
      const [trafficRes, manifestsRes] = await Promise.all([
        fetch('http://localhost:8080/api/routing/traffic').catch(()=>({ok:false})),
        fetch('http://localhost:8080/api/routing/manifests').catch(()=>({ok:false}))
      ]);
      let manifests = [];
      if (manifestsRes.ok) {
         manifests = await manifestsRes.json();
         setDbManifests(manifests);
      }
      if (trafficRes.ok) {
         const trafficData = await trafficRes.json();
         const splitTraffic = [];

         for (const [vId, waypoints] of Object.entries(trafficData)) {
           const vManifests = manifests.filter(m => m.vehicleId === vId);
           if (vManifests.length > 0) {
             vManifests.forEach(m => {
               const mStart = new Date(m.startTime).getTime();
               const mEnd = new Date(m.endTime).getTime();
               const mPath = waypoints.filter(wp => {
                 const t = new Date(wp.timestamp).getTime();
                 return t >= mStart - 1000 && t <= mEnd + 1000;
               });
               if (mPath.length > 0) {
                 splitTraffic.push({ path: mPath, manifestId: m.id, vehicleId: m.vehicleId, name: m.name });
               }
             });
           } else {
             // Fallback for legacy waypoints without associated manifests
             let currentPath = [];
             for (let i = 0; i < waypoints.length; i++) {
               const wp = waypoints[i];
               if (currentPath.length === 0) currentPath.push(wp);
               else {
                 const prevWp = currentPath[currentPath.length - 1];
                 if (new Date(wp.timestamp).getTime() - new Date(prevWp.timestamp).getTime() > 60000) {
                   splitTraffic.push({ path: currentPath, manifestId: 'unknown', vehicleId: vId, name: 'Legacy Path' });
                   currentPath = [wp];
                 } else {
                   currentPath.push(wp);
                 }
               }
             }
             if (currentPath.length > 0) {
               splitTraffic.push({ path: currentPath, manifestId: 'unknown', vehicleId: vId, name: 'Legacy Path' });
             }
           }
         }
         setDbTraffic(splitTraffic);
      }
    } catch(e) {}
  }, []);

  useEffect(() => {
    fetchAtcData();
    const interval = setInterval(fetchAtcData, 5000);
    return () => clearInterval(interval);
  }, [fetchAtcData]);

  useEffect(() => {
    if (selectedVehicle && telemetryData[selectedVehicle] && cameraLock) {
      const pos = telemetryData[selectedVehicle];
      if (typeof pos.longitude !== 'number' || typeof pos.latitude !== 'number') return;
      setViewState(prev => ({ ...prev, longitude: pos.longitude, latitude: pos.latitude }));
    }
  }, [telemetryData, selectedVehicle, cameraLock]);

  useEffect(() => {
    if (!viewState.transitionDuration) {
      setGoToLat(Number(viewState.latitude.toFixed(5)));
      setGoToLon(Number(viewState.longitude.toFixed(5)));
    }
  }, [viewState.latitude, viewState.longitude, viewState.transitionDuration]);

  useEffect(() => {
    const socket = new SockJS('http://localhost:8080/ws-telemetry');
    const stompClient = new Client({
      webSocketFactory: () => socket,
      onConnect: () => {
        fetch('http://localhost:8080/api/discovery/configs')
          .then((res) => res.json())
          .then((data) => {
            setVehicles(data);
            data.forEach((vehicle) => {
              stompClient.subscribe(`/topic/telemetry.${vehicle.id}.position`, (message) => {
                const payload = JSON.parse(message.body);
                const now = Date.now();

                setTelemetryData((prev) => {
                  const old = prev[payload.vehicle_id];
                  let speed = old ? (old.calculatedSpeed || 0) : 0;

                  if (old && old.timestamp_local) {
                      const dt = (now - old.timestamp_local) / 1000;
                      if (dt >= 0.5) {
                          const dist = getDistance(old.longitude, old.latitude, payload.longitude, payload.latitude);
                          speed = dist / dt;
                      }
                  }

                  return { ...prev, [payload.vehicle_id]: { ...payload, timestamp_local: now, calculatedSpeed: speed } };
                });
              });
            });
          })
          .catch((err) => console.error('Error fetching vehicles:', err));
      }
    });
    stompClient.activate();
    return () => stompClient.deactivate();
  }, []);

  const handleCommandSubmit = (event) => {
    event.preventDefault();
    if (!searchQuery.trim()) return;
    setCommand(searchQuery.trim());
    setSearchQuery('');
  };

  const vehicleById = useMemo(() => {
    const map = {};
    vehicles.forEach(vehicle => { map[vehicle.id] = vehicle; });
    return map;
  }, [vehicles]);

  const filteredVehicles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || isAiSearch || query.startsWith('/')) return vehicles;
    return vehicles.filter((vehicle) => {
      const name = vehicle.name?.toLowerCase() || '';
      const id = vehicle.id?.toLowerCase() || '';
      const category = vehicle.category?.toLowerCase() || '';
      return name.includes(query) || id.includes(query) || category.includes(query);
    });
  }, [vehicles, searchQuery, isAiSearch]);

  const filteredManifests = useMemo(() => {
    if (!manifestSearch) return dbManifests;
    const q = manifestSearch.toLowerCase();
    return dbManifests.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      (m.id || '').toLowerCase().includes(q) ||
      (m.vehicleId || '').toLowerCase().includes(q)
    );
  }, [dbManifests, manifestSearch]);

  const handleSelectManifest = (m) => {
    setManifestSearch(m.name || m.id);
    setViewingManifestId(m.id);
    setShowManifestDropdown(false);
    setShowAllManifests(true);

    const trafficChunk = dbTraffic.find(t => t.manifestId === m.id);
    if (trafficChunk && trafficChunk.path.length > 0) {
      const pt = trafficChunk.path[0];
      flyTo(pt.longitude, pt.latitude, 16);
    }
  };

  const activeCount = Object.keys(telemetryData).length;

  const hudBg = isDark ? 'rgba(18, 18, 22, 0.95)' : 'rgba(255, 255, 255, 0.95)';
  const textColor = isDark ? '#fff' : '#111';
  const subtextColor = isDark ? '#888' : '#555';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
  const btnBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const bgInput = isDark ? 'rgba(0,0,0,0.3)' : '#fafafa';

  const controlColors = { flat2D: '#00b4d8', view3D: '#7209b7', north: '#f72585', east: '#4cc9f0', south: '#4895ef', west: '#3a0ca3', zoom: '#00E5FF' };
  const getColoredBtnStyle = (isActive, activeColor) => ({ flex: 1, background: isActive ? activeColor : btnBg, border: `1px solid ${isActive ? activeColor : borderColor}`, borderRadius: '7px', color: isActive ? '#fff' : subtextColor, fontSize: '11px', padding: '7px 0', cursor: 'pointer', textTransform: 'uppercase', fontWeight: '700', transition: 'all 0.2s ease', boxShadow: isActive ? `0 4px 12px ${activeColor}50` : 'none' });

  const currentMultiplier = selectedVehicle && vehicleById[selectedVehicle]?.dangerZoneMultiplier !== undefined ? vehicleById[selectedVehicle].dangerZoneMultiplier : 10;

  const saveMultiplierToDB = async () => {
    if (!selectedVehicle) return;
    const vehicleToSave = vehicles.find(v => v.id === selectedVehicle);
    if (!vehicleToSave) return;
    try {
      await fetch('http://localhost:8080/api/discovery/configs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehicleToSave)
      });
    } catch (err) { console.error("Failed to save config:", err); }
  };

  return (
    <div className="fleet-shell page-enter" style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', background: isDark ? '#080a0f' : '#f7f9fb' }}>
      <style>{`
        @keyframes fleetPageEnter { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes fleetPanelEnterLeft { 0% { opacity: 0; transform: translateX(-22px); } 100% { opacity: 1; transform: translateX(0); } }
        @keyframes fleetPanelEnterRight { 0% { opacity: 0; transform: translateX(22px); } 100% { opacity: 1; transform: translateX(0); } }
        .fleet-shell { animation: fleetPageEnter 0.45s ease forwards; }
        .fleet-sidebar-panel { animation: fleetPanelEnterLeft 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.08s backwards; }
        .fleet-camera-panel { animation: fleetPanelEnterRight 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.14s backwards; }
      `}</style>

      {/* WEBGL MAP */}
      <div className="map-panel" style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
        <FleetMap
          telemetryData={telemetryData} vehicleById={vehicleById} theme={theme}
          selectedVehicle={selectedVehicle} setSelectedVehicle={setSelectedVehicle}
          activeTraces={activeTraces} viewState={viewState} setViewState={setViewState}
          showMapTiles={showMapTiles} showAllManifests={showAllManifests} dbTraffic={dbTraffic} viewingManifestId={viewingManifestId}
          onMapInteract={() => setCameraLock(false)}
          onVehicleClick={(id) => {
            setSelectedVehicle(id);
            setCameraLock(true);
            if (telemetryData[id]) {
              setViewState(prev => ({
                ...prev, longitude: telemetryData[id].longitude, latitude: telemetryData[id].latitude, zoom: 18,
                transitionDuration: 1200, transitionInterpolator: new FlyToInterpolator({ curve: 1.5 })
              }));
            }
          }}
        />

        {/* LEFT SIDEBAR */}
        <div className="fleet-sidebar-panel" style={{ position: 'absolute', top: '20px', left: '20px', background: hudBg, backdropFilter: 'blur(15px)', border: `1px solid ${borderColor}`, borderRadius: '16px', color: textColor, boxShadow: '0 20px 40px rgba(0,0,0,0.15)', zIndex: 10, width: '360px', height: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column', opacity: isSidebarMinimized ? 0 : 1, transform: isSidebarMinimized ? 'translateX(-20px)' : 'translateX(0)', pointerEvents: isSidebarMinimized ? 'none' : 'auto', transition: 'opacity 0.3s ease, transform 0.3s ease' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <button type="button" onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: textColor, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: 0 }}><ArrowLeft size={14} /> Portal</button>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 'auto', marginLeft: '12px' }}><h1 style={{ margin: 0, fontSize: '15px', fontWeight: '800', letterSpacing: '1.5px', color: textColor, textTransform: 'uppercase' }}>RYNTARA</h1></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ThemeToggle />
              <button type="button" onClick={(e) => { e.stopPropagation(); setIsSidebarMinimized(true); }} style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Minimize sidebar"><X size={18} color={subtextColor} /></button>
            </div>
          </div>

          <div style={{ padding: '16px 20px 12px', flexShrink: 0 }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>Fleet Orchestrator</h2>
            <p style={{ margin: '4px 0 12px', fontSize: '12px', color: subtextColor }}>Live Telemetry &amp; Control</p>

            {/* MANIFEST SEARCH */}
            <div style={{ position: 'relative', marginBottom: '16px', padding: '12px', background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)', borderRadius: '12px', border: `1px solid ${borderColor}` }}>
              <label style={{ fontSize: '11px', color: subtextColor, textTransform: 'uppercase', fontWeight: '700' }}>Search Global Manifests</label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <input
                  type="text" value={manifestSearch}
                  onChange={e => { setManifestSearch(e.target.value); setShowManifestDropdown(true); }}
                  onFocus={() => setShowManifestDropdown(true)}
                  placeholder="Search by name, ID..."
                  style={{ width: '100%', padding: '8px', background: bgInput, border: `1px solid ${borderColor}`, color: textColor, borderRadius: '6px', fontSize: '12px', outline: 'none' }}
                />
                {viewingManifestId && (
                  <button onClick={() => { setManifestSearch(''); setViewingManifestId(null); setShowManifestDropdown(false); setShowAllManifests(false); }} style={{ background: btnBg, border: `1px solid ${borderColor}`, borderRadius: '6px', padding: '0 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={14} color={textColor} /></button>
                )}
              </div>
              {showManifestDropdown && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: isDark ? '#1a1c23' : '#fff', border: `1px solid ${borderColor}`, borderRadius: '8px', maxHeight: '200px', overflowY: 'auto', zIndex: 50, marginTop: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                  {filteredManifests.map(m => (
                     <div key={m.id} onClick={() => handleSelectManifest(m)} style={{ padding: '10px 12px', borderBottom: `1px solid ${borderColor}`, cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = btnBg} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                       <div style={{ fontSize: '12px', fontWeight: '700', color: textColor, marginBottom: '4px' }}>{m.name || 'Unnamed Route'}</div>
                       <div style={{ fontSize: '10px', color: subtextColor }}>{m.vehicleId} • {new Date(m.startTime).toLocaleTimeString()}</div>
                     </div>
                  ))}
                  {filteredManifests.length === 0 && <div style={{ padding: '12px', fontSize: '11px', color: subtextColor, textAlign: 'center' }}>No manifests found</div>}
                </div>
              )}
            </div>

            {vehicles.length > 0 && (
              <div style={{ fontSize: '12px', color: subtextColor, display: 'flex', gap: '6px' }}>
                <span><b>{vehicles.length}</b> registered</span><span>·</span>
                <span style={{ color: '#00E676', fontWeight: '600' }}><b>{activeCount}</b> active</span>
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
            {filteredVehicles.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: subtextColor }}><Search size={28} strokeWidth={1.5} style={{ margin: '0 auto 8px', opacity: 0.5 }} /><p style={{ fontSize: '13px', margin: 0 }}>No matching vehicles found...</p></div>
            ) : (
              filteredVehicles.map((vehicle) => {
                const live = telemetryData[vehicle.id] || {};
                const isOnline = !!live.latitude;
                const isGround = vehicle.category === 'GROUND';
                const isSelected = selectedVehicle === vehicle.id;
                const vColor = getVehicleColor(vehicle.id);

                return (
                  <div key={vehicle.id} onClick={() => {
                    setSelectedVehicle(vehicle.id);
                    setCameraLock(true);
                    if (live.latitude && live.longitude) {
                      setViewState(prev => ({
                        ...prev, longitude: live.longitude, latitude: live.latitude, zoom: 18,
                        transitionDuration: 1200, transitionInterpolator: new FlyToInterpolator({ curve: 1.5 })
                      }));
                    }
                  }} style={{ marginBottom: '12px', padding: '12px', borderRadius: '10px', background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${isSelected ? vColor : borderColor}`, cursor: 'pointer', transition: 'border-color 0.2s ease, transform 0.2s ease' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: vColor, color: '#000', boxShadow: `0 0 10px ${vColor}40` }}>
                          {isGround ? <Truck size={14} strokeWidth={1.75} /> : <Plane size={14} strokeWidth={1.75} />}
                        </div>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '13px', color: textColor }}>{vehicle.name}</h4>
                          <span style={{ fontSize: '10px', color: subtextColor, textTransform: 'uppercase' }}>{vehicle.category || 'UAV'}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isOnline ? '#00E676' : '#888' }} />{isOnline ? 'Active' : 'Offline'}</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                      <div><p style={{ margin: 0, color: subtextColor, fontSize: '10px', textTransform: 'uppercase' }}>Latitude</p><p style={{ margin: 0, fontWeight: '600' }}>{typeof live.latitude === 'number' ? live.latitude.toFixed(5) : '—'}</p></div>
                      <div><p style={{ margin: 0, color: subtextColor, fontSize: '10px', textTransform: 'uppercase' }}>Longitude</p><p style={{ margin: 0, fontWeight: '600' }}>{typeof live.longitude === 'number' ? live.longitude.toFixed(5) : '—'}</p></div>

                      {isOnline && (
                        <div><p style={{ margin: 0, color: subtextColor, fontSize: '10px', textTransform: 'uppercase' }}>Kinematic Speed</p><p style={{ margin: 0, fontWeight: '600', color: '#ff3b30' }}>{Number(live.calculatedSpeed || 0).toFixed(1)} m/s</p></div>
                      )}

                      {Object.entries(live).filter(([key]) => !HIDDEN_KEYS.includes(key) && key !== 'calculatedSpeed' && key !== 'timestamp_local').map(([key, value]) => (
                        <div key={key}><p style={{ margin: 0, color: subtextColor, fontSize: '10px', textTransform: 'uppercase' }}>{key.replace(/_/g, ' ')}</p><p style={{ margin: 0, fontWeight: '600' }}>{typeof value === 'number' ? Number(value).toFixed(2) : String(value)}</p></div>
                      ))}
                    </div>

                    <div onClick={(event) => event.stopPropagation()} style={{ marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${borderColor}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: textColor, fontWeight: '500' }}>
                        <input type="checkbox" checked={!!activeTraces[vehicle.id]} onChange={() => setActiveTraces((prev) => ({ ...prev, [vehicle.id]: !prev[vehicle.id] }))} style={{ accentColor: vColor, cursor: 'pointer' }} />
                        <Route size={12} color={vColor} /> Trace
                      </label>
                      <button type="button" onClick={() => navigate(`/vehicle/${vehicle.id}`)} style={{ background: 'transparent', border: `1px solid ${vColor}50`, color: vColor, padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', textTransform: 'uppercase' }}>History</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <DraggableFAB initialTop={20} initialLeft={20} visible={isSidebarMinimized} onClick={() => setIsSidebarMinimized(false)} hudBg={hudBg} borderColor={borderColor} textColor={textColor}>
          <SatelliteDish size={20} style={{ pointerEvents: 'none' }} />
        </DraggableFAB>

        {/* RIGHT HUD */}
        <div className="fleet-camera-panel" style={{ position: 'absolute', top: '20px', right: '20px', background: hudBg, backdropFilter: 'blur(15px)', border: `1px solid ${borderColor}`, borderRadius: '16px', padding: '20px', color: textColor, boxShadow: '0 20px 40px rgba(0,0,0,0.15)', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '18px', width: '270px', height: 'calc(100vh - 40px)', overflowY: 'auto', opacity: isHudExpanded ? 1 : 0, transform: isHudExpanded ? 'translateX(0)' : 'translateX(20px)', pointerEvents: isHudExpanded ? 'auto' : 'none', transition: 'opacity 0.3s ease, transform 0.3s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', color: subtextColor }}>View Controls</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); setIsHudExpanded(false); }} style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Minimize camera settings"><X size={18} color={subtextColor} /></button>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button type="button" style={getColoredBtnStyle(showMapTiles, controlColors.zoom)} onClick={() => setShowMapTiles(!showMapTiles)}>{showMapTiles ? 'Map Tiles: ON' : 'Map Tiles: OFF'}</button>
            <button type="button" style={getColoredBtnStyle(showAllManifests, '#00E676')} onClick={() => setShowAllManifests(!showAllManifests)}>{showAllManifests ? 'Manifests: ON' : 'Manifests: OFF'}</button>
          </div>
          <div style={{ height: '1px', background: borderColor, flexShrink: 0 }} />

          {/* DYNAMIC VEHICLE-SPECIFIC SAFETY SLIDER */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: subtextColor, fontWeight: '700' }}>Velocity Danger Zone</div>
              <div style={{ fontSize: '12px', fontWeight: '800', color: selectedVehicle ? '#ff3b30' : subtextColor }}>{selectedVehicle ? currentMultiplier + 'x' : '—'}</div>
            </div>

            <input
              type="range" min="1" max="30" step="1"
              value={currentMultiplier}
              disabled={!selectedVehicle}
              onChange={(e) => {
                const val = Number(e.target.value);
                setVehicles(prev => prev.map(v => v.id === selectedVehicle ? { ...v, dangerZoneMultiplier: val } : v));
              }}
              onMouseUp={() => saveMultiplierToDB()}
              onTouchEnd={() => saveMultiplierToDB()}
              style={{ width: '100%', cursor: selectedVehicle ? 'pointer' : 'not-allowed', accentColor: '#ff3b30', opacity: selectedVehicle ? 1 : 0.4 }}
            />
            <div style={{ textAlign: 'center', fontSize: '9px', color: subtextColor, marginTop: '6px' }}>
               {selectedVehicle ? `Radius = Speed (m/s) × ${currentMultiplier} (Min 10m)` : "Select a vehicle to configure"}
            </div>
          </div>
          <div style={{ height: '1px', background: borderColor, flexShrink: 0 }} />

          <div style={{ flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: btnBg, border: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'center', alignItems: 'center', perspective: '100px' }}><Layers size={18} color="#7209b7" style={{ transform: `rotateX(${viewState.pitch}deg)`, transformStyle: 'preserve-3d' }} /></div>
              <div>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: subtextColor }}>Pitch Angle</div>
                <div style={{ fontSize: '15px', fontWeight: '600' }}>{Math.round(viewState.pitch)}°</div>
              </div>
            </div>
            <input type="range" min="0" max="85" value={viewState.pitch} onChange={(e) => setViewState(prev => ({...prev, pitch: Number(e.target.value)}))} style={{ width: '100%', cursor: 'pointer', accentColor: '#7209b7', marginBottom: '12px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" style={getColoredBtnStyle(viewState.pitch === 0, controlColors.flat2D)} onClick={() => setViewState(prev => ({...prev, pitch: 0, transitionDuration: 500}))}>2D Flat</button>
              <button type="button" style={getColoredBtnStyle(Math.abs(viewState.pitch - 65) < 2, controlColors.view3D)} onClick={() => setViewState(prev => ({...prev, pitch: 65, transitionDuration: 500}))}>3D View</button>
            </div>
          </div>
          <div style={{ height: '1px', background: borderColor, flexShrink: 0 }} />

          <div style={{ flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: btnBg, border: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><span style={{ fontWeight: '800', color: isLOD ? '#ff3b30' : controlColors.zoom, fontSize: '12px' }}>{viewState.zoom.toFixed(1)}</span></div>
              <div>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: subtextColor }}>Map Scale {isLOD && '(LOD ON)'}</div>
                <div style={{ fontSize: '15px', fontWeight: '600' }}>Zoom Level</div>
              </div>
            </div>
            <input type="range" min="2" max="20" step="0.5" value={viewState.zoom} onChange={(e) => setViewState(prev => ({...prev, zoom: Number(e.target.value)}))} style={{ width: '100%', cursor: 'pointer', accentColor: controlColors.zoom, marginBottom: '12px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" style={getColoredBtnStyle(viewState.zoom < 5, controlColors.zoom)} onClick={() => flyTo(viewState.longitude, viewState.latitude, 3)}>Far</button>
              <button type="button" style={getColoredBtnStyle(viewState.zoom >= 5 && viewState.zoom < 16, controlColors.zoom)} onClick={() => flyTo(viewState.longitude, viewState.latitude, 12)}>Normal</button>
              <button type="button" style={getColoredBtnStyle(viewState.zoom >= 16, controlColors.zoom)} onClick={() => flyTo(viewState.longitude, viewState.latitude, 18)}>Close</button>
            </div>
          </div>
          <div style={{ height: '1px', background: borderColor, flexShrink: 0 }} />

          <div style={{ flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: subtextColor }}>Heading</div>
                <div style={{ fontSize: '15px', fontWeight: '600', marginTop: '2px' }}>{['N','NE','E','SE','S','SW','W','NW'][Math.round(normalizeBearing(viewState.bearing) / 45) % 8]}</div>
              </div>
              <div style={{ fontSize: '15px', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>{Math.round(normalizeBearing(viewState.bearing)).toString().padStart(3, '0')}°</div>
            </div>

            <RotatingCompass bearing={viewState.bearing} setBearing={(b) => setViewState(prev => ({ ...prev, bearing: b }))} subtextColor={subtextColor} borderColor={borderColor} isDark={isDark} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '14px' }}>
              <button type="button" style={getColoredBtnStyle(isBearingActive(viewState.bearing, 0), controlColors.north)} onClick={() => setViewState(prev => ({...prev, bearing: 0, transitionDuration: 300}))}>N</button>
              <button type="button" style={getColoredBtnStyle(isBearingActive(viewState.bearing, -90), controlColors.west)} onClick={() => setViewState(prev => ({...prev, bearing: -90, transitionDuration: 300}))}>W</button>
              <button type="button" style={getColoredBtnStyle(isBearingActive(viewState.bearing, 90), controlColors.east)} onClick={() => setViewState(prev => ({...prev, bearing: 90, transitionDuration: 300}))}>E</button>
              <button type="button" style={getColoredBtnStyle(isBearingActive(viewState.bearing, 180), controlColors.south)} onClick={() => setViewState(prev => ({...prev, bearing: 180, transitionDuration: 300}))}>S</button>
            </div>
          </div>

          <div style={{ height: '1px', background: borderColor, flexShrink: 0 }} />

          <div style={{ flexShrink: 0 }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><MapPin size={12} color={controlColors.zoom} /><span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: subtextColor }}>Teleport Coordinates</span></div>
             <div style={{ display: 'flex', gap: '8px' }}>
               <input type="number" value={goToLat} onChange={(e) => setGoToLat(e.target.value)} step="0.0001" style={{ flex: 1, minWidth: 0, padding: '6px', background: btnBg, border: `1px solid ${borderColor}`, color: textColor, borderRadius: '6px', fontSize: '11px', outline: 'none' }} title="Latitude" />
               <input type="number" value={goToLon} onChange={(e) => setGoToLon(e.target.value)} step="0.0001" style={{ flex: 1, minWidth: 0, padding: '6px', background: btnBg, border: `1px solid ${borderColor}`, color: textColor, borderRadius: '6px', fontSize: '11px', outline: 'none' }} title="Longitude" />
               <button onClick={() => flyTo(Number(goToLon), Number(goToLat), viewState.zoom)} style={{ background: controlColors.zoom, color: '#000', border: 'none', borderRadius: '6px', padding: '0 12px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>GO</button>
             </div>
             <div style={{ textAlign: 'center', fontSize: '9px', color: subtextColor, marginTop: '16px' }}>Left Click: Pan | Right Click: Orbit | Scroll: Zoom</div>
          </div>
        </div>

        <DraggableFAB initialTop={20} initialRight={20} visible={!isHudExpanded} onClick={() => setIsHudExpanded(true)} hudBg={hudBg} borderColor={borderColor} textColor={textColor}>
          <Camera size={20} style={{ pointerEvents: 'none' }} />
        </DraggableFAB>

        <GlobalSearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} isAiSearch={isAiSearch} setIsAiSearch={setIsAiSearch} handleCommandSubmit={handleCommandSubmit} placeholderNormal="Search RYNTARA fleet (Type '/' to navigate)..." placeholderAi="Ask RYNTARA AI to execute a fleet command..." bottomOffset="26px" />
      </div>
    </div>
  );
}