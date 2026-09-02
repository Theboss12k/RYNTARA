package com.fleetapp.repository;

import com.fleetapp.entity.Vehicle;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface VehicleRepository extends JpaRepository<Vehicle, UUID> {
    List<Vehicle> findByCategory(String category);

    // externalId is the vendor/adapter-facing string ID used by telemetry,
    // discovery, and vehicle_configs.json — this lets those layers resolve
    // back to the canonical DB row.
    Optional<Vehicle> findByExternalId(String externalId);
}
