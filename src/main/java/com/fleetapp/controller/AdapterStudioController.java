package com.fleetapp.controller;

import com.fleetapp.dto.AdapterStudioRequests.SaveAdapterRequest;
import com.fleetapp.dto.AdapterStudioRequests.LlmGenerationRequest;
import com.fleetapp.service.AdapterStudioService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/studio")
@CrossOrigin(origins = "${app.cors.allowed-origin:http://localhost:3000}")
public class AdapterStudioController {

    @Autowired
    private AdapterStudioService studioService;

    @GetMapping("/adapters")
    public ResponseEntity<List<String>> listAdapters() {
        try {
            return ResponseEntity.ok(studioService.listAdapters());
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/adapters/{filename}")
    public ResponseEntity<Map<String, String>> getAdapter(@PathVariable String filename) {
        try {
            String code = studioService.readAdapter(filename);
            return ResponseEntity.ok(Map.of("code", code));
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/adapters/{filename}")
    public ResponseEntity<Map<String, String>> saveAdapter(@PathVariable String filename, @RequestBody SaveAdapterRequest request) {
        try {
            // Updated to pass the port down to the service
            studioService.saveAdapter(filename, request.getCode(), request.getPort());
            return ResponseEntity.ok(Map.of("message", "Adapter saved successfully"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/adapters/{filename}")
    public ResponseEntity<Void> deleteAdapter(@PathVariable String filename) {
        try {
            studioService.deleteAdapter(filename);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/ollama/models")
    public ResponseEntity<List<String>> listOllamaModels() {
        return ResponseEntity.ok(studioService.listOllamaModels());
    }

    @PostMapping("/adapters/generate")
    public ResponseEntity<Map<String, String>> generateAdapterCode(@RequestBody LlmGenerationRequest request) {
        try {
            String generatedCode = studioService.generateAdapterCode(request);
            return ResponseEntity.ok(Map.of("code", generatedCode));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }
}