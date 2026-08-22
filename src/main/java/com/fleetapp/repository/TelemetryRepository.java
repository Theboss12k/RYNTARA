package com.fleetapp.repository;

import com.fleetapp.entity.TelemetryRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TelemetryRepository extends JpaRepository<TelemetryRecord, Long> {

    // Spring Data automatically translates this name into:
    // SELECT * FROM telemetry_history WHERE vehicle_id = ? ORDER BY timestamp DESC LIMIT 1000
    List<TelemetryRecord> findTop1000ByVehicleIdOrderByTimestampDesc(String vehicleId);
}