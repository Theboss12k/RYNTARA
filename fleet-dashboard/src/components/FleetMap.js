import React, {
  useEffect,
  useState,
} from 'react';

import Map, {
  Marker,
  Popup,
  NavigationControl,
} from 'react-map-gl/maplibre';

import 'maplibre-gl/dist/maplibre-gl.css';

import {
  Plane,
  Truck,
  MapPin,
} from 'lucide-react';

import {
  getVehicleColor,
} from './ManageFleetPage';


/* =========================================================
   MAP COMPONENT
   ========================================================= */

export default function FleetMap({
  telemetryData,
  vehicleById,
  theme,
  selectedVehicle,
  setSelectedVehicle,
  activeTraces,

  /*
   * CAMERA CONTROLLED BY PARENT
   */
  pitch,
  bearing,
  setPitch,
  setBearing,
}) {

  /* =======================================================
     GEOGRAPHIC CAMERA STATE

     Only longitude / latitude / zoom
     live here.

     Pitch + bearing live in the
     parent component.
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
    history,
    setHistory,
  ] = useState({});


  /* =======================================================
     FOLLOW SELECTED VEHICLE
     ======================================================= */

  useEffect(() => {
    if (
      selectedVehicle &&
      telemetryData[
        selectedVehicle
      ]
    ) {
      const selected =
        telemetryData[
          selectedVehicle
        ];

      setViewState(
        (prev) => ({
          ...prev,

          longitude:
            selected.longitude,

          latitude:
            selected.latitude,

          /*
           * react-map-gl supports
           * transitionDuration as a
           * camera transition property.
           */
          transitionDuration:
            1200,
        })
      );
    }
  }, [
    selectedVehicle,
    telemetryData,
  ]);


  /* =======================================================
     BUILD VEHICLE HISTORY / TRACE
     ======================================================= */

  useEffect(() => {
    setHistory((prev) => {
      const next = {
        ...prev,
      };

      Object.values(
        telemetryData
      ).forEach((position) => {
        const vehicleId =
          position.vehicle_id;

        if (!next[vehicleId]) {
          next[vehicleId] = [];
        }

        const altitude =
          position.altitude || 0;

        const last =
          next[vehicleId][
            next[vehicleId].length - 1
          ];


        if (
          !last ||
          last.lng !==
            position.longitude ||
          last.lat !==
            position.latitude ||
          last.alt !==
            altitude
        ) {
          next[vehicleId] = [
            ...next[vehicleId],

            {
              lng:
                position.longitude,

              lat:
                position.latitude,

              alt:
                altitude,
            },
          ];


          if (
            next[vehicleId].length >
            40
          ) {
            next[vehicleId].shift();
          }
        }
      });

      return next;
    });
  }, [
    telemetryData,
  ]);


  /* =======================================================
     OSM MAP STYLE
     ======================================================= */

  const mapStyle = {
    version: 8,

    sources: {
      osm: {
        type:
          'raster',

        tiles: [
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
        ],

        tileSize:
          256,

        attribution:
          '&copy; OpenStreetMap Contributors',
      },
    },

    layers: [
      {
        id:
          'osm',

        type:
          'raster',

        source:
          'osm',

        minzoom:
          0,

        maxzoom:
          19,
      },
    ],
  };


  /* =======================================================
     THEME
     ======================================================= */

  const isDark =
    theme === 'dark';

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


  /* =======================================================
     MAP
     ======================================================= */

  return (
    <div
      style={{
        width:
          '100%',

        height:
          '100%',

        position:
          'relative',
      }}
    >

      <Map
        {...viewState}

        /*
         * IMPORTANT:
         *
         * These are controlled
         * directly by the parent.
         */
        pitch={pitch}
        bearing={bearing}

        onMove={(event) => {
          const next =
            event.viewState;


          /*
           * Geographic camera state.
           */

          setViewState({
            longitude:
              next.longitude,

            latitude:
              next.latitude,

            zoom:
              next.zoom,
          });


          /*
           * Camera orientation state.
           *
           * This keeps the HUD
           * synchronized when the
           * user manually rotates
           * or pitches the map.
           */

          setPitch(
            next.pitch
          );

          setBearing(
            next.bearing
          );
        }}

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

        {/* =================================================
            MAP NAVIGATION
           ================================================= */}

        <NavigationControl
          position="top-left"
          visualizePitch={
            true
          }
        />


        {/* =================================================
            TRACE DOTS
           ================================================= */}

        {Object.keys(
          activeTraces || {}
        ).map((vehicleId) => {

          if (
            !activeTraces[
              vehicleId
            ] ||
            !history[
              vehicleId
            ]
          ) {
            return null;
          }


          const color =
            getVehicleColor(
              vehicleId
            );


          return history[
            vehicleId
          ].map(
            (
              point,
              index
            ) => {

              const opacity =
                0.4 +
                0.6 *
                  (
                    (index + 1) /
                    history[
                      vehicleId
                    ].length
                  );


              return (
                <Marker
                  key={`${vehicleId}-trace-${index}`}
                  longitude={
                    point.lng
                  }
                  latitude={
                    point.lat
                  }
                  anchor="center"
                >

                  <div
                    style={{
                      width:
                        '6px',

                      height:
                        '6px',

                      borderRadius:
                        '50%',

                      background:
                        color,

                      opacity:

                        opacity,

                      transform:
                        `translateY(-${point.alt}px)`,

                      boxShadow:
                        `0 0 6px ${color}80`,

                      filter:
                        'brightness(0.75)',
                    }}
                  />

                </Marker>
              );
            }
          );
        })}


        {/* =================================================
            LIVE VEHICLE MARKERS
           ================================================= */}

        {Object.values(
          telemetryData
        ).map((position) => {

          const vehicle =
            vehicleById[
              position.vehicle_id
            ];


          if (!vehicle) {
            return null;
          }


          const isGround =
            vehicle.category ===
            'GROUND';


          const altitude =
            isGround
              ? 0
              : (
                  position.altitude ||
                  50
                );


          const color =
            getVehicleColor(
              position.vehicle_id
            );


          return (
            <Marker
              key={
                position.vehicle_id
              }

              longitude={
                position.longitude
              }

              latitude={
                position.latitude
              }

              anchor="bottom"

              onClick={(event) => {
                event
                  .originalEvent
                  .stopPropagation();

                setSelectedVehicle(
                  vehicle.id
                );
              }}
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

                {/* VEHICLE ICON */}

                <div
                  style={{
                    background:
                      color,

                    color:
                      '#000',

                    borderRadius:
                      '8px',

                    padding:
                      '6px',

                    boxShadow:
                      `0 0 15px ${color}`,

                    transform:
                      `translateY(-${altitude}px)`,

                    transition:
                      'transform 0.3s ease-out',
                  }}
                >

                  {isGround ? (
                    <Truck
                      size={14}
                    />
                  ) : (
                    <Plane
                      size={14}
                    />
                  )}

                </div>


                {/* ALTITUDE LINE */}

                <div
                  style={{
                    width:
                      '2px',

                    height:
                      `${altitude}px`,

                    background:
                      `linear-gradient(to bottom, ${color}, transparent)`,

                    transition:
                      'height 0.3s ease-out',
                  }}
                />


                {/* GROUND SHADOW */}

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
          );
        })}


        {/* =================================================
            VEHICLE POPUP
           ================================================= */}

        {selectedVehicle &&
          telemetryData[
            selectedVehicle
          ] && (

            <Popup
              longitude={
                telemetryData[
                  selectedVehicle
                ].longitude
              }

              latitude={
                telemetryData[
                  selectedVehicle
                ].latitude
              }

              anchor="top"

              onClose={() =>
                setSelectedVehicle(
                  null
                )
              }

              closeButton={
                false
              }
            >

              <div
                className="map-popup"
                style={{
                  background:
                    isDark
                      ? '#222'
                      : '#fff',

                  color:
                    textColor,

                  border:
                    `1px solid ${borderColor}`,

                  padding:
                    '12px',

                  borderRadius:
                    '12px',

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

                    alignItems:
                      'center',

                    gap:
                      '20px',
                  }}
                >

                  <b
                    style={{
                      fontSize:
                        '13px',
                    }}
                  >
                    {
                      vehicleById[
                        selectedVehicle
                      ]?.name
                    }
                  </b>


                  <span
                    style={{
                      fontSize:
                        '12px',

                      color:
                        subtextColor,

                      display:
                        'flex',

                      alignItems:
                        'center',

                      gap:
                        '4px',
                    }}
                  >

                    <MapPin
                      size={11}
                      strokeWidth={2}
                    />

                    {
                      telemetryData[
                        selectedVehicle
                      ].altitude
                    }m

                  </span>

                </div>

              </div>

            </Popup>
          )}

      </Map>

    </div>
  );
}