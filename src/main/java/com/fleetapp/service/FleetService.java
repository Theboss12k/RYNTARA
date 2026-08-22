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

    public List<TelemetryRecord> getVehicleHistory(String vehicleId) {
        // 1. Fetch using the ultra-safe derived method
        List<TelemetryRecord> recentHistory = telemetryRepository.findTop1000ByVehicleIdOrderByTimestampDesc(vehicleId);

        // 2. Wrap in ArrayList and reverse for React chronological playback
        List<TelemetryRecord> modifiableHistory = new java.util.ArrayList<>(recentHistory);
        Collections.reverse(modifiableHistory);

        return modifiableHistory;
    }
}