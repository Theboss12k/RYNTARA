package com.fleetapp.config;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fleetapp.entity.VehicleConfig;
import com.fleetapp.repository.VehicleRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.geo.Point;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
import java.util.stream.Stream;

/**
 * Owns every Python ground-station adapter process.
 *
 * Two invariants this class enforces that did not exist before:
 *
 *  1. ONE ADAPTER PER PORT. A UDP port may only ever have a single live
 *     adapter process bound to it. This is tracked centrally in
 *     {@code portRegistry} rather than left to the OS - see
 *     {@link #claimPort(int, String)}.
 *
 *  2. Every adapter is launched with an EXPLICIT --listen-port. Previously
 *     adapters were launched with only --listen-ip, so every script always
 *     bound whatever default port was hardcoded in its own argparse config.
 *     That made it impossible to run two adapters that happened to share a
 *     default port, and impossible to point an adapter at an
 *     operator-chosen port from the "Add Vehicle" flow.
 */
@Component
public class GroundStationProcessManager {

    private static final Logger logger = LoggerFactory.getLogger(GroundStationProcessManager.class);

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired
    private VehicleRepository vehicleRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ExecutorService streamExecutor = Executors.newCachedThreadPool();

    private final Path adapterDir = Paths.get(System.getProperty("user.dir"), "Python_Files", "Python_Codes", "Vehicle_Adapters");
    private final Path mountsFile = Paths.get(System.getProperty("user.dir"), "adapter_mounts.json");
    private final Path vehicleConfigsFile = Paths.get(System.getProperty("user.dir"), "vehicle_configs.json");

    /** port -> the single adapter process bound to that port. Guarded by itself. */
    private final Map<Integer, Mount> portRegistry = new HashMap<>();

    /**
     * Per-port discovery cache: port -> (vehicleId -> observed telemetry field names).
     * Keyed by port (not merged globally) so that a scan for one adapter/port never
     * shows vehicles that were actually seen on a *different* port.
     */
    private final Map<Integer, Map<String, Set<String>>> discoveredCache = new ConcurrentHashMap<>();

    public static class Mount {
        public final String adapterScript;
        public final int port;
        public final Process process;

        Mount(String adapterScript, int port, Process process) {
            this.adapterScript = adapterScript;
            this.port = port;
            this.process = process;
        }
    }

    /** Thrown when a port is requested that is already bound by a *different* adapter script. */
    public static class PortConflictException extends RuntimeException {
        public final int port;
        public final String heldBy;

        public PortConflictException(int port, String heldBy) {
            super("Port " + port + " is already bound by adapter '" + heldBy + "'. One adapter per port is enforced - stop it first or choose a different port.");
            this.port = port;
            this.heldBy = heldBy;
        }
    }

    // =========================================================================================
    // STARTUP
    // =========================================================================================

    @EventListener(ApplicationReadyEvent.class)
    public void startAllAdapters() {
        logger.info("Initializing Ground Station Adapters...");

        List<PersistedMount> mounts = loadPersistedMounts();

        if (mounts.isEmpty() && Files.exists(adapterDir)) {
            // First run / migration path: nothing has been mounted explicitly yet.
            // Fall back to "one mount per adapter file found, on its own script default port"
            // so existing deployments keep working, then persist that as the real mount list
            // going forward so every subsequent start goes through the port registry.
            mounts = discoverDefaultMounts();
            persistMounts(mounts);
        }

        for (PersistedMount m : mounts) {
            try {
                ensureMountRunning(m.adapterScript, m.port);
            } catch (Exception e) {
                logger.error("Failed to bring up persisted mount {} on port {}", m.adapterScript, m.port, e);
            }
        }
    }

