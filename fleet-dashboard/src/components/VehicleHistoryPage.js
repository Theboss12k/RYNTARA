import React, {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
} from 'react';

import {
  useParams,
  useNavigate,
} from 'react-router-dom';

import Map, {
  Marker,
  NavigationControl,
  Source,
  Layer,
} from 'react-map-gl/maplibre';

import {
  Client,
} from '@stomp/stompjs';

import SockJS from 'sockjs-client';

import {
  ArrowLeft,
  Clock,
  Activity,
  Play,
  Pause,
  Plane,
  Truck,
  Layers,
  X,
  Camera,
  Crosshair,
  Gauge,
  Maximize2,
  Navigation,
  Search,
  CheckSquare,
  Square,
  ChevronDown,
} from 'lucide-react';

import {
  useTheme,
} from '../context/ThemeContext';

import {
  getVehicleColor,
} from './ManageFleetPage';

import GlobalSearchBar from './GlobalSearchBar';


/* =========================================================
   ALTITUDE SCALING CONSTANTS
   ========================================================= */
const ALTITUDE_SCALE = 0.15; // Multiplier to keep height proportional
const MAX_VISUAL_ALTITUDE = 55; // Strict cap to prevent leaving map frame


/* =========================================================
   CAMERA HELPERS
   ========================================================= */

const normalizeBearing = (value) => {
  return ((Number(value) % 360) + 360) % 360;
};

const formatBearing = (value) => {
  return Math.round(normalizeBearing(value))
    .toString()
    .padStart(3, '0');
};

const getHeadingLabel = (value) => {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(normalizeBearing(value) / 45) % 8];
};

const isAngleActive = (current, target) => {
  const a = normalizeBearing(current);
  const b = normalizeBearing(target);
  const difference = Math.abs(a - b);
  return difference < 2 || difference > 358;
};


/* =========================================================
   ROTATING COMPASS
   ========================================================= */

