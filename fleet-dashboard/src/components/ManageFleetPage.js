import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useNavigate } from 'react-router-dom';

import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

import {
  ArrowLeft,
  Plane,
  Truck,
  Sparkles,
  Send,
  Gauge,
  SatelliteDish,
  BatteryFull,
  BatteryMedium,
  BatteryLow,
  BatteryWarning,
  Route,
  Search,
  Camera,
  X,
  Layers,
  Navigation,
} from 'lucide-react';

import ThemeToggle from './ThemeToggle';
import { useTheme } from '../context/ThemeContext';
import FleetMap from './FleetMap';


/* =========================================================
   VEHICLE COLORS
   ========================================================= */

const VEHICLE_COLORS = [
  '#FF3366',
  '#00E5FF',
  '#00E676',
  '#FF9100',
  '#D500F9',
  '#FFEA00',
  '#2979FF',
];

export const getVehicleColor = (vId) => {
  let hash = 0;

  for (let i = 0; i < (vId || '').length; i++) {
    hash =
      vId.charCodeAt(i) +
      ((hash << 5) - hash);
  }

  return VEHICLE_COLORS[
    Math.abs(hash) % VEHICLE_COLORS.length
  ];
};


/* =========================================================
   BATTERY ICON
   ========================================================= */

function BatteryIcon({ level }) {
  if (
    level === undefined ||
    level === null
  ) {
    return (
      <Gauge
        size={13}
        strokeWidth={2}
      />
    );
  }

  if (level < 15) {
    return (
      <BatteryWarning
        size={13}
        strokeWidth={2}
      />
    );
  }

  if (level < 40) {
    return (
      <BatteryLow
        size={13}
        strokeWidth={2}
      />
    );
  }

  if (level < 80) {
    return (
      <BatteryMedium
        size={13}
        strokeWidth={2}
      />
    );
  }

  return (
    <BatteryFull
      size={13}
      strokeWidth={2}
    />
  );
}


/* =========================================================
   BEARING HELPERS
   ========================================================= */

function normalizeBearing(value) {
  return (
    ((Number(value) % 360) + 360) % 360
  );
}


function formatBearing(value) {
  return Math.round(
    normalizeBearing(value)
  )
    .toString()
    .padStart(3, '0');
}


function getHeadingLabel(value) {
  const heading =
    normalizeBearing(value);

  const directions = [
    'N',
    'NE',
    'E',
    'SE',
    'S',
    'SW',
    'W',
    'NW',
  ];

  return directions[
    Math.round(heading / 45) % 8
  ];
}