    /** Best-effort: read each script's own argparse default so first-run behavior is unchanged. */
    private List<PersistedMount> discoverDefaultMounts() {
        List<PersistedMount> result = new ArrayList<>();
        try (Stream<Path> paths = Files.list(adapterDir)) {
            List<String> scripts = paths.filter(Files::isRegularFile)
                    .map(p -> p.getFileName().toString())
                    .filter(name -> name.endsWith(".py") && !name.startsWith("."))
                    .sorted()
                    .collect(java.util.stream.Collectors.toList());

            for (String script : scripts) {
                Integer defaultPort = readDefaultPortFromArgparse(script);
                if (defaultPort == null) {
                    logger.warn("Could not determine a default --listen-port for '{}'; skipping auto-mount. " +
                            "Mount it explicitly (with a port) from the Add Vehicle screen instead.", script);
                    continue;
                }
                result.add(new PersistedMount(script, defaultPort));
            }
        } catch (IOException e) {
            logger.error("Failed to read adapter directory", e);
        }
        return result;
    }

    private Integer readDefaultPortFromArgparse(String scriptName) {
        try {
            String content = Files.readString(adapterDir.resolve(scriptName));
            java.util.regex.Matcher m = Pattern.compile("--listen-port[^\\n]*?default\\s*=\\s*(\\d+)").matcher(content);
            if (m.find()) {
                return Integer.parseInt(m.group(1));
            }
        } catch (IOException e) {
            logger.warn("Could not read {} to infer default port: {}", scriptName, e.getMessage());
        }
        return null;
    }

    // =========================================================================================
    // MOUNT / PORT LIFECYCLE
    // =========================================================================================

    /**
     * Idempotently ensures {@code adapterScript} is running and bound to {@code port}.
     *
     * - If that exact (script, port) pair is already running, this is a no-op (reuse).
     * - If the port is held by a DIFFERENT script, throws {@link PortConflictException}.
     * - Otherwise launches a new process on that port.
     *
     * This is what both the live-telemetry startup path AND the "Add Vehicle" discovery
     * scan call, so a registration scan never accidentally starts a second, competing
     * process on a port some other adapter already owns.
     */
    public synchronized Mount ensureMountRunning(String adapterScript, int port) throws IOException {
        if (adapterScript == null || adapterScript.isBlank()) {
            throw new IllegalArgumentException("adapterScript is required");
        }
        if (port <= 0 || port > 65535) {
            throw new IllegalArgumentException("port must be between 1 and 65535");
        }

        Mount existing = portRegistry.get(port);
        if (existing != null) {
            if (isMountAlive(existing)) {
                if (existing.adapterScript.equals(adapterScript)) {
                    return existing; // already exactly what was asked for - reuse it
                }
                throw new PortConflictException(port, existing.adapterScript);
            }
            // stale entry for a dead process, or a non-adapter placeholder claim - fall
            // through and relaunch (a placeholder claim is treated as "in use" below,
            // never removed silently, so sandbox reservations still block us here).
            if (existing.process != null) {
                portRegistry.remove(port);
            } else {
                throw new PortConflictException(port, existing.adapterScript);
            }
        }

        Mount mount = launchAdapterProcess(adapterScript, port);
        portRegistry.put(port, mount);
        persistMounts(currentMountsSnapshot());
        return mount;
    }

    /** Claims a port for a non-adapter consumer (e.g. the Adapter Studio sandbox) without launching anything. */
    public synchronized void claimPort(int port, String owner) {
        Mount existing = portRegistry.get(port);
        if (isMountAlive(existing) || isPlaceholderClaim(existing)) {
            throw new PortConflictException(port, existing.adapterScript);
        }
        // A null-process placeholder mount reserves the port for the caller (e.g. sandbox test run)
        // without there being a real adapter Process behind it yet.
        portRegistry.put(port, new Mount(owner, port, null));
    }

    public synchronized void releasePort(int port) {
        portRegistry.remove(port);
    }

    /** All ports currently bound by a live adapter process - lets the UI show what's already taken. */
    public List<PersistedMount> listActiveMounts() {
        return currentMountsSnapshot();
    }

    public synchronized Optional<String> ownerOf(int port) {
        Mount m = portRegistry.get(port);
        if (m == null) return Optional.empty();
        return Optional.of(m.adapterScript);
    }

    private boolean isMountAlive(Mount m) {
        return m != null && m.process != null && m.process.isAlive();
    }

