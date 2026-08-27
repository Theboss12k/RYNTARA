import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Layers, Navigation, X, Camera, MapPin } from 'lucide-react';

const FLOOR_SIZE = 4000;
const TILE_SIZE = 256;
const FAB_SIZE = 44;
const FAB_MARGIN = 8;

// VISUAL MULTIPLIER: Exaggerates the vertical Z-axis so 50m altitudes are distinctly visible.
const Z_EXAGGERATION = 8;

/* =========================================================
   MATH & PROJECTION HELPERS
   ========================================================= */
const lonToTileX = (lon, zoom) => ((lon + 180) / 360) * Math.pow(2, zoom);
const latToTileY = (lat, zoom) => (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom);
const normalizeBearing = (value) => ((Number(value) % 360) + 360) % 360;

const wrapLon = (lon) => {
  let w = ((lon + 180) % 360) + 360;
  return (w % 360) - 180;
};
const clampLat = (lat) => Math.max(-85.0511, Math.min(85.0511, lat));

function isBearingActive(current, target) {
  const diff = Math.abs(normalizeBearing(current) - normalizeBearing(target));
  return diff < 2 || diff > 358;
}

const getInterpolatedPos = (path, timeMs) => {
  if (!path || path.length === 0) return null;
  const t0 = new Date(path[0].timestamp).getTime();
  const tEnd = new Date(path[path.length - 1].timestamp).getTime();
  if (timeMs < t0 || timeMs > tEnd) return null;

  for (let i = 0; i < path.length - 1; i++) {
    const w1 = path[i];
    const w2 = path[i+1];
    const t1 = new Date(w1.timestamp).getTime();
    const t2 = new Date(w2.timestamp).getTime();
    if (timeMs >= t1 && timeMs <= t2) {
      const f = (timeMs - t1) / (t2 - t1);
      return {
        longitude: w1.longitude + (w2.longitude - w1.longitude) * f,
        latitude: w1.latitude + (w2.latitude - w1.latitude) * f,
        altitude: w1.altitude + (w2.altitude - w1.altitude) * f,
      };
    }
  }
  return null;
};

/* =========================================================
   COMPONENTS
   ========================================================= */

// Creates the vertical tethers connecting a floating 3D point to the 2D floor
function VerticalDropLine({ x, y, zHeight, color }) {
  if (zHeight <= 2) return null;
  return (
    <div style={{
      position: 'absolute', left: FLOOR_SIZE / 2 + x, top: FLOOR_SIZE / 2 + y,
      width: 2, height: zHeight,
      background: `linear-gradient(to top, transparent, ${color})`,
      transformOrigin: 'bottom center',
      transform: 'translate3d(-50%, -100%, 0) rotateX(-90deg)',
      pointerEvents: 'none'
    }} />
  );
}

// Creates a glowing vertical beam for Start/End Ground markers
function WaypointBeacon({ x, y, color }) {
  return (
    <div style={{
      position: 'absolute', left: FLOOR_SIZE / 2 + x, top: FLOOR_SIZE / 2 + y,
      width: 2, height: 120,
      background: `linear-gradient(to top, ${color}, transparent)`,
      transformOrigin: 'bottom center',
      transform: 'translate3d(-50%, -100%, 0) rotateX(-90deg)',
      pointerEvents: 'none',
      opacity: 0.8
    }} />
  );
}

function CSSCylinder({ x, y, radius, zMin, height, color, isSelected, onClick, is2D }) {
  const baseColor = isSelected ? 'rgba(255, 59, 48, 0.5)' : color;
  const borderColor = isSelected ? 'rgba(255, 59, 48, 1)' : 'rgba(255, 59, 48, 0.8)';
  const shadow = isSelected ? '0 0 30px rgba(255, 59, 48, 0.8)' : 'none';

  if (is2D) {
    return (
      <div
        onClick={onClick}
        style={{
          position: 'absolute', left: FLOOR_SIZE / 2 + x, top: FLOOR_SIZE / 2 + y,
          width: radius * 2, height: radius * 2, background: baseColor,
          borderRadius: '50%', border: `2px solid ${borderColor}`,
          transform: `translate3d(-50%, -50%, 2px)`,
          cursor: onClick ? 'pointer' : 'default', boxShadow: shadow,
          willChange: 'transform'
        }}
      />
    );
  }

  const sides = 12;
  const angle = 360 / sides;
  const faceWidth = (2 * radius * Math.tan(Math.PI / sides)) + 1;

  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute', left: FLOOR_SIZE / 2 + x, top: FLOOR_SIZE / 2 + y,
        width: 0, height: 0, transform: `translate3d(0, 0, ${zMin + height / 2}px)`,
        transformStyle: 'preserve-3d', cursor: onClick ? 'pointer' : 'default', boxShadow: shadow
      }}
    >
      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: radius * 2, height: radius * 2,
        background: baseColor, borderRadius: '50%', border: `2px solid ${borderColor}`,
        transform: `translate3d(-50%, -50%, ${height / 2}px)`
      }} />
      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: radius * 2, height: radius * 2,
        background: baseColor, borderRadius: '50%', border: `2px solid ${borderColor}`,
        transform: `translate3d(-50%, -50%, ${-height / 2}px)`
      }} />
      {Array.from({ length: sides }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute', left: '50%', top: '50%',
          width: faceWidth, height: height, background: baseColor,
          borderLeft: '1px solid rgba(0,0,0,0.1)', borderRight: '1px solid rgba(0,0,0,0.1)',
          transformOrigin: 'center center',
          transform: `translate3d(-50%, -50%, 0) rotateZ(${i * angle}deg) translateY(-${radius}px) rotateX(-90deg)`
        }} />
      ))}
    </div>
  );
}

