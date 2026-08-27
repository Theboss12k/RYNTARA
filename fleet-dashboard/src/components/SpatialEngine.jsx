import React, { useState, useMemo, useEffect, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { Map } from 'react-map-gl/maplibre';
import { FlyToInterpolator } from '@deck.gl/core';
import { ScatterplotLayer, PathLayer, LineLayer, PolygonLayer, TextLayer } from '@deck.gl/layers';
import 'maplibre-gl/dist/maplibre-gl.css';

const Z_EXAGGERATION = 8;

const osmRasterStyle = {
  version: 8,
  sources: { 'osm-tiles': { type: 'raster', tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '&copy; OpenStreetMap contributors' } },
  layers: [{ id: 'osm-base', type: 'raster', source: 'osm-tiles', minzoom: 0, maxzoom: 19 }]
};

const getDistance = (lon1, lat1, lon2, lat2) => {
  const R = 6371e3;
  const toRad = (v) => (v * Math.PI) / 180;
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

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
      const dt = (t2 - t1) / 1000;
      const speed = dt > 0 ? getDistance(w1.longitude, w1.latitude, w2.longitude, w2.latitude) / dt : 0;
      return {
        ...w1,
        longitude: w1.longitude + (w2.longitude - w1.longitude) * f,
        latitude: w1.latitude + (w2.latitude - w1.latitude) * f,
        altitude: w1.altitude + (w2.altitude - w1.altitude) * f,
        calculatedSpeed: speed
      };
    }
  }
  return null;
};

const getCuboidPolygon = (lon, lat, widthM, depthM) => {
  const lonOffset = (widthM / 2) / (111320 * Math.cos(lat * Math.PI / 180));
  const latOffset = (depthM / 2) / 111320;
  return [[
    [lon - lonOffset, lat - latOffset],
    [lon + lonOffset, lat - latOffset],
    [lon + lonOffset, lat + latOffset],
    [lon - lonOffset, lat + latOffset],
    [lon - lonOffset, lat - latOffset]
  ]];
};

const getCirclePolygon = (lon, lat, radiusMeters, numPoints = 32) => {
  const coords = [];
  const latOffset = radiusMeters / 111320;
  const lonOffset = radiusMeters / (111320 * Math.cos(lat * Math.PI / 180));
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    coords.push([lon + Math.cos(angle) * lonOffset, lat + Math.sin(angle) * latOffset]);
  }
  return [coords];
};

