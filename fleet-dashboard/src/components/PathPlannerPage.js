import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import SpatialEngine from '../components/SpatialEngine';
import { FlyToInterpolator } from '@deck.gl/core';

import {
  ArrowLeft, MapPin, AlertTriangle, CheckCircle, Clock,
  Sliders, Save, Trash2, FastForward, X, List, Layers, Navigation, Camera
} from 'lucide-react';

import { useTheme } from '../context/ThemeContext';
import GlobalSearchBar from '../components/GlobalSearchBar';

const FAB_SIZE = 44;
const FAB_MARGIN = 8;
const MAX_MAP_PITCH = 85;

const HIDDEN_KEYS = ['id', 'vehicleId', 'vehicle_id', 'timestamp', 'metrics', 'additionalProperties', 'latitude', 'longitude', 'altitude'];

const toLocalISOString = (dateOrMs) => {
  const d = new Date(dateOrMs);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, -1);
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
      style={{ position: 'absolute', top: pos.top, ...(pos.left !== undefined ? { left: pos.left } : {}), ...(pos.right !== undefined ? { right: pos.right } : {}), background: hudBg, border: `1px solid ${borderColor}`, borderRadius: '50%', width: `${FAB_SIZE}px`, height: `${FAB_SIZE}px`, display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: isDragging ? 'grabbing' : 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 25, color: textColor, opacity: visible ? 1 : 0, transform: visible ? 'scale(1)' : 'scale(0.8)', pointerEvents: visible ? 'auto' : 'none', touchAction: 'none', userSelect: 'none', outline: 'none', transition: isDragging ? 'none' : 'opacity 0.3s ease, transform 0.3s ease' }}>
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

