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

    private String name; // NEW: Custom user-defined name
    private String vehicleId;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private double speed;
    private String status = "APPROVED";
}