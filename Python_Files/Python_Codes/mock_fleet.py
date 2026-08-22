import asyncio
import json
import math
import random
import redis.asyncio as redis

# Define a virtual fleet. Added 'type' to differentiate metrics.
FLEET = [
    {"id": "bd150199-6cc8-41cb-8af8-90c4239eee1f", "type": "UAV", "lat": 37.7749, "lon": -122.4194, "radius": 0.01},
    {"id": "d9fa697d-bd67-4035-8df4-f38f94b4a8fb", "type": "UAV", "lat": 37.7833, "lon": -122.4167, "radius": 0.015},
    {"id": "rover-gamma-003", "type": "GROUND", "lat": 37.7690, "lon": -122.4460, "radius": 0.008}
]

async def simulate_fleet():
    client = redis.Redis(host='localhost', port=6379, decode_responses=True)
    print("Starting multi-drone mock telemetry simulation with dynamic extended metrics...")

    angle = 0
    while True:
        angle += 0.1
        for drone in FLEET:
            is_rover = drone["type"] == "GROUND"

            # Calculate base circular motion
            lat = drone["lat"] + (drone["radius"] * math.cos(angle))
            lon = drone["lon"] + (drone["radius"] * math.sin(angle))

            # Dynamic Altitude: Rovers stay at 0, UAVs bob between 40m and 60m
            alt = 0.0 if is_rover else (50.0 + (10.0 * math.sin(angle * 2)))

            # Battery drains cyclically for simulation
            battery = max(10, int(100 - (angle * 2) % 90))

            # --- EXTENDED CUSTOM METRICS ---
            # Heading degree (tangent to the circle)
            heading = (math.degrees(angle) + 90) % 360

            # Speed based on the radius size, plus some slight wind/terrain noise
            base_speed = drone["radius"] * 1000
            speed = max(0.0, base_speed + random.uniform(-1.0, 1.0))

            # Motor temperature fluctuates dynamically
            motor_temp = 45.0 + (speed * 0.4) + random.uniform(-1.5, 1.5)

            # Signal drops occasionally
            signal_dbm = -50 - random.randint(0, 25)

            # Build the core payload
            payload = {
                "vehicle_id": drone["id"],
                "latitude": round(lat, 6),
                "longitude": round(lon, 6),
                "altitude": round(alt, 1),
                "battery_level": battery,

                # Our new dynamic fields
                "speed_kmh": round(speed, 1),
                "heading_deg": round(heading, 1),
                "motor_temp_c": round(motor_temp, 1),
                "signal_dbm": signal_dbm,
                "mission_status": "PATROLLING" if battery > 20 else "RTH_LOW_BATTERY"
            }

            # Add highly specific parameters based on the category
            if is_rover:
                payload["terrain_friction"] = round(random.uniform(0.4, 0.8), 2)
                payload["payload_bay"] = "SECURED"
            else:
                payload["wind_speed_knots"] = round(random.uniform(5.0, 15.0), 1)
                payload["gimbal_pitch"] = round(-30.0 + (20.0 * math.cos(angle)), 1)

            # 1. Update Redis GEO spatial index
            await client.geoadd("fleet_locations", (lon, lat, drone["id"]))

            # 2. Publish to Redis Pub/Sub
            await client.publish(f"telemetry.{drone['id']}.position", json.dumps(payload))
            print(f"Simulated [{drone['id'][0:8]}]: Alt: {alt:.1f}m | Speed: {speed:.1f}km/h | Temp: {motor_temp:.1f}°C")

        await asyncio.sleep(0.5)

if __name__ == "__main__":
    asyncio.run(simulate_fleet())