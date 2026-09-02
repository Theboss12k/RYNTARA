package com.fleetapp.entity;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.ZonedDateTime;
import java.util.UUID;

@Entity
@Table(name = "vehicle")
public class Vehicle implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // The vendor/adapter-facing identifier (e.g. "DRONE-001"). This is the value
    // that Python adapters emit as vehicle_id and that vehicle_configs.json /
    // TelemetryRecord.vehicleId key off of. It is distinct from the internal
    // UUID primary key so registration, telemetry, and discovery can all agree
    // on a single identity for the same physical vehicle.
    @Column(name = "external_id", nullable = false, unique = true, length = 100)
    private String externalId;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, length = 50)
    private String category; // 'UAV' or 'GROUND'

    @Column(length = 50)
    private String status = "OFFLINE";

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "schema_id")
    private ControlSchema controlSchema;

    @Column(name = "created_at", updatable = false)
    private ZonedDateTime createdAt = ZonedDateTime.now();

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getExternalId() { return externalId; }
    public void setExternalId(String externalId) { this.externalId = externalId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public ControlSchema getControlSchema() { return controlSchema; }
    public void setControlSchema(ControlSchema controlSchema) { this.controlSchema = controlSchema; }
    public ZonedDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(ZonedDateTime createdAt) { this.createdAt = createdAt; }
}
