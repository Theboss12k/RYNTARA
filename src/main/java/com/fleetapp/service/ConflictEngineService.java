package com.fleetapp.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fleetapp.dto.ConflictResult;
import com.fleetapp.dto.ProposedManifest;
import com.fleetapp.dto.ProposedWaypoint;
import com.fleetapp.dto.ProposedRedzone;
import com.fleetapp.planning.entity.Redzone;
import com.fleetapp.planning.entity.Waypoint;
import com.fleetapp.planning.repository.RedzoneRepository;
import com.fleetapp.planning.repository.WaypointRepository;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class ConflictEngineService {

    @Autowired
    private WaypointRepository waypointRepo;

    @Autowired
    private RedzoneRepository redzoneRepo;

    private final GeometryFactory geometryFactory = new GeometryFactory();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ConflictResult validateManifest(ProposedManifest proposed) {
        LocalDateTime paddedStart = proposed.getStartTime().minusSeconds(60);
        LocalDateTime paddedEnd = proposed.getEndTime().plusSeconds(60);

        List<Redzone> activeRedzones = redzoneRepo.findAll();
        List<Waypoint> trafficInWindow = waypointRepo.findByPlannedTimeBetween(paddedStart, paddedEnd);

        double bubble = Math.max(proposed.getSafetyBubble(),5.0); // Fetch safety bubble parameter and add 5 m to it for safety

        for (int i = 0; i < proposed.getWaypoints().size(); i++) {
            ProposedWaypoint current = proposed.getWaypoints().get(i);
            Point currentGeom = geometryFactory.createPoint(new Coordinate(current.getLongitude(), current.getLatitude()));
            currentGeom.setSRID(4326);

            boolean hasCollision = false;
            String collider = null;
            double violationDist = 0.0;

            // 1. Check DB Redzones (Enforcing Radius + Safety Bubble)
            for (Redzone rz : activeRedzones) {
                double distance = calculateDistance(currentGeom, rz.getCenterLocation());
                if (distance <= (rz.getRadiusMeters() + bubble)) {
                    hasCollision = true; collider = "DB_REDZONE"; violationDist = distance; break;
                }
            }

            // 1.5 Check UI Local Redzones (Enforcing Radius + Safety Bubble)
            if (!hasCollision && proposed.getLocalRedzones() != null) {
                for (ProposedRedzone rz : proposed.getLocalRedzones()) {
                    Point rzCenter = geometryFactory.createPoint(new Coordinate(rz.getLongitude(), rz.getLatitude()));
                    rzCenter.setSRID(4326);
                    double distance = calculateDistance(currentGeom, rzCenter);
                    if (distance <= (rz.getRadiusMeters() + bubble) && current.getAltitude() >= rz.getAltitudeMinMeters() && current.getAltitude() <= rz.getAltitudeMaxMeters()) {
                        hasCollision = true; collider = "UI_REDZONE"; violationDist = distance; break;
                    }
                }
            }

            // 2. Check Dynamic DB Traffic (Enforcing Safety Bubble)
            if (!hasCollision) {
                for (Waypoint traffic : trafficInWindow) {
                    if (traffic.getVehicleId() != null && traffic.getVehicleId().equals(proposed.getVehicleId())) continue;
                    long timeDiffMs = Math.abs(Duration.between(current.getTimestamp(), traffic.getPlannedTime()).toMillis());
                    if (timeDiffMs <= 10000) {
                        double distance = calculateDistance(currentGeom, traffic.getLocation());
                        double altDifference = Math.abs(current.getAltitude() - traffic.getAltitude());
                        if (distance <= bubble && altDifference < 10.0) {
                            hasCollision = true; collider = traffic.getVehicleId(); violationDist = distance; break;
                        }
                    }
                }
            }

            // --- COLLISION TRIGGERED: CALL PYTHON PLANNER ---
            if (hasCollision) {
                System.out.println("\n[JAVA DEBUG] --- COLLISION DETECTED AT INDEX " + i + " ---");
                ConflictResult res = new ConflictResult(true, i, collider, violationDist);
                try {
                    List<Map<String, Double>> newPath = generateAlternatePath(proposed, activeRedzones, trafficInWindow);
                    res.setSuggestedPath(newPath);
                } catch (Exception e) {
                    System.err.println("[JAVA ERROR] Python Planner Execution Failed:");
                    e.printStackTrace();
                }
                return res;
            }
        }
        return new ConflictResult(false, -1, null, 0.0);
    }

    private List<Map<String, Double>> generateAlternatePath(ProposedManifest proposed, List<Redzone> redzones, List<Waypoint> traffic) throws Exception {
        Map<String, Object> payload = new HashMap<>();

        ProposedWaypoint aStarStart = proposed.getWaypoints().get(0);
        ProposedWaypoint aStarGoal = proposed.getWaypoints().get(proposed.getWaypoints().size() - 1);

        if (proposed.getWaypoints().size() > 2 && proposed.getWaypoints().get(0).getAltitude() != proposed.getWaypoints().get(1).getAltitude()) {
            aStarStart = proposed.getWaypoints().get(1);
            aStarGoal = proposed.getWaypoints().get(proposed.getWaypoints().size() - 2);
        }

        payload.put("start", new double[]{aStarStart.getLongitude(), aStarStart.getLatitude(), aStarStart.getAltitude()});
        payload.put("goal", new double[]{aStarGoal.getLongitude(), aStarGoal.getLatitude(), aStarGoal.getAltitude()});

        List<double[]> obstacles = new ArrayList<>();
        double bubble = Math.max(proposed.getSafetyBubble(),5.0); // Dynamically fetch user's safety bubble

        // --- ADD SAFETY BUBBLE DIRECTLY TO ALL OBSTACLE RADII ---
        for (Redzone rz : redzones) {
            obstacles.add(new double[]{rz.getCenterLocation().getX(), rz.getCenterLocation().getY(), 0.0, rz.getRadiusMeters() + bubble, 200.0});
        }
        if (proposed.getLocalRedzones() != null) {
            for (ProposedRedzone rz : proposed.getLocalRedzones()) {
                obstacles.add(new double[]{rz.getLongitude(), rz.getLatitude(), rz.getAltitudeMinMeters(), rz.getRadiusMeters() + bubble, rz.getAltitudeMaxMeters()});
            }
        }
        for (Waypoint tr : traffic) {
            if (!tr.getVehicleId().equals(proposed.getVehicleId())) {
                double tAlt = tr.getAltitude();
                // Treat other vehicles as dynamic obstacles scaled exactly to the safety bubble
                obstacles.add(new double[]{tr.getLocation().getX(), tr.getLocation().getY(), Math.max(0, tAlt - 10.0), bubble, tAlt + 10.0});
            }
        }

        payload.put("obstacles", obstacles);
        payload.put("allow_height_variation", proposed.isAllowAltRouting());

        File tempFile = File.createTempFile("planner_in", ".json");
        objectMapper.writeValue(tempFile, payload);

        String scriptPath = System.getProperty("user.dir") + "/Python_Files/Python_Codes/Internal_Codes/get_alternate_path.py";
        ProcessBuilder pb = new ProcessBuilder("Python_Files/.venv/bin/python3.13", scriptPath, tempFile.getAbsolutePath());
        pb.redirectErrorStream(false);
        Process p = pb.start();

        BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()));
        StringBuilder output = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) output.append(line);

        BufferedReader errorReader = new BufferedReader(new InputStreamReader(p.getErrorStream()));
        StringBuilder errorOutput = new StringBuilder();
        while ((line = errorReader.readLine()) != null) errorOutput.append(line).append("\n");

        p.waitFor();
        tempFile.delete();

        if (errorOutput.length() > 0) System.err.println("[PYTHON DEBUG/ERROR LOGS]:\n" + errorOutput.toString());

        String jsonResult = output.toString().trim();
        if (jsonResult.isEmpty()) return new ArrayList<>();

        return objectMapper.readValue(jsonResult, new TypeReference<List<Map<String, Double>>>() {});
    }

    private double calculateDistance(Point p1, Point p2) {
        final int R = 6371000;
        double lat1 = Math.toRadians(p1.getY());
        double lat2 = Math.toRadians(p2.getY());
        double dLat = Math.toRadians(p2.getY() - p1.getY());
        double dLon = Math.toRadians(p2.getX() - p1.getX());
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
}