function RotatingCompass({
  bearing,
  setBearing,
  textColor,
  subtextColor,
  borderColor,
  isDark,
}) {
  const compassRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const getBearingFromPointer = (event) => {
    if (!compassRef.current) return bearing;
    const rect = compassRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;

    let angle = Math.atan2(dx, -dy) * (180 / Math.PI);
    if (angle > 180) angle -= 360;
    if (angle < -180) angle += 360;
    return Math.round(angle);
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    compassRef.current?.setPointerCapture(event.pointerId);
    setIsDragging(true);
    setBearing(getBearingFromPointer(event));
  };

  const handlePointerMove = (event) => {
    if (!isDragging) return;
    setBearing(getBearingFromPointer(event));
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const normalized = normalizeBearing(bearing);
  const ticks = Array.from({ length: 72 }, (_, index) => index * 5);

  const cardinalPoints = [
    { label: 'N', angle: 0, color: '#f72585' },
    { label: 'E', angle: 90, color: '#4cc9f0' },
    { label: 'S', angle: 180, color: '#4895ef' },
    { label: 'W', angle: 270, color: '#3a0ca3' },
  ];

  const intermediatePoints = [
    { label: 'NE', angle: 45 },
    { label: 'SE', angle: 135 },
    { label: 'SW', angle: 225 },
    { label: 'NW', angle: 315 },
  ];

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', paddingTop: '2px' }}>
      <div
        ref={compassRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          width: '208px',
          height: '208px',
          position: 'relative',
          borderRadius: '50%',
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
          background: isDark
            ? 'radial-gradient(circle at center, rgba(255,255,255,0.065), rgba(255,255,255,0.015) 58%, rgba(0,0,0,0.22))'
            : 'radial-gradient(circle at center, rgba(0,0,0,0.035), rgba(0,0,0,0.01) 58%, rgba(0,0,0,0.055))',
          border: `1px solid ${borderColor}`,
          boxShadow: 'inset 0 0 30px rgba(0,0,0,0.12), 0 10px 25px rgba(0,0,0,0.10)',
          overflow: 'hidden',
        }}
      >
        {/* ROTATING DIAL */}
        <div
          style={{
            position: 'absolute',
            inset: '7px',
            borderRadius: '50%',
            transform: `rotate(${-normalized}deg)`,
            transition: isDragging ? 'none' : 'transform 160ms ease-out',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: '2px',
              borderRadius: '50%',
              border: `1px solid ${borderColor}`,
            }}
          />

          {ticks.map((angle) => {
            const isMajor = angle % 30 === 0;
            const isMedium = angle % 10 === 0;
            return (
              <div
                key={angle}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: isMajor ? '2px' : '1px',
                  height: isMajor ? '10px' : isMedium ? '7px' : '4px',
                  borderRadius: '2px',
                  background: isMajor ? subtextColor : `${subtextColor}75`,
                  transformOrigin: '50% 94px',
                  transform: `translate(-50%, -94px) rotate(${angle}deg)`,
                }}
              />
            );
          })}

          {cardinalPoints.map(({ label, angle, color }) => {
            const radians = (angle * Math.PI) / 180;
            const radius = 76;
            const x = Math.sin(radians) * radius;
            const y = -Math.cos(radians) * radius;

            return (
              <div
                key={label}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${normalized}deg)`,
                  fontSize: label === 'N' ? '16px' : '13px',
                  fontWeight: '800',
                  color,
                  textShadow: `0 0 8px ${color}55`,
                }}
              >
                {label}
              </div>
            );
          })}

          {intermediatePoints.map(({ label, angle }) => {
            const radians = (angle * Math.PI) / 180;
            const radius = 78;
            const x = Math.sin(radians) * radius;
            const y = -Math.cos(radians) * radius;

            return (
              <div
                key={label}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: '28px',
                  height: '22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${normalized}deg)`,
                  fontSize: '8px',
                  fontWeight: '700',
                  color: subtextColor,
                  opacity: 0.8,
                }}
              >
                {label}
              </div>
            );
          })}

          {[0, 90, 180, 270].map((angle) => {
            const radians = (angle * Math.PI) / 180;
            const radius = 53;
            const x = Math.sin(radians) * radius;
            const y = -Math.cos(radians) * radius;

            return (
              <div
                key={angle}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${normalized}deg)`,
                  fontSize: '7px',
                  color: subtextColor,
                  opacity: 0.55,
                }}
              >
                {angle}°
              </div>
            );
          })}
        </div>

        {/* NORTH POINTER */}
        <div
          style={{
            position: 'absolute',
            top: '4px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: '7px solid transparent',
              borderRight: '7px solid transparent',
              borderTop: '14px solid #f72585',
              filter: 'drop-shadow(0 0 6px rgba(247,37,133,0.75))',
            }}
          />
        </div>

        {/* CENTER ICON */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '60px',
            height: '60px',
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: isDark ? 'rgba(8,10,15,0.92)' : 'rgba(255,255,255,0.94)',
            border: `1px solid ${borderColor}`,
            boxShadow: '0 7px 22px rgba(0,0,0,0.24)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 8,
            pointerEvents: 'none',
          }}
        >
          <Navigation
            size={29}
            strokeWidth={2.1}
            color="#00E5FF"
            fill="rgba(0,229,255,0.12)"
            style={{
              transform: `rotate(${bearing - 45}deg)`,
              transition: isDragging ? 'none' : 'transform 120ms ease-out',
              filter: 'drop-shadow(0 0 7px rgba(0,229,255,0.65))',
            }}
          />
        </div>

        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '5px',
            height: '5px',
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 0 9px rgba(255,255,255,0.9)',
            zIndex: 12,
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}


/* =========================================================
   MAIN VEHICLE HISTORY PAGE
   ========================================================= */

export default function VehicleHistoryPage() {
  const { id: initialId } = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const mapRef = useRef(null);

  /* =======================================================
     STATE MANAGEMENT
     ======================================================= */
  const [vehicles, setVehicles] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [focusedTelemetryId, setFocusedTelemetryId] = useState(null);

  // Map of histories per vehicle: { [vehicleId]: Array<TelemetryPoint> }
  const [histories, setHistories] = useState({});

  // Global Index for synchronized timeline across multiple vehicles
  const [globalCurrentIndex, setGlobalCurrentIndex] = useState(0);

  // UI States
  const [isLive, setIsLive] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHudExpanded, setIsHudExpanded] = useState(true);
  const [isTelemetryExpanded, setIsTelemetryExpanded] = useState(true);
  const [autoFollow, setAutoFollow] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [dropdownSearchQuery, setDropdownSearchQuery] = useState('');
  const [isBackHovered, setIsBackHovered] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Global Search Bar States
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [isAiSearch, setIsAiSearch] = useState(false);

  // Camera State
  const [viewState, setViewState] = useState({
    longitude: -122.4194,
    latitude: 37.7749,
    zoom: 15,
  });
  const [pitch, setPitch] = useState(60);
  const [bearing, setBearing] = useState(-20);

  // Helper for safe JSON responses
  const safeJson = async (res, label) => {
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      const bodyPreview = (await res.text()).slice(0, 120);
      throw new Error(`${label} returned non-JSON. Preview: ${bodyPreview}`);
    }
    return res.json();
  };

  /* =======================================================
     1. INITIAL CONFIG FETCH & MULTI-SELECT SETUP
     ======================================================= */
  useEffect(() => {
    fetch('http://localhost:8080/api/discovery/configs')
      .then((res) => safeJson(res, 'GET /api/discovery/configs'))
      .then((data) => {
        setVehicles(data);
        if (data.length > 0) {
          const initialSelection = initialId && data.some((v) => v.id === initialId)
            ? [initialId]
            : [data[0].id];
          setSelectedIds(initialSelection);
          setFocusedTelemetryId(initialSelection[0]);
        }
      })
      .catch((err) => console.error('Vehicle configs fetch failed:', err));
  }, [initialId]);

  /* =======================================================
     2. FETCH HISTORIES FOR ALL SELECTED VEHICLES
     ======================================================= */
  useEffect(() => {
    if (selectedIds.length === 0) return;

    selectedIds.forEach((vId) => {
      fetch(`http://localhost:8080/api/fleet/vehicles/${vId}/history`)
        .then((res) => safeJson(res, `GET history for ${vId}`))
        .then((data) => {
          if (Array.isArray(data) && data.length > 0) {
            setHistories((prev) => ({
              ...prev,
              [vId]: data,
            }));

            // Center on latest point of first vehicle if not set
            const last = data[data.length - 1];
            if (last?.longitude != null && last?.latitude != null && vId === selectedIds[0]) {
              setViewState((prev) => ({
                ...prev,
                longitude: Number(last.longitude),
                latitude: Number(last.latitude),
              }));
            }
          }
        })
        .catch((err) => console.error(`History fetch failed for ${vId}:`, err));
    });
  }, [selectedIds]);

  /* =======================================================
     3. WEBSOCKET SUBSCRIPTION FOR ALL SELECTED VEHICLES
     ======================================================= */
  useEffect(() => {
    if (selectedIds.length === 0) return;

    const socket = new SockJS('http://localhost:8080/ws-telemetry');
    const stompClient = new Client({
      webSocketFactory: () => socket,
      onConnect: () => {
        selectedIds.forEach((vId) => {
          stompClient.subscribe(`/topic/telemetry.${vId}.position`, (message) => {
            try {
              const payload = JSON.parse(message.body);
              if (!payload.timestamp) {
                payload.timestamp = new Date().toISOString();
              }
              setHistories((prev) => ({
                ...prev,
                [vId]: [...(prev[vId] || []), payload],
              }));
            } catch (err) {
              console.error('Error parsing telemetry packet:', err);
            }
          });
        });
      },
    });

    stompClient.activate();
    return () => stompClient.deactivate();
  }, [selectedIds]);

  // Click outside to close vehicle dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /* =======================================================
     4. TIMELINE PLAYBACK & AUTO-FOLLOW
     ======================================================= */
  const maxHistoryLength = useMemo(() => {
    const lengths = selectedIds.map((id) => (histories[id] || []).length);
    return Math.max(0, ...lengths);
  }, [histories, selectedIds]);

  // Keep timeline anchored to latest data when LIVE
  useEffect(() => {
    if (isLive && maxHistoryLength > 0) {
      setGlobalCurrentIndex(maxHistoryLength - 1);
    }
  }, [maxHistoryLength, isLive]);

  // Handle Playback Interval
  useEffect(() => {
    if (!isPlaying || isLive || maxHistoryLength === 0) return;

    const interval = setInterval(() => {
      setGlobalCurrentIndex((prev) => {
        if (prev >= maxHistoryLength - 1) {
          setIsPlaying(false);
          setIsLive(true);
          return maxHistoryLength - 1;
        }
        return prev + 1;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, isLive, maxHistoryLength]);

  // Derive active point for each selected vehicle
  const activePointsMap = useMemo(() => {
    const map = {};
    selectedIds.forEach((vId) => {
      const vHistory = histories[vId] || [];
      if (vHistory.length === 0) return;

      // Use absolute index to prevent shifting array lengths from breaking paused view
      const index = isLive
        ? vHistory.length - 1
        : Math.min(vHistory.length - 1, globalCurrentIndex);

      map[vId] = vHistory[index];
    });
    return map;
  }, [histories, selectedIds, globalCurrentIndex, isLive]);

  // Camera Auto Follow active focused vehicle
  useEffect(() => {
    if (!autoFollow || !focusedTelemetryId) return;
    const pt = activePointsMap[focusedTelemetryId];
    if (pt?.longitude != null && pt?.latitude != null) {
      setViewState((prev) => ({
        ...prev,
        longitude: Number(pt.longitude),
        latitude: Number(pt.latitude),
      }));
    }
  }, [activePointsMap, autoFollow, focusedTelemetryId]);

  /* =======================================================
     5. MULTI-VEHICLE PATHS & GEOJSON LAYERS
     ======================================================= */
  const vehiclePaths = useMemo(() => {
    return selectedIds.map((vId) => {
      const vHistory = histories[vId] || [];
      if (vHistory.length < 2) return null;

      const endIndex = isLive
        ? vHistory.length - 1
        : Math.min(vHistory.length - 1, globalCurrentIndex);

      const coordinates = [];
      for (let i = 0; i <= endIndex; i++) {
        const p = vHistory[i];
        if (p?.longitude != null && p?.latitude != null) {
          let lon = Number(p.longitude);
          let lat = Number(p.latitude);
          if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) {
            [lat, lon] = [lon, lat];
          }
          if (!isNaN(lon) && !isNaN(lat) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            coordinates.push([lon, lat]);
          }
        }
      }

      if (coordinates.length < 2) return null;

      return {
        id: vId,
        color: getVehicleColor(vId),
        geoJson: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates,
          },
        },
      };
    }).filter(Boolean);
  }, [histories, selectedIds, globalCurrentIndex, isLive]);

  /* =======================================================
     6. FIT ALL PATHS TO VIEWPORT
     ======================================================= */
  const fitPathToBounds = useCallback(() => {
    if (!mapRef.current) return;

    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let hasCoords = false;

    vehiclePaths.forEach(({ geoJson }) => {
      geoJson.geometry.coordinates.forEach(([lng, lat]) => {
        hasCoords = true;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      });
    });

    if (!hasCoords) return;

    const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current;
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 80, duration: 800, maxZoom: 18 }
    );
    setIsFocused(true);
  }, [vehiclePaths]);

  /* =======================================================
     7. MULTI-SELECT & DROPDOWN FILTER
     ======================================================= */
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const q = dropdownSearchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        (v.name || '').toLowerCase().includes(q) ||
        (v.id || '').toLowerCase().includes(q) ||
        (v.category || '').toLowerCase().includes(q)
      );
    });
  }, [vehicles, dropdownSearchQuery]);

  const toggleVehicleSelection = (vId) => {
    setSelectedIds((prev) => {
      if (prev.includes(vId)) {
        if (prev.length === 1) return prev; // Keep at least one selected
        const next = prev.filter((id) => id !== vId);
        if (focusedTelemetryId === vId) {
          setFocusedTelemetryId(next[0] || null);
        }
        return next;
      } else {
        const next = [...prev, vId];
        if (!focusedTelemetryId) setFocusedTelemetryId(vId);
        return next;
      }
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredVehicles.length) {
      if (filteredVehicles.length > 0) {
        setSelectedIds([filteredVehicles[0].id]);
        setFocusedTelemetryId(filteredVehicles[0].id);
      }
    } else {
      const allFilteredIds = filteredVehicles.map((v) => v.id);
      setSelectedIds(allFilteredIds);
      if (!allFilteredIds.includes(focusedTelemetryId)) {
        setFocusedTelemetryId(allFilteredIds[0] || null);
      }
    }
  };

  /* =======================================================
     8. GLOBAL AI SEARCH COMMAND HANDLER
     ======================================================= */
  const handleCommandSubmit = (event) => {
    event.preventDefault();
    if (!globalSearchQuery.trim()) return;
    console.log('Command submitted:', globalSearchQuery.trim());
    setGlobalSearchQuery('');
  };

  /* =======================================================
     THEME & STYLES
     ======================================================= */
  const isDark = theme === 'dark';
  const hudBg = isDark ? 'var(--bg-glass, rgba(18, 18, 22, 0.95))' : 'rgba(255, 255, 255, 0.95)';
  const textColor = isDark ? '#fff' : '#111';
  const subtextColor = isDark ? '#888' : '#555';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
  const btnBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  const controlColors = {
    flat2D: '#00b4d8',
    view3D: '#7209b7',
    north: '#f72585',
    east: '#4cc9f0',
    south: '#4895ef',
    west: '#3a0ca3',
    focus: '#10b981',
  };

  const getColoredBtnStyle = (isActive, activeColor) => ({
    flex: 1,
    background: isActive ? activeColor : btnBg,
    border: `1px solid ${isActive ? activeColor : borderColor}`,
    borderRadius: '7px',
    color: isActive ? '#fff' : subtextColor,
    fontSize: '11px',
    padding: '7px 0',
    cursor: 'pointer',
    textTransform: 'uppercase',
    fontWeight: '700',
    transition: 'all 0.2s ease',
    boxShadow: isActive ? `0 4px 12px ${activeColor}50` : 'none',
  });

  const mapStyle = useMemo(
    () => ({
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: [
            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
          ],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap Contributors',
        },
      },
      layers: [
        {
          id: 'osm',
          type: 'raster',
          source: 'osm',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    }),
    []
  );

  const formatTimestamp = (ts) => {
    if (!ts) return 'No Data';
    const date = new Date(ts);
    if (isNaN(date.getTime())) return String(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const focusedActivePoint = focusedTelemetryId ? activePointsMap[focusedTelemetryId] : null;
  const focusedVehicleConfig = vehicles.find((v) => v.id === focusedTelemetryId);
  const isGround = focusedVehicleConfig?.category === 'GROUND';

  const hiddenKeys = [
    'id',
    'vehicleId',
    'vehicle_id',
    'timestamp',
    'metrics',
    'additionalProperties',
    'latitude',
    'longitude',
    'altitude',
    'battery_level',
  ];

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: isDark ? '#111' : '#eee' }}>

      {/* =================================================
          HEADER: SEARCH & MULTI-VEHICLE SELECTOR
         ================================================= */}
      <div
        style={{
          padding: '14px 24px',
          background: isDark ? '#1a1a20' : '#fff',
          borderBottom: `1px solid ${isDark ? '#333' : '#ddd'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/manage')}
            onMouseEnter={() => setIsBackHovered(true)}
            onMouseLeave={() => setIsBackHovered(false)}
            style={{
              background: isBackHovered ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)') : 'transparent',
              border: 'none',
              color: isBackHovered ? '#00E5FF' : isDark ? '#fff' : '#000',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              fontWeight: '500',
              padding: '6px 10px',
              borderRadius: '8px',
              transition: 'all 0.2s ease',
            }}
          >
            <ArrowLeft size={16} />
            Back to Fleet
          </button>

          <div style={{ width: '1px', height: '24px', background: isDark ? '#333' : '#ddd' }} />

          {/* DROPDOWN SELECTOR */}
          <div ref={dropdownRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              style={{
                background: isDark ? '#22222c' : '#ffffff',
                color: textColor,
                border: `1px solid ${borderColor}`,
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span>
                {selectedIds.length === 1
                  ? `${vehicles.find((v) => v.id === selectedIds[0])?.name || '1 Vehicle'} Selected`
                  : `${selectedIds.length} Vehicles Visualized`}
              </span>
              <ChevronDown size={14} color={subtextColor} />
            </button>

            {/* DROPDOWN POPOVER */}
            {isDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '110%',
                  left: 0,
                  width: '320px',
                  background: isDark ? '#1a1a20' : '#ffffff',
                  border: `1px solid ${borderColor}`,
                  borderRadius: '12px',
                  boxShadow: '0 15px 35px rgba(0,0,0,0.25)',
                  padding: '12px',
                  zIndex: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {/* DROPDOWN SEARCH INPUT */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={14} color={subtextColor} style={{ position: 'absolute', left: '10px' }} />
                  <input
                    type="text"
                    placeholder="Search by name, ID, category..."
                    value={dropdownSearchQuery}
                    onChange={(e) => setDropdownSearchQuery(e.target.value)}
                    autoFocus
                    style={{
                      width: '100%',
                      background: isDark ? '#0d0e12' : '#f4f4f5',
                      color: textColor,
                      border: `1px solid ${borderColor}`,
                      borderRadius: '8px',
                      padding: '8px 10px 8px 32px',
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* SELECT ALL TOGGLE */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
                  <span style={{ fontSize: '11px', color: subtextColor, textTransform: 'uppercase', fontWeight: '600' }}>
                    Fleet Entities ({filteredVehicles.length})
                  </span>
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#00E5FF',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    {selectedIds.length === filteredVehicles.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                {/* VEHICLE LIST */}
                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {filteredVehicles.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px', color: subtextColor, fontSize: '12px' }}>
                      No matching vehicles
                    </div>
                  ) : (
                    filteredVehicles.map((v) => {
                      const isSelected = selectedIds.includes(v.id);
                      const color = getVehicleColor(v.id);
                      return (
                        <div
                          key={v.id}
                          onClick={() => toggleVehicleSelection(v.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            background: isSelected ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent',
                          }}
                        >
                          {isSelected ? (
                            <CheckSquare size={16} color={color} />
                          ) : (
                            <Square size={16} color={subtextColor} />
                          )}

                          <div
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: color,
                              boxShadow: `0 0 6px ${color}`,
                            }}
                          />

                          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: '13px', fontWeight: '600', color: textColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {v.name}
                            </span>
                            <span style={{ fontSize: '10px', color: subtextColor, fontFamily: 'monospace' }}>
                              {v.id.substring(0, 10)}... · {v.category}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* COLOR PILLS FOR SELECTED VEHICLES */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {selectedIds.map((vId) => {
              const v = vehicles.find((item) => item.id === vId);
              const color = getVehicleColor(vId);
              const isFocused = focusedTelemetryId === vId;
              return (
                <div
                  key={vId}
                  onClick={() => setFocusedTelemetryId(vId)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '16px',
                    background: `${color}18`,
                    border: `1px solid ${isFocused ? color : `${color}40`}`,
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: color,
                    boxShadow: isFocused ? `0 0 10px ${color}40` : 'none',
                  }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />
                  {v?.name || vId.substring(0, 8)}
                </div>
              );
            })}
          </div>
        </div>

        <span
          style={{
            fontSize: '12px',
            padding: '4px 10px',
            borderRadius: '12px',
            background: 'rgba(0, 229, 255, 0.12)',
            color: '#00E5FF',
            fontWeight: '600',
          }}
        >
          Multi-Vehicle Spatial Timeline
        </span>
      </div>

      {/* =================================================
          MAP VIEWPORT
         ================================================= */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Map
          ref={mapRef}
          {...viewState}
          pitch={pitch}
          bearing={bearing}
          onMove={(evt) => {
            const next = evt.viewState;
            setViewState({
              longitude: next.longitude,
              latitude: next.latitude,
              zoom: next.zoom,
            });
            setPitch(next.pitch);
            setBearing(next.bearing);
          }}
          onDragStart={() => setIsFocused(false)}
          onZoomStart={() => setIsFocused(false)}
          mapStyle={mapStyle}
          style={{ width: '100%', height: '100%' }}
        >
          <NavigationControl position="bottom-right" visualizePitch={true} />

          {/* GEOJSON TRACE PATHS FOR ALL SELECTED VEHICLES */}
          {vehiclePaths.map(({ id: vId, color, geoJson }) => (
            <Source key={vId} id={`source-path-${vId}`} type="geojson" data={geoJson}>
              <Layer
                id={`layer-path-${vId}`}
                type="line"
                paint={{
                  'line-color': color,
                  'line-width': 3.5,
                  'line-opacity': 0.85,
                }}
              />
            </Source>
          ))}

          {/* MARKERS FOR ALL ACTIVE SELECTED VEHICLES */}
          {Object.entries(activePointsMap).map(([vId, pt]) => {
            if (!pt || pt.longitude == null || pt.latitude == null) return null;
            const vConfig = vehicles.find((v) => v.id === vId);
            const isRover = vConfig?.category === 'GROUND';
            const color = getVehicleColor(vId);
            const alt = isRover ? 0 : Number(pt.altitude || 50);

            // Apply scale and strict cap to visual pixel offset
            const visualAltitude = Math.min(alt * ALTITUDE_SCALE, MAX_VISUAL_ALTITUDE);

            return (
              <Marker
                key={vId}
                longitude={Number(pt.longitude)}
                latitude={Number(pt.latitude)}
                anchor="bottom"
              >
                <div
                  onClick={() => setFocusedTelemetryId(vId)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      background: color,
                      color: '#000',
                      borderRadius: '8px',
                      padding: '6px',
                      boxShadow: `0 0 15px ${color}`,
                      transform: `translateY(-${visualAltitude}px)`,
                      transition: 'transform 0.2s ease-out',
                    }}
                  >
                    {isRover ? <Truck size={16} /> : <Plane size={16} />}
                  </div>

                  <div
                    style={{
                      width: '2px',
                      height: `${visualAltitude}px`,
                      background: `linear-gradient(to bottom, ${color}, transparent)`,
                    }}
                  />

                  <div
                    style={{
                      width: '12px',
                      height: '4px',
                      background: 'rgba(0,0,0,0.6)',
                      borderRadius: '50%',
                      boxShadow: '0 0 4px rgba(0,0,0,0.8)',
                    }}
                  />
                </div>
              </Marker>
            );
          })}
        </Map>

        {/* =================================================
            LIVE TELEMETRY HUD (WITH VEHICLE TABS)
           ================================================= */}
        {focusedActivePoint && (
          isTelemetryExpanded ? (
            <div
              style={{
                position: 'absolute',
                top: '20px',
                left: '20px',
                background: hudBg,
                backdropFilter: 'blur(15px)',
                border: `1px solid ${borderColor}`,
                borderRadius: '16px',
                padding: '20px',
                color: textColor,
                zIndex: 10,
                width: '300px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
                maxHeight: 'calc(100vh - 160px)',
                overflowY: 'auto',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Gauge size={18} color={getVehicleColor(focusedTelemetryId)} />
                  <h3 style={{ margin: 0, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    Telemetry Inspector
                  </h3>
                </div>
                <X size={18} color={subtextColor} style={{ cursor: 'pointer' }} onClick={() => setIsTelemetryExpanded(false)} />
              </div>

              {/* VEHICLE TABS IF MULTIPLE VISUALIZED */}
              {selectedIds.length > 1 && (
                <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {selectedIds.map((vId) => {
                    const v = vehicles.find((item) => item.id === vId);
                    const color = getVehicleColor(vId);
                    const isActive = focusedTelemetryId === vId;
                    return (
                      <button
                        key={vId}
                        type="button"
                        onClick={() => setFocusedTelemetryId(vId)}
                        style={{
                          background: isActive ? color : btnBg,
                          color: isActive ? '#000' : subtextColor,
                          border: `1px solid ${isActive ? color : borderColor}`,
                          borderRadius: '6px',
                          padding: '4px 8px',
                          fontSize: '10px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {v?.name || vId.substring(0, 6)}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* METRICS GRID */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <div style={{ fontSize: '10px', color: subtextColor, textTransform: 'uppercase' }}>Latitude</div>
                  <div style={{ fontSize: '13px', fontWeight: '600' }}>
                    {Number(focusedActivePoint.latitude).toFixed(5)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10px', color: subtextColor, textTransform: 'uppercase' }}>Longitude</div>
                  <div style={{ fontSize: '13px', fontWeight: '600' }}>
                    {Number(focusedActivePoint.longitude).toFixed(5)}
                  </div>
                </div>

                {!isGround && (
                  <div>
                    <div style={{ fontSize: '10px', color: subtextColor, textTransform: 'uppercase' }}>Altitude</div>
                    <div style={{ fontSize: '13px', fontWeight: '600' }}>
                      {Number(focusedActivePoint.altitude || 0).toFixed(1)}m
                    </div>
                  </div>
                )}

                {focusedActivePoint.battery_level !== undefined && (
                  <div>
                    <div style={{ fontSize: '10px', color: subtextColor, textTransform: 'uppercase' }}>Battery</div>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: '600',
                        color: focusedActivePoint.battery_level < 20 ? '#ff3b30' : textColor,
                      }}
                    >
                      {focusedActivePoint.battery_level}%
                    </div>
                  </div>
                )}

                {Object.keys(focusedActivePoint)
                  .filter((key) => !hiddenKeys.includes(key))
                  .map((key) => (
                    <div key={key}>
                      <div style={{ fontSize: '10px', color: subtextColor, textTransform: 'uppercase' }}>
                        {key.replace(/_/g, ' ')}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: '600' }}>
                        {String(focusedActivePoint[key])}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div
              onClick={() => setIsTelemetryExpanded(true)}
              title="Expand Live Telemetry"
              style={{
                position: 'absolute',
                top: '20px',
                left: '20px',
                background: hudBg,
                border: `1px solid ${borderColor}`,
                borderRadius: '50%',
                width: '44px',
                height: '44px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 10,
                color: '#00E5FF',
              }}
            >
              <Gauge size={20} />
            </div>
          )
        )}

        {/* =================================================
            CAMERA HUD
           ================================================= */}
        {isHudExpanded ? (
          <div
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: hudBg,
              backdropFilter: 'blur(15px)',
              border: `1px solid ${borderColor}`,
              borderRadius: '16px',
              padding: '20px',
              color: textColor,
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              width: '270px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', color: subtextColor }}>
                Camera Controls
              </span>
              <X size={18} color={subtextColor} style={{ cursor: 'pointer' }} onClick={() => setIsHudExpanded(false)} />
            </div>

            <button
              onClick={fitPathToBounds}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '12px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: `1px solid ${isFocused ? controlColors.focus : borderColor}`,
                background: isFocused ? `${controlColors.focus}25` : btnBg,
                color: isFocused ? controlColors.focus : textColor,
                cursor: 'pointer',
                fontWeight: '700',
              }}
            >
              <Maximize2 size={14} />
              Focus All Paths
              {isFocused && ' ✓'}
            </button>

            {/* PITCH */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: btnBg,
                    border: `1px solid ${borderColor}`,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    perspective: '100px',
                  }}
                >
                  <Layers
                    size={20}
                    color={controlColors.view3D}
                    style={{
                      transform: `rotateX(${pitch}deg)`,
                      transformStyle: 'preserve-3d',
                      transition: 'transform 0.2s ease',
                    }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: subtextColor }}>
                    Pitch Angle
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '600' }}>
                    {Math.round(pitch)}°
                  </div>
                </div>
              </div>

              <input
                type="range"
                min="0"
                max="85"
                value={pitch}
                onChange={(e) => setPitch(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: controlColors.view3D, marginBottom: '8px' }}
              />

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  style={getColoredBtnStyle(pitch < 2, controlColors.flat2D)}
                  onClick={() => setPitch(0)}
                >
                  2D Flat
                </button>
                <button
                  type="button"
                  style={getColoredBtnStyle(Math.abs(pitch - 65) < 2, controlColors.view3D)}
                  onClick={() => setPitch(65)}
                >
                  3D View
                </button>
              </div>
            </div>

            <div style={{ height: '1px', background: borderColor }} />

            {/* HEADING & COMPASS */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: subtextColor }}>
                    Heading
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '600', marginTop: '2px' }}>
                    {getHeadingLabel(bearing)}
                  </div>
                </div>
                <div style={{ fontSize: '15px', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>
                  {formatBearing(bearing)}°
                </div>
              </div>

              <RotatingCompass
                bearing={bearing}
                setBearing={setBearing}
                textColor={textColor}
                subtextColor={subtextColor}
                borderColor={borderColor}
                isDark={isDark}
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '10px' }}>
                <button type="button" style={getColoredBtnStyle(isAngleActive(bearing, 0), controlColors.north)} onClick={() => setBearing(0)}>N</button>
                <button type="button" style={getColoredBtnStyle(isAngleActive(bearing, -90), controlColors.west)} onClick={() => setBearing(-90)}>W</button>
                <button type="button" style={getColoredBtnStyle(isAngleActive(bearing, 90), controlColors.east)} onClick={() => setBearing(90)}>E</button>
                <button type="button" style={getColoredBtnStyle(isAngleActive(bearing, 180), controlColors.south)} onClick={() => setBearing(180)}>S</button>
              </div>
            </div>
          </div>
        ) : (
          <div
            onClick={() => setIsHudExpanded(true)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: hudBg,
              border: `1px solid ${borderColor}`,
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 10,
              color: textColor,
            }}
          >
            <Camera size={20} />
          </div>
        )}

        {/* =================================================
            REUSABLE GLOBAL SEARCH COMPONENT
           ================================================= */}
        <GlobalSearchBar
          searchQuery={globalSearchQuery}
          setSearchQuery={setGlobalSearchQuery}
          isAiSearch={isAiSearch}
          setIsAiSearch={setIsAiSearch}
          onCommandSubmit={handleCommandSubmit}
          placeholderNormal="Search RYNTARA fleet history..."
          placeholderAi="Ask RYNTARA AI to query historical records..."
          bottomOffset="26px"
        />
      </div>

      {/* =================================================
          SYNCHRONIZED TIMELINE & DVR
         ================================================= */}
      <div
        style={{
          padding: '20px 24px',
          background: isDark ? '#1a1a20' : '#fff',
          borderTop: `1px solid ${isDark ? '#333' : '#ddd'}`,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', maxWidth: '1200px', margin: '0 auto' }}>
          {/* PLAY / PAUSE */}
          <button
            onClick={() => {
              setIsPlaying(!isPlaying);
              setIsLive(false);
            }}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              border: 'none',
              background: isLive ? '#333' : '#00E5FF',
              color: '#000',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: 'pointer',
              boxShadow: isPlaying ? '0 0 15px #00E5FF' : 'none',
            }}
          >
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: '3px' }} />}
          </button>

          {/* AUTO FOLLOW */}
          <button
            onClick={() => setAutoFollow(!autoFollow)}
            title="Toggle Camera Auto-Follow"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              border: `1px solid ${autoFollow ? '#00E5FF' : borderColor}`,
              background: autoFollow ? '#00E5FF' : btnBg,
              color: autoFollow ? '#000' : subtextColor,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <Crosshair size={18} />
          </button>

          {/* TIMELINE RANGE */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: isDark ? '#aaa' : '#555', fontSize: '12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={14} />
                {formatTimestamp(focusedActivePoint?.timestamp)}
              </span>
              <span>
                Point: {maxHistoryLength > 0 ? globalCurrentIndex + 1 : 0} / {maxHistoryLength} &nbsp;·&nbsp; {isLive ? 'Live Sync' : 'DVR Mode'}
              </span>
            </div>

            <input
              type="range"
              min="0"
              max={Math.max(0, maxHistoryLength - 1)}
              value={globalCurrentIndex}
              onChange={(e) => {
                setGlobalCurrentIndex(Number(e.target.value));
                setIsLive(false);
                setIsPlaying(false);
              }}
              style={{ width: '100%', cursor: 'pointer', accentColor: '#00E5FF' }}
            />
          </div>

          {/* LIVE TOGGLE */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '90px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: isDark ? '#fff' : '#000', fontSize: '13px', fontWeight: '600' }}>
              <input
                type="checkbox"
                checked={isLive}
                onChange={(e) => {
                  const active = e.target.checked;
                  setIsLive(active);
                  if (active) {
                    setIsPlaying(false);
                  }
                }}
                style={{ width: '16px', height: '16px', accentColor: '#ff3b30' }}
              />
              <Activity size={16} color={isLive ? '#ff3b30' : isDark ? '#888' : '#555'} />
              LIVE
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}