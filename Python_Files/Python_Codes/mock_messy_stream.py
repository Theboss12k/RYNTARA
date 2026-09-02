import asyncio
import json
import socket
import math

TARGET_PORT = 14557

async def stream_messy_data():
    print(f"Starting alternative messy data stream to 127.0.0.1:{TARGET_PORT}...")
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    angle = 0
    while True:
        angle += 0.1

        # Completely different messy data structure ("HERMES_STREAM_V9")
        messy_payload = {
            "packet_type": "HERMES_STREAM_V9",
            "craft_id": "HERMES-DRONE-77",
            "gps_pos": {
                "latitude_val": round(48.8566 + (0.01 * math.cos(angle)), 6), # Paris, France
                "longitude_val": round(2.3522 + (0.01 * math.sin(angle)), 6)
            },
            "elevation_meters": round(300.0 + (10.0 * math.sin(angle)), 1),
            "power_cell_percentage": max(5, int(95 - (angle * 3) % 90)),
            "ground_speed_knots": round(20.0 + (2.0 * math.cos(angle)), 1),
            "compass_heading": round((math.degrees(angle)) % 360, 1)
        }

        encoded_payload = json.dumps(messy_payload).encode('utf-8')
        sock.sendto(encoded_payload, ('127.0.0.1', TARGET_PORT))

        print(f"Transmitted alternative packet for {messy_payload['craft_id']} on port {TARGET_PORT}")
        await asyncio.sleep(1.0) # Send once per second

if __name__ == "__main__":
    asyncio.run(stream_messy_data())