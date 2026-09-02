package com.fleetapp.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProposedManifest {
    private String name; // NEW: Receives custom name from UI
    private String vehicleId;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private double speed;
    private double safetyBubble;
    private List<ProposedWaypoint> waypoints;
    private List<ProposedRedzone> localRedzones;
    private boolean allowAltRouting;
}