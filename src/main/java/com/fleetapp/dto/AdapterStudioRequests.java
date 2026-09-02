package com.fleetapp.dto;

public class AdapterStudioRequests {

    public static class SaveAdapterRequest {
        private String code;
        private Integer port;

        public String getCode() { return code; }
        public void setCode(String code) { this.code = code; }

        public Integer getPort() { return port; }
        public void setPort(Integer port) { this.port = port; }
    }

    public static class LlmGenerationRequest {
        private String model;
        private String instruction;
        private String rawSample;
        private String targetSchema;
        private String currentCode;

        public String getModel() { return model; }
        public void setModel(String model) { this.model = model; }

        public String getInstruction() { return instruction; }
        public void setInstruction(String instruction) { this.instruction = instruction; }

        public String getRawSample() { return rawSample; }
        public void setRawSample(String rawSample) { this.rawSample = rawSample; }

        public String getTargetSchema() { return targetSchema; }
        public void setTargetSchema(String targetSchema) { this.targetSchema = targetSchema; }

        public String getCurrentCode() { return currentCode; }
        public void setCurrentCode(String currentCode) { this.currentCode = currentCode; }
    }
}