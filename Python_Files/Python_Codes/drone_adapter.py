import asyncio
import json
import argparse
import redis.asyncio as redis
from mavsdk import System

async def run(vehicle_id, connection_url, redis_host, redis_port):
    print(f"[{vehicle_id}] Initializing adapter...")

    # Connect to Redis
    redis_client = redis.Redis(host=redis_host, port=redis_port, decode_responses=True)

    drone = System()
    print(f"[{vehicle_id}] Connecting to drone at {connection_url}...")
    await drone.connect(system_address=connection_url)

    async for state in drone.core.connection_state():
        if state.is_connected:
            print(f"[{vehicle_id}] Drone successfully connected!")
            break

    # Start the continuous telemetry streams
    asyncio.ensure_future(stream_position(drone, redis_client, vehicle_id))
    asyncio.ensure_future(stream_battery(drone, redis_client, vehicle_id))

    while True:
        await asyncio.sleep(1)

async def stream_position(drone, redis_client, vehicle_id):
    """Listens to GPS position and publishes it dynamically."""
    async for position in drone.telemetry.position():
        payload = {
            "vehicle_id": vehicle_id,
            "latitude": position.latitude_deg,
            "longitude": position.longitude_deg,
            "altitude": position.absolute_altitude_m
        }

        await redis_client.geoadd(
            "fleet_locations",
            (position.longitude_deg, position.latitude_deg, vehicle_id)
        )

        # Dynamically route to the correct WebSocket channel
        topic = f"telemetry.{vehicle_id}.position"
        await redis_client.publish(topic, json.dumps(payload))

async def stream_battery(drone, redis_client, vehicle_id):
    """Listens to battery state and publishes it dynamically."""
    async for battery in drone.telemetry.battery():
        payload = {
            "vehicle_id": vehicle_id,
            "battery_level": round(battery.remaining_percent * 100, 1)
        }
        topic = f"telemetry.{vehicle_id}.battery"
        await redis_client.publish(topic, json.dumps(payload))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MAVLink to Redis Adapter")
    parser.add_argument("--id", required=True, help="The UUID of the vehicle from the database")
    parser.add_argument("--url", default="udp://:14540", help="The MAVLink connection string (e.g., udp://:14540, serial:///dev/ttyUSB0:57600)")
    parser.add_argument("--redis-host", default="localhost", help="Redis server host")
    parser.add_argument("--redis-port", type=int, default=6379, help="Redis server port")

    args = parser.parse_args()

    # Run the event loop with dynamic arguments
    asyncio.run(run(args.id, args.url, args.redis_host, args.redis_port))