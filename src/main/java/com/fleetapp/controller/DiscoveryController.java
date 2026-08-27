package com.fleetapp.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fleetapp.config.GroundStationProcessManager;
import com.fleetapp.config.GroundStationProcessManager.PersistedMount;
import com.fleetapp.config.GroundStationProcessManager.PortConflictException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyEmitter;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

@RestController
@RequestMapping("/api/discovery")
@CrossOrigin(origins = "*")
public class DiscoveryController {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    private GroundStationProcessManager groundStationProcessManager;

    @GetMapping("/adapters")
    public ResponseEntity<List<String>> getAdapters() {
        try {
            Path adapterDir = Paths.get(System.getProperty("user.dir"), "Python_Files", "Python_Codes", "Vehicle_Adapters");
            List<String> adapters = new ArrayList<>();
            if (Files.exists(adapterDir)) {
                try (var stream = Files.list(adapterDir)) {
                    stream.filter(Files::isRegularFile)
                            .map(p -> p.getFileName().toString())
                            .filter(name -> name.endsWith(".py") && !name.startsWith("."))
                            .forEach(adapters::add);
                }
            }
            return ResponseEntity.ok(adapters);
        } catch (Exception e) {
            return ResponseEntity.ok(Collections.emptyList());
        }
    }

    /** Which ports are currently bound and by which adapter - lets the UI steer clear of conflicts up front. */
    @GetMapping("/mounts")
    public ResponseEntity<List<PersistedMount>> getMounts() {
        return ResponseEntity.ok(groundStationProcessManager.listActiveMounts());
    }

    @GetMapping("/configs")
    public ResponseEntity<List<Map<String, Object>>> getConfigs() {
        try {
            Path path = Paths.get(System.getProperty("user.dir"), "vehicle_configs.json");
            if (Files.exists(path)) {
                List<Map<String, Object>> configs = objectMapper.readValue(path.toFile(), new TypeReference<List<Map<String, Object>>>() {});
                return ResponseEntity.ok(configs);
            }
            return ResponseEntity.ok(Collections.emptyList());
        } catch (Exception e) {
            return ResponseEntity.ok(Collections.emptyList());
        }
    }

    @PostMapping("/configs")
    public ResponseEntity<?> saveVehicleConfig(@RequestBody Map<String, Object> payload) {
        try {
            Path path = Paths.get(System.getProperty("user.dir"), "vehicle_configs.json");
            List<Map<String, Object>> configs = new ArrayList<>();

            if (Files.exists(path)) {
                configs = objectMapper.readValue(path.toFile(), new TypeReference<List<Map<String, Object>>>() {});
            }

            String vehicleId = (String) payload.get("id");
            configs.removeIf(c -> vehicleId != null && vehicleId.equals(c.get("id")));
            configs.add(payload);

            objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), configs);
            return ResponseEntity.ok(Map.of("status", "success"));

        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Registration-phase scan.
     *
     * Body: { "adapter": "drone_adapter.py", "port": 14550, "idPattern": "UAV-SQD7-.*" (optional) }
     *
     * Flow, matching the required registration sequence:
     *   1. Use the SELECTED adapter, bound to the SPECIFIED port (ensureMountRunning - reuses
     *      an already-running mount for that exact adapter+port, or refuses with a clear
     *      conflict if the port belongs to a different adapter).
     *   2. Listen briefly and collect the vehicle names/IDs that adapter has actually seen on
     *      that port.
     *   3. Compare those IDs against the database (Postgres `vehicle` table), not just the
     *      local JSON cache, so "already registered" reflects the real source of truth.
     */
    @PostMapping(value = "/scan", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseBodyEmitter scanSpectrum(@RequestBody Map<String, Object> request) {
        ResponseBodyEmitter emitter = new ResponseBodyEmitter(60000L);

        String adapter = (String) request.get("adapter");
        Object portObj = request.get("port");

        new Thread(() -> {
            try {
                if (adapter == null || adapter.isBlank()) {
                    emitter.send(">> ERROR: no adapter selected.\n");
                    emitter.completeWithError(new IllegalArgumentException("adapter is required"));
                    return;
                }
                if (portObj == null) {
                    emitter.send(">> ERROR: no port specified. Every adapter mount needs an explicit port.\n");
                    emitter.completeWithError(new IllegalArgumentException("port is required"));
                    return;
                }

                int port;
                try {
                    port = Integer.parseInt(String.valueOf(portObj));
                } catch (NumberFormatException e) {
                    emitter.send(">> ERROR: port must be a number.\n");
                    emitter.completeWithError(e);
                    return;
                }

                emitter.send(">> Mounting adapter '" + adapter + "' on port " + port + "...\n");

                try {
                    groundStationProcessManager.ensureMountRunning(adapter, port);
                } catch (PortConflictException pce) {
                    // Distinct, greppable prefix so the frontend can show a dedicated conflict message.
                    emitter.send(">> PORT_CONFLICT: " + pce.getMessage() + "\n");
                    emitter.completeWithError(pce);
                    return;
                }

                emitter.send(">> Adapter mounted. Listening for UDP telemetry broadcasts...\n");

                // Give the adapter a window to actually receive some packets on the port.
                Thread.sleep(3000);

                Map<String, Set<String>> cache = groundStationProcessManager.getDiscoveredCacheForPort(port);
                emitter.send(">> Intercepted active entities on port " + port + ": " + cache.size() + "\n");

                Map<String, Boolean> inDb = groundStationProcessManager.compareToDb(cache.keySet());

                emitter.send("---SCAN_COMPLETE---\n");

                List<Map<String, Object>> results = new ArrayList<>();
                for (Map.Entry<String, Set<String>> entry : cache.entrySet()) {
                    Map<String, Object> vehicleInfo = new LinkedHashMap<>();
                    vehicleInfo.put("vehicleId", entry.getKey());
                    vehicleInfo.put("detectedParameters", new ArrayList<>(entry.getValue()));
                    vehicleInfo.put("inDatabase", inDb.getOrDefault(entry.getKey(), false));
                    results.add(vehicleInfo);
                }

                emitter.send(objectMapper.writeValueAsString(results) + "\n");
                emitter.complete();

            } catch (Exception e) {
                try {
                    emitter.send(">> ERROR during scan: " + e.getMessage() + "\n");
                    emitter.completeWithError(e);
                } catch (Exception ignored) {}
            }
        }).start();

        return emitter;
    }
}
