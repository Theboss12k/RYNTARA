#!/bin/bash

echo "Starting Routing Module Generation..."

# Define base source directory
SRC_DIR="src/main/java/com/fleetapp"
RES_DIR="src/main/resources"

# Create directories
mkdir -p "$SRC_DIR/entity"
mkdir -p "$SRC_DIR/dto"
mkdir -p "$SRC_DIR/repository"
mkdir -p "$SRC_DIR/service"
mkdir -p "$SRC_DIR/controller"

# ---------------------------------------------------------
# 1. CREATE ENTITIES
# ---------------------------------------------------------
cat << 'EOF' > "$SRC_DIR/entity/Manifest.java"
package com.fleetapp.entity;

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
package com.fleetapp.entity;

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
package com.fleetapp.entity;

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

# ---------------------------------------------------------
# 2. CREATE DTOs
# ---------------------------------------------------------
cat << 'EOF' > "$SRC_DIR/dto/ProposedManifest.java"
package com.fleetapp.dto;

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
package com.fleetapp.dto;

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
package com.fleetapp.dto;

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

# ---------------------------------------------------------
# 3. CREATE REPOSITORIES
# ---------------------------------------------------------
cat << 'EOF' > "$SRC_DIR/repository/WaypointRepository.java"
package com.fleetapp.repository;

import com.fleetapp.entity.Waypoint;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface WaypointRepository extends JpaRepository<Waypoint, UUID> {
    List<Waypoint> findByPlannedTimeBetween(LocalDateTime start, LocalDateTime end);
}
EOF

cat << 'EOF' > "$SRC_DIR/repository/RedzoneRepository.java"
package com.fleetapp.repository;

import com.fleetapp.entity.Redzone;
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
package com.fleetapp.repository;

import com.fleetapp.entity.Manifest;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface ManifestRepository extends JpaRepository<Manifest, UUID> {
}
EOF

# ---------------------------------------------------------
# 4. CREATE SERVICE
# ---------------------------------------------------------
cat << 'EOF' > "$SRC_DIR/service/ConflictEngineService.java"
package com.fleetapp.service;

import com.fleetapp.dto.ConflictResult;
import com.fleetapp.dto.ProposedManifest;
import com.fleetapp.dto.ProposedWaypoint;
import com.fleetapp.entity.Redzone;
import com.fleetapp.entity.Waypoint;
import com.fleetapp.repository.RedzoneRepository;
import com.fleetapp.repository.WaypointRepository;
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

            for (Redzone rz : activeRedzones) {
                double distance = calculateDistance(currentGeom, rz.getCenterLocation());
                if (distance <= rz.getRadiusMeters()) {
                    return new ConflictResult(true, i, "REDZONE", distance);
                }
            }

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

    private double calculateDistance(Point p1, Point p2) {
        final int R = 6371000;
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

# ---------------------------------------------------------
# 5. CREATE CONTROLLER
# ---------------------------------------------------------
cat << 'EOF' > "$SRC_DIR/controller/RoutingController.java"
package com.fleetapp.controller;

import com.fleetapp.dto.ConflictResult;
import com.fleetapp.dto.ProposedManifest;
import com.fleetapp.service.ConflictEngineService;
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
        return ResponseEntity.ok("Manifest successfully integrated into routing matrix.");
    }
}
EOF

# ---------------------------------------------------------
# 6. SAFELY UPDATE POM.XML & APPLICATION.PROPERTIES
# ---------------------------------------------------------
python3 -c "
import sys
# Update pom.xml
try:
    with open('pom.xml', 'r') as f:
        pom_content = f.read()
    if 'hibernate-spatial' not in pom_content:
        dep = '        <dependency>\n            <groupId>org.hibernate.orm</groupId>\n            <artifactId>hibernate-spatial</artifactId>\n        </dependency>\n    </dependencies>'
        pom_content = pom_content.replace('</dependencies>', dep)
        with open('pom.xml', 'w') as f:
            f.write(pom_content)
        print('✅ Added hibernate-spatial to pom.xml')
except Exception as e:
    print('Failed to update pom.xml:', e)

# Update application.properties
try:
    prop_path = 'src/main/resources/application.properties'
    with open(prop_path, 'r') as f:
        props = f.read()
    if 'spring.jpa.database-platform=org.hibernate.spatial.dialect.postgis.PostgisPG95Dialect' not in props:
        with open(prop_path, 'a') as f:
            f.write('\n# Added for PostGIS Support\nspring.jpa.database-platform=org.hibernate.spatial.dialect.postgis.PostgisPG95Dialect\n')
        print('✅ Added PostGIS dialect to application.properties')
except Exception as e:
    print('Failed to update application.properties:', e)
"

echo "✅ Module generated successfully!"
