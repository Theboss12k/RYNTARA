package com.fleetapp.entity;

import java.util.List;

public class VehicleConfig {
    private String id;
    private String name;
    private String category;
    private List<String> monitoredParameters;

    // Optional regex. When set, this config authorizes/claims EVERY vehicle_id that matches
    // the pattern, not just the exact `id` above. This is what lets one port serve many
    // vehicles (e.g. a whole squadron broadcasting as "UAV-SQD7-*") without registering each
    // exact hardware ID one by one.
    private String idPattern;

    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getIdPattern() { return idPattern; }
    public void setIdPattern(String idPattern) { this.idPattern = idPattern; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public List<String> getMonitoredParameters() { return monitoredParameters; }
    public void setMonitoredParameters(List<String> monitoredParameters) { this.monitoredParameters = monitoredParameters; }
}