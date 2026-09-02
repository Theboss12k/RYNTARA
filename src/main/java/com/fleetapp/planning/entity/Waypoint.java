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
