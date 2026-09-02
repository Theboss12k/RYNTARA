package com.fleetapp.planning.repository;

import com.fleetapp.planning.entity.Manifest;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface ManifestRepository extends JpaRepository<Manifest, UUID> {
}
