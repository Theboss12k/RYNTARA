import React, {
  useEffect,
  useState,
  useMemo,
  useRef,
} from 'react';

import {
  useParams,
  useNavigate,
} from 'react-router-dom';

import Map, {
  Marker,
  NavigationControl,
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
} from 'lucide-react';

import {
  useTheme,
} from '../context/ThemeContext';

import {
  getVehicleColor,
} from './ManageFleetPage';


/* =========================================================
   CAMERA HELPERS
   ========================================================= */

const normalizeBearing = (value) => {
  return (
    ((Number(value) % 360) + 360) % 360
  );
};


const formatBearing = (value) => {
  return Math.round(
    normalizeBearing(value)
  )
    .toString()
    .padStart(3, '0');
};


const getHeadingLabel = (value) => {
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
    Math.round(
      normalizeBearing(value) / 45
    ) % 8
  ];
};


const isAngleActive = (
  current,
  target
) => {
  const a =
    normalizeBearing(current);

  const b =
    normalizeBearing(target);

  const difference =
    Math.abs(a - b);

  return (
    difference < 2 ||
    difference > 358
  );
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
  const compassRef =
    useRef(null);

  const [
    isDragging,
    setIsDragging,
  ] = useState(false);


  const getBearingFromPointer = (
    event
  ) => {
    if (!compassRef.current) {
      return bearing;
    }

    const rect =
      compassRef.current.getBoundingClientRect();

    const centerX =
      rect.left +
      rect.width / 2;

    const centerY =
      rect.top +
      rect.height / 2;

    const dx =
      event.clientX - centerX;

    const dy =
      event.clientY - centerY;

    /*
     * atan2(dx, -dy)
     *
     * 0°   = North
     * 90°  = East
     * 180° = South
     * -90° = West
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
        paddingTop: '2px',
      }}
    >

      <div
        ref={compassRef}

        onPointerDown={
          handlePointerDown
        }

        onPointerMove={
          handlePointerMove
        }

        onPointerUp={
          handlePointerUp
        }

        onPointerCancel={
          handlePointerUp
        }

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

          border:
            `1px solid ${borderColor}`,

          boxShadow:
            'inset 0 0 30px rgba(0,0,0,0.12), 0 10px 25px rgba(0,0,0,0.10)',

          overflow: 'hidden',
        }}
      >

        {/* =================================================
            ROTATING DIAL
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
              border:
                `1px solid ${borderColor}`,
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

                  width:
                    isMajor
                      ? '2px'
                      : '1px',

                  height:
                    isMajor
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


          {/* CARDINALS */}

          {cardinalPoints.map(
            ({
              label,
              angle,
              color,
            }) => {
              const radians =
                (angle * Math.PI) /
                180;

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
                (angle * Math.PI) /
                180;

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


          {/* DEGREE LABELS */}

          {[0, 90, 180, 270].map(
            (angle) => {
              const radians =
                (angle * Math.PI) /
                180;

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
            FIXED NORTH POINTER
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
            CENTER NAVIGATION ICON
            CALIBRATED -15° TO CORRECT VISUAL BIAS
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
            color={webGLColorSafe()}
            fill="rgba(0,229,255,0.12)"

            style={{
              /*
               * -15° is the visual calibration
               * requested for the Navigation icon.
               *
               * This does NOT alter map bearing.
               */
              transform:
                `rotate(${bearing - 45}deg)`,

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

      </div>
    </div>
  );
}


/*
 * The compass component is declared before
 * VehicleHistoryPage, so this helper provides
 * the accent used by the icon.
 *
 * It intentionally returns the same cyan
 * used by the fleet compass.
 */
function webGLColorSafe() {
  return '#00E5FF';
}


/* =========================================================
   MAIN PAGE
   ========================================================= */

export default function VehicleHistoryPage() {

  const {
    id,
  } = useParams();

  const navigate =
    useNavigate();

  const {
    theme,
  } = useTheme();

  const mapRef =
    useRef(null);


  /* =======================================================
     HISTORY STATE
     ======================================================= */

  const [
    history,
    setHistory,
  ] = useState([]);

  const [
    vehicles,
    setVehicles,
  ] = useState([]);

  const [
    vehicle,
    setVehicle,
  ] = useState(null);

  const [
    currentIndex,
    setCurrentIndex,
  ] = useState(0);


  /* =======================================================
     UI STATE
     ======================================================= */

  const [
    isLive,
    setIsLive,
  ] = useState(true);

  const [
    isPlaying,
    setIsPlaying,
  ] = useState(false);

  const [
    isHudExpanded,
    setIsHudExpanded,
  ] = useState(true);

  const [
    isTelemetryExpanded,
    setIsTelemetryExpanded,
  ] = useState(true);

  const [
    autoFollow,
    setAutoFollow,
  ] = useState(false);

  const [
    isFocused,
    setIsFocused,
  ] = useState(false);

  const [
    searchQuery,
    setSearchQuery,
  ] = useState('');

  const [
    isBackHovered,
    setIsBackHovered,
  ] = useState(false);


  /* =======================================================
     CAMERA STATE

     Geographic camera values remain together,
     while pitch and bearing are still explicitly
     controlled by the HUD.
     ======================================================= */

  const [
    viewState,
    setViewState,
  ] = useState({
    longitude:
      -122.4194,

    latitude:
      37.7749,

    zoom:
      15,
  });

  const [
    pitch,
    setPitch,
  ] = useState(60);

  const [
    bearing,
    setBearing,
  ] = useState(-20);


  /* =======================================================
     INITIAL REST FETCH
     ======================================================= */

  const safeJson = async (
    res,
    label
  ) => {
    const contentType =
      res.headers.get(
        'content-type'
      ) || '';

    if (
      !res.ok ||
      !contentType.includes(
        'application/json'
      )
    ) {
      const bodyPreview =
        (
          await res.text()
        ).slice(0, 120);

      throw new Error(
        `${label} returned non-JSON body. Body preview: ${bodyPreview}`
      );
    }

    return res.json();
  };


  useEffect(() => {

    fetch(
      'http://localhost:8080/api/fleet/vehicles'
    )
      .then((res) =>
        safeJson(
          res,
          'GET /api/fleet/vehicles'
        )
      )
      .then((data) => {

        setVehicles(data);

        const found =
          data.find(
            (v) =>
              v.id === id
          );

        if (found) {
          setVehicle(found);
        }
      })
      .catch((err) =>
        console.error(
          'Vehicle fetch failed:',
          err
        )
      );


    fetch(
      `http://localhost:8080/api/fleet/vehicles/${id}/history`
    )
      .then((res) =>
        safeJson(
          res,
          `GET /api/fleet/vehicles/${id}/history`
        )
      )
      .then((data) => {

        if (
          data &&
          data.length > 0
        ) {
          setHistory(data);

          setCurrentIndex(
            data.length - 1
          );

          const last =
            data[
              data.length - 1
            ];

          if (
            last.longitude != null &&
            last.latitude != null
          ) {
            setViewState(
              (prev) => ({
                ...prev,

                longitude:
                  Number(
                    last.longitude
                  ),

                latitude:
                  Number(
                    last.latitude
                  ),
              })
            );
          }
        }
      })
      .catch((err) =>
        console.error(
          'History fetch failed:',
          err
        )
      );

  }, [id]);


  /* =======================================================
     WEBSOCKET TELEMETRY
     ======================================================= */

  useEffect(() => {

    const socket =
      new SockJS(
        'http://localhost:8080/ws-telemetry'
      );

    const stompClient =
      new Client({
        webSocketFactory:
          () => socket,

        onConnect: () => {

          stompClient.subscribe(
            `/topic/telemetry.${id}.position`,
            (message) => {

              let payload;

              try {
                payload =
                  JSON.parse(
                    message.body
                  );
              } catch (err) {
                return;
              }

              if (
                !payload.timestamp
              ) {
                payload.timestamp =
                  new Date().toISOString();
              }

              setHistory(
                (prev) => [
                  ...prev,
                  payload,
                ]
              );
            }
          );
        },
      });

    stompClient.activate();

    return () =>
      stompClient.deactivate();

  }, [id]);


  /* =======================================================
     LIVE MODE TRACKER
     ======================================================= */

  useEffect(() => {

    if (
      isLive &&
      history.length > 0
    ) {
      setCurrentIndex(
        history.length - 1
      );
    }

  }, [
    history.length,
    isLive,
  ]);


  /* =======================================================
     PLAYBACK TIMER
     ======================================================= */

  useEffect(() => {

    if (
      !isPlaying ||
      isLive ||
      history.length === 0
    ) {
      return;
    }

    const interval =
      setInterval(() => {

        setCurrentIndex(
          (prev) => {

            if (
              prev >=
              history.length - 1
            ) {
              setIsPlaying(false);
              setIsLive(true);

              return prev;
            }

            return prev + 1;
          }
        );

      }, 100);

    return () =>
      clearInterval(
        interval
      );

  }, [
    isPlaying,
    isLive,
    history.length,
  ]);


  /* =======================================================
     ACTIVE HISTORY POINT
     ======================================================= */

  const activePoint =
    history[
      currentIndex
    ];


  /* =======================================================
     AUTO FOLLOW
     ======================================================= */

  useEffect(() => {

    if (
      activePoint &&
      autoFollow &&
      activePoint.longitude != null &&
      activePoint.latitude != null
    ) {

      setViewState(
        (prev) => ({
          ...prev,

          longitude:
            Number(
              activePoint.longitude
            ),

          latitude:
            Number(
              activePoint.latitude
            ),
        })
      );
    }

  }, [
    activePoint,
    isPlaying,
    autoFollow,
  ]);


  /* =======================================================
     TELEMETRY
     ======================================================= */

  const telemetry =
    useMemo(() => {

      if (!activePoint) {
        return null;
      }

      return {
        ...activePoint,
        ...(activePoint.metrics || {}),
      };

    }, [
      activePoint,
    ]);


  /* =======================================================
     THEME
     ======================================================= */

  const isDark =
    theme === 'dark';

  const rawColor =
    getVehicleColor(id);

  const isValidHex =
    typeof rawColor ===
      'string' &&
    /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(
      rawColor
    );

  const webGLColor =
    isValidHex
      ? rawColor
      : '#FF3366';


  /* =======================================================
     MAP STYLE
     ======================================================= */

  const mapStyle =
    useMemo(
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

            attribution:
              '&copy; OpenStreetMap Contributors',
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


  /* =======================================================
     COLORS
     ======================================================= */

  const hudBg =
    isDark
      ? 'var(--bg-glass, rgba(18, 18, 22, 0.95))'
      : 'rgba(255, 255, 255, 0.95)';

  const textColor =
    isDark
      ? '#fff'
      : '#111';

  const subtextColor =
    isDark
      ? '#888'
      : '#555';

  const borderColor =
    isDark
      ? 'rgba(255,255,255,0.08)'
      : 'rgba(0,0,0,0.1)';

  const btnBg =
    isDark
      ? 'rgba(255,255,255,0.05)'
      : 'rgba(0,0,0,0.04)';


  /* =======================================================
     CAMERA COLORS
     ======================================================= */

  const controlColors = {
    flat2D:
      '#00b4d8',

    view3D:
      '#7209b7',

    north:
      '#f72585',

    east:
      '#4cc9f0',

    south:
      '#4895ef',

    west:
      '#3a0ca3',

    focus:
      '#10b981',
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

    borderRadius:
      '7px',

    color:
      isActive
        ? '#fff'
        : subtextColor,

    fontSize:
      '11px',

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


  /* =======================================================
     HISTORY PATH
     ======================================================= */

  const pathCoordinates =
    useMemo(() => {

      if (
        history.length < 2 ||
        currentIndex < 1
      ) {
        return null;
      }

      const validCoords = [];

      let lastPoint =
        null;


      for (
        let i = 0;
        i <= currentIndex;
        i++
      ) {

        const p =
          history[i];

        if (
          p &&
          p.longitude != null &&
          p.latitude != null
        ) {

          let lon =
            Number(
              p.longitude
            );

          let lat =
            Number(
              p.latitude
            );


          /*
           * Preserve your original
           * latitude/longitude correction.
           */

          if (
            Math.abs(lat) > 90 &&
            Math.abs(lon) <= 90
          ) {
            const temp =
              lat;

            lat =
              lon;

            lon =
              temp;
          }


          if (
            !isNaN(lon) &&
            !isNaN(lat) &&
            Math.abs(lat) <= 90 &&
            Math.abs(lon) <= 180
          ) {

            if (
              !lastPoint ||
              lastPoint[0] !== lon ||
              lastPoint[1] !== lat
            ) {

              validCoords.push([
                lon,
                lat,
              ]);

              lastPoint = [
                lon,
                lat,
              ];
            }
          }
        }
      }


      return validCoords.length >= 2
        ? validCoords
        : null;

    }, [
      history,
      currentIndex,
    ]);


  /* =======================================================
     FOCUS PATH
     ======================================================= */

  const fitPathToBounds = () => {

    if (
      !pathCoordinates ||
      pathCoordinates.length < 2 ||
      !mapRef.current
    ) {
      return;
    }


    let minLng =
      Infinity;

    let maxLng =
      -Infinity;

    let minLat =
      Infinity;

    let maxLat =
      -Infinity;


    for (
      const [lng, lat]
      of pathCoordinates
    ) {

      if (
        lng < minLng
      ) {
        minLng = lng;
      }

      if (
        lng > maxLng
      ) {
        maxLng = lng;
      }

      if (
        lat < minLat
      ) {
        minLat = lat;
      }

      if (
        lat > maxLat
      ) {
        maxLat = lat;
      }
    }


    const map =
      mapRef.current.getMap
        ? mapRef.current.getMap()
        : mapRef.current;


    map.fitBounds(
      [
        [
          minLng,
          minLat,
        ],
        [
          maxLng,
          maxLat,
        ],
      ],
      {
        padding:
          80,

        duration:
          800,

        maxZoom:
          18,
      }
    );


    setIsFocused(true);
  };


  /* =======================================================
     FORMAT TIME
     ======================================================= */

  const formatTimestamp = (
    ts
  ) => {

    if (!ts) {
      return 'No Data';
    }

    const date =
      new Date(ts);

    if (
      isNaN(
        date.getTime()
      )
    ) {
      return String(ts);
    }

    return date.toLocaleTimeString(
      [],
      {
        hour:
          '2-digit',

        minute:
          '2-digit',

        second:
          '2-digit',
      }
    );
  };


  /* =======================================================
     FILTER VEHICLES
     ======================================================= */

  const filteredVehicles =
    vehicles.filter(
      (v) =>
        (v.name || '')
          .toLowerCase()
          .includes(
            searchQuery.toLowerCase()
          ) ||

        (v.id || '')
          .toLowerCase()
          .includes(
            searchQuery.toLowerCase()
          )
    );


  /* =======================================================
     VEHICLE DISPLAY
     ======================================================= */

  const isGround =
    vehicle?.category ===
    'GROUND';

  const displayAlt =
    isGround
      ? 0
      : (
          activePoint?.altitude ||
          50
        );


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


  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <div
      style={{
        width:
          '100vw',

        height:
          '100vh',

        display:
          'flex',

        flexDirection:
          'column',

        background:
          isDark
            ? '#111'
            : '#eee',
      }}
    >

      {/* =================================================
          HEADER
         ================================================= */}

      <div
        style={{
          padding:
            '16px 24px',

          background:
            isDark
              ? '#1a1a20'
              : '#fff',

          borderBottom:
            `1px solid ${
              isDark
                ? '#333'
                : '#ddd'
            }`,

          display:
            'flex',

          justifyContent:
            'space-between',

          alignItems:
            'center',

          zIndex:
            10,
        }}
      >

        <div
          style={{
            display:
              'flex',

            alignItems:
              'center',

            gap:
              '16px',
          }}
        >

          {/* BACK */}

          <button
            onClick={() =>
              navigate('/manage')
            }

            onMouseEnter={() =>
              setIsBackHovered(true)
            }

            onMouseLeave={() =>
              setIsBackHovered(false)
            }

            style={{
              background:
                isBackHovered
                  ? (
                      isDark
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(0,0,0,0.05)'
                    )
                  : 'transparent',

              border:
                'none',

              color:
                isBackHovered
                  ? webGLColor
                  : (
                      isDark
                        ? '#fff'
                        : '#000'
                    ),

              cursor:
                'pointer',

              display:
                'flex',

              alignItems:
                'center',

              gap:
                '8px',

              fontSize:
                '14px',

              fontWeight:
                '500',

              padding:
                '6px 10px',

              borderRadius:
                '8px',

              transition:
                'all 0.2s ease',
            }}
          >
            <ArrowLeft
              size={16}
            />

            Back to Fleet
          </button>


          <div
            style={{
              width:
                '1px',

              height:
                '24px',

              background:
                isDark
                  ? '#333'
                  : '#ddd',
            }}
          />


          {/* SEARCH */}

          <div
            style={{
              display:
                'flex',

              alignItems:
                'center',

              gap:
                '8px',
            }}
          >

            <div
              style={{
                position:
                  'relative',

                display:
                  'flex',

                alignItems:
                  'center',
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
                    '10px',
                }}
              />


              <input
                type="text"
                placeholder="Search vehicle..."
                value={
                  searchQuery
                }

                onChange={(e) =>
                  setSearchQuery(
                    e.target.value
                  )
                }

                style={{
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
                    '8px 10px 8px 32px',

                  fontSize:
                    '13px',

                  outline:
                    'none',

                  width:
                    '140px',
                }}
              />

            </div>


            <select
              value={id}

              onChange={(e) =>
                navigate(
                  `/vehicle/${e.target.value}`
                )
              }

              style={{
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
                  '8px 14px',

                fontSize:
                  '14px',

                fontWeight:
                  '600',

                cursor:
                  'pointer',

                outline:
                  'none',
              }}
            >

              {filteredVehicles.length >
              0 ? (

                filteredVehicles.map(
                  (v) => (
                    <option
                      key={v.id}
                      value={v.id}
                      style={{
                        background:
                          isDark
                            ? '#1a1a20'
                            : '#fff',

                        color:
                          textColor,
                      }}
                    >
                      {v.name} (
                      {v.category}
                      )
                    </option>
                  )
                )

              ) : (

                <option
                  disabled
                  value=""
                >
                  No vehicles found
                </option>
              )}

            </select>

          </div>


          <span
            style={{
              fontSize:
                '12px',

              padding:
                '4px 8px',

              borderRadius:
                '12px',

              background:
                `${webGLColor}20`,

              color:
                webGLColor,

              fontWeight:
                '600',
            }}
          >
            Historical DVR &amp; Live Feed
          </span>

        </div>

      </div>


      {/* =================================================
          MAP
         ================================================= */}

      <div
        style={{
          flex:
            1,

          position:
            'relative',
        }}
      >

        <Map
          ref={mapRef}

          {...viewState}

          /*
           * CAMERA CONTROLS
           *
           * These are deliberately supplied
           * separately so the HUD and map
           * remain synchronized.
           */

          pitch={
            pitch
          }

          bearing={
            bearing
          }

          onMove={(evt) => {

            const next =
              evt.viewState;


            setViewState({
              longitude:
                next.longitude,

              latitude:
                next.latitude,

              zoom:
                next.zoom,
            });


            /*
             * Manual map rotation updates
             * the compass.
             */

            setPitch(
              next.pitch
            );

            setBearing(
              next.bearing
            );
          }}

          onDragStart={() =>
            setIsFocused(false)
          }

          onZoomStart={() =>
            setIsFocused(false)
          }

          mapStyle={
            mapStyle
          }

          style={{
            width:
              '100%',

            height:
              '100%',
          }}
        >

          <NavigationControl
            position="bottom-right"
            visualizePitch={
              true
            }
          />


          {/* VEHICLE MARKER */}

          {activePoint && (
            <Marker
              longitude={
                Number(
                  activePoint.longitude
                )
              }

              latitude={
                Number(
                  activePoint.latitude
                )
              }

              anchor="bottom"
            >

              <div
                style={{
                  display:
                    'flex',

                  flexDirection:
                    'column',

                  alignItems:
                    'center',
                }}
              >

                <div
                  style={{
                    background:
                      webGLColor,

                    color:
                      '#000',

                    borderRadius:
                      '8px',

                    padding:
                      '6px',

                    boxShadow:
                      `0 0 15px ${webGLColor}`,

                    transform:
                      `translateY(-${displayAlt}px)`,
                  }}
                >

                  {isGround ? (
                    <Truck
                      size={16}
                    />
                  ) : (
                    <Plane
                      size={16}
                    />
                  )}

                </div>


                <div
                  style={{
                    width:
                      '2px',

                    height:
                      `${displayAlt}px`,

                    background:
                      `linear-gradient(to bottom, ${webGLColor}, transparent)`,
                  }}
                />


                <div
                  style={{
                    width:
                      '12px',

                    height:
                      '4px',

                    background:
                      'rgba(0,0,0,0.6)',

                    borderRadius:
                      '50%',

                    boxShadow:
                      '0 0 4px rgba(0,0,0,0.8)',
                  }}
                />

              </div>

            </Marker>
          )}

        </Map>


        {/* =================================================
            TELEMETRY PANEL
           ================================================= */}

        {telemetry && (
          isTelemetryExpanded ? (

            <div
              style={{
                position:
                  'absolute',

                top:
                  '20px',

                left:
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

                zIndex:
                  10,

                width:
                  '280px',

                boxShadow:
                  '0 20px 40px rgba(0,0,0,0.15)',

                maxHeight:
                  'calc(100vh - 160px)',

                overflowY:
                  'auto',
              }}
            >

              <div
                style={{
                  display:
                    'flex',

                  justifyContent:
                    'space-between',

                  alignItems:
                    'center',

                  marginBottom:
                    '16px',
                }}
              >

                <div
                  style={{
                    display:
                      'flex',

                    alignItems:
                      'center',

                    gap:
                      '8px',
                  }}
                >

                  <Gauge
                    size={18}
                    color={
                      webGLColor
                    }
                  />

                  <h3
                    style={{
                      margin:
                        0,

                      fontSize:
                        '14px',

                      textTransform:
                        'uppercase',

                      letterSpacing:
                        '1px',
                    }}
                  >
                    Live Telemetry
                  </h3>

                </div>


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
                    setIsTelemetryExpanded(
                      false
                    )
                  }
                />

              </div>


              <div
                style={{
                  display:
                    'grid',

                  gridTemplateColumns:
                    '1fr 1fr',

                  gap:
                    '16px',
                }}
              >

                <div>
                  <div
                    style={{
                      fontSize:
                        '11px',

                      color:
                        subtextColor,

                      textTransform:
                        'uppercase',
                    }}
                  >
                    Latitude
                  </div>

                  <div
                    style={{
                      fontSize:
                        '14px',

                      fontWeight:
                        '600',
                    }}
                  >
                    {
                      Number(
                        telemetry.latitude
                      ).toFixed(5)
                    }
                  </div>
                </div>


                <div>
                  <div
                    style={{
                      fontSize:
                        '11px',

                      color:
                        subtextColor,

                      textTransform:
                        'uppercase',
                    }}
                  >
                    Longitude
                  </div>

                  <div
                    style={{
                      fontSize:
                        '14px',

                      fontWeight:
                        '600',
                    }}
                  >
                    {
                      Number(
                        telemetry.longitude
                      ).toFixed(5)
                    }
                  </div>
                </div>


                {!isGround && (
                  <div>
                    <div
                      style={{
                        fontSize:
                          '11px',

                        color:
                          subtextColor,

                        textTransform:
                          'uppercase',
                      }}
                    >
                      Altitude
                    </div>

                    <div
                      style={{
                        fontSize:
                          '14px',

                        fontWeight:
                          '600',
                      }}
                    >
                      {
                        Number(
                          telemetry.altitude ||
                          0
                        ).toFixed(1)
                      }m
                    </div>
                  </div>
                )}


                {telemetry.battery_level !==
                  undefined && (
                  <div>
                    <div
                      style={{
                        fontSize:
                          '11px',

                        color:
                          subtextColor,

                        textTransform:
                          'uppercase',
                      }}
                    >
                      Battery
                    </div>

                    <div
                      style={{
                        fontSize:
                          '14px',

                        fontWeight:
                          '600',

                        color:
                          telemetry.battery_level <
                          20
                            ? '#ff3b30'
                            : textColor,
                      }}
                    >
                      {
                        telemetry.battery_level
                      }%
                    </div>
                  </div>
                )}


                {Object.keys(
                  telemetry
                )
                  .filter(
                    (key) =>
                      !hiddenKeys.includes(
                        key
                      )
                  )
                  .map(
                    (key) => (
                      <div
                        key={key}
                      >

                        <div
                          style={{
                            fontSize:
                              '11px',

                            color:
                              subtextColor,

                            textTransform:
                              'uppercase',
                          }}
                        >
                          {
                            key.replace(
                              /_/g,
                              ' '
                            )
                          }
                        </div>

                        <div
                          style={{
                            fontSize:
                              '14px',

                            fontWeight:
                              '600',
                          }}
                        >
                          {
                            telemetry[
                              key
                            ]
                          }
                        </div>

                      </div>
                    )
                  )}

              </div>

            </div>

          ) : (

            <div
              onClick={() =>
                setIsTelemetryExpanded(
                  true
                )
              }

              title="Expand Live Telemetry"

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
                  webGLColor,
              }}
            >
              <Gauge
                size={20}
              />
            </div>
          )
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
                FOCUS PATH
               ================================================= */}

            <button
              onClick={
                fitPathToBounds
              }

              style={{
                width:
                  '100%',

                display:
                  'flex',

                alignItems:
                  'center',

                justifyContent:
                  'center',

                gap:
                  '8px',

                fontSize:
                  '12px',

                padding:
                  '8px 12px',

                borderRadius:
                  '8px',

                border:
                  `1px solid ${
                    isFocused
                      ? controlColors.focus
                      : borderColor
                  }`,

                background:
                  isFocused
                    ? `${controlColors.focus}25`
                    : btnBg,

                color:
                  isFocused
                    ? controlColors.focus
                    : textColor,

                cursor:
                  'pointer',

                fontWeight:
                  '700',
              }}
            >

              <Maximize2
                size={14}
              />

              Focus Path

              {isFocused &&
                ' ✓'}

            </button>


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
                value={
                  pitch
                }

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

                  style={
                    getColoredBtnStyle(
                      pitch < 2,
                      controlColors.flat2D
                    )
                  }

                  onClick={() =>
                    setPitch(0)
                  }
                >
                  2D Flat
                </button>


                <button
                  type="button"

                  style={
                    getColoredBtnStyle(
                      Math.abs(
                        pitch - 65
                      ) < 2,
                      controlColors.view3D
                    )
                  }

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

                  justifyContent:
                    'space-between',

                  alignItems:
                    'center',

                  marginBottom:
                    '4px',
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


              {/* N / W / E / S */}

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

                  style={
                    getColoredBtnStyle(
                      isAngleActive(
                        bearing,
                        0
                      ),

                      controlColors.north
                    )
                  }

                  onClick={() =>
                    setBearing(0)
                  }
                >
                  N
                </button>


                <button
                  type="button"

                  style={
                    getColoredBtnStyle(
                      isAngleActive(
                        bearing,
                        -90
                      ),

                      controlColors.west
                    )
                  }

                  onClick={() =>
                    setBearing(-90)
                  }
                >
                  W
                </button>


                <button
                  type="button"

                  style={
                    getColoredBtnStyle(
                      isAngleActive(
                        bearing,
                        90
                      ),

                      controlColors.east
                    )
                  }

                  onClick={() =>
                    setBearing(90)
                  }
                >
                  E
                </button>


                <button
                  type="button"

                  style={
                    getColoredBtnStyle(
                      isAngleActive(
                        bearing,
                        180
                      ),

                      controlColors.south
                    )
                  }

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
                }}
              >
                Drag the compass to rotate the map
              </div>

            </div>

          </div>

        ) : (

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

      </div>


      {/* =================================================
          TIMELINE
         ================================================= */}

      <div
        style={{
          padding:
            '24px',

          background:
            isDark
              ? '#1a1a20'
              : '#fff',

          borderTop:
            `1px solid ${
              isDark
                ? '#333'
                : '#ddd'
            }`,

          zIndex:
            10,
        }}
      >

        <div
          style={{
            display:
              'flex',

            alignItems:
              'center',

            gap:
              '24px',

            maxWidth:
              '1200px',

            margin:
              '0 auto',
          }}
        >

          {/* PLAY */}

          <button
            onClick={() => {

              setIsPlaying(
                !isPlaying
              );

              setIsLive(
                false
              );

            }}

            style={{
              width:
                '48px',

              height:
                '48px',

              borderRadius:
                '50%',

              border:
                'none',

              background:
                isLive
                  ? '#333'
                  : webGLColor,

              color:
                '#000',

              display:
                'flex',

              justifyContent:
                'center',

              alignItems:
                'center',

              cursor:
                'pointer',

              boxShadow:
                isPlaying
                  ? `0 0 15px ${webGLColor}`
                  : 'none',
            }}
          >

            {isPlaying ? (
              <Pause
                size={20}
                fill="currentColor"
              />
            ) : (
              <Play
                size={20}
                fill="currentColor"
                style={{
                  marginLeft:
                    '4px',
                }}
              />
            )}

          </button>


          {/* AUTO FOLLOW */}

          <button
            onClick={() =>
              setAutoFollow(
                !autoFollow
              )
            }

            title="Toggle Camera Auto-Follow"

            style={{
              width:
                '42px',

              height:
                '42px',

              borderRadius:
                '10px',

              border:
                `1px solid ${
                  autoFollow
                    ? webGLColor
                    : borderColor
                }`,

              background:
                autoFollow
                  ? webGLColor
                  : btnBg,

              color:
                autoFollow
                  ? '#fff'
                  : subtextColor,

              display:
                'flex',

              justifyContent:
                'center',

              alignItems:
                'center',

              cursor:
                'pointer',

              boxShadow:
                autoFollow
                  ? `0 4px 12px ${webGLColor}50`
                  : 'none',
            }}
          >
            <Crosshair
              size={20}
            />
          </button>


          {/* TIMELINE */}

          <div
            style={{
              flex:
                1,

              display:
                'flex',

              flexDirection:
                'column',

              gap:
                '8px',
            }}
          >

            <div
              style={{
                display:
                  'flex',

                justifyContent:
                  'space-between',

                color:
                  isDark
                    ? '#aaa'
                    : '#555',

                fontSize:
                  '13px',
              }}
            >

              <span
                style={{
                  display:
                    'flex',

                  alignItems:
                    'center',

                  gap:
                    '6px',
                }}
              >

                <Clock
                  size={14}
                />

                {
                  formatTimestamp(
                    activePoint?.timestamp
                  )
                }

              </span>


              <span>
                Point:{' '}
                {
                  history.length >
                  0
                    ? currentIndex + 1
                    : 0
                }{' '}
                /{' '}
                {
                  history.length
                }
              </span>

            </div>


            <input
              type="range"

              min="0"

              max={Math.max(
                0,
                history.length - 1
              )}

              value={
                currentIndex
              }

              onChange={(e) => {

                setCurrentIndex(
                  Number(
                    e.target.value
                  )
                );

                setIsLive(
                  false
                );

                setIsPlaying(
                  false
                );
              }}

              style={{
                width:
                  '100%',

                cursor:
                  'pointer',

                accentColor:
                  webGLColor,
              }}

              disabled={
                history.length ===
                0
              }
            />

          </div>


          {/* LIVE */}

          <div
            style={{
              display:
                'flex',

              flexDirection:
                'column',

              alignItems:
                'center',

              gap:
                '8px',

              minWidth:
                '100px',
            }}
          >

            <label
              style={{
                display:
                  'flex',

                alignItems:
                  'center',

                gap:
                  '8px',

                cursor:
                  'pointer',

                color:
                  isDark
                    ? '#fff'
                    : '#000',

                fontSize:
                  '14px',

                fontWeight:
                  '600',
              }}
            >

              <input
                type="checkbox"

                checked={
                  isLive
                }

                onChange={(e) => {

                  const active =
                    e.target.checked;

                  setIsLive(
                    active
                  );

                  if (active) {

                    setIsPlaying(
                      false
                    );

                    if (
                      history.length >
                      0
                    ) {
                      setCurrentIndex(
                        history.length -
                        1
                      );
                    }
                  }
                }}

                style={{
                  width:
                    '18px',

                  height:
                    '18px',

                  accentColor:
                    '#ff3b30',
                }}
              />


              <Activity
                size={16}
                color={
                  isLive
                    ? '#ff3b30'
                    : (
                        isDark
                          ? '#888'
                          : '#555'
                      )
                }
              />

              LIVE

            </label>

          </div>

        </div>

      </div>

    </div>
  );
}