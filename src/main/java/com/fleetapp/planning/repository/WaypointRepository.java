package com.fleetapp.planning.repository;

import com.fleetapp.planning.entity.Waypoint;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface WaypointRepository extends JpaRepository<Waypoint, UUID> {
    List<Waypoint> findByPlannedTimeBetween(LocalDateTime start, LocalDateTime end);
}
