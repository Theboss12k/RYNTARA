package com.fleetapp.dto;

public class ProposedRedzone {

    private double longitude;
    private double latitude;
    private double radiusMeters;

    // The missing 3D bounds!
    private double altitudeMinMeters;
    private double altitudeMaxMeters;

    public double getLongitude() {
        return longitude;
    }

    public void setLongitude(double longitude) {
        this.longitude = longitude;
    }

    public double getLatitude() {
        return latitude;
    }

    public void setLatitude(double latitude) {
        this.latitude = latitude;
    }

    public double getRadiusMeters() {
        return radiusMeters;
    }

    public void setRadiusMeters(double radiusMeters) {
        this.radiusMeters = radiusMeters;
    }

    public double getAltitudeMinMeters() {
        return altitudeMinMeters;
    }

    public void setAltitudeMinMeters(double altitudeMinMeters) {
        this.altitudeMinMeters = altitudeMinMeters;
    }

    public double getAltitudeMaxMeters() {
        return altitudeMaxMeters;
    }

    public void setAltitudeMaxMeters(double altitudeMaxMeters) {
        this.altitudeMaxMeters = altitudeMaxMeters;
    }
}