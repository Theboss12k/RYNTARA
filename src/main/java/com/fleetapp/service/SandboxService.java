package com.fleetapp.service;

import com.fleetapp.config.GroundStationProcessManager;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.nio.file.Path;
import java.nio.file.Paths;

@Service
public class SandboxService {

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    // Shares the same port registry as production adapters so a sandbox test run can never
    // silently collide with (or steal traffic from) a live "one adapter per port" mount.
    @Autowired
    private GroundStationProcessManager groundStationProcessManager;

    private DatagramSocket activeSocket;
    private Thread snifferThread;
    private Process activePythonProcess;
    private Integer claimedPort;

    public void startRawSniffer(int port) {
        stopSandbox();

        try {
            groundStationProcessManager.claimPort(port, "sandbox:raw-sniffer");
            claimedPort = port;
        } catch (GroundStationProcessManager.PortConflictException e) {
            messagingTemplate.convertAndSend("/topic/studio.raw", ">> PORT_CONFLICT: " + e.getMessage());
            return;
        }

        snifferThread = new Thread(() -> {
            try {
                activeSocket = new DatagramSocket(port);
                byte[] buffer = new byte[4096];

                while (!activeSocket.isClosed()) {
                    DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                    activeSocket.receive(packet);

                    String rawData = new String(packet.getData(), 0, packet.getLength());
                    messagingTemplate.convertAndSend("/topic/studio.raw", rawData);
                }
            } catch (Exception e) {
                if (activeSocket != null && !activeSocket.isClosed()) {
                    messagingTemplate.convertAndSend("/topic/studio.raw", ">> SOCKET ERROR: " + e.getMessage());
                }
            }
        });
        snifferThread.start();
    }

    public void startAdapterTest(String code, int port, String rawSample) {
        stopSandbox();

        try {
            groundStationProcessManager.claimPort(port, "sandbox:adapter-test");
            claimedPort = port;
        } catch (GroundStationProcessManager.PortConflictException e) {
            messagingTemplate.convertAndSend("/topic/studio.parsed", ">> PORT_CONFLICT: " + e.getMessage());
            return;
        }

        Thread testThread = new Thread(() -> {
            try {
                Path tempScriptPath = Paths.get(System.getProperty("user.dir"), "Python_Files", "Python_Codes", "Vehicle_Adapters", ".temp_adapter_test.py");
                java.nio.file.Files.writeString(tempScriptPath, code, java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.TRUNCATE_EXISTING);

                ProcessBuilder pb = new ProcessBuilder("python3", tempScriptPath.toString());
                pb.redirectErrorStream(true);

                // CRITICAL FIX: Forces Python to immediately flush output to the Java stream
                pb.environment().put("PYTHONUNBUFFERED", "1");

                activePythonProcess = pb.start();

                // --- AUTO-INJECTOR THREAD ---
                new Thread(() -> {
                    try {
                        // Fire the packet 3 times to guarantee the Python socket is bound and listening
                        for (int i = 1; i <= 3; i++) {
                            Thread.sleep(800);
                            messagingTemplate.convertAndSend("/topic/studio.parsed", ">> [SYSTEM] INJECTING SAMPLE PACKET (" + i + "/3)...");

                            DatagramSocket injectionSocket = new DatagramSocket();
                            byte[] buffer = rawSample.getBytes();
                            DatagramPacket packet = new DatagramPacket(buffer, buffer.length, InetAddress.getByName("127.0.0.1"), port);
                            injectionSocket.send(packet);
                            injectionSocket.close();
                        }
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }).start();

                // Instantly read the unbuffered output stream from Python
                BufferedReader reader = new BufferedReader(new InputStreamReader(activePythonProcess.getInputStream()));
                String line;
                while ((line = reader.readLine()) != null) {
                    messagingTemplate.convertAndSend("/topic/studio.parsed", line);
                }
            } catch (Exception e) {
                messagingTemplate.convertAndSend("/topic/studio.parsed", ">> EXECUTION FATAL ERROR: " + e.getMessage());
            }
        });
        testThread.start();
    }

    public void stopSandbox() {
        if (activeSocket != null && !activeSocket.isClosed()) {
            activeSocket.close();
        }
        if (snifferThread != null) {
            snifferThread.interrupt();
        }
        if (activePythonProcess != null && activePythonProcess.isAlive()) {
            activePythonProcess.destroyForcibly();
        }
        if (claimedPort != null) {
            groundStationProcessManager.releasePort(claimedPort);
            claimedPort = null;
        }
    }
}