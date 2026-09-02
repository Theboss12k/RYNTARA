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
