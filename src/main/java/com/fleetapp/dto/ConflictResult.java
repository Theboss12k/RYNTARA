package com.fleetapp.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;
import java.util.Map;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class ConflictResult {
    private boolean hasConflict;
    private int conflictIndex;
    private String conflictingEntity;
    private double distanceViolation;
    private List<Map<String, Double>> suggestedPath; // NEW: Holds the Python generated safe route

    // Explicitly adding this getter bypasses the Lombok naming confusion
    public boolean isHasConflict() {
        return this.hasConflict;
    }

    // Constructor for backwards compatibility with your existing code
    public ConflictResult(boolean hasConflict, int conflictIndex, String conflictingEntity, double distanceViolation) {
        this.hasConflict = hasConflict;
        this.conflictIndex = conflictIndex;
        this.conflictingEntity = conflictingEntity;
        this.distanceViolation = distanceViolation;
    }
}