function isBearingActive(
  current,
  target
) {
  const a =
    normalizeBearing(current);

  const b =
    normalizeBearing(target);

  const difference = Math.abs(a - b);

  return (
    difference < 2 ||
    difference > 358
  );
}


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
  const compassRef = React.useRef(null);

  const [isDragging, setIsDragging] =
    useState(false);


  const getBearingFromPointer = (
    event
  ) => {
    if (!compassRef.current) {
      return bearing;
    }

    const rect =
      compassRef.current.getBoundingClientRect();

    const centerX =
      rect.left + rect.width / 2;

    const centerY =
      rect.top + rect.height / 2;

    const dx =
      event.clientX - centerX;

    const dy =
      event.clientY - centerY;

    /*
      atan2(dx, -dy) gives:

      0°   = North
      90°  = East
      180° = South
      -90° = West
    */

    let angle =
      Math.atan2(dx, -dy) *
      (180 / Math.PI);

    if (angle > 180) {
      angle -= 360;
    }

    if (angle < -180) {
      angle += 360;
    }

    return Math.round(angle);
  };


  const handlePointerDown = (
    event
  ) => {
    event.preventDefault();

    compassRef.current?.setPointerCapture(
      event.pointerId
    );

    setIsDragging(true);

    setBearing(
      getBearingFromPointer(event)
    );
  };


  const handlePointerMove = (
    event
  ) => {
    if (!isDragging) {
      return;
    }

    setBearing(
      getBearingFromPointer(event)
    );
  };


  const handlePointerUp = () => {
    setIsDragging(false);
  };


  const normalized =
    normalizeBearing(bearing);


  /*
    Dial markings.

    The dial itself rotates opposite
    to the selected map bearing.

    This means the selected heading
    always comes to the fixed top pointer.
  */

  const ticks = Array.from(
    { length: 72 },
    (_, index) => index * 5
  );


  const cardinalPoints = [
    {
      label: 'N',
      angle: 0,
      color: '#f72585',
    },
    {
      label: 'E',
      angle: 90,
      color: '#4cc9f0',
    },
    {
      label: 'S',
      angle: 180,
      color: '#4895ef',
    },
    {
      label: 'W',
      angle: 270,
      color: '#3a0ca3',
    },
  ];


  const intermediatePoints = [
    {
      label: 'NE',
      angle: 45,
    },
    {
      label: 'SE',
      angle: 135,
    },
    {
      label: 'SW',
      angle: 225,
    },
    {
      label: 'NW',
      angle: 315,
    },
  ];


  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2px 0 0',
      }}
    >
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
          cursor: isDragging
            ? 'grabbing'
            : 'grab',
          touchAction: 'none',
          userSelect: 'none',
          background: isDark
            ? 'radial-gradient(circle at center, rgba(255,255,255,0.065), rgba(255,255,255,0.015) 58%, rgba(0,0,0,0.22))'
            : 'radial-gradient(circle at center, rgba(0,0,0,0.035), rgba(0,0,0,0.01) 58%, rgba(0,0,0,0.055))',
          border: `1px solid ${borderColor}`,
          boxShadow:
            'inset 0 0 30px rgba(0,0,0,0.12), 0 10px 25px rgba(0,0,0,0.10)',
          overflow: 'hidden',
        }}
      >

        {/* =================================================
            ROTATING COMPASS DIAL
           ================================================= */}

        <div
          style={{
            position: 'absolute',
            inset: '7px',
            borderRadius: '50%',
            transform:
              `rotate(${-normalized}deg)`,
            transition: isDragging
              ? 'none'
              : 'transform 160ms ease-out',
          }}
        >

          {/* OUTER RING */}

          <div
            style={{
              position: 'absolute',
              inset: '2px',
              borderRadius: '50%',
              border: `1px solid ${borderColor}`,
            }}
          />


          {/* TICKS */}

          {ticks.map((angle) => {
            const isMajor =
              angle % 30 === 0;

            const isMedium =
              angle % 10 === 0;

            return (
              <div
                key={angle}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: isMajor
                    ? '2px'
                    : '1px',
                  height: isMajor
                    ? '10px'
                    : isMedium
                      ? '7px'
                      : '4px',
                  borderRadius: '2px',
                  background:
                    isMajor
                      ? subtextColor
                      : `${subtextColor}75`,
                  transformOrigin:
                    '50% 94px',
                  transform:
                    `translate(-50%, -94px) rotate(${angle}deg)`,
                }}
              />
            );
          })}


          {/* CARDINAL DIRECTIONS */}

          {cardinalPoints.map(
            ({
              label,
              angle,
              color,
            }) => {
              const radians =
                (angle * Math.PI) / 180;

              const radius = 76;

              const x =
                Math.sin(radians) *
                radius;

              const y =
                -Math.cos(radians) *
                radius;

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
                    transform:
                      `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${normalized}deg)`,
                    fontSize:
                      label === 'N'
                        ? '16px'
                        : '13px',
                    fontWeight: '800',
                    color,
                    textShadow:
                      `0 0 8px ${color}55`,
                  }}
                >
                  {label}
                </div>
              );
            }
          )}


          {/* INTERMEDIATE DIRECTIONS */}

          {intermediatePoints.map(
            ({
              label,
              angle,
            }) => {
              const radians =
                (angle * Math.PI) / 180;

              const radius = 78;

              const x =
                Math.sin(radians) *
                radius;

              const y =
                -Math.cos(radians) *
                radius;

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
                    transform:
                      `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${normalized}deg)`,
                    fontSize: '8px',
                    fontWeight: '700',
                    color: subtextColor,
                    opacity: 0.8,
                  }}
                >
                  {label}
                </div>
              );
            }
          )}


          {/* DEGREE MARKERS */}

          {[0, 90, 180, 270].map(
            (angle) => {
              const radians =
                (angle * Math.PI) / 180;

              const radius = 53;

              const x =
                Math.sin(radians) *
                radius;

              const y =
                -Math.cos(radians) *
                radius;

              return (
                <div
                  key={angle}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform:
                      `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${normalized}deg)`,
                    fontSize: '7px',
                    color: subtextColor,
                    opacity: 0.55,
                  }}
                >
                  {angle}°
                </div>
              );
            }
          )}
        </div>


        {/* =================================================
            FIXED HEADING POINTER
           ================================================= */}

        <div
          style={{
            position: 'absolute',
            top: '4px',
            left: '50%',
            transform:
              'translateX(-50%)',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft:
                '7px solid transparent',
              borderRight:
                '7px solid transparent',
              borderTop:
                '14px solid #f72585',
              filter:
                'drop-shadow(0 0 6px rgba(247,37,133,0.75))',
            }}
          />
        </div>


        {/* =================================================
            CENTER CAMERA / VEHICLE ICON
           ================================================= */}

        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '60px',
            height: '60px',
            transform:
              'translate(-50%, -50%)',
            borderRadius: '50%',
            background: isDark
              ? 'rgba(8,10,15,0.92)'
              : 'rgba(255,255,255,0.94)',
            border:
              `1px solid ${borderColor}`,
            boxShadow:
              '0 7px 22px rgba(0,0,0,0.24)',
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
              transform:
                `rotate(${bearing-45}deg)`,
              transition: isDragging
                ? 'none'
                : 'transform 120ms ease-out',
              filter:
                'drop-shadow(0 0 7px rgba(0,229,255,0.65))',
            }}
          />
        </div>


        {/* CENTER DOT */}

        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '5px',
            height: '5px',
            transform:
              'translate(-50%, -50%)',
            borderRadius: '50%',
            background: '#fff',
            boxShadow:
              '0 0 9px rgba(255,255,255,0.9)',
            zIndex: 12,
            pointerEvents: 'none',
          }}
        />


        {/* TOP HEADING LABEL */}

        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '22px',
            transform:
              'translateX(-50%)',
            zIndex: 11,
            pointerEvents: 'none',
            fontSize: '7px',
            letterSpacing: '1px',
            fontWeight: '700',
            color: '#f72585',
            opacity: 0.85,
          }}
        >
          HEADING
        </div>
      </div>
    </div>
  );
}


