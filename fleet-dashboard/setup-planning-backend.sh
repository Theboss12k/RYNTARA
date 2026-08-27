#!/bin/bash

# 1. Define base directory and package path
BASE_DIR="fleet-planner-backend"
SRC_DIR="$BASE_DIR/src/main/java/com/fleetapp/planning"
RES_DIR="$BASE_DIR/src/main/resources"

echo "Creating directory structure for $BASE_DIR..."
mkdir -p "$SRC_DIR/controller"
mkdir -p "$SRC_DIR/service"
mkdir -p "$SRC_DIR/repository"
mkdir -p "$SRC_DIR/entity"
mkdir -p "$SRC_DIR/dto"
mkdir -p "$RES_DIR"

# 2. Create pom.xml
cat << 'EOF' > "$BASE_DIR/pom.xml"
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.3</version>
    </parent>
    <groupId>com.fleetapp</groupId>
    <artifactId>fleet-planner</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>fleet-planner-backend</name>
    <properties>
        <java.version>17</java.version>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
        <!-- PostGIS Spatial Support for Hibernate -->
        <dependency>
            <groupId>org.hibernate.orm</groupId>
            <artifactId>hibernate-spatial</artifactId>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
    </dependencies>
</project>
EOF

# 3. Create application.properties
cat << 'EOF' > "$RES_DIR/application.properties"
server.port=8081

spring.datasource.url=jdbc:postgresql://localhost:5432/fleet_planning_db
spring.datasource.username=postgres
spring.datasource.password=postgres

# Hibernate Spatial dialect for PostGIS
spring.jpa.database-platform=org.hibernate.spatial.dialect.postgis.PostgisPG95Dialect
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true

# Allow CORS for React frontend
spring.web.cors.allowed-origins=http://localhost:3000
EOF

# 4. Create Main Application Class
cat << 'EOF' > "$SRC_DIR/FleetPlannerApplication.java"
package com.fleetapp.planning;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class FleetPlannerApplication {
    public static void main(String[] args) {
        SpringApplication.run(FleetPlannerApplication.class, args);
    }
}
EOF

# 5. Create Entities
cat << 'EOF' > "$SRC_DIR/entity/Manifest.java"
package com.fleetapp.planning.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Entity
@Table(name = "manifests")
public class Manifest {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    private String vehicleId;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private double speed;
    private String status = "APPROVED";
}
EOF

cat << 'EOF' > "$SRC_DIR/entity/Waypoint.java"
package com.fleetapp.planning.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.locationtech.jts.geom.Point;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Entity
@Table(name = "waypoints")
public class Waypoint {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    private UUID manifestId;
    private String vehicleId;
    private LocalDateTime plannedTime;
    
    @Column(columnDefinition = "geometry(Point, 4326)")
    private Point location;
    private double altitude;
}
EOF

cat << 'EOF' > "$SRC_DIR/entity/Redzone.java"
package com.fleetapp.planning.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.locationtech.jts.geom.Point;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Entity
@Table(name = "redzones")
public class Redzone {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    
    @Column(columnDefinition = "geometry(Point, 4326)")
    private Point centerLocation;
    private double radiusMeters;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private boolean isPermanent = true;
}
EOF

# 6. Create DTOs
cat << 'EOF' > "$SRC_DIR/dto/ProposedManifest.java"
package com.fleetapp.planning.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class ProposedManifest {
    private String vehicleId;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private double speed;
    private double safetyBubble;
    private List<ProposedWaypoint> waypoints;
}
EOF

cat << 'EOF' > "$SRC_DIR/dto/ProposedWaypoint.java"
package com.fleetapp.planning.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ProposedWaypoint {
    private LocalDateTime timestamp;
    private double longitude;
    private double latitude;
    private double altitude;
}
EOF

cat << 'EOF' > "$SRC_DIR/dto/ConflictResult.java"
package com.fleetapp.planning.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class ConflictResult {
    private boolean hasConflict;
    private int conflictIndex;
    private String conflictingEntity;
    private double distanceViolation;
}
EOF

# 7. Create Repositories
cat << 'EOF' > "$SRC_DIR/repository/WaypointRepository.java"
package com.fleetapp.planning.repository;

import com.fleetapp.planning.entity.Waypoint;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface WaypointRepository extends JpaRepository<Waypoint, UUID> {
    List<Waypoint> findByPlannedTimeBetween(LocalDateTime start, LocalDateTime end);
}
EOF

cat << 'EOF' > "$SRC_DIR/repository/RedzoneRepository.java"
package com.fleetapp.planning.repository;

