# RYNTARA

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.24022438.svg)](https://doi.org/10.5281/zenodo.24022438)

RYNTARA coordinates drones and rovers from one map. It is a vehicle-independent
coordination and runtime safety framework: it takes telemetry in whatever format
each vehicle speaks, shows the whole fleet live, and checks planned routes against
redzones and other traffic before they are approved.

**Demo and walkthrough:** [theboss12k.github.io/RYNTARA](https://theboss12k.github.io/RYNTARA/)

## How it works

1. **Vehicle.** Each vehicle broadcasts telemetry over UDP in its own format, on its own port.
2. **Adapter.** A Python script bound to that port turns each packet into the shared fleet schema.
3. **Ground station.** Spring Boot supervises the adapters, publishes parsed telemetry to Redis
   and keeps history in PostgreSQL.
4. **Fleet map.** The dashboard subscribes over WebSocket and draws every vehicle on a 3D map.
5. **Planner.** New routes are checked against redzones and live traffic. A conflicting route
   gets an A* alternate.

Multi-vehicle coordination uses a derived version of **PHASE** (Physics-based Hierarchical
Adaptive Spatial Evasion). The research implementation lives in
[Autonomous_Algorithms](https://github.com/Theboss12k/Autonomous_Algorithms)
([DOI 10.5281/zenodo.22260336](https://doi.org/10.5281/zenodo.22260336)).

## Repository layout

| Path | What it is |
|---|---|
| `src/main/java` | Ground station: Spring Boot 4 on Java 17+, JPA with Hibernate Spatial, WebSocket broker, adapter process manager (port 8080) |
| `fleet-dashboard/` | Operator console: React 18, MapLibre GL, deck.gl, Monaco editor (port 3000) |
| `Python_Files/` | Vehicle adapters, mock telemetry streams and the alternate-path planner |
| `Algorithms/` | The PHASE version integrated into RYNTARA |
| `adapter_mounts.json` | Adapters the ground station starts on boot |
| `vehicle_configs.json` | Registered vehicle definitions |

## Run it locally

You need Docker, JDK 17 to 21, Node.js and Python 3.13.

Start the databases and Redis:

```sh
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password -e POSTGRES_DB=fleet_db postgis/postgis:16-3.4
docker run -d -p 5433:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fleet_planning_db postgis/postgis:16-3.4
docker run -d -p 6379:6379 redis:7
```

Create the Python environment:

```sh
python3.13 -m venv Python_Files/.venv
Python_Files/.venv/bin/pip install numpy
```

Start the ground station from the repository root. It starts every adapter listed in
`adapter_mounts.json`:

```sh
./mvnw spring-boot:run
```

Start the dashboard:

```sh
cd fleet-dashboard && npm install && npm start
```

Stream simulated vehicles:

```sh
Python_Files/.venv/bin/python Python_Files/Python_Codes/mock_raw_data.py
```

Four vehicles appear at [localhost:3000/manage](http://localhost:3000/manage).

The database passwords above are local development defaults. Change them before running
RYNTARA anywhere other than your own machine.

## Safety note

RYNTARA is for research and system development. It makes no guarantee of collision-free
operation without further validation, and it is not certified for flight or road use.

## License

[Apache License 2.0](LICENSE)

## Citing RYNTARA

If you use RYNTARA in your work, please cite it. GitHub's **Cite this repository** button gives APA and BibTeX from [`CITATION.cff`](CITATION.cff), and the DOI [10.5281/zenodo.24022438](https://doi.org/10.5281/zenodo.24022438) always resolves to the latest archived release on Zenodo.

