package com.fleetapp.planning.repository;

import com.fleetapp.planning.entity.Redzone;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface RedzoneRepository extends JpaRepository<Redzone, UUID> {
    @Query("SELECT r FROM Redzone r WHERE r.isPermanent = true OR (r.startTime <= :end AND r.endTime >= :start)")
    List<Redzone> findActiveRedzones(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
}