export default function SpatialEngine({
  initialLon = -122.4194, initialLat = 37.7749, focusLon, focusLat, focusZoom,
  clickMode, onMapClick, telemetryData = {}, vehicles = [], dbTraffic = [], dbTrafficMap = {}, dbRedzones = [], buildings = [],
  simulatedTimeMs, overrideTimeMs, redzones = [], vehicleById = {}, startPoint = null, endPoint = null, manifest = [], planningState,
  manualTransitPath = null, conflictData, suggestedPath = null, onMarkerClick, showMapTiles = true, viewState, setViewState,
  onMapInteract, showAllManifests, onVehicleClick, viewingManifestId
}) {
  const isLOD = viewState.zoom < 13.5;
  const is2D = viewState.pitch === 0;

  const [hoverInfo, setHoverInfo] = useState(null);

  useEffect(() => {
    if (clickMode === 'START' || clickMode === 'END' || clickMode === 'REDZONE') {
      setViewState(prev => ({ ...prev, pitch: 0, transitionDuration: 500 }));
    }
  }, [clickMode, setViewState]);

  const flyTo = useCallback((targetLon, targetLat, targetZoom = 16.5) => {
    setViewState(prev => ({
      ...prev, longitude: targetLon, latitude: targetLat, zoom: targetZoom,
      transitionDuration: 1200, transitionInterpolator: new FlyToInterpolator({ curve: 1.5 })
    }));
  }, [setViewState]);

  useEffect(() => {
    if (focusLon !== undefined && focusLat !== undefined) flyTo(focusLon, focusLat, focusZoom || viewState.zoom);
  }, [focusLon, focusLat, focusZoom, flyTo, viewState.zoom]);

  // Aggressive chunking scanner for vehicles moving on the timeline scrubber
  const activeVehicles = useMemo(() => {
    if (!simulatedTimeMs) return [];
    const active = [];

    for (const [vId, chunkedPaths] of Object.entries(dbTrafficMap || {})) {
      let activePos = null;
      for (let i = 0; i < chunkedPaths.length; i++) {
        const { path } = chunkedPaths[i];
        if (path.length === 0) continue;
        const t0 = new Date(path[0].timestamp).getTime();
        const tEnd = new Date(path[path.length - 1].timestamp).getTime();

        if (simulatedTimeMs >= t0 && simulatedTimeMs <= tEnd) {
          activePos = getInterpolatedPos(path, simulatedTimeMs);
          break;
        }
      }

      if (!activePos && chunkedPaths.length > 0) {
        let minDiff = Infinity;
        for (let i = 0; i < chunkedPaths.length; i++) {
          const { path } = chunkedPaths[i];
          if (path.length === 0) continue;
          const t0 = new Date(path[0].timestamp).getTime();
          const tEnd = new Date(path[path.length - 1].timestamp).getTime();

          if (simulatedTimeMs < t0 && (t0 - simulatedTimeMs) < minDiff) {
            minDiff = t0 - simulatedTimeMs;
            activePos = { ...path[0], calculatedSpeed: 0 };
          } else if (simulatedTimeMs > tEnd && (simulatedTimeMs - tEnd) < minDiff) {
            minDiff = simulatedTimeMs - tEnd;
            activePos = { ...path[path.length - 1], calculatedSpeed: 0 };
          }
        }
      }

      if (activePos) {
        activePos.vehicle_id = vId;
        activePos.multiplier = vehicleById[vId]?.dangerZoneMultiplier !== undefined ? vehicleById[vId].dangerZoneMultiplier : 10;
        activePos.source = 'db';
        active.push(activePos);
      }
    }
    return active;
  }, [dbTrafficMap, simulatedTimeMs, vehicleById]);

  const activeManifestDrone = useMemo(() => {
    if (overrideTimeMs === null) return null;
    return getInterpolatedPos(manifest, simulatedTimeMs);
  }, [manifest, simulatedTimeMs, overrideTimeMs]);

  const liveVehicleData = useMemo(() => {
    return Object.values(telemetryData).map(pos => {
      pos.multiplier = vehicleById[pos.vehicle_id]?.dangerZoneMultiplier !== undefined ? vehicleById[pos.vehicle_id].dangerZoneMultiplier : 10;
      pos.source = 'telemetry';
      return pos;
    });
  }, [telemetryData, vehicleById]);

  const routeColor = planningState === 'REJECTED' ? [255, 59, 48] : [0, 230, 118];

  const dangerZoneVehicles = useMemo(() => {
    const arr = [...(overrideTimeMs !== null ? activeVehicles : liveVehicleData)];
    if (activeManifestDrone) {
      arr.push({ ...activeManifestDrone, source: 'manifest' });
    }
    return arr.map(v => {
      const alt = v.altitude || 0;
      v.isAirborne = alt > 0;
      v.dangerRadius = Math.max(10, (v.calculatedSpeed || 0) * (v.multiplier || 10));
      v.pos = [v.longitude, v.latitude, is2D ? 0 : alt * Z_EXAGGERATION];
      v.groundPos = [v.longitude, v.latitude, 0];
      return v;
    }).filter(Boolean);
  }, [overrideTimeMs, activeVehicles, liveVehicleData, activeManifestDrone, is2D]);

  // Dashed Line Math Generator (Deck.GL compatible)
  const manualTransitLines = useMemo(() => {
    if (!manualTransitPath || manualTransitPath.length < 2) return [];
    const p1 = [manualTransitPath[0].longitude, manualTransitPath[0].latitude, is2D ? 0 : (manualTransitPath[0].altitude || 0) * Z_EXAGGERATION];
    const p2 = [manualTransitPath[1].longitude, manualTransitPath[1].latitude, is2D ? 0 : (manualTransitPath[1].altitude || 0) * Z_EXAGGERATION];

    const lines = [];
    const segments = 20;
    for (let i = 0; i < segments; i += 2) {
      const f1 = i / segments;
      const f2 = (i + 1) / segments;
      lines.push({
        src: [p1[0] + (p2[0]-p1[0])*f1, p1[1] + (p2[1]-p1[1])*f1, p1[2] + (p2[2]-p1[2])*f1],
        tgt: [p1[0] + (p2[0]-p1[0])*f2, p1[1] + (p2[1]-p1[1])*f2, p1[2] + (p2[2]-p1[2])*f2]
      });
    }
    return lines;
  }, [manualTransitPath, is2D]);

  const groundVehicles = dangerZoneVehicles.filter(v => !v.isAirborne);
  const airborneVehicles = dangerZoneVehicles.filter(v => v.isAirborne);

  const layers = [
    new PolygonLayer({ id: 'buildings-layer', data: buildings, extruded: !is2D && !isLOD, wireframe: true, getPolygon: d => getCuboidPolygon(d.center[0], d.center[1], d.width, d.depth), getElevation: d => d.height * Z_EXAGGERATION, getFillColor: [100, 100, 100, 150], getLineColor: [255, 255, 255, 50], pickable: true, onClick: ({object}) => object && flyTo(object.center[0], object.center[1]) }),
    new PolygonLayer({ id: 'db-redzones-layer', data: dbRedzones, extruded: !is2D && !isLOD, wireframe: false, getPolygon: d => getCirclePolygon(d.center[0], d.center[1], d.radius), getElevation: d => (d.altMax || 200) * Z_EXAGGERATION, getFillColor: [255, 59, 48, 40], getLineColor: [255, 59, 48, 200], lineWidthMinPixels: 2, pickable: true, onClick: ({object}) => object && flyTo(object.center[0], object.center[1]) }),
    new PolygonLayer({ id: 'ui-redzones-layer', data: redzones, extruded: !is2D && !isLOD, wireframe: false, getPolygon: d => getCirclePolygon(d.center[0], d.center[1], d.radius), getElevation: d => ((d.altMax || 0) || d.radius) * Z_EXAGGERATION, getFillColor: [255, 59, 48, 90], getLineColor: [255, 59, 48, 255], lineWidthMinPixels: 2, pickable: true, updateTriggers: { getPolygon: redzones.map(rz => rz.radius).join(','), getElevation: redzones.map(rz => `${rz.altMax}-${rz.altMin}-${rz.radius}`).join(',') }, onClick: ({object}) => { if (object) { if (object.id && onMarkerClick) onMarkerClick(object.id); flyTo(object.center[0], object.center[1]); } } }),

    suggestedPath && suggestedPath.length > 1 && new PathLayer({ id: 'suggested-safe-path', data: [suggestedPath], getPath: d => d.map(pt => [pt.longitude, pt.latitude, (is2D ? 3 : Math.max(pt.altitude || 0, 0.2) * Z_EXAGGERATION)]), getColor: [0, 230, 118, 255], getWidth: 5, widthUnits: 'pixels', updateTriggers: { getPath: [suggestedPath] } }),

    // Global Manifest View Toggle (Isolates paths by dbTraffic chunking algorithm)
    showAllManifests && new PathLayer({
      id: 'db-traffic-paths',
      data: dbTraffic.filter(p => p.path && p.path.length > 1),
      getPath: d => d.path.map(pt => [pt.longitude, pt.latitude, (is2D ? 2 : Math.max(pt.altitude || 0, 0.2) * Z_EXAGGERATION)]),
      getColor: d => d.manifestId === viewingManifestId ? [0, 255, 128, 255] : [0, 229, 255, 200],
      getWidth: d => d.manifestId === viewingManifestId ? 6 : 4,
      widthUnits: 'pixels',
      pickable: true, autoHighlight: true, highlightColor: [0, 255, 128, 255],
      onHover: info => setHoverInfo(info)
    }),

    manualTransitLines.length > 0 && new LineLayer({ id: 'manual-transit-dashed-line', data: manualTransitLines, getSourcePosition: d => d.src, getTargetPosition: d => d.tgt, getColor: [255, 170, 0, 255], getWidth: 4, widthUnits: 'pixels' }),
    manifest.length > 1 && new PathLayer({ id: 'planning-route-path', data: [manifest], getPath: d => d.map(pt => [pt.longitude, pt.latitude, (is2D ? 2 : Math.max(pt.altitude || 0, 0.2) * Z_EXAGGERATION)]), getColor: routeColor, getWidth: 4, widthUnits: 'pixels', updateTriggers: { getPath: [manifest], getColor: [planningState] } }),

    !isLOD && !is2D && new LineLayer({
      id: 'vertical-drop-lines',
      data: dangerZoneVehicles.filter(v => v.isAirborne),
      getSourcePosition: d => d.groundPos, getTargetPosition: d => d.pos,
      getColor: d => d.source === 'manifest' ? routeColor : (d.source === 'telemetry' ? [0, 230, 118, 150] : [255, 170, 0, 150]),
      getWidth: 1.5, widthUnits: 'pixels'
    }),

    // GROUND DANGER ZONES: billboard: false (lays flat)
    new ScatterplotLayer({
      id: 'ground-danger-zones', data: groundVehicles, getPosition: d => d.pos,
      getFillColor: [255, 59, 48, 30], getLineColor: [255, 59, 48, 120], stroked: true,
      lineWidthMinPixels: 2, billboard: false, getRadius: d => d.dangerRadius, radiusUnits: 'meters', radiusMinPixels: 15
    }),

    // AIRBORNE DANGER ZONES: billboard: true (Creates perfect sphere without map tearing)
    new ScatterplotLayer({
      id: 'airborne-danger-zones', data: airborneVehicles, getPosition: d => d.pos,
      getFillColor: [255, 59, 48, 30], getLineColor: [255, 59, 48, 120], stroked: true,
      lineWidthMinPixels: 2, billboard: true, getRadius: d => d.dangerRadius, radiusUnits: 'meters', radiusMinPixels: 15
    }),

    // CRISP 2D VEHICLE ICONS: Uses pixel units (never vanishes)
    new ScatterplotLayer({
      id: 'vehicle-marker-glyphs', data: dangerZoneVehicles, getPosition: d => d.pos,
      getFillColor: d => d.source === 'manifest' ? routeColor : (d.source === 'telemetry' ? [0, 230, 118, 255] : [255, 170, 0, 255]),
      getLineColor: [255, 255, 255, 255], lineWidthMinPixels: 2, stroked: true, billboard: false, pickable: true,
      getRadius: d => d.source === 'manifest' ? 11 : 8, radiusUnits: 'pixels',
      onClick: ({ object }) => { if (object && object.vehicle_id && onVehicleClick) onVehicleClick(object.vehicle_id); }
    }),

    // START & END WAYPOINT MARKERS
    (startPoint || endPoint) && new ScatterplotLayer({
      id: 'start-end-waypoints',
      data: [
        ...(startPoint ? [{ pos: startPoint, color: [0, 229, 255] }] : []),
        ...(endPoint ? [{ pos: endPoint, color: [168, 85, 247] }] : [])
      ],
      getPosition: d => [d.pos[0], d.pos[1], is2D ? 0 : (d.pos[2] || 0) * Z_EXAGGERATION],
      getFillColor: d => d.color, getLineColor: [255, 255, 255, 255], lineWidthMinPixels: 2,
      stroked: true, billboard: false, getRadius: 10, radiusUnits: 'pixels'
    }),

    !isLOD && new TextLayer({
      id: 'telemetry-labels', data: dangerZoneVehicles.filter(v => v.source !== 'manifest'),
      getPosition: d => [d.longitude, d.latitude, (is2D ? 0 : (d.altitude || 0) * Z_EXAGGERATION) + 20], getText: d => `${vehicles.find(veh => veh.id === (d.vehicle_id || d.vehicleId))?.name || d.vehicle_id || 'Unknown'} ${(d.altitude || 0).toFixed(1)}m`,
      getSize: 10, getColor: [255, 255, 255], getBackgroundColor: [18, 18, 22, 230], getBorderColor: [0, 230, 118, 255], getBorderWidth: 1, background: true, backgroundPadding: [4, 4], pixelOffset: [0, -20], fontFamily: 'system-ui, sans-serif', fontWeight: 'bold', outlineWidth: 2, outlineColor: [0, 0, 0, 255],
    }),

    !isLOD && conflictData && Math.abs(simulatedTimeMs - new Date(conflictData.timestamp).getTime()) < 10000 && new ScatterplotLayer({
      id: 'conflict-marker', data: [conflictData], getPosition: d => [d.position.longitude, d.position.latitude, is2D ? 0 : 50 * Z_EXAGGERATION], getFillColor: [255, 59, 48], getRadius: 16, radiusUnits: 'pixels', pickable: true, onClick: ({object}) => object && flyTo(object.position.longitude, object.position.latitude, 19)
    })
  ].filter(Boolean);

  const renderTooltip = () => {
    if (!hoverInfo || !hoverInfo.object || !showAllManifests) return null;
    const { path, manifestId, vehicleId, name } = hoverInfo.object;
    if (!path || path.length === 0) return null;

    const start = new Date(path[0].timestamp).toLocaleTimeString();
    const end = new Date(path[path.length - 1].timestamp).toLocaleTimeString();
    const vehicleName = vehicleById[vehicleId]?.name || vehicleId;

    return (
      <div style={{ position: 'absolute', zIndex: 9999, left: hoverInfo.x + 15, top: hoverInfo.y + 15, background: 'rgba(18, 18, 22, 0.95)', color: '#fff', border: `1px solid rgba(255,255,255,0.1)`, padding: '12px', borderRadius: '8px', fontSize: '11px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)', pointerEvents: 'none' }}>
        <div style={{ fontWeight: '800', color: '#00E5FF', marginBottom: '6px', fontSize: '12px', textTransform: 'uppercase' }}>{name}</div>
        <div style={{ color: '#888', marginBottom: '8px', fontSize: '9px', fontFamily: 'monospace' }}>ID: {manifestId}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
          <span style={{ color: '#888' }}>Vehicle:</span><strong style={{ textAlign: 'right' }}>{vehicleName}</strong>
          <span style={{ color: '#888' }}>Start:</span><strong style={{ textAlign: 'right' }}>{start}</strong>
          <span style={{ color: '#888' }}>End:</span><strong style={{ textAlign: 'right' }}>{end}</strong>
        </div>
      </div>
    );
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#11141a', cursor: clickMode ? 'crosshair' : 'default' }}>
      <DeckGL
        viewState={viewState}
        controller={{ dragRotate: true, scrollZoom: true, doubleClickZoom: false }}
        onViewStateChange={({ viewState: newViewState, interactionState }) => {
          if (interactionState && (interactionState.isDragging || interactionState.isPanning || interactionState.isRotating || interactionState.isZooming)) {
            if (onMapInteract) onMapInteract();
          }
          setViewState(newViewState);
        }}
        layers={layers}
        onClick={(info) => {
          if (clickMode && onMapClick && info.coordinate) {
            onMapClick({ lngLat: { lng: info.coordinate[0], lat: info.coordinate[1] }});
          } else if (!info.object && onMapInteract) {
            onMapInteract();
          }
        }}
        getCursor={({isDragging, isHovering}) => clickMode ? 'crosshair' : isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'}
      >
        {showMapTiles && <Map mapStyle={osmRasterStyle} reuseMaps />}
      </DeckGL>
      {renderTooltip()}
    </div>
  );
}