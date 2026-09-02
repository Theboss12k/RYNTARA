package com.fleetapp.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * The Adapter Studio (/api/studio/**) includes an endpoint
 * (SandboxController#startTest) that writes arbitrary submitted Python code to
 * disk and executes it as a subprocess. @CrossOrigin only restricts
 * browser-originated requests - it does nothing against a direct HTTP client
 * hitting the endpoint. This interceptor requires a shared-secret header on
 * every /api/studio/** request so the code-execution surface isn't reachable
 * by anyone who can merely route packets to the server.
 *
 * This is a pragmatic mitigation, not a substitute for real sandboxing: the
 * submitted code still runs as the same OS user as the Java process with no
 * seccomp/cgroup/container isolation. For anything beyond trusted local/dev
 * use, run this behind proper user auth AND execute submitted code inside an
 * isolated, network-restricted, resource-capped container or VM.
 */
@Configuration
public class StudioSecurityConfig implements WebMvcConfigurer {

    private static final Logger logger = LoggerFactory.getLogger(StudioSecurityConfig.class);

    // Must be set via env var / application.properties in any non-local
    // environment. Left blank by default so local dev doesn't require setup,
    // but a blank token means Studio endpoints are OPEN - see the interceptor
    // warning below.
    @Value("${app.studio.api-token:}")
    private String studioApiToken;

    @Bean
    public StudioAuthInterceptor studioAuthInterceptor() {
        return new StudioAuthInterceptor(studioApiToken);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(studioAuthInterceptor())
                .addPathPatterns("/api/studio/**");
    }

    public static class StudioAuthInterceptor implements HandlerInterceptor {

        private final String expectedToken;

        public StudioAuthInterceptor(String expectedToken) {
            this.expectedToken = expectedToken;
            if (expectedToken == null || expectedToken.isBlank()) {
                logger.warn(">> SECURITY WARNING: app.studio.api-token is not set. " +
                        "/api/studio/** (including code execution) is UNPROTECTED. " +
                        "Set app.studio.api-token before exposing this server beyond localhost.");
            }
        }

        @Override
        public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
                throws java.io.IOException {
            if (expectedToken == null || expectedToken.isBlank()) {
                // No token configured - fail open only for local/dev convenience,
                // matching the pre-existing (also open) behavior. Warned above.
                return true;
            }

            String provided = request.getHeader("X-Studio-Token");
            if (provided == null || !constantTimeEquals(provided, expectedToken)) {
                logger.warn("Rejected unauthorized Studio request to {} from {}",
                        request.getRequestURI(), request.getRemoteAddr());
                response.sendError(HttpServletResponse.SC_FORBIDDEN, "Missing or invalid X-Studio-Token");
                return false;
            }
            return true;
        }

        private boolean constantTimeEquals(String a, String b) {
            if (a.length() != b.length()) return false;
            int result = 0;
            for (int i = 0; i < a.length(); i++) {
                result |= a.charAt(i) ^ b.charAt(i);
            }
            return result == 0;
        }
    }
}
