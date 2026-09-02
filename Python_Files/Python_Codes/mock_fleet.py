import asyncio
import json
import math
import random
import socket

# Altered the first ID to test the new vehicle registration wizard
FLEET = [
    {"id": "new-drone-001", "type": "UAV", "lat": 37.7749, "lon": -122.4194, "radius": 0.01},
    {"id": "d9fa697d-bd67-4035-8df4-f38f94b4a8fb", "type": "UAV", "lat": 37.7833, "lon": -122.4167, "radius": 0.015},
    {"id": "rover-gamma-003", "type": "GROUND", "lat": 37.7690, "lon": -122.4460, "radius": 0.008}
]

async def simulate_fleet(target_port=14550):
    print(f"Starting multi-drone mock telemetry UDP transmission on port {target_port}...")

    angle = 0
    while True:
        angle += 0.1
        for drone in FLEET:
            is_rover = drone["type"] == "GROUND"

            lat = drone["lat"] + (drone["radius"] * math.cos(angle))
            lon = drone["lon"] + (drone["radius"] * math.sin(angle))
            alt = 0.0 if is_rover else (50.0 + (10.0 * math.sin(angle * 2)))
            battery = max(10, int(100 - (angle * 2) % 90))
            heading = (math.degrees(angle) + 90) % 360
            base_speed = drone["radius"] * 1000
            speed = max(0.0, base_speed + random.uniform(-1.0, 1.0))
            motor_temp = 45.0 + (speed * 0.4) + random.uniform(-1.5, 1.5)
            signal_dbm = -50 - random.randint(0, 25)

            payload = {
                "vehicle_id": drone["id"],
                "latitude": round(lat, 6),
                "longitude": round(lon, 6),
                "altitude": round(alt, 1),
                "battery_level": battery,
                "speed_kmh": round(speed, 1),
                "heading_deg": round(heading, 1),
                "motor_temp_c": round(motor_temp, 1),
                "signal_dbm": signal_dbm,
                "mission_status": "PATROLLING" if battery > 20 else "RTH_LOW_BATTERY"
            }

            if is_rover:
                payload["terrain_friction"] = round(random.uniform(0.4, 0.8), 2)
                payload["payload_bay"] = "SECURED"
            else:
                payload["wind_speed_knots"] = round(random.uniform(5.0, 15.0), 1)
                payload["gimbal_pitch"] = round(-30.0 + (20.0 * math.cos(angle)), 1)

            # Recreate socket per packet to randomize source port
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            encoded_payload = json.dumps(payload).encode('utf-8')

            # Send directly to loopback so macOS properly routes to both listeners
            sock.sendto(encoded_payload, ('127.0.0.1', target_port))
            sock.close()

            print(f"Transmitted [{drone['id'][0:8]}]: Alt: {alt:.1f}m | Speed: {speed:.1f}km/h via UDP")

        await asyncio.sleep(0.5)

if __name__ == "__main__":
    asyncio.run(simulate_fleet())