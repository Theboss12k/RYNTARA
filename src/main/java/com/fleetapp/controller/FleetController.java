package com.fleetapp.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fleetapp.entity.ControlSchema;
import com.fleetapp.entity.Vehicle;
import com.fleetapp.service.FleetService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/fleet")
@CrossOrigin(origins = "${app.cors.allowed-origin:http://localhost:3000}")
public class FleetController {

    private static final Logger logger = LoggerFactory.getLogger(FleetController.class);

    private final FleetService fleetService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    private JdbcTemplate jdbcTemplate;

    public FleetController(FleetService fleetService) {
        this.fleetService = fleetService;
    }

    @GetMapping("/vehicles")
    public ResponseEntity<List<Vehicle>> getVehicles() {
        return ResponseEntity.ok(fleetService.getAllVehicles());
    }

    @GetMapping("/schemas")
    public ResponseEntity<List<ControlSchema>> getSchemas() {
        return ResponseEntity.ok(fleetService.getAllSchemas());
    }

    @PostMapping("/vehicles")
    public ResponseEntity<?> registerVehicle(@RequestBody String rawBody) {
        try {
            JsonNode jsonNode = objectMapper.readTree(rawBody);

            // rawId is the vendor/adapter-facing identifier (what the Python
            // adapters emit as vehicle_id, e.g. "DRONE-001") - it is stored as
            // external_id, NOT reused as the DB primary key, so it can be an
            // arbitrary vendor string rather than a valid UUID.
            String rawId = jsonNode.has("id") ? jsonNode.get("id").asText() : null;
            String name = jsonNode.has("name") ? jsonNode.get("name").asText() : null;
            String category = jsonNode.has("category") ? jsonNode.get("category").asText() : null;

            if (rawId == null || rawId.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Vehicle ID is required"));
            }

            String vehicleName = (name != null && !name.isBlank()) ? name : rawId;
            String safeCategory = (category != null && !category.isBlank()) ? category.toUpperCase() : "UAV";
            if (safeCategory.length() > 20) {
                safeCategory = safeCategory.substring(0, 20);
            }

            // Look up an existing row by external_id so re-registration updates
            // in place instead of creating a duplicate vehicle with a new UUID.
            UUID vehicleUuid = jdbcTemplate.query(
                    "SELECT id FROM vehicle WHERE external_id = ?",
                    rs -> rs.next() ? UUID.fromString(rs.getString("id")) : null,
                    rawId
            );
            if (vehicleUuid == null) {
                vehicleUuid = UUID.randomUUID();
            }

            // Pure JDBC atomic Upsert against the correct table name ("vehicle",
            // matching @Table on the Vehicle entity - NOT "vehicles").
            jdbcTemplate.update(
                    "INSERT INTO vehicle (id, external_id, name, category, status, created_at) " +
                            "VALUES (?, ?, ?, ?, COALESCE((SELECT status FROM vehicle WHERE id = ?), 'OFFLINE'), " +
                            "COALESCE((SELECT created_at FROM vehicle WHERE id = ?), now())) " +
                            "ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, " +
                            "external_id = EXCLUDED.external_id",
                    vehicleUuid, rawId, vehicleName, safeCategory, vehicleUuid, vehicleUuid
            );

            logger.info("Successfully registered vehicle via JDBC Upsert: {} (external_id={}, uuid={})",
                    vehicleName, rawId, vehicleUuid);
            return ResponseEntity.ok(Map.of("status", "success", "uuid", vehicleUuid.toString(), "externalId", rawId));

        } catch (Exception e) {
            logger.error("Failed to register vehicle", e);
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // Accepts either the internal UUID or the vendor-facing external ID, since
    // callers (e.g. a map/marker click) may only have one or the other handy.
    @GetMapping("/vehicles/{id}/history")
    public ResponseEntity<?> getVehicleHistory(@PathVariable("id") String id) {
        String externalId = fleetService.resolveExternalId(id);
        if (externalId == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(fleetService.getVehicleHistory(externalId));
    }
}