/* =========================================================
   MAIN PAGE
   ========================================================= */

export default function ManageFleetPage() {
  const navigate = useNavigate();

  const { theme } = useTheme();


  /* =======================================================
     FLEET STATE
     ======================================================= */

  const [vehicles, setVehicles] =
    useState([]);

  const [telemetryData, setTelemetryData] =
    useState({});

  const [command, setCommand] =
    useState('');

  const [selectedVehicle, setSelectedVehicle] =
    useState(null);

  const [activeTraces, setActiveTraces] =
    useState({});


  /* =======================================================
     UI STATE
     ======================================================= */

  const [searchQuery, setSearchQuery] =
    useState('');

  const [
    isSidebarMinimized,
    setIsSidebarMinimized,
  ] = useState(false);

  const [
    isHudExpanded,
    setIsHudExpanded,
  ] = useState(true);


  /* =======================================================
     CAMERA STATE

     SINGLE SOURCE OF TRUTH
     ======================================================= */

  const [pitch, setPitch] =
    useState(60);

  const [bearing, setBearing] =
    useState(-20);


  /* =======================================================
     TELEMETRY CONNECTION
     ======================================================= */

  useEffect(() => {
    const socket =
      new SockJS(
        'http://localhost:8080/ws-telemetry'
      );

    const stompClient =
      new Client({
        webSocketFactory: () =>
          socket,

        onConnect: () => {
          fetch(
            'http://localhost:8080/api/fleet/vehicles'
          )
            .then((res) => res.json())
            .then((data) => {
              setVehicles(data);

              data.forEach((vehicle) => {
                stompClient.subscribe(
                  `/topic/telemetry.${vehicle.id}.position`,
                  (message) => {
                    const payload =
                      JSON.parse(
                        message.body
                      );

                    setTelemetryData(
                      (prev) => ({
                        ...prev,
                        [payload.vehicle_id]:
                          payload,
                      })
                    );
                  }
                );
              });
            })
            .catch((err) => {
              console.error(
                'Error fetching vehicles:',
                err
              );
            });
        },
      });

    stompClient.activate();

    return () => {
      stompClient.deactivate();
    };
  }, []);


  /* =======================================================
     COMMAND BAR
     ======================================================= */

  const handleCommandSubmit = (e) => {
    e.preventDefault();

    if (!command.trim()) {
      return;
    }

    console.log(
      'Command submitted:',
      command
    );

    setCommand('');
  };


  /* =======================================================
     VEHICLE MAP
     ======================================================= */

  const vehicleById = useMemo(() => {
    const map = {};

    vehicles.forEach((vehicle) => {
      map[vehicle.id] = vehicle;
    });

    return map;
  }, [vehicles]);


  const filteredVehicles =
    vehicles.filter((vehicle) => {
      const name =
        vehicle.name?.toLowerCase() || '';

      const id =
        vehicle.id?.toLowerCase() || '';

      const query =
        searchQuery.toLowerCase();

      return (
        name.includes(query) ||
        id.includes(query)
      );
    });


  const activeCount =
    Object.keys(telemetryData).length;


  /* =======================================================
     THEME
     ======================================================= */

  const isDark =
    theme === 'dark';

  const hudBg = isDark
    ? 'var(--bg-glass, rgba(18, 18, 22, 0.95))'
    : 'rgba(255, 255, 255, 0.95)';

  const textColor =
    isDark ? '#fff' : '#111';

  const subtextColor =
    isDark ? '#888' : '#555';

  const borderColor = isDark
    ? 'rgba(255,255,255,0.08)'
    : 'rgba(0,0,0,0.1)';

  const btnBg = isDark
    ? 'rgba(255,255,255,0.05)'
    : 'rgba(0,0,0,0.04)';


  /* =======================================================
     CAMERA COLORS
     ======================================================= */

  const controlColors = {
    flat2D: '#00b4d8',
    view3D: '#7209b7',
    north: '#f72585',
    east: '#4cc9f0',
    south: '#4895ef',
    west: '#3a0ca3',
  };


  /* =======================================================
     BUTTON STYLE
     ======================================================= */

  const getColoredBtnStyle = (
    isActive,
    activeColor
  ) => ({
    flex: 1,

    background:
      isActive
        ? activeColor
        : btnBg,

    border:
      `1px solid ${
        isActive
          ? activeColor
          : borderColor
      }`,

    borderRadius: '7px',

    color:
      isActive
        ? '#fff'
        : subtextColor,

    fontSize: '11px',

    padding:
      '7px 0',

    cursor:
      'pointer',

    textTransform:
      'uppercase',

    fontWeight:
      '700',

    transition:
      'all 0.2s ease',

    boxShadow:
      isActive
        ? `0 4px 12px ${activeColor}50`
        : 'none',
  });


  return (
    <div
      className="fleet-shell page-enter"
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
      }}
    >

      {/* =================================================
          FULL MAP
         ================================================= */}

      <div
        className="map-panel"
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
        }}
      >

        <FleetMap
          telemetryData={
            telemetryData
          }

          vehicleById={
            vehicleById
          }

          theme={theme}

          selectedVehicle={
            selectedVehicle
          }

          setSelectedVehicle={
            setSelectedVehicle
          }

          activeTraces={
            activeTraces
          }

          /*
           * CAMERA STATE
           */
          pitch={pitch}
          bearing={bearing}
          setPitch={setPitch}
          setBearing={setBearing}
        />


        {/* =================================================
            LEFT SIDEBAR
           ================================================= */}

        {!isSidebarMinimized ? (
          <div
            style={{
              position: 'absolute',
              top: '20px',
              left: '20px',

              background:
                hudBg,

              backdropFilter:
                'blur(15px)',

              border:
                `1px solid ${borderColor}`,

              borderRadius:
                '16px',

              color:
                textColor,

              boxShadow:
                '0 20px 40px rgba(0,0,0,0.15)',

              zIndex:
                10,

              width:
                '360px',

              maxHeight:
                'calc(100vh - 100px)',

              display:
                'flex',

              flexDirection:
                'column',
            }}
          >

            {/* HEADER */}

            <div
              style={{
                padding:
                  '16px 20px',

                borderBottom:
                  `1px solid ${borderColor}`,

                display:
                  'flex',

                justifyContent:
                  'space-between',

                alignItems:
                  'center',
              }}
            >

              <button
                type="button"
                onClick={() =>
                  navigate('/')
                }
                style={{
                  background:
                    'none',

                  border:
                    'none',

                  color:
                    textColor,

                  cursor:
                    'pointer',

                  display:
                    'flex',

                  alignItems:
                    'center',

                  gap:
                    '6px',

                  fontSize:
                    '13px',

                  padding:
                    0,
                }}
              >
                <ArrowLeft
                  size={14}
                />

                Portal
              </button>


              <div
                style={{
                  display:
                    'flex',

                  alignItems:
                    'center',

                  gap:
                    '12px',
                }}
              >

                <ThemeToggle />

                <X
                  size={18}
                  color={
                    subtextColor
                  }
                  style={{
                    cursor:
                      'pointer',
                  }}
                  onClick={() =>
                    setIsSidebarMinimized(
                      true
                    )
                  }
                />

              </div>
            </div>


            {/* TITLE + SEARCH */}

            <div
              style={{
                padding:
                  '16px 20px 0',
              }}
            >

              <h2
                style={{
                  margin:
                    0,

                  fontSize:
                    '16px',

                  fontWeight:
                    '700',
                }}
              >
                Fleet Orchestrator
              </h2>


              <p
                style={{
                  margin:
                    '4px 0 12px',

                  fontSize:
                    '12px',

                  color:
                    subtextColor,
                }}
              >
                Live Telemetry &amp; Control
              </p>


              <div
                style={{
                  position:
                    'relative',

                  display:
                    'flex',

                  alignItems:
                    'center',

                  marginBottom:
                    '12px',
                }}
              >

                <Search
                  size={14}
                  color={
                    subtextColor
                  }
                  style={{
                    position:
                      'absolute',

                    left:
                      '12px',
                  }}
                />


                <input
                  type="text"
                  placeholder="Search fleet vehicles..."
                  value={
                    searchQuery
                  }
                  onChange={(e) =>
                    setSearchQuery(
                      e.target.value
                    )
                  }
                  style={{
                    width:
                      '100%',

                    background:
                      isDark
                        ? '#22222c'
                        : '#ffffff',

                    color:
                      textColor,

                    border:
                      `1px solid ${borderColor}`,

                    borderRadius:
                      '8px',

                    padding:
                      '8px 10px 8px 34px',

                    fontSize:
                      '13px',

                    outline:
                      'none',
                  }}
                />

              </div>


              {vehicles.length > 0 && (
                <div
                  style={{
                    fontSize:
                      '12px',

                    color:
                      subtextColor,

                    marginBottom:
                      '12px',

                    display:
                      'flex',

                    gap:
                      '6px',
                  }}
                >

                  <span>
                    <b>
                      {
                        vehicles.length
                      }
                    </b>{' '}
                    registered
                  </span>

                  <span>·</span>

                  <span
                    style={{
                      color:
                        '#00E676',

                      fontWeight:
                        '600',
                    }}
                  >
                    <b>
                      {
                        activeCount
                      }
                    </b>{' '}
                    active
                  </span>

                </div>
              )}

            </div>


            {/* VEHICLE LIST */}

            <div
              style={{
                flex:
                  1,

                overflowY:
                  'auto',

                padding:
                  '0 20px 20px',

                maxHeight:
                  'calc(100vh - 280px)',
              }}
            >

              {filteredVehicles.length === 0 ? (
                <div
                  style={{
                    padding:
                      '20px 0',

                    textAlign:
                      'center',

                    color:
                      subtextColor,
                  }}
                >
                  <SatelliteDish
                    size={28}
                    strokeWidth={1.5}
                    style={{
                      margin:
                        '0 auto 8px',
                    }}
                  />

                  <p
                    style={{
                      fontSize:
                        '13px',

                      margin:
                        0,
                    }}
                  >
                    No matching vehicles found...
                  </p>
                </div>
              ) : (
                filteredVehicles.map(
                  (vehicle) => {
                    const live =
                      telemetryData[
                        vehicle.id
                      ] || {};

                    const isOnline =
                      !!live.latitude;

                    const isGround =
                      vehicle.category ===
                      'GROUND';

                    const isSelected =
                      selectedVehicle ===
                      vehicle.id;

                    const vColor =
                      getVehicleColor(
                        vehicle.id
                      );

                    return (
                      <div
                        key={
                          vehicle.id
                        }
                        onClick={() =>
                          setSelectedVehicle(
                            vehicle.id
                          )
                        }
                        style={{
                          marginBottom:
                            '12px',

                          padding:
                            '12px',

                          borderRadius:
                            '10px',

                          background:
                            isDark
                              ? 'rgba(255,255,255,0.03)'
                              : 'rgba(0,0,0,0.02)',

                          border:
                            `1px solid ${
                              isSelected
                                ? vColor
                                : borderColor
                            }`,

                          cursor:
                            'pointer',
                        }}
                      >

                        {/* CARD TOP */}

                        <div
                          style={{
                            display:
                              'flex',

                            justifyContent:
                              'space-between',

                            alignItems:
                              'center',

                            marginBottom:
                              '8px',
                          }}
                        >

                          <div
                            style={{
                              display:
                                'flex',

                              alignItems:
                                'center',

                              gap:
                                '10px',
                            }}
                          >

                            <div
                              style={{
                                width:
                                  '28px',

                                height:
                                  '28px',

                                borderRadius:
                                  '6px',

                                display:
                                  'flex',

                                alignItems:
                                  'center',

                                justifyContent:
                                  'center',

                                background:
                                  vColor,

                                color:
                                  '#000',

                                boxShadow:
                                  `0 0 10px ${vColor}40`,
                              }}
                            >
                              {isGround ? (
                                <Truck
                                  size={14}
                                  strokeWidth={
                                    1.75
                                  }
                                />
                              ) : (
                                <Plane
                                  size={14}
                                  strokeWidth={
                                    1.75
                                  }
                                />
                              )}
                            </div>


                            <div>

                              <h4
                                style={{
                                  margin:
                                    0,

                                  fontSize:
                                    '13px',

                                  color:
                                    textColor,
                                }}
                              >
                                {
                                  vehicle.name
                                }
                              </h4>

                              <span
                                style={{
                                  fontSize:
                                    '10px',

                                  color:
                                    subtextColor,

                                  textTransform:
                                    'uppercase',
                                }}
                              >
                                {
                                  vehicle.category ||
                                  'UAV'
                                }
                              </span>

                            </div>

                          </div>


                          <div
                            style={{
                              fontSize:
                                '11px',

                              display:
                                'flex',

                              alignItems:
                                'center',

                              gap:
                                '4px',
                            }}
                          >

                            <span
                              style={{
                                width:
                                  '6px',

                                height:
                                  '6px',

                                borderRadius:
                                  '50%',

                                background:
                                  isOnline
                                    ? '#00E676'
                                    : '#888',
                              }}
                            />

                            {
                              isOnline
                                ? 'Active'
                                : 'Offline'
                            }

                          </div>

                        </div>


                        {/* TELEMETRY */}

                        <div
                          style={{
                            display:
                              'grid',

                            gridTemplateColumns:
                              '1fr 1fr',

                            gap:
                              '8px',

                            fontSize:
                              '12px',
                          }}
                        >

                          <div>

                            <p
                              style={{
                                margin:
                                  0,

                                color:
                                  subtextColor,

                                fontSize:
                                  '10px',

                                textTransform:
                                  'uppercase',
                              }}
                            >
                              Latitude
                            </p>

                            <p
                              style={{
                                margin:
                                  0,

                                fontWeight:
                                  '600',
                              }}
                            >
                              {
                                typeof live.latitude ===
                                'number'
                                  ? live.latitude.toFixed(
                                      5
                                    )
                                  : '—'
                              }
                            </p>

                          </div>


                          <div>

                            <p
                              style={{
                                margin:
                                  0,

                                color:
                                  subtextColor,

                                fontSize:
                                  '10px',

                                textTransform:
                                  'uppercase',
                              }}
                            >
                              Longitude
                            </p>

                            <p
                              style={{
                                margin:
                                  0,

                                fontWeight:
                                  '600',
                              }}
                            >
                              {
                                typeof live.longitude ===
                                'number'
                                  ? live.longitude.toFixed(
                                      5
                                    )
                                  : '—'
                              }
                            </p>

                          </div>

                        </div>


                        {/* TRACE / HISTORY */}

                        <div
                          onClick={(e) =>
                            e.stopPropagation()
                          }
                          style={{
                            marginTop:
                              '10px',

                            paddingTop:
                              '8px',

                            borderTop:
                              `1px solid ${borderColor}`,

                            display:
                              'flex',

                            alignItems:
                              'center',

                            justifyContent:
                              'space-between',
                          }}
                        >

                          <label
                            style={{
                              fontSize:
                                '11px',

                              display:
                                'flex',

                              alignItems:
                                'center',

                              gap:
                                '6px',

                              cursor:
                                'pointer',

                              color:
                                textColor,

                              fontWeight:
                                '500',
                            }}
                          >

                            <input
                              type="checkbox"
                              checked={
                                !!activeTraces[
                                  vehicle.id
                                ]
                              }
                              onChange={() =>
                                setActiveTraces(
                                  (prev) => ({
                                    ...prev,
                                    [vehicle.id]:
                                      !prev[
                                        vehicle.id
                                      ],
                                  })
                                )
                              }
                              style={{
                                accentColor:
                                  vColor,
                                cursor:
                                  'pointer',
                              }}
                            />

                            <Route
                              size={12}
                              color={
                                vColor
                              }
                            />

                            Trace

                          </label>


                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/vehicle/${vehicle.id}`
                              )
                            }
                            style={{
                              background:
                                'transparent',

                              border:
                                `1px solid ${vColor}50`,

                              color:
                                vColor,

                              padding:
                                '3px 8px',

                              borderRadius:
                                '4px',

                              fontSize:
                                '10px',

                              fontWeight:
                                '600',

                              cursor:
                                'pointer',

                              textTransform:
                                'uppercase',
                            }}
                          >
                            History
                          </button>

                        </div>

                      </div>
                    );
                  }
                )
              )}

            </div>

          </div>
        ) : (

          /* MINIMIZED SIDEBAR */

          <div
            onClick={() =>
              setIsSidebarMinimized(
                false
              )
            }
            title="Open Fleet Orchestrator"
            style={{
              position:
                'absolute',

              top:
                '20px',

              left:
                '20px',

              background:
                hudBg,

              border:
                `1px solid ${borderColor}`,

              borderRadius:
                '50%',

              width:
                '44px',

              height:
                '44px',

              display:
                'flex',

              justifyContent:
                'center',

              alignItems:
                'center',

              cursor:
                'pointer',

              boxShadow:
                '0 4px 12px rgba(0,0,0,0.15)',

              zIndex:
                10,

              color:
                textColor,
            }}
          >
            <SatelliteDish
              size={20}
            />
          </div>
        )}


        {/* =================================================
            CAMERA HUD
           ================================================= */}

        {isHudExpanded ? (
          <div
            style={{
              position:
                'absolute',

              top:
                '20px',

              right:
                '20px',

              background:
                hudBg,

              backdropFilter:
                'blur(15px)',

              border:
                `1px solid ${borderColor}`,

              borderRadius:
                '16px',

              padding:
                '20px',

              color:
                textColor,

              boxShadow:
                '0 20px 40px rgba(0,0,0,0.15)',

              zIndex:
                10,

              display:
                'flex',

              flexDirection:
                'column',

              gap:
                '18px',

              width:
                '270px',
            }}
          >

            {/* HUD HEADER */}

            <div
              style={{
                display:
                  'flex',

                justifyContent:
                  'space-between',

                alignItems:
                  'center',
              }}
            >

              <span
                style={{
                  fontSize:
                    '13px',

                  fontWeight:
                    '600',

                  textTransform:
                    'uppercase',

                  letterSpacing:
                    '1px',

                  color:
                    subtextColor,
                }}
              >
                Camera Settings
              </span>


              <X
                size={18}
                color={
                  subtextColor
                }
                style={{
                  cursor:
                    'pointer',
                }}
                onClick={() =>
                  setIsHudExpanded(
                    false
                  )
                }
              />

            </div>


            {/* =================================================
                PITCH
               ================================================= */}

            <div>

              <div
                style={{
                  display:
                    'flex',

                  alignItems:
                    'center',

                  gap:
                    '14px',

                  marginBottom:
                    '10px',
                }}
              >

                <div
                  style={{
                    width:
                      '38px',

                    height:
                      '38px',

                    borderRadius:
                      '10px',

                    background:
                      btnBg,

                    border:
                      `1px solid ${borderColor}`,

                    display:
                      'flex',

                    justifyContent:
                      'center',

                    alignItems:
                      'center',

                    perspective:
                      '100px',
                  }}
                >

                  <Layers
                    size={20}
                    color={
                      controlColors.view3D
                    }
                    style={{
                      transform:
                        `rotateX(${pitch}deg)`,

                      transformStyle:
                        'preserve-3d',

                      transition:
                        'transform 0.2s ease',
                    }}
                  />

                </div>


                <div>

                  <div
                    style={{
                      fontSize:
                        '10px',

                      textTransform:
                        'uppercase',

                      letterSpacing:
                        '1px',

                      color:
                        subtextColor,
                    }}
                  >
                    Pitch Angle
                  </div>

                  <div
                    style={{
                      fontSize:
                        '15px',

                      fontWeight:
                        '600',
                    }}
                  >
                    {
                      Math.round(
                        pitch
                      )
                    }°
                  </div>

                </div>

              </div>


              <input
                type="range"
                min="0"
                max="85"
                value={pitch}
                onChange={(e) =>
                  setPitch(
                    Number(
                      e.target.value
                    )
                  )
                }
                style={{
                  width:
                    '100%',

                  cursor:
                    'pointer',

                  accentColor:
                    controlColors.view3D,

                  marginBottom:
                    '8px',
                }}
              />


              <div
                style={{
                  display:
                    'flex',

                  gap:
                    '8px',
                }}
              >

                <button
                  type="button"
                  style={getColoredBtnStyle(
                    pitch < 2,
                    controlColors.flat2D
                  )}
                  onClick={() =>
                    setPitch(0)
                  }
                >
                  2D Flat
                </button>


                <button
                  type="button"
                  style={getColoredBtnStyle(
                    Math.abs(
                      pitch - 65
                    ) < 2,
                    controlColors.view3D
                  )}
                  onClick={() =>
                    setPitch(65)
                  }
                >
                  3D View
                </button>

              </div>

            </div>


            <div
              style={{
                height:
                  '1px',

                background:
                  borderColor,
              }}
            />


            {/* =================================================
                HEADING
               ================================================= */}

            <div>

              <div
                style={{
                  display:
                    'flex',

                  alignItems:
                    'center',

                  justifyContent:
                    'space-between',

                  marginBottom:
                    '2px',
                }}
              >

                <div>

                  <div
                    style={{
                      fontSize:
                        '10px',

                      textTransform:
                        'uppercase',

                      letterSpacing:
                        '1px',

                      color:
                        subtextColor,
                    }}
                  >
                    Heading
                  </div>

                  <div
                    style={{
                      fontSize:
                        '15px',

                      fontWeight:
                        '600',

                      marginTop:
                        '2px',
                    }}
                  >
                    {
                      getHeadingLabel(
                        bearing
                      )
                    }
                  </div>

                </div>


                <div
                  style={{
                    fontSize:
                      '15px',

                    fontWeight:
                      '700',

                    fontVariantNumeric:
                      'tabular-nums',

                    letterSpacing:
                      '0.5px',
                  }}
                >
                  {
                    formatBearing(
                      bearing
                    )
                  }°
                </div>

              </div>


              {/* ROTATING COMPASS */}

              <RotatingCompass
                bearing={
                  bearing
                }
                setBearing={
                  setBearing
                }
                textColor={
                  textColor
                }
                subtextColor={
                  subtextColor
                }
                borderColor={
                  borderColor
                }
                isDark={
                  isDark
                }
              />


              {/* CARDINAL PRESETS */}

              <div
                style={{
                  display:
                    'grid',

                  gridTemplateColumns:
                    'repeat(4, 1fr)',

                  gap:
                    '6px',

                  marginTop:
                    '10px',
                }}
              >

                <button
                  type="button"
                  style={getColoredBtnStyle(
                    isBearingActive(
                      bearing,
                      0
                    ),
                    controlColors.north
                  )}
                  onClick={() =>
                    setBearing(0)
                  }
                >
                  N
                </button>


                <button
                  type="button"
                  style={getColoredBtnStyle(
                    isBearingActive(
                      bearing,
                      -90
                    ),
                    controlColors.west
                  )}
                  onClick={() =>
                    setBearing(-90)
                  }
                >
                  W
                </button>


                <button
                  type="button"
                  style={getColoredBtnStyle(
                    isBearingActive(
                      bearing,
                      90
                    ),
                    controlColors.east
                  )}
                  onClick={() =>
                    setBearing(90)
                  }
                >
                  E
                </button>


                <button
                  type="button"
                  style={getColoredBtnStyle(
                    isBearingActive(
                      bearing,
                      180
                    ),
                    controlColors.south
                  )}
                  onClick={() =>
                    setBearing(180)
                  }
                >
                  S
                </button>

              </div>


              <div
                style={{
                  textAlign:
                    'center',

                  fontSize:
                    '9px',

                  color:
                    subtextColor,

                  marginTop:
                    '8px',

                  opacity:
                    0.7,

                  letterSpacing:
                    '0.3px',
                }}
              >
                Drag the compass to rotate the map
              </div>

            </div>

          </div>
        ) : (

          /* COLLAPSED HUD */

          <div
            onClick={() =>
              setIsHudExpanded(
                true
              )
            }
            style={{
              position:
                'absolute',

              top:
                '20px',

              right:
                '20px',

              background:
                hudBg,

              border:
                `1px solid ${borderColor}`,

              borderRadius:
                '50%',

              width:
                '44px',

              height:
                '44px',

              display:
                'flex',

              justifyContent:
                'center',

              alignItems:
                'center',

              cursor:
                'pointer',

              boxShadow:
                '0 4px 12px rgba(0,0,0,0.15)',

              zIndex:
                10,

              color:
                textColor,
            }}
          >
            <Camera
              size={20}
            />
          </div>
        )}


        {/* =================================================
            COMMAND BAR
           ================================================= */}

        <div className="command-bar-wrap">

          <form
            onSubmit={
              handleCommandSubmit
            }
            className="command-bar"
          >

            <Sparkles
              size={16}
              strokeWidth={2}
              className="command-bar-icon"
            />


            <input
              type="text"
              value={command}
              onChange={(e) =>
                setCommand(
                  e.target.value
                )
              }
              placeholder="Ask the AI to orchestrate the fleet (e.g., 'Deploy Alpha to grid sector 4')"
            />


            <button
              type="submit"
              className="btn btn-primary btn-compact"
            >
              Dispatch

              <Send
                size={14}
                strokeWidth={2}
              />
            </button>

          </form>

        </div>

      </div>
    </div>
  );
}