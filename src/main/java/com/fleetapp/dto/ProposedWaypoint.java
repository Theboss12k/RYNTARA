package com.fleetapp.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ProposedWaypoint {
    private LocalDateTime timestamp;
    private double longitude;
    private double latitude;
    private double altitude;
}
