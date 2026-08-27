import React, { useEffect, useState, useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { Map, Popup, NavigationControl } from 'react-map-gl/maplibre';
import { ScatterplotLayer, LineLayer, TextLayer, PathLayer } from '@deck.gl/layers';
import { MapPin, FastForward } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';

import { getVehicleColor } from './ManageFleetPage';

const Z_EXAGGERATION = 8;
const MAX_MAP_PITCH = 85;

function hexToRgb(hex) {
  if (!hex) return [0, 229, 255];
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const int = parseInt(hex, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

const osmRasterStyle = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap Contributors'
    }
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 19 }],
};

export default function FleetMap({
  telemetryData, vehicleById, theme, selectedVehicle, setSelectedVehicle,
  activeTraces, viewState, setViewState, showMapTiles,
  onMapInteract, onVehicleClick,
  showAllManifests, dbTraffic, viewingManifestId
}) {
  const isDark = theme === 'dark';
  const textColor = isDark ? '#fff' : '#111';
  const subtextColor = isDark ? '#888' : '#555';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';

  const [history, setHistory] = useState({});
  const [hoverInfo, setHoverInfo] = useState(null);

  useEffect(() => {
    setHistory(prev => {
      const next = { ...prev };
      Object.values(telemetryData).forEach(position => {
        const vehicleId = position.vehicle_id;
        if (!vehicleId) return;
        if (!next[vehicleId]) next[vehicleId] = [];

        const altitude = Number(position.altitude) || 0;
        const last = next[vehicleId][next[vehicleId].length - 1];

        if (!last || last.lng !== position.longitude || last.lat !== position.latitude || last.alt !== altitude) {
          next[vehicleId] = [...next[vehicleId], { lng: position.longitude, lat: position.latitude, alt: altitude }];
          if (next[vehicleId].length > 40) next[vehicleId].shift();
        }
      });
      return next;
    });
  }, [telemetryData]);

  const is2D = viewState.pitch === 0;
  const isLOD = viewState.zoom < 13.5;

  const vehicleData = useMemo(() => {
    return Object.values(telemetryData).map(pos => {
      const vehicle = vehicleById[pos.vehicle_id];
      if (!vehicle) return null;
      const alt = Number(pos.altitude) || 0;
      const isAirborne = alt > 0;
      const mult = vehicle.dangerZoneMultiplier !== undefined ? vehicle.dangerZoneMultiplier : 10;
      const dangerRadius = Math.max(10, (pos.calculatedSpeed || 0) * mult);

      return {
        id: pos.vehicle_id,
        name: vehicle.name,
        pos: [pos.longitude, pos.latitude, is2D ? 0 : alt * Z_EXAGGERATION],
        groundPos: [pos.longitude, pos.latitude, 0],
        baseAlt: alt,
        calculatedSpeed: pos.calculatedSpeed || 0,
        dangerRadius: dangerRadius,
        isAirborne,
        color: hexToRgb(getVehicleColor(pos.vehicle_id))
      };
    }).filter(Boolean);
  }, [telemetryData, vehicleById, is2D]);

  const traceData = useMemo(() => {
    const data = [];
    Object.keys(activeTraces || {}).forEach(vId => {
      if (!activeTraces[vId] || !history[vId]) return;
      const rgb = hexToRgb(getVehicleColor(vId));
      const len = history[vId].length;
      history[vId].forEach((pt, i) => {
        const opacity = 0.4 + 0.6 * ((i + 1) / len);
        data.push({ pos: [pt.lng, pt.lat, is2D ? 0 : pt.alt * Z_EXAGGERATION], color: [...rgb, opacity * 255] });
      });
    });
    return data;
  }, [activeTraces, history, is2D]);

  const layers = [
    // Renders the chunked manifests. Highlights the one selected from the Dropdown.
    showAllManifests && new PathLayer({
      id: 'all-manifests-paths',
      data: dbTraffic.filter(p => p.path && p.path.length > 1),
      getPath: d => d.path.map(pt => [pt.longitude, pt.latitude, is2D ? 2 : Math.max(pt.altitude || 0, 0.2) * Z_EXAGGERATION]),
      getColor: d => d.manifestId === viewingManifestId ? [0, 255, 128, 255] : [0, 229, 255, 180],
      getWidth: d => d.manifestId === viewingManifestId ? 6 : 4,
      widthUnits: 'pixels',
      pickable: true,
      autoHighlight: true,
      highlightColor: [0, 255, 128, 255],
      onHover: info => setHoverInfo(info)
    }),

    traceData.length > 0 && new ScatterplotLayer({
      id: 'history-traces', data: traceData, getPosition: d => d.pos,
      getFillColor: d => d.color, getRadius: 6, radiusUnits: 'pixels', updateTriggers: { getFillColor: [traceData] }
    }),

    !is2D && !isLOD && new LineLayer({
      id: 'vertical-drop-lines', data: vehicleData.filter(v => v.isAirborne),
      getSourcePosition: d => d.groundPos, getTargetPosition: d => d.pos,
      getColor: [255, 255, 255, 120], getWidth: 1.5, widthUnits: 'pixels'
    }),

    // GROUND ZONES: billboard: false (lays flat on map)
    new ScatterplotLayer({
      id: 'ground-danger-zones', data: vehicleData.filter(v => !v.isAirborne),
      getPosition: d => d.pos, getFillColor: [255, 59, 48, 30], getLineColor: [255, 59, 48, 120],
      stroked: true, lineWidthMinPixels: 2, billboard: false,
      getRadius: d => d.dangerRadius, radiusUnits: 'meters', radiusMinPixels: 15
    }),

    // AIRBORNE ZONES: billboard: true (creates 3D Sphere effect, never tears the map)
    new ScatterplotLayer({
      id: 'airborne-danger-zones', data: vehicleData.filter(v => v.isAirborne),
      getPosition: d => d.pos, getFillColor: [255, 59, 48, 30], getLineColor: [255, 59, 48, 120],
      stroked: true, lineWidthMinPixels: 2, billboard: true,
      getRadius: d => d.dangerRadius, radiusUnits: 'meters', radiusMinPixels: 15
    }),

    selectedVehicle && new ScatterplotLayer({
      id: 'selected-highlight', data: vehicleData.filter(v => v.id === selectedVehicle),
      getPosition: d => d.pos, getFillColor: [0, 229, 255, 100], getLineColor: [0, 229, 255, 255],
      stroked: true, lineWidthMinPixels: 2, billboard: false, getRadius: 24, radiusUnits: 'pixels'
    }),

    // 2D VEHICLE ICONS
    new ScatterplotLayer({
      id: 'vehicle-marker-glyphs', data: vehicleData, getPosition: d => d.pos,
      getFillColor: d => d.color, getLineColor: [255, 255, 255, 255],
      lineWidthMinPixels: 2, stroked: true, billboard: false, pickable: true,
      getRadius: d => d.id === selectedVehicle ? 11 : 8, radiusUnits: 'pixels',
      onClick: ({ object }) => { if (object && onVehicleClick) onVehicleClick(object.id); },
      updateTriggers: { getRadius: [selectedVehicle] }
    }),

    !isLOD && new TextLayer({
      id: 'vehicle-labels', data: vehicleData, getPosition: d => [d.pos[0], d.pos[1], d.pos[2] + 20],
      getText: d => `${d.name} ${d.baseAlt > 0 ? d.baseAlt.toFixed(1) + 'm' : ''}`,
      getSize: 11, getColor: [255, 255, 255], getBackgroundColor: [18, 18, 22, 230],
      getBorderColor: d => [...d.color, 255], getBorderWidth: 1, background: true,
      backgroundPadding: [4, 4], pixelOffset: [0, -20], fontFamily: 'system-ui, sans-serif',
      fontWeight: 'bold', outlineWidth: 2, outlineColor: [0, 0, 0, 255],
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
      <div style={{ position: 'absolute', zIndex: 9999, left: hoverInfo.x + 15, top: hoverInfo.y + 15, background: isDark ? 'rgba(18, 18, 22, 0.95)' : 'rgba(255, 255, 255, 0.95)', color: textColor, border: `1px solid ${borderColor}`, padding: '12px', borderRadius: '8px', fontSize: '11px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)', pointerEvents: 'none' }}>
        <div style={{ fontWeight: '800', color: '#00E5FF', marginBottom: '6px', fontSize: '12px', textTransform: 'uppercase' }}>{name}</div>
        <div style={{ color: subtextColor, marginBottom: '8px', fontSize: '9px', fontFamily: 'monospace' }}>ID: {manifestId}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
          <span style={{ color: subtextColor }}>Vehicle:</span><strong style={{ textAlign: 'right' }}>{vehicleName}</strong>
          <span style={{ color: subtextColor }}>Start:</span><strong style={{ textAlign: 'right' }}>{start}</strong>
          <span style={{ color: subtextColor }}>End:</span><strong style={{ textAlign: 'right' }}>{end}</strong>
        </div>
      </div>
    );
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <DeckGL
        viewState={viewState} controller={{ dragRotate: true, scrollZoom: true, doubleClickZoom: false }}
        onViewStateChange={({ viewState: nextViewState, interactionState }) => {
          if (interactionState && (interactionState.isDragging || interactionState.isPanning || interactionState.isRotating || interactionState.isZooming)) {
            if (onMapInteract) onMapInteract();
          }
          setViewState(prev => ({ ...nextViewState, pitch: Math.max(0, Math.min(MAX_MAP_PITCH, nextViewState.pitch)) }));
        }}
        layers={layers}
        onClick={(info) => {
          if (!info.object) {
             setSelectedVehicle(null);
             if (onMapInteract) onMapInteract();
          }
        }}
        getCursor={({ isDragging, isHovering }) => isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'}
      >
        {showMapTiles && (
          <Map mapStyle={osmRasterStyle} reuseMaps>
            <NavigationControl position="top-left" visualizePitch={true} />
            {selectedVehicle && telemetryData[selectedVehicle] && (
              <Popup longitude={telemetryData[selectedVehicle].longitude} latitude={telemetryData[selectedVehicle].latitude} anchor="top" offset={[0, 10]} onClose={() => { setSelectedVehicle(null); if (onMapInteract) onMapInteract(); }} closeButton={false} className="webgl-popup">
                <div style={{ background: isDark ? 'rgba(18, 18, 22, 0.95)' : 'rgba(255, 255, 255, 0.95)', color: textColor, border: `1px solid ${borderColor}`, padding: '12px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', backdropFilter: 'blur(10px)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px' }}>
                    <b style={{ fontSize: '13px' }}>{vehicleById[selectedVehicle]?.name || selectedVehicle}</b>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <span style={{ fontSize: '12px', color: subtextColor, display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={11} strokeWidth={2} />{Number(telemetryData[selectedVehicle].altitude || 0).toFixed(1)}m</span>
                      <span style={{ fontSize: '12px', color: '#ff3b30', display: 'flex', alignItems: 'center', gap: '4px' }}><FastForward size={11} strokeWidth={2} />{Number(telemetryData[selectedVehicle].calculatedSpeed || 0).toFixed(1)} m/s</span>
                    </div>
                  </div>
                </div>
              </Popup>
            )}
          </Map>
        )}
      </DeckGL>
      {renderTooltip()}
    </div>
  );
}