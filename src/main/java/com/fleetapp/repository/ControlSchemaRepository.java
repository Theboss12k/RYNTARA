package com.fleetapp.repository;

import com.fleetapp.entity.ControlSchema;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ControlSchemaRepository extends JpaRepository<ControlSchema, Long> {
}