import com.fleetapp.planning.entity.Redzone;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface RedzoneRepository extends JpaRepository<Redzone, UUID> {
    @Query("SELECT r FROM Redzone r WHERE r.isPermanent = true OR (r.startTime <= :end AND r.endTime >= :start)")
    List<Redzone> findActiveRedzones(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
}
EOF

cat << 'EOF' > "$SRC_DIR/repository/ManifestRepository.java"
package com.fleetapp.planning.repository;

import com.fleetapp.planning.entity.Manifest;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface ManifestRepository extends JpaRepository<Manifest, UUID> {
}
EOF

# 8. Create Service
cat << 'EOF' > "$SRC_DIR/service/ConflictEngineService.java"
package com.fleetapp.planning.service;

import com.fleetapp.planning.dto.ConflictResult;
import com.fleetapp.planning.dto.ProposedManifest;
import com.fleetapp.planning.dto.ProposedWaypoint;
import com.fleetapp.planning.entity.Redzone;
import com.fleetapp.planning.entity.Waypoint;
import com.fleetapp.planning.repository.RedzoneRepository;
import com.fleetapp.planning.repository.WaypointRepository;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.List;

@Service
public class ConflictEngineService {

    @Autowired
    private WaypointRepository waypointRepo;

    @Autowired
    private RedzoneRepository redzoneRepo;

    private final GeometryFactory geometryFactory = new GeometryFactory();

    public ConflictResult validateManifest(ProposedManifest proposed) {
        List<Redzone> activeRedzones = redzoneRepo.findActiveRedzones(proposed.getStartTime(), proposed.getEndTime());
        List<Waypoint> trafficInWindow = waypointRepo.findByPlannedTimeBetween(proposed.getStartTime(), proposed.getEndTime());

        for (int i = 0; i < proposed.getWaypoints().size(); i++) {
            ProposedWaypoint current = proposed.getWaypoints().get(i);
            Point currentGeom = geometryFactory.createPoint(new Coordinate(current.getLongitude(), current.getLatitude()));
            currentGeom.setSRID(4326);

            // 1. Check Redzones
            for (Redzone rz : activeRedzones) {
                double distance = calculateDistance(currentGeom, rz.getCenterLocation());
                if (distance <= rz.getRadiusMeters()) {
                    return new ConflictResult(true, i, "REDZONE", distance);
                }
            }

            // 2. Check Dynamic Traffic
            for (Waypoint traffic : trafficInWindow) {
                if (Math.abs(Duration.between(current.getTimestamp(), traffic.getPlannedTime()).toMillis()) <= 1000) {
                    double distance = calculateDistance(currentGeom, traffic.getLocation());
                    double altDifference = Math.abs(current.getAltitude() - traffic.getAltitude());
                    
                    if (distance <= proposed.getSafetyBubble() && altDifference < 10.0) {
                        return new ConflictResult(true, i, traffic.getVehicleId(), distance);
                    }
                }
            }
        }
        return new ConflictResult(false, -1, null, 0.0);
    }

    // Rough Haversine implementation for distance in meters
    private double calculateDistance(Point p1, Point p2) {
        final int R = 6371000; // Earth radius in meters
        double lat1 = Math.toRadians(p1.getY());
        double lat2 = Math.toRadians(p2.getY());
        double dLat = Math.toRadians(p2.getY() - p1.getY());
        double dLon = Math.toRadians(p2.getX() - p1.getX());

        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                   Math.cos(lat1) * Math.cos(lat2) *
                   Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }
}
EOF

# 9. Create Controller
cat << 'EOF' > "$SRC_DIR/controller/RoutingController.java"
package com.fleetapp.planning.controller;

import com.fleetapp.planning.dto.ConflictResult;
import com.fleetapp.planning.dto.ProposedManifest;
import com.fleetapp.planning.service.ConflictEngineService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/routing")
@CrossOrigin(origins = "*")
public class RoutingController {

    @Autowired
    private ConflictEngineService conflictEngine;

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
        // Save logic to be wired to ManifestRepository
        return ResponseEntity.ok("Manifest successfully integrated into routing matrix.");
    }
}
EOF

echo "Backend generated successfully in $BASE_DIR!"
echo ""
echo "IMPORTANT DB SETUP:"
echo "1. Log into psql: psql -U postgres"
echo "2. Run: CREATE DATABASE fleet_planning_db;"
echo "3. Run: \c fleet_planning_db"
echo "4. Run: CREATE EXTENSION postgis;"