export default function PathPlannerPage() {
  const navigate = useNavigate();
  const { theme } = useTheme();

  const isDark = theme === 'dark';
  const hudBg = isDark ? 'rgba(18, 18, 22, 0.95)' : 'rgba(255, 255, 255, 0.95)';
  const textColor = isDark ? '#fff' : '#111';
  const subtextColor = isDark ? '#888' : '#555';
  const borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.1)';
  const btnBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
  const insetBg = isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)';
  const bgInput = isDark ? 'rgba(0,0,0,0.3)' : '#fafafa';

  const [searchQuery, setSearchQuery] = useState('');
  const [isAiSearch, setIsAiSearch] = useState(false);

  const handleCommandSubmit = (event) => {
    event.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchQuery('');
  };

  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');

  const [telemetryData, setTelemetryData] = useState({});
  const [frozenTelemetry, setFrozenTelemetry] = useState(null);
  const latestTelemetryRef = useRef(telemetryData);

  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
  const [isScrubberMinimized, setIsScrubberMinimized] = useState(false);
  const [isLegendMinimized, setIsLegendMinimized] = useState(false);
  const [isHudExpanded, setIsHudExpanded] = useState(true);

  const [cameraLock, setCameraLock] = useState(false);
  const [showAllManifests, setShowAllManifests] = useState(false);

  // MANIFEST DROPDOWN SEARCH STATE
  const [manifestSearch, setManifestSearch] = useState('');
  const [showManifestDropdown, setShowManifestDropdown] = useState(false);
  const [viewingManifestId, setViewingManifestId] = useState(null);

  const [viewState, setViewState] = useState({
    longitude: -122.4194, latitude: 37.7749, zoom: 15, pitch: 60, bearing: -20, maxZoom: 22, minZoom: 2,
  });
  const isLOD = viewState.zoom < 13.5;

  const [showMapTiles, setShowMapTiles] = useState(true);
  const [goToLat, setGoToLat] = useState(viewState.latitude);
  const [goToLon, setGoToLon] = useState(viewState.longitude);

  const [clickMode, setClickMode] = useState(null);
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [speed, setSpeed] = useState(15);

  const [startTime, setStartTime] = useState(() => toLocalISOString(Date.now()).slice(0, 16));
  const [isManualTime, setIsManualTime] = useState(false);
  const [lastManifestEndTime, setLastManifestEndTime] = useState(null);
  const lastAutofilledVehicle = useRef(null);

  const [altitude, setAltitude] = useState(50);
  const [precision, setPrecision] = useState(0.5);
  const [safetyBubble, setSafetyBubble] = useState(30);
  const [flexAltitude, setFlexAltitude] = useState(true);

  const [manifestName, setManifestName] = useState('New Route');

  const [redzones, setRedzones] = useState([]);
  const [redzoneAltMin, setRedzoneAltMin] = useState(0);
  const [redzoneAltMax, setRedzoneAltMax] = useState(120);
  const [editingRedzoneId, setEditingRedzoneId] = useState(null);
  const redzoneIdRef = useRef(0);

  const [dbTrafficMap, setDbTrafficMap] = useState({});
  const [dbTraffic, setDbTraffic] = useState([]);
  const [dbManifests, setDbManifests] = useState([]);
  const [dbRedzones, setDbRedzones] = useState([]);
  const [liveTime, setLiveTime] = useState(Date.now());
  const [overrideTimeMs, setOverrideTimeMs] = useState(null);

  const [planningState, setPlanningState] = useState('IDLE');
  const [manifest, setManifest] = useState([]);
  const [conflictData, setConflictData] = useState(null);
  const [suggestedPath, setSuggestedPath] = useState(null);
  const [formError, setFormError] = useState('');

  const selectedVehicleObj = vehicles.find((v) => v.id === selectedVehicleId);
  const isUav = selectedVehicleObj?.category !== 'GROUND';

  const flyTo = useCallback((targetLon, targetLat, targetZoom = 16.5) => {
    setViewState(prev => ({
      ...prev, longitude: targetLon, latitude: targetLat, zoom: targetZoom,
      transitionDuration: 1200, transitionInterpolator: new FlyToInterpolator({ curve: 1.5 }),
    }));
  }, []);

  useEffect(() => {
    if (selectedVehicleId && telemetryData[selectedVehicleId]) {
      const pos = telemetryData[selectedVehicleId];
      setViewState(prev => ({
        ...prev, longitude: pos.longitude, latitude: pos.latitude, zoom: 18,
        transitionDuration: 1200, transitionInterpolator: new FlyToInterpolator({ curve: 1.5 })
      }));
      setCameraLock(true);
    }
  }, [selectedVehicleId]);

  useEffect(() => {
    if (cameraLock && selectedVehicleId && telemetryData[selectedVehicleId]) {
      const pos = telemetryData[selectedVehicleId];
      if (typeof pos.longitude !== 'number' || typeof pos.latitude !== 'number') return;
      setViewState(prev => ({ ...prev, longitude: pos.longitude, latitude: pos.latitude }));
    }
  }, [telemetryData, selectedVehicleId, cameraLock]);

  useEffect(() => {
    const socket = new SockJS('http://localhost:8080/ws-telemetry');
    const stompClient = new Client({
      webSocketFactory: () => socket,
      onConnect: () => {
        fetch('http://localhost:8080/api/discovery/configs')
          .then((res) => res.json())
          .then((data) => {
            setVehicles(data);
            if (data.length > 0) setSelectedVehicleId(data[0].id);

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

  const fetchAtcData = useCallback(async () => {
    try {
      const [rzRes, trafficRes, manifestsRes] = await Promise.all([
        fetch('http://localhost:8080/api/routing/redzones').catch(()=>({ok:false})),
        fetch('http://localhost:8080/api/routing/traffic').catch(()=>({ok:false})),
        fetch('http://localhost:8080/api/routing/manifests').catch(()=>({ok:false}))
      ]);
      if (rzRes.ok) {
        const rzData = await rzRes.json();
        setDbRedzones(rzData.map(r => ({ id: r.id, center: [r.longitude, r.latitude], radius: r.radiusMeters })));
      }
      let manifests = [];
      if (manifestsRes.ok) {
        manifests = await manifestsRes.json();
        setDbManifests(manifests);
      }
      if (trafficRes.ok) {
        const trafficData = await trafficRes.json();
        const splitTraffic = [];
        const splitMap = {};

        for (const [vId, waypoints] of Object.entries(trafficData)) {
          splitMap[vId] = [];
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
                const manifestObj = { path: mPath, manifestId: m.id, vehicleId: m.vehicleId, name: m.name };
                splitTraffic.push(manifestObj);
                splitMap[vId].push(manifestObj);
              }
            });
          } else {
            let currentPath = [];
            for (let i = 0; i < waypoints.length; i++) {
              const wp = waypoints[i];
              if (currentPath.length === 0) currentPath.push(wp);
              else {
                const prevWp = currentPath[currentPath.length - 1];
                if (new Date(wp.timestamp).getTime() - new Date(prevWp.timestamp).getTime() > 60000) {
                  const manifestObj = { path: currentPath, manifestId: 'unknown', vehicleId: vId, name: 'Legacy Path' };
                  splitTraffic.push(manifestObj);
                  splitMap[vId].push(manifestObj);
                  currentPath = [wp];
                } else {
                  currentPath.push(wp);
                }
              }
            }
            if (currentPath.length > 0) {
              const manifestObj = { path: currentPath, manifestId: 'unknown', vehicleId: vId, name: 'Legacy Path' };
              splitTraffic.push(manifestObj);
              splitMap[vId].push(manifestObj);
            }
          }
        }
        setDbTrafficMap(splitMap);
        setDbTraffic(splitTraffic);
      }
    } catch (e) {
      console.error("Failed to fetch ATC data", e);
    }
  }, []);

  useEffect(() => {
    fetchAtcData();
    const interval = setInterval(fetchAtcData, 5000);
    return () => clearInterval(interval);
  }, [fetchAtcData]);

  useEffect(() => {
    latestTelemetryRef.current = telemetryData;
  }, [telemetryData]);

  useEffect(() => {
    if (overrideTimeMs !== null && frozenTelemetry === null) {
      setFrozenTelemetry(JSON.parse(JSON.stringify(latestTelemetryRef.current)));
    } else if (overrideTimeMs === null && frozenTelemetry !== null) {
      setFrozenTelemetry(null);
    }
  }, [overrideTimeMs, frozenTelemetry]);

  const activeTelemetry = frozenTelemetry || telemetryData;

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isManualTime) {
        const endMs = lastManifestEndTime || Date.now();
        const defaultStartMs = Math.max(Date.now(), endMs);
        setStartTime(toLocalISOString(defaultStartMs).slice(0, 16));
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isManualTime, lastManifestEndTime]);

  useEffect(() => {
    if (!selectedVehicleId) return;
    const vehiclePaths = dbTrafficMap[selectedVehicleId];

    if (vehiclePaths && vehiclePaths.length > 0) {
      const lastPathObj = vehiclePaths[vehiclePaths.length - 1];
      const lastWp = lastPathObj.path[lastPathObj.path.length - 1];
      const endMs = new Date(lastWp.timestamp).getTime();
      setLastManifestEndTime(endMs);

      if (lastAutofilledVehicle.current !== selectedVehicleId) {
        setIsManualTime(false);
        const defaultStartMs = Math.max(Date.now(), endMs);
        setStartTime(toLocalISOString(defaultStartMs).slice(0, 16));
        lastAutofilledVehicle.current = selectedVehicleId;
        setPlanningState('IDLE');
      }
    } else {
      setLastManifestEndTime(null);
      if (lastAutofilledVehicle.current !== selectedVehicleId) {
        setIsManualTime(false);
        setStartTime(toLocalISOString(Date.now()).slice(0, 16));
        lastAutofilledVehicle.current = selectedVehicleId;
        setPlanningState('IDLE');
      }
    }
  }, [selectedVehicleId, dbTrafficMap]);

  const timeBounds = useMemo(() => {
    let min = Infinity, max = -Infinity;
    dbTraffic.forEach(manifestObj => {
      if (manifestObj.path && manifestObj.path.length > 0) {
        min = Math.min(min, new Date(manifestObj.path[0].timestamp).getTime());
        max = Math.max(max, new Date(manifestObj.path[manifestObj.path.length-1].timestamp).getTime());
      }
    });
    if (manifest.length > 0) {
       min = Math.min(min, new Date(manifest[0].timestamp).getTime());
       max = Math.max(max, new Date(manifest[manifest.length-1].timestamp).getTime());
    }
    if (min === Infinity) {
       const now = Date.now();
       return { min: now - 60000, max: now + 3600000 };
    }
    return { min: min - 60000, max: max + 60000 };
  }, [dbTraffic, manifest]);

  const simulatedTimeMs = overrideTimeMs !== null ? overrideTimeMs : liveTime;

  const vehiclePaths = dbTrafficMap[selectedVehicleId];
  let manualTransitPath = null;
  let continuityWarning = false;

  if (startPoint && vehiclePaths && vehiclePaths.length > 0) {
    const lastPathObj = vehiclePaths[vehiclePaths.length - 1];
    const lastWp = lastPathObj.path[lastPathObj.path.length - 1];
    const dist = getDistance(lastWp.longitude, lastWp.latitude, startPoint[0], startPoint[1]);
    if (dist > 5) {
      continuityWarning = true;
      manualTransitPath = [
        { longitude: lastWp.longitude, latitude: lastWp.latitude, altitude: lastWp.altitude },
        { longitude: startPoint[0], latitude: startPoint[1], altitude: startPoint[2] || 0 }
      ];
    }
  }

  const selectedStartMs = new Date(startTime).getTime();
  const isTimeBlocked = lastManifestEndTime && selectedStartMs < lastManifestEndTime;
  const isPastWarning = isManualTime && (selectedStartMs < Date.now() - 60000);

  const isCruisingAltLow = isUav && (
    altitude < (startPoint ? startPoint[2] || 0 : 0) ||
    altitude < (endPoint ? endPoint[2] || 0 : 0)
  );

  let estimatedArrivalMs = null;
  if (startPoint && endPoint && speed > 0 && startTime) {
    const dist = getDistance(startPoint[0], startPoint[1], endPoint[0], endPoint[1]);
    const durationSec = dist / speed;
    estimatedArrivalMs = new Date(startTime).getTime() + (durationSec * 1000);
  }

  const handleMapClick = ({ lngLat }) => {
    if (clickMode === 'START') { setStartPoint([lngLat.lng, lngLat.lat, 0]); setClickMode(null); }
    if (clickMode === 'END') { setEndPoint([lngLat.lng, lngLat.lat, 0]); setClickMode(null); }
    if (clickMode === 'REDZONE') {
      redzoneIdRef.current += 1;
      setRedzones((prev) => [...prev, { id: `rz-${redzoneIdRef.current}`, center: [lngLat.lng, lngLat.lat], radius: 50, altMin: redzoneAltMin, altMax: redzoneAltMax }]);
      setClickMode(null);
    }
  };

  const updatePoint = (setter, point, index, val) => {
    const newPoint = [...point];
    newPoint[index] = Number(val);
    setter(newPoint);
    setPlanningState('IDLE');
  };

  const updateRedzone = (id, updates) => {
    setRedzones(prev => prev.map(rz => rz.id === id ? { ...rz, ...updates } : rz));
  };

  const deleteRedzone = (id) => {
    setRedzones((prev) => prev.filter((rz) => rz.id !== id));
    if(editingRedzoneId === id) setEditingRedzoneId(null);
  };

  // Filter dynamic manifest dropdown
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
    if (trafficChunk && trafficChunk.path && trafficChunk.path.length > 0) {
      const pt = trafficChunk.path[0];
      flyTo(pt.longitude, pt.latitude, 16);
    }
  };

  const generateAndValidateManifest = async () => {
    if (!startPoint || !endPoint || isTimeBlocked || isPastWarning) return;
    setPlanningState('PROCESSING');
    setFormError('');
    setSuggestedPath(null);

    const totalDist = getDistance(startPoint[0], startPoint[1], endPoint[0], endPoint[1]);
    const totalTimeSec = totalDist / speed;
    const steps = Math.max(1, Math.ceil(totalTimeSec / precision));
    const startMs = new Date(startTime).getTime();

    const startAlt = startPoint[2] || 0;
    const endAlt = endPoint[2] || 0;

    const newManifest = Array.from({ length: steps + 1 }).map((_, i) => {
      let calcAlt = isUav ? altitude : 0;
      if (isUav) {
         if (i === 0) calcAlt = startAlt;
         else if (i === steps) calcAlt = endAlt;
      }
      return {
        timestamp: toLocalISOString(startMs + i * precision * 1000),
        longitude: startPoint[0] + (endPoint[0] - startPoint[0]) * (i / steps),
        latitude: startPoint[1] + (endPoint[1] - startPoint[1]) * (i / steps),
        altitude: calcAlt,
      };
    });

    setManifest(newManifest);

    try {
      const payload = {
        name: manifestName,
        vehicleId: selectedVehicleId,
        startTime: newManifest[0].timestamp,
        endTime: newManifest[newManifest.length - 1].timestamp,
        speed: speed,
        safetyBubble: safetyBubble,
        waypoints: newManifest,
        localRedzones: redzones.map(rz => ({
          longitude: rz.center[0], latitude: rz.center[1],
          radiusMeters: rz.radius, altitudeMinMeters: rz.altMin, altitudeMaxMeters: rz.altMax
        })),
        allowAltRouting: flexAltitude
      };

      const res = await fetch('http://localhost:8080/api/routing/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("Failed to reach routing engine");
      const result = await res.json();

      if (result.hasConflict) {
        setConflictData({
          index: result.conflictIndex, timestamp: newManifest[result.conflictIndex].timestamp,
          conflictingVehicle: result.conflictingEntity, distanceViolation: result.distanceViolation,
          position: { longitude: newManifest[result.conflictIndex].longitude, latitude: newManifest[result.conflictIndex].latitude }
        });
        if (result.suggestedPath && result.suggestedPath.length > 0) setSuggestedPath(result.suggestedPath);
        setOverrideTimeMs(new Date(newManifest[result.conflictIndex].timestamp).getTime());
        setPlanningState('REJECTED');
      } else {
        setConflictData(null);
        setOverrideTimeMs(new Date(newManifest[0].timestamp).getTime());
        setPlanningState('APPROVED');
      }
    } catch (err) {
      console.error("Routing Error:", err);
      setFormError("Error connecting to Routing Engine: " + err.message);
      setPlanningState('IDLE');
    }
  };

  const handleAcceptSuggestedRoute = () => {
    if (!suggestedPath || suggestedPath.length < 2) return;
    const startMs = new Date(startTime).getTime();
    let accumulatedTimeMs = startMs;
    const newManifest = [];
    const finalSafePath = [];
    if (isUav) finalSafePath.push({ longitude: startPoint[0], latitude: startPoint[1], altitude: startPoint[2] || 0 });
    finalSafePath.push(...suggestedPath);
    if (isUav) finalSafePath.push({ longitude: endPoint[0], latitude: endPoint[1], altitude: endPoint[2] || 0 });

    for (let i = 0; i < finalSafePath.length; i++) {
        const pt = finalSafePath[i];
        if (i > 0) {
            const prev = finalSafePath[i-1];
            const dist2D = getDistance(prev.longitude, prev.latitude, pt.longitude, pt.latitude);
            const dist3D = Math.hypot(dist2D, pt.altitude - prev.altitude);
            const durationSec = dist3D / speed;
            accumulatedTimeMs += (durationSec * 1000);
        }
        newManifest.push({ timestamp: toLocalISOString(accumulatedTimeMs), longitude: pt.longitude, latitude: pt.latitude, altitude: pt.altitude });
    }
    setManifest(newManifest);
    setSuggestedPath(null);
    setConflictData(null);
    setPlanningState('APPROVED');
  };

  const handleSubmitManifest = async () => {
    try {
      const payload = {
        name: manifestName,
        vehicleId: selectedVehicleId, startTime: manifest[0].timestamp, endTime: manifest[manifest.length - 1].timestamp, speed: speed, safetyBubble: safetyBubble,
        waypoints: manifest, localRedzones: redzones.map(rz => ({ longitude: rz.center[0], latitude: rz.center[1], radiusMeters: rz.radius, altitudeMinMeters: rz.altMin, altitudeMaxMeters: rz.altMax })),
        allowAltRouting: flexAltitude
      };
      const res = await fetch('http://localhost:8080/api/routing/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await res.text());
      alert("Manifest accepted! The path is now live on the ATC Radar.");
      navigate('/manage');
    } catch (err) { setFormError("Submission failed: " + err.message); }
  };

  const isInvalidState = !startPoint || !endPoint || isTimeBlocked || isPastWarning || planningState === 'PROCESSING';

  const controlColors = { flat2D: '#00b4d8', view3D: '#7209b7', north: '#f72585', east: '#4cc9f0', south: '#4895ef', west: '#3a0ca3', zoom: '#00E5FF' };
  const getColoredBtnStyle = (isActive, activeColor) => ({ flex: 1, background: isActive ? activeColor : btnBg, border: `1px solid ${isActive ? activeColor : borderColor}`, borderRadius: '7px', color: isActive ? '#fff' : subtextColor, fontSize: '11px', padding: '7px 0', cursor: 'pointer', textTransform: 'uppercase', fontWeight: '700', transition: 'all 0.2s ease', boxShadow: isActive ? `0 4px 12px ${activeColor}50` : 'none' });

  const vehicleById = useMemo(() => {
    const map = {};
    vehicles.forEach(vehicle => { map[vehicle.id] = vehicle; });
    return map;
  }, [vehicles]);

  const currentMultiplier = selectedVehicleId && vehicleById[selectedVehicleId]?.dangerZoneMultiplier !== undefined ? vehicleById[selectedVehicleId].dangerZoneMultiplier : 10;

  const saveMultiplierToDB = async () => {
    if (!selectedVehicleId) return;
    const vehicleToSave = vehicles.find(v => v.id === selectedVehicleId);
    if (!vehicleToSave) return;
    try {
      await fetch('http://localhost:8080/api/discovery/configs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehicleToSave)
      });
    } catch (err) { console.error("Failed to save config:", err); }
  };

  return (
    <div className="pp-shell" style={{ width: '100vw', height: '100vh', display: 'flex', background: isDark ? '#080a0f' : '#f7f9fb', overflow: 'hidden', position: 'relative' }}>
      <style>{`
        .pp-icon-btn { background: transparent; border: none; padding: 4px; cursor: pointer; display: flex; transition: all 0.15s ease; }
        .pp-icon-btn:hover { transform: translateY(-1px); filter: brightness(1.2); }
        .pp-num-input { padding: 6px; background: ${bgInput}; border: 1px solid ${borderColor}; color: ${textColor}; border-radius: 6px; width: 100%; outline: none; transition: border-color 0.2s; }
        .pp-num-input:focus { border-color: #00E5FF; }
        .pp-num-input.error { border-color: #ff3b30; background: rgba(255, 59, 48, 0.05); }
        .pp-num-input.warning { border-color: #ffaa00; background: rgba(255, 170, 0, 0.05); }
        @keyframes radar-spin { 100% { transform: rotate(360deg); } }
        @keyframes data-pulse { 0% { opacity: 0.5; box-shadow: 0 0 10px #00E5FF; } 50% { opacity: 1; box-shadow: 0 0 30px #00E5FF; } 100% { opacity: 0.5; box-shadow: 0 0 10px #00E5FF; } }
      `}</style>

      {planningState === 'PROCESSING' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 9999, background: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.5)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
           <div style={{ background: hudBg, border: `1px solid rgba(0, 229, 255, 0.5)`, borderRadius: '24px', padding: '40px 60px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 0 50px rgba(0, 229, 255, 0.15)', textAlign: 'center' }}>
              <div style={{ position: 'relative', width: '80px', height: '80px', marginBottom: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                 <div style={{ position: 'absolute', inset: 0, border: '3px dashed #00E5FF', borderRadius: '50%', animation: 'radar-spin 4s linear infinite', opacity: 0.4 }} />
                 <div style={{ position: 'absolute', inset: '10px', border: '3px solid #a855f7', borderTopColor: 'transparent', borderRadius: '50%', animation: 'radar-spin 1.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite' }} />
                 <div style={{ width: '20px', height: '20px', background: '#00E5FF', borderRadius: '50%', animation: 'data-pulse 1s ease-in-out infinite' }} />
              </div>
              <h2 style={{ color: textColor, margin: '0 0 10px 0', fontSize: '22px', fontWeight: '800', letterSpacing: '1px' }}>Simulating Trajectory</h2>
              <p style={{ color: subtextColor, margin: 0, fontSize: '13px', maxWidth: '280px', lineHeight: '1.5' }}>Evaluating spatial constraints, checking collisions, and generating A* multi-dimensional splines.</p>
           </div>
        </div>
      )}

      <DraggableFAB initialTop={20} initialLeft={20} visible={isSidebarMinimized} onClick={() => setIsSidebarMinimized(false)} hudBg={hudBg} borderColor={borderColor} textColor={textColor}>
        <Sliders size={20} style={{ pointerEvents: 'none' }} />
      </DraggableFAB>

      <div className="fleet-sidebar-panel" style={{ position: 'absolute', top: '20px', left: '20px', width: '380px', height: 'calc(100vh - 40px)', background: hudBg, border: `1px solid ${borderColor}`, borderRadius: '16px', display: 'flex', flexDirection: 'column', zIndex: 20, backdropFilter: 'blur(15px)', opacity: isSidebarMinimized ? 0 : 1, transform: isSidebarMinimized ? 'translateX(-20px)' : 'translateX(0)', pointerEvents: isSidebarMinimized ? 'none' : 'auto', transition: 'opacity 0.3s ease, transform 0.3s ease', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
        <div style={{ padding: '20px', paddingBottom: '16px', borderBottom: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button onClick={() => navigate('/manage')} style={{ background: 'transparent', border: 'none', color: textColor, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600', padding: 0 }}><ArrowLeft size={16} /> Fleet Map</button>
          <button onClick={() => setIsSidebarMinimized(true)} style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Minimize Panel"><X size={18} color={subtextColor} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ fontSize: '11px', color: subtextColor, textTransform: 'uppercase', fontWeight: '700' }}>Target Vehicle</label>
            <select value={selectedVehicleId} onChange={(e) => { setSelectedVehicleId(e.target.value); setCameraLock(true); }} style={{ width: '100%', marginTop: '6px', padding: '10px', background: bgInput, border: `1px solid ${borderColor}`, color: textColor, borderRadius: '8px' }}>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.category})</option>)}
            </select>

            {/* SEARCH MANIFESTS DROPDOWN */}
            <div style={{ position: 'relative', marginTop: '16px', padding: '12px', background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)', borderRadius: '12px', border: `1px solid ${borderColor}` }}>
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

            {activeTelemetry[selectedVehicleId] && (
              <div style={{ marginTop: '10px', padding: '12px', background: isDark ? 'rgba(0, 230, 118, 0.05)' : 'rgba(0, 230, 118, 0.1)', border: '1px solid rgba(0, 230, 118, 0.2)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: '#00E676', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E676' }}/>{frozenTelemetry ? 'Frozen Telemetry' : 'Live Telemetry'}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <div><div style={{ fontSize: '9px', color: subtextColor, textTransform: 'uppercase' }}>Lat</div><div style={{ fontSize: '11px', fontWeight: '600', color: textColor }}>{activeTelemetry[selectedVehicleId].latitude.toFixed(5)}</div></div>
                  <div><div style={{ fontSize: '9px', color: subtextColor, textTransform: 'uppercase' }}>Lon</div><div style={{ fontSize: '11px', fontWeight: '600', color: textColor }}>{activeTelemetry[selectedVehicleId].longitude.toFixed(5)}</div></div>
                  <div><div style={{ fontSize: '9px', color: subtextColor, textTransform: 'uppercase' }}>Alt</div><div style={{ fontSize: '11px', fontWeight: '600', color: textColor }}>{Number(activeTelemetry[selectedVehicleId].altitude || 0).toFixed(1)}m</div></div>
                </div>
              </div>
            )}
          </div>

          <div style={{ background: insetBg, border: `1px solid ${borderColor}`, borderRadius: '12px', padding: '16px' }}>
            <label style={{ fontSize: '11px', color: subtextColor, textTransform: 'uppercase', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}><MapPin size={14} /> Spatial Waypoints</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => {setClickMode('START'); setPlanningState('IDLE'); setCameraLock(false);}} style={{ flex: 1, padding: '10px', background: clickMode === 'START' || startPoint ? '#00E5FF' : btnBg, color: clickMode === 'START' || startPoint ? '#000' : textColor, border: `1px solid ${clickMode === 'START' || startPoint ? '#00E5FF' : borderColor}`, borderRadius: '8px', cursor: 'pointer', fontWeight: '700', transition: 'all 0.2s' }}>{startPoint ? 'Start Set ✓' : 'Set Start'}</button>
              <button onClick={() => {setClickMode('END'); setPlanningState('IDLE'); setCameraLock(false);}} style={{ flex: 1, padding: '10px', background: clickMode === 'END' || endPoint ? '#a855f7' : btnBg, color: clickMode === 'END' || endPoint ? '#fff' : textColor, border: `1px solid ${clickMode === 'END' || endPoint ? '#a855f7' : borderColor}`, borderRadius: '8px', cursor: 'pointer', fontWeight: '700', transition: 'all 0.2s' }}>{endPoint ? 'End Set ✓' : 'Set End'}</button>
            </div>

            {startPoint && (
              <div style={{ marginTop: '12px', padding: '10px', background: isDark ? 'rgba(255,255,255,0.02)' : '#fff', border: `1px solid ${borderColor}`, borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', color: '#00E5FF', fontWeight: '700', textTransform: 'uppercase' }}>Start Coordinates</span>
                  <button onClick={() => { setStartPoint(null); setPlanningState('IDLE'); }} style={{ background: 'none', border: 'none', color: '#ff3b30', cursor: 'pointer', padding: 0 }}><X size={14} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                    <div><span style={{ fontSize: '9px', color: subtextColor }}>Lng</span><input type="number" step="0.0001" value={startPoint[0]} onChange={e => updatePoint(setStartPoint, startPoint, 0, e.target.value)} className="pp-num-input" style={{ padding: '4px', fontSize: '11px' }} /></div>
                    <div><span style={{ fontSize: '9px', color: subtextColor }}>Lat</span><input type="number" step="0.0001" value={startPoint[1]} onChange={e => updatePoint(setStartPoint, startPoint, 1, e.target.value)} className="pp-num-input" style={{ padding: '4px', fontSize: '11px' }} /></div>
                    <div><span style={{ fontSize: '9px', color: subtextColor }}>Alt (m)</span><input type="number" step="1" value={startPoint[2]} onChange={e => updatePoint(setStartPoint, startPoint, 2, e.target.value)} className="pp-num-input" style={{ padding: '4px', fontSize: '11px' }} /></div>
                </div>
              </div>
            )}

            {endPoint && (
              <div style={{ marginTop: '12px', padding: '10px', background: isDark ? 'rgba(255,255,255,0.02)' : '#fff', border: `1px solid ${borderColor}`, borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', color: '#a855f7', fontWeight: '700', textTransform: 'uppercase' }}>End Coordinates</span>
                  <button onClick={() => { setEndPoint(null); setPlanningState('IDLE'); }} style={{ background: 'none', border: 'none', color: '#ff3b30', cursor: 'pointer', padding: 0 }}><X size={14} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                    <div><span style={{ fontSize: '9px', color: subtextColor }}>Lng</span><input type="number" step="0.0001" value={endPoint[0]} onChange={e => updatePoint(setEndPoint, endPoint, 0, e.target.value)} className="pp-num-input" style={{ padding: '4px', fontSize: '11px' }} /></div>
                    <div><span style={{ fontSize: '9px', color: subtextColor }}>Lat</span><input type="number" step="0.0001" value={endPoint[1]} onChange={e => updatePoint(setEndPoint, endPoint, 1, e.target.value)} className="pp-num-input" style={{ padding: '4px', fontSize: '11px' }} /></div>
                    <div><span style={{ fontSize: '9px', color: subtextColor }}>Alt (m)</span><input type="number" step="1" value={endPoint[2]} onChange={e => updatePoint(setEndPoint, endPoint, 2, e.target.value)} className="pp-num-input" style={{ padding: '4px', fontSize: '11px' }} /></div>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px' }}>
              <div><span style={{ fontSize: '10px', color: subtextColor, textTransform: 'uppercase' }}>Default Alt Min</span><input type="number" min="0" value={redzoneAltMin} onChange={(e) => setRedzoneAltMin(Number(e.target.value))} className="pp-num-input" /></div>
              <div><span style={{ fontSize: '10px', color: subtextColor, textTransform: 'uppercase' }}>Default Alt Max</span><input type="number" min="0" value={redzoneAltMax} onChange={(e) => setRedzoneAltMax(Number(e.target.value))} className="pp-num-input" /></div>
            </div>

            <button onClick={() => {setClickMode(clickMode === 'REDZONE' ? null : 'REDZONE'); setCameraLock(false);}} style={{ width: '100%', marginTop: '10px', padding: '10px', background: clickMode === 'REDZONE' ? '#ff3b30' : btnBg, color: clickMode === 'REDZONE' ? '#fff' : '#ff3b30', border: `1px solid ${clickMode === 'REDZONE' ? '#ff3b30' : borderColor}`, borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
              {clickMode === 'REDZONE' ? 'Click Map to Drop Redzone...' : '+ Drop New Redzone'}
            </button>

            {redzones.length > 0 && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '10px', color: subtextColor, textTransform: 'uppercase', fontWeight: '700' }}>Active Local Redzones</span>
                {redzones.map(rz => (
                  <div key={rz.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: isDark ? 'rgba(255,255,255,0.03)' : '#fff', padding: '12px', borderRadius: '8px', border: `1px solid ${borderColor}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: textColor, fontWeight: '700' }}>Custom Zone {rz.id.split('-')[1]}</span>
                      <button onClick={() => deleteRedzone(rz.id)} className="pp-icon-btn"><Trash2 size={16} color="#ff3b30"/></button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                      <div><span style={{ fontSize: '9px', color: subtextColor }}>Radius (m)</span><input type="number" min="1" value={rz.radius} onChange={(e) => updateRedzone(rz.id, {radius: Number(e.target.value)})} className="pp-num-input" style={{ padding: '4px', fontSize: '11px' }} /></div>
                      <div><span style={{ fontSize: '9px', color: subtextColor }}>Alt Min</span><input type="number" min="0" value={rz.altMin} onChange={(e) => updateRedzone(rz.id, {altMin: Number(e.target.value)})} className="pp-num-input" style={{ padding: '4px', fontSize: '11px' }} /></div>
                      <div><span style={{ fontSize: '9px', color: subtextColor }}>Alt Max</span><input type="number" min="0" value={rz.altMax} onChange={(e) => updateRedzone(rz.id, {altMax: Number(e.target.value)})} className="pp-num-input" style={{ padding: '4px', fontSize: '11px' }} /></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: '11px', color: subtextColor, textTransform: 'uppercase', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}><Sliders size={14} /> Trajectory Parameters</label>

            <div style={{ marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', color: subtextColor }}>Manifest Name</span>
              <input type="text" value={manifestName} onChange={(e) => setManifestName(e.target.value)} className="pp-num-input" placeholder="e.g. MedEvac Delivery" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div><span style={{ fontSize: '11px', color: subtextColor }}>Speed (m/s)</span><input type="number" min="0.1" step="0.1" value={speed} onChange={(e) => {setSpeed(Number(e.target.value)); setPlanningState('IDLE')}} className="pp-num-input" /></div>
              <div>
                <span style={{ fontSize: '11px', color: (isTimeBlocked || isPastWarning) ? '#ff3b30' : subtextColor }}>Start Time {isManualTime && '(Manual)'}</span>
                <input type="datetime-local" value={startTime} onChange={(e) => {setStartTime(e.target.value); setIsManualTime(true); setPlanningState('IDLE')}} className={`pp-num-input ${(isTimeBlocked || isPastWarning) ? 'error' : ''}`} />
              </div>
            </div>

            {isUav && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                <div><span style={{ fontSize: '11px', color: isCruisingAltLow ? '#ffaa00' : subtextColor }}>Cruising Alt (m)</span><input type="number" value={altitude} onChange={(e) => {setAltitude(Number(e.target.value)); setPlanningState('IDLE')}} className={`pp-num-input ${isCruisingAltLow ? 'warning' : ''}`} style={isCruisingAltLow ? { borderColor: '#ffaa00', background: 'rgba(255, 170, 0, 0.05)' } : {}}/></div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: textColor }}>
                    <input type="checkbox" checked={flexAltitude} onChange={(e) => setFlexAltitude(e.target.checked)} style={{ accentColor: '#00E5FF' }} /> Allow Alt Shift
                  </label>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <div><span style={{ fontSize: '11px', color: subtextColor }}>Interval (sec)</span><input type="number" min="0.1" step="0.1" value={precision} onChange={(e) => {setPrecision(Number(e.target.value)); setPlanningState('IDLE')}} className="pp-num-input" /></div>
              <div><span style={{ fontSize: '11px', color: subtextColor }}>Static Bubble (m)</span><input type="number" value={safetyBubble} onChange={(e) => {setSafetyBubble(Number(e.target.value)); setPlanningState('IDLE')}} className="pp-num-input" /></div>
            </div>

            <div style={{ marginTop: '12px', padding: '12px', background: insetBg, borderRadius: '8px', border: `1px solid ${borderColor}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: subtextColor, fontWeight: '700' }}>Velocity Danger Zone</div>
                <div style={{ fontSize: '12px', fontWeight: '800', color: selectedVehicleId ? '#ff3b30' : subtextColor }}>{selectedVehicleId ? currentMultiplier + 'x' : '—'}</div>
              </div>
              <input
                type="range" min="1" max="30" step="1"
                value={currentMultiplier} disabled={!selectedVehicleId}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setVehicles(prev => prev.map(v => v.id === selectedVehicleId ? { ...v, dangerZoneMultiplier: val } : v));
                }}
                onMouseUp={() => saveMultiplierToDB()} onTouchEnd={() => saveMultiplierToDB()}
                style={{ width: '100%', cursor: selectedVehicleId ? 'pointer' : 'not-allowed', accentColor: '#ff3b30', opacity: selectedVehicleId ? 1 : 0.4 }}
              />
              <div style={{ textAlign: 'center', fontSize: '9px', color: subtextColor, marginTop: '6px' }}>
                 {selectedVehicleId ? `Radius = Speed (m/s) × ${currentMultiplier} (Min 10m)` : "Select a vehicle to configure"}
              </div>
            </div>

            {estimatedArrivalMs && (
              <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '8px', background: isDark ? 'rgba(0, 229, 255, 0.1)' : 'rgba(0, 229, 255, 0.05)', border: `1px solid rgba(0, 229, 255, 0.3)`, color: textColor, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: subtextColor, textTransform: 'uppercase', fontWeight: '700' }}>Expected Arrival</span>
                <span style={{ fontWeight: '700', fontSize: '13px', color: '#00E5FF' }}>{new Date(estimatedArrivalMs).toLocaleTimeString()}</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {continuityWarning && manualTransitPath && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255, 170, 0, 0.1)', border: '1px solid rgba(255, 170, 0, 0.3)', color: '#ffaa00', fontSize: '12px' }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>Warning: The chosen Start Point is disconnected from the vehicle's last known position. The drone will jump to this point to begin routing.</span>
              </div>
            )}
            {isCruisingAltLow && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255, 170, 0, 0.1)', border: '1px solid rgba(255, 170, 0, 0.3)', color: '#ffaa00', fontSize: '12px' }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>Warning: Cruising altitude is lower than start or end altitude. Route will dip.</span>
              </div>
            )}
            {isPastWarning && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', color: '#ff3b30', fontSize: '12px' }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>Start time cannot be in the past. Modify your manual override.</span>
              </div>
            )}
            {isTimeBlocked && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', color: '#ff3b30', fontSize: '12px' }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>Cannot plan during an existing manifest. Must start after {new Date(lastManifestEndTime).toLocaleTimeString()}.</span>
              </div>
            )}
            {formError && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', color: '#ff3b30', fontSize: '12px' }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>{formError}</span>
              </div>
            )}
          </div>

          <button onClick={generateAndValidateManifest} disabled={isInvalidState} style={{ width: '100%', padding: '16px', borderRadius: '12px', border: 'none', background: isInvalidState ? btnBg : '#00E5FF', color: isInvalidState ? subtextColor : '#000', fontWeight: '700', cursor: isInvalidState ? 'not-allowed' : 'pointer', transition: 'all 0.2s ease' }}>
            {planningState === 'PROCESSING' ? 'Processing Engine...' : 'Generate & Validate Manifest'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        <SpatialEngine
          initialLon={-122.4194} initialLat={37.7749} clickMode={clickMode} onMapClick={handleMapClick}
          telemetryData={activeTelemetry} vehicles={vehicles} dbTraffic={dbTraffic} dbTrafficMap={dbTrafficMap} dbRedzones={dbRedzones} dbManifests={dbManifests}
          redzones={redzones} startPoint={startPoint} endPoint={endPoint} manifest={manifest} planningState={planningState}
          manualTransitPath={manualTransitPath} suggestedPath={suggestedPath} overrideTimeMs={overrideTimeMs}
          simulatedTimeMs={simulatedTimeMs} conflictData={conflictData} onMarkerClick={(id) => setEditingRedzoneId(prev => prev === id ? null : id)}
          isDark={isDark} vehicleById={vehicleById} viewState={viewState} setViewState={setViewState} showMapTiles={showMapTiles}
          showAllManifests={showAllManifests} viewingManifestId={viewingManifestId}
          onMapInteract={() => { setCameraLock(false); }}
          onVehicleClick={(id) => { setSelectedVehicleId(id); setCameraLock(true); }}
        />

        {planningState === 'APPROVED' && (
          <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0, 230, 118, 0.15)', border: '1px solid #00E676', backdropFilter: 'blur(10px)', padding: '16px 24px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px', zIndex: 10 }}>
            <CheckCircle color="#00E676" size={24} />
            <div><h4 style={{ margin: 0, color: '#fff', fontSize: '15px' }}>Manifest Approved</h4><p style={{ margin: 0, color: '#aaa', fontSize: '12px' }}>No spatial conflicts detected.</p></div>
            <button onClick={handleSubmitManifest} style={{ marginLeft: '16px', background: '#00E676', color: '#000', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Save size={14} style={{ marginRight: '6px' }} /> Submit to DB</button>
          </div>
        )}

        <DraggableFAB initialTop={window.innerHeight - 100} initialLeft={window.innerWidth / 2 - 22} visible={isScrubberMinimized} onClick={() => setIsScrubberMinimized(false)} hudBg={hudBg} borderColor={borderColor} textColor={textColor}>
          <Clock size={20} style={{ pointerEvents: 'none' }} />
        </DraggableFAB>

        <div style={{ position: 'absolute', bottom: '26px', left: '50%', width: '80%', background: hudBg, border: `1px solid ${planningState === 'REJECTED' ? '#ff3b30' : borderColor}`, backdropFilter: 'blur(15px)', borderRadius: '16px', padding: '20px', zIndex: 10, boxShadow: `0 20px 40px rgba(${planningState === 'REJECTED' ? '255, 59, 48' : '0, 0, 0'}, 0.2)`, opacity: isScrubberMinimized ? 0 : 1, transform: `translateX(-50%) ${isScrubberMinimized ? 'translateY(40px)' : 'translateY(0)'}`, pointerEvents: isScrubberMinimized ? 'none' : 'auto', transition: 'opacity 0.3s ease, transform 0.3s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {planningState === 'REJECTED' ? <AlertTriangle color="#ff3b30" size={24} /> : overrideTimeMs !== null ? <Clock color="#00E5FF" size={24} /> : <FastForward color="#a855f7" size={24} />}
              <div>
                <h4 style={{ margin: 0, color: planningState === 'REJECTED' ? '#ff3b30' : textColor, fontSize: '15px', fontWeight: '700' }}>{planningState === 'REJECTED' ? 'Manifest Rejected: Critical Conflict' : overrideTimeMs !== null ? 'Simulation Time Scrubber Active' : 'Live Traffic View'}</h4>
                <p style={{ margin: 0, color: subtextColor, fontSize: '12px' }}>{planningState === 'REJECTED' && conflictData ? (<>Safety bubble violation with <strong style={{ color: textColor }}>{conflictData.conflictingVehicle}</strong> at {new Date(conflictData.timestamp).toLocaleTimeString()}.</>) : overrideTimeMs !== null ? (<>Scrubbing historical/future DB paths. Live telemetry frozen.</>) : (<>Live Redis telemetry visible. Database paths parked.</>)}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {planningState === 'REJECTED' && suggestedPath && (<button onClick={handleAcceptSuggestedRoute} style={{ background: '#00E676', border: 'none', color: '#000', padding: '8px 16px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s ease' }}>Accept Safe Alternate Route</button>)}
              {planningState === 'REJECTED' && !suggestedPath && (<button disabled style={{ background: 'transparent', border: '1px solid #ff3b30', color: '#ff3b30', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', cursor: 'not-allowed', opacity: 0.5 }}>No Safe Route Found</button>)}
              {overrideTimeMs !== null && (<button onClick={() => setOverrideTimeMs(null)} style={{ background: 'transparent', border: `1px solid #a855f7`, color: '#a855f7', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Resume Live Time</button>)}
              <button onClick={() => setIsScrubberMinimized(true)} style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: '8px' }} title="Minimize Scrubber"><X size={18} color={subtextColor} /></button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Clock size={16} color={subtextColor} />
            <input type="range" min={timeBounds.min} max={timeBounds.max} value={simulatedTimeMs} onChange={(e) => setOverrideTimeMs(Number(e.target.value))} style={{ flex: 1, cursor: 'pointer', accentColor: planningState === 'REJECTED' ? '#ff3b30' : overrideTimeMs !== null ? '#00E5FF' : '#a855f7' }} />
            <span style={{ fontSize: '13px', fontFamily: 'monospace', color: textColor, minWidth: '80px', textAlign: 'right' }}>{new Date(simulatedTimeMs).toLocaleTimeString()}</span>
          </div>
        </div>

        <DraggableFAB initialTop={window.innerHeight - 100} initialRight={20} visible={isLegendMinimized} onClick={() => setIsLegendMinimized(false)} hudBg={hudBg} borderColor={borderColor} textColor={textColor}>
          <List size={20} style={{ pointerEvents: 'none' }} />
        </DraggableFAB>

        <div style={{ position: 'absolute', bottom: '26px', right: '20px', background: hudBg, border: `1px solid ${borderColor}`, borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 10, backdropFilter: 'blur(15px)', boxShadow: '0 10px 30px rgba(0,0,0,0.15)', opacity: isLegendMinimized ? 0 : 1, transform: isLegendMinimized ? 'translateX(20px)' : 'translateX(0)', pointerEvents: isLegendMinimized ? 'none' : 'auto', transition: 'opacity 0.3s ease, transform 0.3s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', color: subtextColor, letterSpacing: '0.5px' }}>Route Legend</span>
            <button onClick={() => setIsLegendMinimized(true)} style={{ background: 'none', border: 'none', padding: '0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Minimize Legend"><X size={14} color={subtextColor} /></button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '16px', height: '4px', background: '#00E5FF', borderRadius: '2px', boxShadow: '0 0 6px rgba(0,229,255,0.6)' }} /><span style={{ fontSize: '11px', color: textColor, fontWeight: '600' }}>Active Manifest</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '16px', height: '4px', background: '#00E676', borderRadius: '2px', boxShadow: '0 0 6px rgba(0,230,118,0.6)' }} /><span style={{ fontSize: '11px', color: textColor, fontWeight: '600' }}>A* Safe Route</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '16px', height: '4px', background: '#ffaa00', borderRadius: '2px', boxShadow: '0 0 6px rgba(255,170,0,0.6)' }} /><span style={{ fontSize: '11px', color: textColor, fontWeight: '600' }}>Fleet Traffic</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '16px', height: '4px', background: '#ff3b30', borderRadius: '2px', boxShadow: '0 0 6px rgba(255,59,48,0.6)' }} /><span style={{ fontSize: '11px', color: textColor, fontWeight: '600' }}>Rejected Path / Redzone</span></div>
        </div>

        {/* RIGHT CAMERA HUD */}
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
              <div style={{ fontSize: '12px', fontWeight: '800', color: selectedVehicleId ? '#ff3b30' : subtextColor }}>{selectedVehicleId ? currentMultiplier + 'x' : '—'}</div>
            </div>

            <input
              type="range" min="1" max="30" step="1"
              value={currentMultiplier}
              disabled={!selectedVehicleId}
              onChange={(e) => {
                const val = Number(e.target.value);
                setVehicles(prev => prev.map(v => v.id === selectedVehicleId ? { ...v, dangerZoneMultiplier: val } : v));
              }}
              onMouseUp={() => saveMultiplierToDB()}
              onTouchEnd={() => saveMultiplierToDB()}
              style={{ width: '100%', cursor: selectedVehicleId ? 'pointer' : 'not-allowed', accentColor: '#ff3b30', opacity: selectedVehicleId ? 1 : 0.4 }}
            />
            <div style={{ textAlign: 'center', fontSize: '9px', color: subtextColor, marginTop: '6px' }}>
               {selectedVehicleId ? `Radius = Speed (m/s) × ${currentMultiplier} (Min 10m)` : "Select a vehicle to configure"}
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