function MapTiles({ centerLon, centerLat, tileZoom }) {
  const centerX = lonToTileX(centerLon, tileZoom);
  const centerY = latToTileY(centerLat, tileZoom);
  const tileIntX = Math.floor(centerX);
  const tileIntY = Math.floor(centerY);
  const offsetX = (centerX - tileIntX) * TILE_SIZE;
  const offsetY = (centerY - tileIntY) * TILE_SIZE;

  const maxTile = Math.pow(2, tileZoom) - 1;
  const tiles = [];

  for (let i = -8; i <= 8; i++) {
    for (let j = -8; j <= 8; j++) {
      const absoluteX = tileIntX + j;
      const absoluteY = tileIntY + i;

      let wrappedTx = absoluteX % (maxTile + 1);
      if (wrappedTx < 0) wrappedTx += (maxTile + 1);

      if (absoluteY >= 0 && absoluteY <= maxTile) {
        tiles.push(
          <img
            key={`${tileZoom}-${absoluteX}-${absoluteY}`}
            src={`https://a.tile.openstreetmap.org/${tileZoom}/${wrappedTx}/${absoluteY}.png`}
            loading="lazy"
            style={{
              position: 'absolute', left: FLOOR_SIZE/2 + (j * TILE_SIZE) - offsetX, top: FLOOR_SIZE/2 + (i * TILE_SIZE) - offsetY,
              width: TILE_SIZE, height: TILE_SIZE, opacity: 0.7, pointerEvents: 'none',
              backgroundColor: '#11141a',
              willChange: 'transform'
            }}
            alt=""
          />
        );
      }
    }
  }
  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', transform: 'translateZ(0.1px)' }}>{tiles}</div>;
}

