package com.fleetapp.config;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fleetapp.entity.TelemetryRecord;
import com.fleetapp.repository.TelemetryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.PatternTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketRedisBridgeConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        config.enableSimpleBroker("/topic");
        config.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws-telemetry")
                .setAllowedOriginPatterns("*")
                .withSockJS();
    }

    @Bean
    public RedisMessageListenerContainer redisContainer(
            RedisConnectionFactory connectionFactory,
            TelemetryRedisListener listener) {

        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener(listener, new PatternTopic("telemetry.*"));
        return container;
    }
}

@Component
class TelemetryRedisListener implements MessageListener {

    private static final Logger logger = LoggerFactory.getLogger(TelemetryRedisListener.class);
    private final SimpMessagingTemplate messagingTemplate;

    // NEW: Inject the TimescaleDB repository
    private final TelemetryRepository telemetryRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public TelemetryRedisListener(SimpMessagingTemplate messagingTemplate, TelemetryRepository telemetryRepository) {
        this.messagingTemplate = messagingTemplate;
        this.telemetryRepository = telemetryRepository;
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String channel = new String(message.getChannel());
            String rawPayload = new String(message.getBody());

            TelemetryPayload telemetry = objectMapper.readValue(rawPayload, TelemetryPayload.class);

            // 1. Blast to React UI via WebSockets (Low Latency)
            messagingTemplate.convertAndSend("/topic/" + channel, telemetry);

            // 2. Persist to Postgres/TimescaleDB (Historical DVR)
            if (telemetry.getVehicle_id() != null) {
                TelemetryRecord record = new TelemetryRecord();
                record.setVehicleId(telemetry.getVehicle_id());
                record.setLatitude(telemetry.getLatitude());
                record.setLongitude(telemetry.getLongitude());
                record.setAltitude(telemetry.getAltitude() != null ? telemetry.getAltitude() : 0.0);
                record.setTimestamp(Instant.now());

                // Pack battery_level and all custom dynamic Python metrics into the JSONB column
                Map<String, Object> allMetrics = new HashMap<>(telemetry.getAdditionalProperties());
                if (telemetry.getBattery_level() != null) {
                    allMetrics.put("battery_level", telemetry.getBattery_level());
                }
                record.setMetrics(allMetrics);

                telemetryRepository.save(record);
            }

        } catch (Exception e) {
            logger.error("Failed to route and save telemetry data", e);
        }
    }
}

/**
 * Modular DTO: Captures known fields, and automatically absorbs any future fields.
 */
class TelemetryPayload {
    private String vehicle_id;
    private Double latitude;
    private Double longitude;
    private Double altitude;
    private Integer battery_level;

    // Dynamic map to catch any new parameters (e.g., speed, heading) automatically
    private Map<String, Object> additionalProperties = new HashMap<>();

    // Core Getters and Setters
    public String getVehicle_id() { return vehicle_id; }
    public void setVehicle_id(String vehicle_id) { this.vehicle_id = vehicle_id; }

    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }

    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }

    public Double getAltitude() { return altitude; }
    public void setAltitude(Double altitude) { this.altitude = altitude; }

    public Integer getBattery_level() { return battery_level; }
    public void setBattery_level(Integer battery_level) { this.battery_level = battery_level; }

    // --- The Magic for Modularity ---

    @JsonAnyGetter
    public Map<String, Object> getAdditionalProperties() {
        return additionalProperties;
    }

    @JsonAnySetter
    public void setAdditionalProperty(String key, Object value) {
        this.additionalProperties.put(key, value);
    }
}