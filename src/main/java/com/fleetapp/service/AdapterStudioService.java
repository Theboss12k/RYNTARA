package com.fleetapp.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fleetapp.dto.AdapterStudioRequests.LlmGenerationRequest;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.*;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
public class AdapterStudioService {

    private final Path adapterDir = Paths.get(System.getProperty("user.dir"), "Python_Files", "Python_Codes", "Vehicle_Adapters");
    // Define the path to the mounts JSON file dynamically just like GroundStationProcessManager does
    private final Path mountsFile = Paths.get(System.getProperty("user.dir"), "adapter_mounts.json");

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Default Ollama local endpoint
    private final String OLLAMA_BASE_URL = "http://localhost:11434";

    public AdapterStudioService() throws IOException {
        if (!Files.exists(adapterDir)) {
            Files.createDirectories(adapterDir);
        }
    }

    public List<String> listAdapters() throws IOException {
        try (Stream<Path> paths = Files.list(adapterDir)) {
            return paths
                    .filter(Files::isRegularFile)
                    .map(path -> path.getFileName().toString())
                    .filter(name -> name.endsWith(".py"))
                    .collect(Collectors.toList());
        }
    }

    public String readAdapter(String filename) throws IOException {
        Path filePath = adapterDir.resolve(filename).normalize();
        validatePathSafety(filePath);
        return Files.readString(filePath);
    }

    // Updated signature and logic to persist the port in JSON
    public void saveAdapter(String filename, String code, Integer port) throws IOException {
        // 1. Save the python file
        Path filePath = adapterDir.resolve(filename).normalize();
        validatePathSafety(filePath);
        Files.writeString(filePath, code, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);

        // 2. Synchronize adapter_mounts.json
        if (port != null) {
            ArrayNode mountsArray;
            if (Files.exists(mountsFile) && Files.size(mountsFile) > 0) {
                JsonNode root = objectMapper.readTree(mountsFile.toFile());
                if (root.isArray()) {
                    mountsArray = (ArrayNode) root;
                } else {
                    mountsArray = objectMapper.createArrayNode();
                }
            } else {
                mountsArray = objectMapper.createArrayNode();
            }

            boolean updated = false;
            for (int i = 0; i < mountsArray.size(); i++) {
                JsonNode node = mountsArray.get(i);
                if (node.has("adapterScript") && node.get("adapterScript").asText().equals(filename)) {
                    ((ObjectNode) node).put("port", port);
                    updated = true;
                    break;
                }
            }

            if (!updated) {
                ObjectNode newNode = objectMapper.createObjectNode();
                newNode.put("adapterScript", filename);
                newNode.put("port", port);
                mountsArray.add(newNode);
            }

            objectMapper.writerWithDefaultPrettyPrinter().writeValue(mountsFile.toFile(), mountsArray);
        }
    }

    public void deleteAdapter(String filename) throws IOException {
        Path filePath = adapterDir.resolve(filename).normalize();
        validatePathSafety(filePath);
        Files.deleteIfExists(filePath);
    }

    public List<String> listOllamaModels() {
        List<String> modelNames = new ArrayList<>();
        try {
            String response = restTemplate.getForObject(OLLAMA_BASE_URL + "/api/tags", String.class);
            JsonNode root = objectMapper.readTree(response);
            JsonNode modelsNode = root.path("models");
            if (modelsNode.isArray()) {
                for (JsonNode node : modelsNode) {
                    modelNames.add(node.path("name").asText());
                }
            }
        } catch (Exception e) {
            System.err.println(">> [OLLAMA] Unable to fetch models: " + e.getMessage());
        }
        return modelNames;
    }

    public String generateAdapterCode(LlmGenerationRequest request) {
        String selectedModel = (request.getModel() != null && !request.getModel().isBlank())
                ? request.getModel()
                : "llama3";

        String systemPrompt = "You are an expert Python systems engineer building stateless telemetry stream adapters.\n" +
                "RULES:\n" +
                "1. Output ONLY a clean, standalone, executable Python script using standard 'socket' and 'argparse'.\n" +
                "2. DO NOT use asyncio, custom protocol classes, config files, or databases.\n" +
                "3. DO NOT include any firewall or vehicle authorization logic (security is handled upstream by Java).\n" +
                "4. Implement parse_packet(raw_data) to transform raw input bytes into the required schema dictionary.\n" +
                "5. Implement run_adapter(ip, port) to bind UDP socket, parse packets, and print clean json with print(json.dumps(parsed), flush=True).\n" +
                "6. The script is always launched with exactly these two CLI flags and no others: " +
                "--listen-ip <ip> --listen-port <port>. You MUST define argparse arguments named " +
                "'--listen-ip' (default '0.0.0.0') and '--listen-port' (type int, any sensible default) - " +
                "NOT positional arguments, and NOT any other flag names.\n" +
                "7. The __main__ block MUST end by actually calling run_adapter(args.listen_ip, args.listen_port). " +
                "A script that only parses arguments and never calls run_adapter is INVALID.\n" +
                "8. Output ONLY pure executable Python code without markdown ticks or explanations.";

        String userPrompt = String.format(
                "### TASK:\n%s\n\n" +
                        "### SAMPLE RAW INPUT:\n%s\n\n" +
                        "### REQUIRED OUTPUT SCHEMA:\n%s\n\n" +
                        "Generate the complete stateless adapter script.",
                request.getInstruction(),
                request.getRawSample(),
                request.getTargetSchema()
        );

        Map<String, Object> requestBody = Map.of(
                "model", selectedModel,
                "system", systemPrompt,
                "prompt", userPrompt,
                "stream", false,
                "options", Map.of("temperature", 0.1)
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        try {
            ResponseEntity<String> response = restTemplate.postForEntity(OLLAMA_BASE_URL + "/api/generate", entity, String.class);
            JsonNode root = objectMapper.readTree(response.getBody());
            String rawCode = root.path("response").asText();
            return sanitizeGeneratedCode(rawCode);
        } catch (Exception e) {
            return "# Error connecting to local Ollama daemon: " + e.getMessage() +
                    "\n# Ensure Ollama is running (`ollama serve`) on http://localhost:11434";
        }
    }

    private String sanitizeGeneratedCode(String code) {
        if (code == null) return "";
        String sanitized = code.trim();
        if (sanitized.startsWith("```python")) {
            sanitized = sanitized.substring(9);
        } else if (sanitized.startsWith("```")) {
            sanitized = sanitized.substring(3);
        }
        if (sanitized.endsWith("```")) {
            sanitized = sanitized.substring(0, sanitized.length() - 3);
        }
        return sanitized.trim();
    }

    private void validatePathSafety(Path filePath) {
        if (!filePath.startsWith(adapterDir)) {
            throw new SecurityException("Access denied. Path traversal detected.");
        }
    }
}