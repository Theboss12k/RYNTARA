package com.fleetapp.service;

import com.fleetapp.entity.ControlSchema;
import com.fleetapp.entity.TelemetryRecord;
import com.fleetapp.entity.Vehicle;
import com.fleetapp.repository.ControlSchemaRepository;
import com.fleetapp.repository.TelemetryRepository;
import com.fleetapp.repository.VehicleRepository;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Service
public class FleetService {

    private final VehicleRepository vehicleRepository;
    private final ControlSchemaRepository schemaRepository;
    private final TelemetryRepository telemetryRepository;

    public FleetService(VehicleRepository vehicleRepository,
                        ControlSchemaRepository schemaRepository,
                        TelemetryRepository telemetryRepository) {
        this.vehicleRepository = vehicleRepository;
        this.schemaRepository = schemaRepository;
        this.telemetryRepository = telemetryRepository;
    }

    public List<Vehicle> getAllVehicles() {
        return vehicleRepository.findAll();
    }

    public List<ControlSchema> getAllSchemas() {
        return schemaRepository.findAll();
    }

    public Vehicle registerNewVehicle(Vehicle vehicle) {
        return vehicleRepository.save(vehicle);
    }

    /**
     * Telemetry, discovery, and vehicle_configs.json all key off the vendor
     * "external ID" string (e.g. "DRONE-001"), while the fleet UI generally
     * addresses vehicles by their internal DB UUID. This resolves either form
     * to the canonical external ID so callers can look up telemetry history
     * regardless of which identifier they have on hand. Returns null if the
     * vehicle doesn't exist.
     */
    public String resolveExternalId(String idOrExternalId) {
        try {
            UUID uuid = UUID.fromString(idOrExternalId);
            return vehicleRepository.findById(uuid)
                    .map(Vehicle::getExternalId)
                    .orElse(null);
        } catch (IllegalArgumentException notAUuid) {
            // Not a UUID - treat as an external ID directly, but confirm it
            // actually corresponds to a registered vehicle.
            return vehicleRepository.findByExternalId(idOrExternalId)
                    .map(Vehicle::getExternalId)
                    .orElse(null);
        }
    }

    public List<TelemetryRecord> getVehicleHistory(String vehicleId) {
        // 1. Fetch using the ultra-safe derived method
        List<TelemetryRecord> recentHistory = telemetryRepository.findTop1000ByVehicleIdOrderByTimestampDesc(vehicleId);

        // 2. Wrap in ArrayList and reverse for React chronological playback
        List<TelemetryRecord> modifiableHistory = new java.util.ArrayList<>(recentHistory);
        Collections.reverse(modifiableHistory);

        return modifiableHistory;
    }
}