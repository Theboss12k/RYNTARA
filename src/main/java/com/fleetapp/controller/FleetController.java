package com.fleetapp.controller;

import com.fleetapp.entity.ControlSchema;
import com.fleetapp.entity.Vehicle;
import com.fleetapp.service.FleetService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/fleet")
@CrossOrigin(origins = "*")
public class FleetController {

    private final FleetService fleetService;

    public FleetController(FleetService fleetService) {
        this.fleetService = fleetService;
    }

    @GetMapping("/vehicles")
    public ResponseEntity<List<Vehicle>> getVehicles() {
        return ResponseEntity.ok(fleetService.getAllVehicles());
    }

    @GetMapping("/schemas")
    public ResponseEntity<List<ControlSchema>> getSchemas() {
        return ResponseEntity.ok(fleetService.getAllSchemas());
    }

    @PostMapping("/vehicles")
    public ResponseEntity<Vehicle> addVehicle(@RequestBody Vehicle vehicle) {
        Vehicle savedVehicle = fleetService.registerNewVehicle(vehicle);
        return ResponseEntity.ok(savedVehicle);
    }

    // This explicitly maps to the exact URL you are testing
    @GetMapping("/vehicles/{id}/history")
    public ResponseEntity<?> getVehicleHistory(@PathVariable("id") String id) {
        // Now calling the simplified service method without the limit parameter
        return ResponseEntity.ok(fleetService.getVehicleHistory(id));
    }
}