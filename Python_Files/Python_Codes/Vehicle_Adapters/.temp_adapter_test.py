import socket
import json
import argparse

def parse_packet(raw_data):
    try:
        data = json.loads(raw_data.decode('utf-8'))
        
        if data.get("header") != "CUSTOM_PROPRIETARY_V2":
            return None
        
        telemetry = data.get("telemetry", {})
        pwr = data.get("pwr", {})

        parsed = {
            "vehicle_id": data.get("uav_id"),
            "latitude": telemetry.get("loc", [])[0],
            "longitude": telemetry.get("loc", [])[1],
            "altitude": telemetry.get("alt_m"),
            "battery_level": pwr.get("bat_pct"),
            "speed_kmh": telemetry.get("velocity_kts", 0) * 1.852,  # Convert knots to km/h
            "heading_deg": telemetry.get("yaw")
        }
        
        return parsed

    except (json.JSONDecodeError, KeyError, IndexError):
        return None

def run_adapter(ip, port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((ip, port))
    
    while True:
        raw_data, _ = sock.recvfrom(1024)  # Buffer size is 1024 bytes
        parsed_packet = parse_packet(raw_data)
        
        if parsed_packet:
            print(json.dumps(parsed_packet), flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--listen-ip', default='0.0.0.0')
    parser.add_argument('--listen-port', type=int, default=14555)
    
    args = parser.parse_args()
    run_adapter(args.listen_ip, args.listen_port)