    private boolean isPlaceholderClaim(Mount m) {
        return m != null && m.process == null;
    }

    private Mount launchAdapterProcess(String scriptName, int port) throws IOException {
        Path scriptPath = adapterDir.resolve(scriptName);
        if (!Files.exists(scriptPath)) {
            throw new IOException("Adapter script not found: " + scriptPath);
        }

        ProcessBuilder processBuilder = new ProcessBuilder(
                "Python_Files/.venv/bin/python3.13",
                scriptPath.toString(),
                "--listen-ip", "0.0.0.0",
                "--listen-port", String.valueOf(port)
        );

        processBuilder.redirectErrorStream(true);
        processBuilder.environment().put("PYTHONUNBUFFERED", "1");

        Process process = processBuilder.start();
        logger.info("Launched adapter '{}' on port {} with PID: {}", scriptName, port, process.pid());

        // Each adapter process gets its own dedicated reader thread ("separate terminal").
        // These threads are fully independent of one another - see the class-level note on
        // thread/port hygiene below - so N adapters never contend over a single buffer.
        startStreamProcessor(process, scriptName, port);

        process.onExit().thenAccept(p -> {
            logger.warn("Adapter '{}' on port {} exited (code {}). Releasing port.", scriptName, port, p.exitValue());
            synchronized (this) {
                Mount current = portRegistry.get(port);
                if (current != null && current.process == p) {
                    portRegistry.remove(port);
                }
            }
        });

        return new Mount(scriptName, port, process);
    }

