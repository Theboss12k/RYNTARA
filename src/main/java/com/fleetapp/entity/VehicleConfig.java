package com.fleetapp.entity;

import java.util.List;

public class VehicleConfig {
    private String id;
    private String name;
    private String category;
    private String adapter;
    private List<String> monitoredParameters;

    // NEW: Persisted Danger Zone Multiplier
    private Integer dangerZoneMultiplier;

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

    public String getAdapter() { return adapter; }
    public void setAdapter(String adapter) { this.adapter = adapter; }

    public List<String> getMonitoredParameters() { return monitoredParameters; }
    public void setMonitoredParameters(List<String> monitoredParameters) { this.monitoredParameters = monitoredParameters; }

    public Integer getDangerZoneMultiplier() { return dangerZoneMultiplier; }
    public void setDangerZoneMultiplier(Integer dangerZoneMultiplier) { this.dangerZoneMultiplier = dangerZoneMultiplier; }
}