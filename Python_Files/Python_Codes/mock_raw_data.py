import asyncio
import json
import socket
import math

TARGET_PORT = 14555

# Define multiple vehicles positioned across different global regions
global_fleet = [
    {
        "id": "CUSTOM-DRONE-99",
        "lat": 37.7749,
        "lon": -122.4194,  # San Francisco, USA
        "alt": 150.0,
        "speed": 12.5,
        "angle": 0.0
    },
    {
        "id": "TOKYO-UAV-01",
        "lat": 35.6762,
        "lon": 139.6503,  # Tokyo, Japan
        "alt": 220.0,
        "speed": 18.0,
        "angle": 1.5
    },
    {
        "id": "LONDON-ROVER-02",
        "lat": 51.5074,
        "lon": -0.1278,   # London, UK (Ground vehicle with 0 altitude)
        "alt": 0.0,
        "speed": 8.2,
        "angle": 3.0
    },
    {
        "id": "SYDNEY-DRONE-03",
        "lat": -33.8688,
        "lon": 151.2093,  # Sydney, Australia
        "alt": 95.5,
        "speed": 14.1,
        "angle": 4.5
    }
]

async def stream_raw_data():
    print(f"Starting global multi-vehicle stream to 127.0.0.1:{TARGET_PORT}...")
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    while True:
        for vehicle in global_fleet:
            # Advance each vehicle's independent orbital angle
            vehicle["angle"] += 0.1
            angle = vehicle["angle"]

            # Calculate movement offset simulating real-time motion
            lat_offset = 0.01 * math.cos(angle)
            lon_offset = 0.01 * math.sin(angle)

            proprietary_payload = {
                "header": "CUSTOM_PROPRIETARY_V2",
                "uav_id": vehicle["id"],
                "telemetry": {
                    "loc": [
                        round(vehicle["lat"] + lat_offset, 6),
                        round(vehicle["lon"] + lon_offset, 6)
                    ],
                    "alt_m": round(vehicle["alt"] + (5.0 * math.sin(angle)), 1),
                    "yaw": round((math.degrees(angle) + 90) % 360, 1)
                },
                "pwr": {
                    "bat_pct": max(10, int(100 - (angle * 2) % 90)),
                    "temp_c": 45.2
                },
                "velocity_kts": round(vehicle["speed"] + math.sin(angle), 1)
            }

            encoded_payload = json.dumps(proprietary_payload).encode('utf-8')
            sock.sendto(encoded_payload, ('127.0.0.1', TARGET_PORT))

            print(f"Transmitted packet for {vehicle['id']} -> Lat: {proprietary_payload['telemetry']['loc'][0]}, Lon: {proprietary_payload['telemetry']['loc'][1]}")

        # Send batch once per second
        await asyncio.sleep(1.0)

if __name__ == "__main__":
    asyncio.run(stream_raw_data())