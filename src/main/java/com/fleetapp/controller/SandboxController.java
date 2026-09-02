package com.fleetapp.controller;

import com.fleetapp.service.SandboxService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/studio/sandbox")
@CrossOrigin(origins = "${app.cors.allowed-origin:http://localhost:3000}")
public class SandboxController {

    @Autowired
    private SandboxService sandboxService;

    // UPDATED: Now accepts the rawSample data as well
    public static class TestRequest {
        private String code;
        private int port;
        private String rawSample;

        public String getCode() { return code; }
        public void setCode(String code) { this.code = code; }
        public int getPort() { return port; }
        public void setPort(int port) { this.port = port; }
        public String getRawSample() { return rawSample; }
        public void setRawSample(String rawSample) { this.rawSample = rawSample; }
    }

    @PostMapping("/sniff/start")
    public ResponseEntity<Void> startSniffing(@RequestParam int port) {
        sandboxService.startRawSniffer(port);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/test/start")
    public ResponseEntity<Void> startTest(@RequestBody TestRequest request) {
        sandboxService.startAdapterTest(request.getCode(), request.getPort(), request.getRawSample());
        return ResponseEntity.ok().build();
    }

    @PostMapping("/stop")
    public ResponseEntity<Void> stopSandbox() {
        sandboxService.stopSandbox();
        return ResponseEntity.ok().build();
    }
}