function RotatingCompass({ bearing, setBearing, subtextColor, borderColor, isDark }) {
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
    try { compassRef.current?.setPointerCapture(event.pointerId); } catch {}
    setIsDragging(true);
    setBearing(getBearingFromPointer(event));
  };

  const handlePointerMove = (event) => { if (isDragging) setBearing(getBearingFromPointer(event)); };
  const handlePointerUp = () => setIsDragging(false);

  const normalized = normalizeBearing(bearing);
  const ticks = Array.from({ length: 72 }, (_, index) => index * 5);
  const cardinalPoints = [
    { label: 'N', angle: 0, color: '#f72585' }, { label: 'E', angle: 90, color: '#4cc9f0' },
    { label: 'S', angle: 180, color: '#4895ef' }, { label: 'W', angle: 270, color: '#3a0ca3' },
  ];
  const intermediatePoints = [
    { label: 'NE', angle: 45 }, { label: 'SE', angle: 135 },
    { label: 'SW', angle: 225 }, { label: 'NW', angle: 315 },
  ];

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2px 0 0' }}>
      <div
        ref={compassRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
        style={{
          width: '160px', height: '160px', position: 'relative', borderRadius: '50%', cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none',
          background: isDark ? 'radial-gradient(circle at center, rgba(255,255,255,0.065), rgba(255,255,255,0.015) 58%, rgba(0,0,0,0.22))' : 'radial-gradient(circle at center, rgba(0,0,0,0.035), rgba(0,0,0,0.01) 58%, rgba(0,0,0,0.055))',
          border: `1px solid ${borderColor}`, boxShadow: 'inset 0 0 30px rgba(0,0,0,0.12), 0 10px 25px rgba(0,0,0,0.10)', overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', inset: '6px', borderRadius: '50%', transform: `rotate(${-normalized}deg)`, transition: isDragging ? 'none' : 'transform 160ms ease-out' }}>
          <div style={{ position: 'absolute', inset: '2px', borderRadius: '50%', border: `1px solid ${borderColor}` }} />
          {ticks.map((angle) => {
            const isMajor = angle % 30 === 0;
            const isMedium = angle % 10 === 0;
            return <div key={angle} style={{ position: 'absolute', left: '50%', top: '50%', width: isMajor ? '2px' : '1px', height: isMajor ? '9px' : isMedium ? '6px' : '3px', borderRadius: '2px', background: isMajor ? subtextColor : `${subtextColor}75`, transformOrigin: '50% 72px', transform: `translate(-50%, -72px) rotate(${angle}deg)` }} />;
          })}
          {cardinalPoints.map(({ label, angle, color }) => {
            const radians = (angle * Math.PI) / 180;
            return <div key={label} style={{ position: 'absolute', left: '50%', top: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `translate(calc(-50% + ${Math.sin(radians)*56}px), calc(-50% + ${-Math.cos(radians)*56}px)) rotate(${normalized}deg)`, fontSize: label === 'N' ? '12px' : '10px', fontWeight: '800', color, textShadow: `0 0 8px ${color}55` }}>{label}</div>;
          })}
          {intermediatePoints.map(({ label, angle }) => {
            const radians = (angle * Math.PI) / 180;
            return <div key={label} style={{ position: 'absolute', left: '50%', top: '50%', width: '20px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `translate(calc(-50% + ${Math.sin(radians)*58}px), calc(-50% + ${-Math.cos(radians)*58}px)) rotate(${normalized}deg)`, fontSize: '6px', fontWeight: '700', color: subtextColor, opacity: 0.8 }}>{label}</div>;
          })}
        </div>
        <div style={{ position: 'absolute', top: '4px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, pointerEvents: 'none' }}><div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '10px solid #f72585', filter: 'drop-shadow(0 0 6px rgba(247,37,133,0.75))' }} /></div>
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: '42px', height: '42px', transform: 'translate(-50%, -50%)', borderRadius: '50%', background: isDark ? 'rgba(8,10,15,0.92)' : 'rgba(255,255,255,0.94)', border: `1px solid ${borderColor}`, boxShadow: '0 7px 22px rgba(0,0,0,0.24)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 8, pointerEvents: 'none' }}><Navigation size={20} strokeWidth={2.1} color="#00E5FF" fill="rgba(0,229,255,0.12)" style={{ transform: `rotate(${bearing - 45}deg)`, transition: isDragging ? 'none' : 'transform 120ms ease-out', filter: 'drop-shadow(0 0 7px rgba(0,229,255,0.65))' }} /></div>
      </div>
    </div>
  );
}

/* =========================================================
   MAIN ENGINE EXPORT
   ========================================================= */

export default function SpatialEngine({
  initialLon = -122.4194,
  initialLat = 37.7749,
  focusLon,
  focusLat,
  focusZoom,
  clickMode,
  onMapClick,
  onMapMouseDown,
  onMapMouseMove,
  onMapMouseUp,
  telemetryData = {},
  vehicles = [],
  dbTraffic = [],
  dbRedzones = [],
  simulatedTimeMs,
  overrideTimeMs,
  redzones = [],
  redzoneDraft = null,
  startPoint = null,
  endPoint = null,
  manifest = [],
  planningState,
  manualTransitPath = null,
  conflictData,
  editingRedzoneId,
  onMarkerClick,
  isDark = true
}) {
  const containerRef = useRef(null);

  const [pitch, setPitch] = useState(45);
  const [bearing, setBearing] = useState(0);
  const [mapZoom, setMapZoom] = useState(14);
  const [centerLon, setCenterLon] = useState(initialLon);
  const [centerLat, setCenterLat] = useState(initialLat);
  const [isHudExpanded, setIsHudExpanded] = useState(true);
  const [showMapTiles, setShowMapTiles] = useState(true);

  const [goToLat, setGoToLat] = useState(initialLat);
  const [goToLon, setGoToLon] = useState(initialLon);

  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [dragMode, setDragMode] = useState(null);

  const lastMouseRef = useRef({ x: 0, y: 0 });
  const animationRef = useRef(null);

  const rafRef = useRef(null);
  const pendingDelta = useRef({ dx: 0, dy: 0 });
  const camRef = useRef({ lon: initialLon, lat: initialLat, zoom: 14 });

  const is2D = pitch === 0;

  useEffect(() => {
    camRef.current = { lon: centerLon, lat: centerLat, zoom: mapZoom };
  }, [centerLon, centerLat, mapZoom]);

  useEffect(() => {
    if (focusLon !== undefined && focusLat !== undefined) {
      setCenterLon(wrapLon(focusLon));
      setCenterLat(clampLat(focusLat));
      if (focusZoom !== undefined) setMapZoom(focusZoom);
    }
  }, [focusLon, focusLat, focusZoom]);

  useEffect(() => {
    if (!isDragging && !isAnimating) {
      setGoToLat(Number(centerLat.toFixed(5)));
      setGoToLon(Number(centerLon.toFixed(5)));
    }
  }, [centerLat, centerLon, isDragging, isAnimating]);

  const tileZoom = Math.floor(mapZoom);
  const fractionalScale = Math.pow(2, mapZoom - tileZoom);
  const pxPerMeter = useMemo(() => (256 * Math.pow(2, tileZoom)) / (40075016.686 * Math.cos(centerLat * Math.PI/180)), [centerLat, tileZoom]);

  // Project callback now factors in Z_EXAGGERATION to raise heights significantly
  const project = useCallback((lon, lat, alt = 0) => ({
    x: (lon - centerLon) * 111320 * Math.cos(centerLat * (Math.PI / 180)) * pxPerMeter,
    y: -(lat - centerLat) * 111320 * pxPerMeter,
    z: alt * pxPerMeter * Z_EXAGGERATION
  }), [centerLon, centerLat, pxPerMeter]);

  const unproject = (x, y) => ({
    lng: centerLon + ((x / pxPerMeter) / (111320 * Math.cos(centerLat * (Math.PI / 180)))),
    lat: centerLat + (-(y / pxPerMeter) / 111320)
  });

  const visibleTraffic = useMemo(() => {
    const threshold = 0.015;
    return dbTraffic.filter(path =>
      path.some(pt => Math.abs(pt.longitude - centerLon) < threshold && Math.abs(pt.latitude - centerLat) < threshold)
    );
  }, [dbTraffic, centerLon, centerLat]);

  const activeVehicles = useMemo(() => {
    if (!simulatedTimeMs) return [];
    return visibleTraffic.map(path => {
      const t0 = new Date(path[0].timestamp).getTime();
      const tEnd = new Date(path[path.length - 1].timestamp).getTime();

      if (simulatedTimeMs < t0) return { ...path[0] };
      if (simulatedTimeMs > tEnd) return { ...path[path.length - 1] };

      return getInterpolatedPos(path, simulatedTimeMs);
    }).filter(Boolean);
  }, [visibleTraffic, simulatedTimeMs]);

  const activeManifestDrone = useMemo(() => getInterpolatedPos(manifest, simulatedTimeMs), [manifest, simulatedTimeMs]);

  /* =========================================================
     SMOOTH CAMERA FLY-TO LOGIC
     ========================================================= */
  const flyTo = useCallback((targetLon, targetLat, targetZoom = 17) => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setIsAnimating(true);

    const startLon = camRef.current.lon;
    const startLat = camRef.current.lat;
    const startZoom = camRef.current.zoom;
    const duration = 850;
    const startTime = performance.now();

    const animate = (time) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      setCenterLon(startLon + (targetLon - startLon) * ease);
      setCenterLat(startLat + (targetLat - startLat) * ease);
      setMapZoom(startZoom + (targetZoom - startZoom) * ease);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        animationRef.current = null;
        setIsAnimating(false);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, []);

  /* =========================================================
     HARDWARE ACCELERATED INTERACTION HANDLERS
     ========================================================= */
  const handleViewportPointerDown = (e) => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      setIsAnimating(false);
    }
    if (clickMode) return;
    setIsDragging(true);
    setDragMode(e.buttons === 2 || e.buttons === 4 || e.ctrlKey ? 'ORBIT' : 'PAN');
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    pendingDelta.current = { dx: 0, dy: 0 };
  };

  const handleViewportPointerMove = (e) => {
    if (!isDragging) return;

    pendingDelta.current.dx += e.clientX - lastMouseRef.current.x;
    pendingDelta.current.dy += e.clientY - lastMouseRef.current.y;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };

    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        const dx = pendingDelta.current.dx;
        const dy = pendingDelta.current.dy;
        pendingDelta.current = { dx: 0, dy: 0 };

        if (dragMode === 'ORBIT') {
          setBearing((prev) => normalizeBearing(prev + dx * 0.4));
          setPitch((prev) => {
            let p = prev - dy * 0.4;
            if (p < 3) p = 0;
            return Math.max(0, Math.min(85, p));
          });
        } else if (dragMode === 'PAN') {
          const bearingRad = bearing * (Math.PI / 180);
          const rotatedDx = (dx / fractionalScale) * Math.cos(bearingRad) + (dy / fractionalScale) * Math.sin(bearingRad);
          const rotatedDy = -(dx / fractionalScale) * Math.sin(bearingRad) + (dy / fractionalScale) * Math.cos(bearingRad);

          setCenterLon((prevLon) => {
            const lonShift = (rotatedDx / pxPerMeter) / (111320 * Math.cos(centerLat * (Math.PI / 180)));
            return wrapLon(prevLon - lonShift);
          });
          setCenterLat((prevLat) => {
            const latShift = (rotatedDy / pxPerMeter) / 111320;
            return clampLat(prevLat + latShift);
          });
        }
        rafRef.current = null;
      });
    }
  };

  const handleViewportPointerUp = () => {
    setIsDragging(false);
    setDragMode(null);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const handleViewportWheel = (e) => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      setIsAnimating(false);
    }
    setMapZoom((prev) => Math.max(2, Math.min(20, prev + (e.deltaY * -0.0025))));
  };

  const getGeoFromEvent = (e) => {
    const x = (e.nativeEvent.offsetX - FLOOR_SIZE / 2) / fractionalScale;
    const y = (e.nativeEvent.offsetY - FLOOR_SIZE / 2) / fractionalScale;
    return unproject(x, y);
  };

  const handleTeleport = () => {
    const validLat = clampLat(Number(goToLat) || 0);
    const validLon = wrapLon(Number(goToLon) || 0);
    flyTo(validLon, validLat, mapZoom);
  };

  const btnBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
  const subtextColor = isDark ? '#888' : '#555';
  const textColor = isDark ? '#fff' : '#111';
  const controlColors = { flat2D: '#00b4d8', view3D: '#7209b7', north: '#f72585', east: '#4cc9f0', south: '#4895ef', west: '#3a0ca3', zoom: '#00E5FF' };

  const getColoredBtnStyle = (isActive, activeColor) => ({
    flex: 1, background: isActive ? activeColor : btnBg, border: `1px solid ${isActive ? activeColor : borderColor}`,
    borderRadius: '7px', color: isActive ? '#fff' : subtextColor, fontSize: '11px', padding: '7px 0',
    cursor: 'pointer', textTransform: 'uppercase', fontWeight: '700', transition: 'all 0.2s ease',
    boxShadow: isActive ? `0 4px 12px ${activeColor}50` : 'none',
  });

  return (
    <div
      ref={containerRef}
      onPointerDown={handleViewportPointerDown}
      onPointerMove={handleViewportPointerMove}
      onPointerUp={handleViewportPointerUp}
      onPointerLeave={handleViewportPointerUp}
      onWheel={handleViewportWheel}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        width: '100%', height: '100%', background: 'transparent', overflow: 'hidden',
        cursor: clickMode ? 'crosshair' : (dragMode === 'PAN' ? 'grabbing' : dragMode === 'ORBIT' ? 'move' : 'grab'),
        userSelect: 'none', position: 'relative',
        perspective: is2D ? 'none' : '1400px'
      }}
    >
      <div style={{
        width: '100%', height: '100%', transformStyle: 'preserve-3d',
        transform: `scale(${fractionalScale}) translate3d(0, 0, ${is2D ? 0 : 400}px) rotateX(${pitch}deg) rotateZ(${bearing}deg)`,
        transition: (isDragging || isAnimating) ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>

        <div
          onClick={(e) => clickMode || onMapClick ? onMapClick?.({ lngLat: getGeoFromEvent(e) }) : null}
          onPointerDown={(e) => clickMode === 'REDZONE' ? (e.target.setPointerCapture(e.pointerId), onMapMouseDown?.({ lngLat: getGeoFromEvent(e) })) : null}
          onPointerMove={(e) => clickMode === 'REDZONE' && e.target.hasPointerCapture(e.pointerId) ? onMapMouseMove?.({ lngLat: getGeoFromEvent(e) }) : null}
          onPointerUp={(e) => clickMode === 'REDZONE' ? (e.target.releasePointerCapture(e.pointerId), onMapMouseUp?.({ lngLat: getGeoFromEvent(e) })) : null}
          style={{
            position: 'absolute', left: '50%', top: '50%',
            width: FLOOR_SIZE, height: FLOOR_SIZE, transform: 'translate3d(-50%, -50%, 0)',
            background: showMapTiles ? (isDark ? '#111' : '#eee') : `linear-gradient(${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} 1px, transparent 1px), linear-gradient(90deg, ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} 1px, transparent 1px), radial-gradient(circle at center, ${isDark ? '#1f1f1f 0%, #111 70%, #0a0a0f 100%' : '#fff 0%, #f7f9fb 70%, #e2e5e9 100%'})`,
            backgroundSize: showMapTiles ? 'auto' : '100px 100px, 100px 100px, 100% 100%',
            border: `2px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0,0,0,0.1)'}`,
            boxShadow: `0 0 100px ${isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.1)'} inset`, transformStyle: 'preserve-3d'
          }}
        >
          {showMapTiles && <MapTiles centerLon={centerLon} centerLat={centerLat} tileZoom={tileZoom} />}

          <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', pointerEvents: clickMode ? 'none' : 'auto' }}>

            {/* DB REDZONES */}
            {dbRedzones.map((rz, i) => {
              const p = project(rz.center[0], rz.center[1]);
              const height = (rz.altMax || 200) * pxPerMeter * Z_EXAGGERATION;
              return <CSSCylinder key={`db-rz-${i}`} x={p.x} y={p.y} radius={rz.radius * pxPerMeter} zMin={0} height={height} color="rgba(255, 59, 48, 0.15)" isSelected={false} is2D={is2D} onClick={(e) => { e.stopPropagation(); flyTo(rz.center[0], rz.center[1], 16); }} />;
            })}

            {/* LIVE DB TRAFFIC LINES */}
            {overrideTimeMs !== null && visibleTraffic.map((path, pathIdx) => (
              path.length > 1 && path.slice(0, -1).map((m, i) => {
                const p1 = project(m.longitude, m.latitude, m.altitude);
                const p2 = project(path[i+1].longitude, path[i+1].latitude, path[i+1].altitude);
                const z1 = is2D ? 2 : p1.z;
                const z2 = is2D ? 2 : p2.z;

                const length = is2D ? Math.hypot(p2.x - p1.x, p2.y - p1.y) : Math.hypot(p2.x - p1.x, p2.y - p1.y, z2 - z1);
                if (length > 1000) return null;

                return (
                  <div key={`db-traf-${pathIdx}-${i}`} style={{
                    position: 'absolute', left: FLOOR_SIZE / 2 + p1.x, top: FLOOR_SIZE / 2 + p1.y,
                    width: length, height: 2, background: 'rgba(255, 170, 0, 0.4)',
                    transformOrigin: '0 50%',
                    transform: `translate3d(0, -50%, ${z1}px) rotateZ(${Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI)}deg) ${!is2D ? `rotateY(${Math.atan2(z2 - z1, Math.hypot(p2.x - p1.x, p2.y - p1.y)) * -(180 / Math.PI)}deg)` : ''}`,
                    borderRadius: '1px', willChange: 'transform'
                  }} />
                );
              })
            ))}

            {/* DB TRAFFIC VEHICLES & DROP LINES */}
            {overrideTimeMs !== null && activeVehicles.map((v, i) => {
              const p = project(v.longitude, v.latitude, v.altitude);
              const z = is2D ? 3 : p.z;
              return (
                 <React.Fragment key={`db-active-${i}`}>
                   {!is2D && <VerticalDropLine x={p.x} y={p.y} zHeight={z} color="rgba(255, 170, 0, 0.8)" />}
                   <div onClick={(e) => { e.stopPropagation(); flyTo(v.longitude, v.latitude, 18.5); }}
                        style={{
                          position: 'absolute', left: FLOOR_SIZE/2 + p.x, top: FLOOR_SIZE/2 + p.y,
                          width: 14, height: 14, background: '#ffaa00', borderRadius: '50%',
                          transform: `translate3d(-50%, -50%, ${z}px) scale(${1/fractionalScale}) rotateX(${-pitch}deg)`,
                          boxShadow: `0 0 15px #ffaa00`, border: '2px solid #fff', cursor: 'pointer',
                          transition: overrideTimeMs === null ? 'left 0.1s linear, top 0.1s linear' : 'none',
                          willChange: 'transform'
                   }} />
                 </React.Fragment>
              )
            })}

            {/* LIVE REDIS STOMP TELEMETRY & DROP LINES */}
            {Object.values(telemetryData).map((livePos) => {
              if (typeof livePos.longitude !== 'number' || typeof livePos.latitude !== 'number') return null;
              const alt = Number(livePos.altitude) || 0;
              const p = project(livePos.longitude, livePos.latitude, alt);
              const z = is2D ? 4 : p.z + 1;

              const v = vehicles.find(veh => veh.id === livePos.vehicle_id);
              const name = v ? v.name : livePos.vehicle_id;

              return (
                 <React.Fragment key={`telemetry-${livePos.vehicle_id}`}>
                    {!is2D && <VerticalDropLine x={p.x} y={p.y} zHeight={p.z} color="rgba(0, 230, 118, 0.8)" />}
                    <div onClick={(e) => { e.stopPropagation(); flyTo(livePos.longitude, livePos.latitude, 18.5); }}
                         style={{
                           position: 'absolute', left: FLOOR_SIZE/2 + p.x, top: FLOOR_SIZE/2 + p.y,
                           transform: `translate3d(-50%, -50%, ${z}px) scale(${1/fractionalScale}) rotateX(${-pitch}deg)`,
                           transition: 'left 0.15s linear, top 0.15s linear, transform 0.1s ease',
                           display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer',
                           willChange: 'transform'
                    }}>
                       <div style={{
                           background: isDark ? 'rgba(18, 18, 22, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                           border: '1px solid #00E676', color: isDark ? '#fff' : '#000',
                           padding: '4px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: '800',
                           whiteSpace: 'nowrap', marginBottom: '4px', boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                           pointerEvents: 'none', textTransform: 'uppercase'
                       }}>
                           {name} <span style={{ color: '#00E676', marginLeft: '4px' }}>{alt.toFixed(1)}m</span>
                       </div>
                       <div style={{
                           width: 14, height: 14, background: '#00E676', borderRadius: '50%',
                           boxShadow: `0 0 20px #00E676`, border: '2px solid #000'
                       }} />
                    </div>
                 </React.Fragment>
              )
            })}

            {/* MANUAL TRANSIT DASHED LINE */}
            {manualTransitPath && (() => {
              const p1 = project(manualTransitPath[0].longitude, manualTransitPath[0].latitude, manualTransitPath[0].altitude);
              const p2 = project(manualTransitPath[1].longitude, manualTransitPath[1].latitude, manualTransitPath[1].altitude);
              const z1 = is2D ? 2 : p1.z;
              const z2 = is2D ? 2 : p2.z;
              const length = is2D ? Math.hypot(p2.x - p1.x, p2.y - p1.y) : Math.hypot(p2.x - p1.x, p2.y - p1.y, z2 - z1);

              return (
                <div style={{
                  position: 'absolute', left: FLOOR_SIZE / 2 + p1.x, top: FLOOR_SIZE / 2 + p1.y,
                  width: length, height: 2,
                  background: 'repeating-linear-gradient(to right, #ffaa00 0, #ffaa00 6px, transparent 6px, transparent 12px)',
                  transformOrigin: '0 50%',
                  transform: `translate3d(0, -50%, ${z1}px) rotateZ(${Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI)}deg) ${!is2D ? `rotateY(${Math.atan2(z2 - z1, Math.hypot(p2.x - p1.x, p2.y - p1.y)) * -(180 / Math.PI)}deg)` : ''}`,
                  willChange: 'transform'
                }} />
              );
            })()}

            {/* CURRENT PLANNING ROUTE & ALTITUDE FENCE */}
            {manifest.length > 1 && manifest.map((m, i) => {
              const p1 = project(m.longitude, m.latitude, m.altitude);
              const isRejected = planningState === 'REJECTED';
              const color = isRejected ? '#ff3b30' : '#00E5FF';

              const fenceDensity = Math.max(2, Math.ceil(manifest.length / 10)); // Draw 10 struts evenly across the path

              return (
                <React.Fragment key={`route-seg-${i}`}>
                  {/* Vertical Altitude Fence */}
                  {!is2D && (i % fenceDensity === 0 || i === manifest.length - 1) && (
                    <VerticalDropLine x={p1.x} y={p1.y} zHeight={p1.z} color={isRejected ? 'rgba(255, 59, 48, 0.4)' : 'rgba(0, 229, 255, 0.4)'} />
                  )}

                  {/* Horizontal Flight Path */}
                  {i < manifest.length - 1 && (() => {
                    const p2 = project(manifest[i+1].longitude, manifest[i+1].latitude, manifest[i+1].altitude);
                    const z1 = is2D ? 2 : p1.z;
                    const z2 = is2D ? 2 : p2.z;
                    const length = is2D ? Math.hypot(p2.x - p1.x, p2.y - p1.y) : Math.hypot(p2.x - p1.x, p2.y - p1.y, z2 - z1);
                    return (
                      <div style={{
                        position: 'absolute', left: FLOOR_SIZE / 2 + p1.x, top: FLOOR_SIZE / 2 + p1.y,
                        width: length, height: 4, background: isRejected ? 'transparent' : color, borderTop: isRejected ? `4px dashed ${color}` : 'none',
                        transformOrigin: '0 50%',
                        transform: `translate3d(0, -50%, ${z1}px) rotateZ(${Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI)}deg) ${!is2D ? `rotateY(${Math.atan2(z2 - z1, Math.hypot(p2.x - p1.x, p2.y - p1.y)) * -(180 / Math.PI)}deg)` : ''}`,
                        boxShadow: isRejected ? 'none' : `0 0 12px ${color}`, borderRadius: '2px', willChange: 'transform'
                      }} />
                    );
                  })()}
                </React.Fragment>
              );
            })}

            {/* WAYPOINTS WITH TALL GLOWING BEACONS */}
            {startPoint && (
              <React.Fragment>
                {!is2D && <WaypointBeacon x={project(startPoint[0], startPoint[1]).x} y={project(startPoint[0], startPoint[1]).y} color="#00E5FF" />}
                <div onClick={(e) => { e.stopPropagation(); flyTo(startPoint[0], startPoint[1], 18); }} style={{ position: 'absolute', left: FLOOR_SIZE/2 + project(startPoint[0], startPoint[1]).x, top: FLOOR_SIZE/2 + project(startPoint[0], startPoint[1]).y, width: 24, height: 24, background: '#00E5FF', borderRadius: '50%', transform: `translate3d(-50%, -50%, 4px) scale(${1/fractionalScale})`, boxShadow: '0 0 20px #00E5FF', cursor: 'pointer', willChange: 'transform' }} />
              </React.Fragment>
            )}

            {endPoint && (
              <React.Fragment>
                {!is2D && <WaypointBeacon x={project(endPoint[0], endPoint[1]).x} y={project(endPoint[0], endPoint[1]).y} color="#a855f7" />}
                <div onClick={(e) => { e.stopPropagation(); flyTo(endPoint[0], endPoint[1], 18); }} style={{ position: 'absolute', left: FLOOR_SIZE/2 + project(endPoint[0], endPoint[1]).x, top: FLOOR_SIZE/2 + project(endPoint[0], endPoint[1]).y, width: 24, height: 24, background: '#a855f7', borderRadius: '50%', transform: `translate3d(-50%, -50%, 4px) scale(${1/fractionalScale})`, boxShadow: '0 0 20px #a855f7', cursor: 'pointer', willChange: 'transform' }} />
              </React.Fragment>
            )}

            {/* UI REDZONES */}
            {[...redzones, redzoneDraft].filter(Boolean).map((rz, i) => {
              const p = project(rz.center[0], rz.center[1]);
              const rPx = rz.radius * pxPerMeter;
              const zMin = (rz.altMin || 0) * pxPerMeter * Z_EXAGGERATION;
              const height = (((rz.altMax || 0) || rz.radius) * pxPerMeter * Z_EXAGGERATION) - zMin;
              return (
                <CSSCylinder
                  key={`draft-rz-${rz.id || i}`}
                  x={p.x} y={p.y} radius={rPx} zMin={zMin} height={height}
                  color="rgba(255, 59, 48, 0.35)"
                  isSelected={rz.id && rz.id === editingRedzoneId}
                  is2D={is2D} onClick={(e) => { e.stopPropagation(); if (rz.id && onMarkerClick) onMarkerClick(rz.id); flyTo(rz.center[0], rz.center[1], 16.5); }}
                />
              );
            })}

            {/* SCRUBBER VEHICLE & DROP LINE */}
            {activeManifestDrone && (() => {
              const pScrub = project(activeManifestDrone.longitude, activeManifestDrone.latitude, activeManifestDrone.altitude);
              return (
                <React.Fragment>
                  {!is2D && <VerticalDropLine x={pScrub.x} y={pScrub.y} zHeight={pScrub.z} color={planningState === 'REJECTED' ? 'rgba(255, 59, 48, 0.8)' : 'rgba(0, 229, 255, 0.8)'} />}
                  <div
                    onClick={(e) => { e.stopPropagation(); flyTo(activeManifestDrone.longitude, activeManifestDrone.latitude, 18.5); }}
                    style={{
                      position: 'absolute', left: FLOOR_SIZE/2 + pScrub.x, top: FLOOR_SIZE/2 + pScrub.y,
                      width: 32, height: 32, background: planningState === 'REJECTED' ? '#ff3b30' : '#00E5FF', borderRadius: '50%', border: '4px solid #fff', cursor: 'pointer',
                      transform: `translate3d(-50%, -50%, ${is2D ? 4 : pScrub.z}px) rotateZ(${-bearing}deg) rotateX(${-pitch}deg) scale(${1/fractionalScale})`,
                      boxShadow: `0 0 30px ${planningState === 'REJECTED' ? '#ff3b30' : '#00E5FF'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', willChange: 'transform'
                  }}>
                    <div style={{ width: 12, height: 12, background: '#fff', borderRadius: '50%' }} />
                  </div>
                </React.Fragment>
              );
            })()}

            {/* CONFLICT MARKER */}
            {conflictData && Math.abs(simulatedTimeMs - new Date(conflictData.timestamp).getTime()) < 10000 && (
              <div
                onClick={(e) => { e.stopPropagation(); flyTo(conflictData.position.longitude, conflictData.position.latitude, 19); }}
                style={{
                 position: 'absolute',
                 left: FLOOR_SIZE/2 + project(conflictData.position.longitude, conflictData.position.latitude).x,
                 top: FLOOR_SIZE/2 + project(conflictData.position.longitude, conflictData.position.latitude).y,
                 width: 0, height: 0, cursor: 'pointer',
                 borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderTop: '20px solid #ff3b30',
                 transform: `translate3d(-50%, -50%, ${is2D ? 5 : project(0,0,50).z}px) rotateX(${-pitch}deg) scale(${1/fractionalScale})`,
                 filter: 'drop-shadow(0 0 10px rgba(255,59,48,0.8))', willChange: 'transform'
              }} />
            )}
          </div>
        </div>
      </div>

      {/* ENCAPSULATED HUD CONTROLS */}
      <div style={{
        position: 'absolute', top: '20px', right: '20px', background: isDark ? 'rgba(18, 18, 22, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(15px)', border: `1px solid ${borderColor}`, borderRadius: '16px',
        padding: '20px', color: textColor, boxShadow: '0 20px 40px rgba(0,0,0,0.15)', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '18px', width: '260px',
        opacity: isHudExpanded ? 1 : 0, transform: isHudExpanded ? 'translateX(0)' : 'translateX(20px)', pointerEvents: isHudExpanded ? 'auto' : 'none', transition: 'all 0.3s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', color: subtextColor }}>Camera Settings</span>
          <button onClick={() => setIsHudExpanded(false)} style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer' }}><X size={18} color={subtextColor} /></button>
        </div>

        <div>
          <button type="button" style={getColoredBtnStyle(showMapTiles, controlColors.zoom)} onClick={() => setShowMapTiles(!showMapTiles)}>
            {showMapTiles ? 'Map Tiles: ON (Raster)' : 'Map Tiles: OFF (Grid Box)'}
          </button>
        </div>

        <div style={{ height: '1px', background: borderColor }} />

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: btnBg, border: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'center', alignItems: 'center', perspective: '100px' }}>
              <Layers size={18} color="#7209b7" style={{ transform: `rotateX(${pitch}deg)`, transformStyle: 'preserve-3d' }} />
            </div>
            <div>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: subtextColor }}>Pitch Angle</div>
              <div style={{ fontSize: '15px', fontWeight: '600' }}>{Math.round(pitch)}°</div>
            </div>
          </div>
          <input type="range" min="0" max="85" value={pitch} onChange={(e) => { let val = Number(e.target.value); if (val <= 3) val = 0; setPitch(val); }} style={{ width: '100%', cursor: 'pointer', accentColor: '#7209b7', marginBottom: '12px' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" style={getColoredBtnStyle(pitch === 0, controlColors.flat2D)} onClick={() => setPitch(0)}>2D Flat</button>
            <button type="button" style={getColoredBtnStyle(Math.abs(pitch - 45) < 2, controlColors.view3D)} onClick={() => setPitch(45)}>3D View</button>
          </div>
        </div>

        <div style={{ height: '1px', background: borderColor }} />

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: btnBg, border: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <span style={{ fontWeight: '800', color: controlColors.zoom, fontSize: '12px' }}>{mapZoom.toFixed(1)}</span>
            </div>
            <div>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: subtextColor }}>Map Scale</div>
              <div style={{ fontSize: '15px', fontWeight: '600' }}>Zoom Level</div>
            </div>
          </div>
          <input type="range" min="2" max="20" step="0.5" value={mapZoom} onChange={(e) => setMapZoom(Number(e.target.value))} style={{ width: '100%', cursor: 'pointer', accentColor: controlColors.zoom, marginBottom: '12px' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" style={getColoredBtnStyle(mapZoom < 5, controlColors.zoom)} onClick={() => setMapZoom(3)}>Far</button>
            <button type="button" style={getColoredBtnStyle(mapZoom >= 5 && mapZoom < 16, controlColors.zoom)} onClick={() => setMapZoom(13)}>Normal</button>
            <button type="button" style={getColoredBtnStyle(mapZoom >= 16, controlColors.zoom)} onClick={() => setMapZoom(18)}>Close</button>
          </div>
        </div>

        <div style={{ height: '1px', background: borderColor }} />

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', color: subtextColor }}>Heading</div>
              <div style={{ fontSize: '15px', fontWeight: '600', marginTop: '2px' }}>{['N','NE','E','SE','S','SW','W','NW'][Math.round(normalizeBearing(bearing) / 45) % 8]}</div>
            </div>
            <div style={{ fontSize: '15px', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>{Math.round(normalizeBearing(bearing)).toString().padStart(3, '0')}°</div>
          </div>
          <RotatingCompass bearing={bearing} setBearing={setBearing} subtextColor={subtextColor} borderColor={borderColor} isDark={isDark} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '14px' }}>
            <button type="button" style={getColoredBtnStyle(isBearingActive(bearing, 0), controlColors.north)} onClick={() => setBearing(0)}>N</button>
            <button type="button" style={getColoredBtnStyle(isBearingActive(bearing, -90), controlColors.west)} onClick={() => setBearing(-90)}>W</button>
            <button type="button" style={getColoredBtnStyle(isBearingActive(bearing, 90), controlColors.east)} onClick={() => setBearing(90)}>E</button>
            <button type="button" style={getColoredBtnStyle(isBearingActive(bearing, 180), controlColors.south)} onClick={() => setBearing(180)}>S</button>
          </div>
        </div>

        <div style={{ height: '1px', background: borderColor }} />

        <div>
           <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <MapPin size={12} color={controlColors.zoom} />
              <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: subtextColor }}>Teleport Coordinates</span>
           </div>
           <div style={{ display: 'flex', gap: '8px' }}>
             <input type="number" value={goToLat} onChange={(e) => setGoToLat(e.target.value)} step="0.0001" style={{ flex: 1, minWidth: 0, padding: '6px', background: btnBg, border: `1px solid ${borderColor}`, color: textColor, borderRadius: '6px', fontSize: '11px', outline: 'none' }} title="Latitude" />
             <input type="number" value={goToLon} onChange={(e) => setGoToLon(e.target.value)} step="0.0001" style={{ flex: 1, minWidth: 0, padding: '6px', background: btnBg, border: `1px solid ${borderColor}`, color: textColor, borderRadius: '6px', fontSize: '11px', outline: 'none' }} title="Longitude" />
             <button onClick={handleTeleport} style={{ background: controlColors.zoom, color: '#000', border: 'none', borderRadius: '6px', padding: '0 12px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>GO</button>
           </div>
           <div style={{ textAlign: 'center', fontSize: '9px', color: subtextColor, marginTop: '16px' }}>
            Left Click: Pan | Right Click: Orbit | Scroll: Zoom
          </div>
        </div>
      </div>

      {!isHudExpanded && (
        <div onClick={() => setIsHudExpanded(true)} style={{ position: 'absolute', top: 20, right: 20, width: FAB_SIZE, height: FAB_SIZE, background: isDark ? 'rgba(18, 18, 22, 0.95)' : 'rgba(255, 255, 255, 0.95)', border: `1px solid ${borderColor}`, borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', zIndex: 15, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          <Camera size={20} color={textColor} />
        </div>
      )}
    </div>
  );
}