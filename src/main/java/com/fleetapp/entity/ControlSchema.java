package com.fleetapp.entity;

import jakarta.persistence.*;
import java.io.Serializable;

@Entity
@Table(name = "control_schema")
public class ControlSchema implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "connection_type", nullable = false, length = 50)
    private String connectionType; // 'INTERNET', 'BLUETOOTH', 'SERIAL'

    @Column(name = "schema_payload", columnDefinition = "jsonb")
    private String schemaPayload;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getConnectionType() { return connectionType; }
    public void setConnectionType(String connectionType) { this.connectionType = connectionType; }
    public String getSchemaPayload() { return schemaPayload; }
    public void setSchemaPayload(String schemaPayload) { this.schemaPayload = schemaPayload; }
}