    private void startStreamProcessor(Process process, String scriptName, int port) {
        streamExecutor.submit(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {

                    if (!line.trim().startsWith("{")) {
                        logger.debug("[{}:{}] {}", scriptName, port, line);
                        continue;
                    }

                    try {
                        JsonNode payload = objectMapper.readTree(line);

                        String vehicleId = null;
                        if (payload.has("vehicle_id")) {
                            vehicleId = payload.get("vehicle_id").asText();
                        } else if (payload.has("uav_id")) {
                            vehicleId = payload.get("uav_id").asText();
                        } else if (payload.has("craft_id")) {
                            vehicleId = payload.get("craft_id").asText();
                        }

                        if (vehicleId != null && !vehicleId.isBlank()) {
                            Set<String> keys = new HashSet<>();
                            payload.fieldNames().forEachRemaining(keys::add);
                            discoveredCache
                                    .computeIfAbsent(port, k -> new ConcurrentHashMap<>())
                                    .computeIfAbsent(vehicleId, k -> ConcurrentHashMap.newKeySet())
                                    .addAll(keys);
                        }

                        if (vehicleId != null && isVehicleAuthorized(vehicleId)) {
                            redisTemplate.convertAndSend("telemetry.live", line);

                            if (payload.has("longitude") && payload.has("latitude")) {
                                double lon = payload.get("longitude").asDouble();
                                double lat = payload.get("latitude").asDouble();
                                redisTemplate.opsForGeo().add("fleet_locations", new Point(lon, lat), vehicleId);
                            }
                        } else {
                            logger.warn("[{}:{}] Firewall Blocked Unauthorized ID: {}", scriptName, port, vehicleId);
                        }

                    } catch (Exception e) {
                        logger.error("[{}:{}] Failed to parse incoming JSON: {}", scriptName, port, line, e);
                    }
                }
            } catch (IOException e) {
                logger.error("[{}:{}] Error reading adapter stream", scriptName, port, e);
            }
        });
    }

    // =========================================================================================
    // AUTHORIZATION - exact ID match OR regex idPattern match, so a single vehicle_configs.json
    // entry can authorize a whole fleet of vehicles sharing an ID naming convention on one port,
    // instead of requiring one entry per exact vehicle_id.
    // =========================================================================================

    private boolean isVehicleAuthorized(String vehicleIdStr) {
        if (vehicleIdStr == null || vehicleIdStr.isBlank()) {
            return false;
        }

        for (VehicleConfig config : readVehicleConfigs()) {
            if (vehicleIdStr.equals(config.getId())) {
                return true;
            }
            if (config.getIdPattern() != null && !config.getIdPattern().isBlank()) {
                Pattern compiled = compilePatternSafely(config.getIdPattern());
                if (compiled != null && compiled.matcher(vehicleIdStr).matches()) {
                    return true;
                }
            }
        }
        return false;
    }

    private final Map<String, Pattern> patternCache = new ConcurrentHashMap<>();

    private Pattern compilePatternSafely(String regex) {
        return patternCache.computeIfAbsent(regex, r -> {
            try {
                return Pattern.compile(r);
            } catch (PatternSyntaxException e) {
                logger.error("Invalid idPattern regex '{}' in vehicle_configs.json - ignoring", r, e);
                return null;
            }
        });
    }

    private List<VehicleConfig> readVehicleConfigs() {
        try {
            if (Files.exists(vehicleConfigsFile)) {
                return objectMapper.readValue(vehicleConfigsFile.toFile(), new TypeReference<List<VehicleConfig>>() {});
            }
        } catch (Exception e) {
            logger.error("Error reading vehicle_configs.json", e);
        }
        return Collections.emptyList();
    }

    // =========================================================================================
    // DISCOVERY (used by DiscoveryController's /api/discovery/scan)
    // =========================================================================================

    /** Raw sightings for exactly one port - never mixed with sightings from any other port/adapter. */
    public Map<String, Set<String>> getDiscoveredCacheForPort(int port) {
        return discoveredCache.getOrDefault(port, Collections.emptyMap());
    }

    /**
     * Splits a set of discovered vehicle IDs into those already present in the Postgres
     * `vehicle` table and those that are not - i.e. the actual "compare to db" step, using
     * the same ID normalization rule FleetController uses when it registers a vehicle
     * (literal UUID if the id parses as one, otherwise a deterministic name-based UUID).
     */
    public Map<String, Boolean> compareToDb(Collection<String> vehicleIds) {
        Map<String, Boolean> result = new LinkedHashMap<>();
        for (String rawId : vehicleIds) {
            UUID uuid;
            try {
                uuid = UUID.fromString(rawId);
            } catch (IllegalArgumentException e) {
                uuid = UUID.nameUUIDFromBytes(rawId.getBytes());
            }
            result.put(rawId, vehicleRepository.existsById(uuid));
        }
        return result;
    }

    // =========================================================================================
    // PERSISTENCE OF MOUNTS (adapter_mounts.json)
    // =========================================================================================

    public static class PersistedMount {
        public String adapterScript;
        public int port;

        public PersistedMount() {}

        PersistedMount(String adapterScript, int port) {
            this.adapterScript = adapterScript;
            this.port = port;
        }
    }

    private synchronized List<PersistedMount> currentMountsSnapshot() {
        List<PersistedMount> snapshot = new ArrayList<>();
        for (Mount m : portRegistry.values()) {
            if (m.process != null && m.process.isAlive()) {
                snapshot.add(new PersistedMount(m.adapterScript, m.port));
            }
        }
        return snapshot;
    }

    private List<PersistedMount> loadPersistedMounts() {
        try {
            if (Files.exists(mountsFile)) {
                return objectMapper.readValue(mountsFile.toFile(), new TypeReference<List<PersistedMount>>() {});
            }
        } catch (Exception e) {
            logger.error("Error reading adapter_mounts.json", e);
        }
        return new ArrayList<>();
    }

    private void persistMounts(List<PersistedMount> mounts) {
        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(mountsFile.toFile(), mounts);
        } catch (IOException e) {
            logger.error("Error saving adapter_mounts.json", e);
        }
    }

    // =========================================================================================
    // SHUTDOWN
    // =========================================================================================

    @PreDestroy
    public void stopAllAdapters() {
        logger.info("Shutting down all Ground Station Python adapters...");
        for (Mount mount : portRegistry.values()) {
            if (mount.process != null && mount.process.isAlive()) {
                mount.process.destroy();
            }
        }
        streamExecutor.shutdownNow();
    }
}
