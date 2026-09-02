package com.fleetapp.controller;

import com.fleetapp.dto.ConflictResult;
import com.fleetapp.dto.ProposedManifest;
import com.fleetapp.planning.entity.Manifest;
import com.fleetapp.planning.entity.Redzone;
import com.fleetapp.planning.entity.Waypoint;
import com.fleetapp.service.ConflictEngineService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/routing")
@CrossOrigin(origins = "*")
public class RoutingController {

    @Autowired
    private ConflictEngineService conflictEngine;

    @Autowired
    private com.fleetapp.planning.repository.RedzoneRepository redzoneRepo;

    @Autowired
    private com.fleetapp.planning.repository.WaypointRepository waypointRepo;

    @Autowired
    private com.fleetapp.planning.repository.ManifestRepository manifestRepo;

    @PostMapping("/validate")
    public ResponseEntity<ConflictResult> validatePath(@RequestBody ProposedManifest manifest) {
        ConflictResult result = conflictEngine.validateManifest(manifest);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/submit")
    public ResponseEntity<String> submitManifest(@RequestBody ProposedManifest manifest) {
        ConflictResult result = conflictEngine.validateManifest(manifest);
        if (result.isHasConflict()) {
            return ResponseEntity.badRequest().body("Conflict detected. Submission rejected.");
        }

        org.locationtech.jts.geom.GeometryFactory gf = new org.locationtech.jts.geom.GeometryFactory();

        // 1. Generate & Save Official Manifest DB Entry
        Manifest newManifest = new Manifest();
        newManifest.setVehicleId(manifest.getVehicleId());
        newManifest.setStartTime(manifest.getStartTime());
        newManifest.setEndTime(manifest.getEndTime());
        newManifest.setSpeed(manifest.getSpeed());
        newManifest.setName(manifest.getName() != null && !manifest.getName().isBlank() ? manifest.getName() : "Auto-Generated Route");
        newManifest.setStatus("APPROVED");
        manifestRepo.save(newManifest);

        // 2. Save UI Redzones
        if (manifest.getLocalRedzones() != null) {
            for (com.fleetapp.dto.ProposedRedzone rz : manifest.getLocalRedzones()) {
                Redzone entity = new Redzone();
                org.locationtech.jts.geom.Point center = gf.createPoint(new org.locationtech.jts.geom.Coordinate(rz.getLongitude(), rz.getLatitude()));
                center.setSRID(4326);
                entity.setCenterLocation(center);
                entity.setRadiusMeters(rz.getRadiusMeters());
                entity.setPermanent(true);
                redzoneRepo.save(entity);
            }
        }

        // 3. Save Waypoints
        if (manifest.getWaypoints() != null) {
            for (com.fleetapp.dto.ProposedWaypoint pw : manifest.getWaypoints()) {
                Waypoint wp = new Waypoint();
                wp.setVehicleId(manifest.getVehicleId());
                org.locationtech.jts.geom.Point loc = gf.createPoint(new org.locationtech.jts.geom.Coordinate(pw.getLongitude(), pw.getLatitude()));
                loc.setSRID(4326);
                wp.setLocation(loc);
                wp.setAltitude(pw.getAltitude());
                wp.setPlannedTime(pw.getTimestamp());
                waypointRepo.save(wp);
            }
        }

        return ResponseEntity.ok("Manifest successfully integrated into routing matrix.");
    }

    // --- ATC DATA FETCH ENDPOINTS --- //

    @GetMapping("/redzones")
    public ResponseEntity<List<Map<String, Object>>> getActiveRedzones() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Redzone rz : redzoneRepo.findAll()) {
            Map<String, Object> map = new HashMap<>();
            map.put("id", rz.getId());
            map.put("longitude", rz.getCenterLocation().getX());
            map.put("latitude", rz.getCenterLocation().getY());
            map.put("radiusMeters", rz.getRadiusMeters());
            result.add(map);
        }
        return ResponseEntity.ok(result);
    }

    @GetMapping("/manifests")
    public ResponseEntity<List<Manifest>> getAllManifests() {
        return ResponseEntity.ok(manifestRepo.findAll());
    }

    @GetMapping("/traffic")
    public ResponseEntity<Map<String, List<Map<String, Object>>>> getActiveTraffic() {
        Map<String, List<Map<String, Object>>> grouped = new HashMap<>();

        for (Waypoint wp : waypointRepo.findAll()) {
            grouped.putIfAbsent(wp.getVehicleId(), new ArrayList<>());

            Map<String, Object> map = new HashMap<>();
            map.put("vehicleId", wp.getVehicleId()); // Injects vehicleID for React Tooltips
            map.put("longitude", wp.getLocation().getX());
            map.put("latitude", wp.getLocation().getY());
            map.put("altitude", wp.getAltitude());
            map.put("timestamp", wp.getPlannedTime().toString());

            grouped.get(wp.getVehicleId()).add(map);
        }

        for (List<Map<String, Object>> path : grouped.values()) {
            path.sort((a, b) -> LocalDateTime.parse((String)a.get("timestamp"))
                    .compareTo(LocalDateTime.parse((String)b.get("timestamp"))));
        }

        return ResponseEntity.ok(grouped);
    }
}