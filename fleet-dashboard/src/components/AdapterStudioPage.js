import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import {
  ArrowLeft, FileCode, Play, Square, Save, Sparkles,
  Terminal, AlertTriangle, Plug, Database,
  Cpu, CheckCircle2, Loader2, Copy
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import ThemeToggle from './ThemeToggle';

const REQUIRED_SCHEMA = {
  vehicle_id: "string",
  latitude: "float",
  longitude: "float",
  altitude: "float",
  battery_level: "int",
  speed_kmh: "float",
  heading_deg: "float"
};

const getBoilerplate = (port) => `import json
import socket
import argparse
import sys

def parse_packet(raw_data):
    """
    Transform vendor-specific packet formats into the standard fleet schema.
    PURE PARSER: Stateless. Only maps fields and handles unit conversions.
    """
    try:
        data = json.loads(raw_data.decode('utf-8'))
        return {
            "vehicle_id": data.get("uav_id", "00000000-0000-0000-0000-000000000000"),
            "latitude": float(data.get("lat", 0.0)),
            "longitude": float(data.get("lon", 0.0)),
            "altitude": float(data.get("alt", 0.0)),
            "battery_level": int(data.get("battery", 100)),
            "speed_kmh": float(data.get("speed", 0.0)),
            "heading_deg": float(data.get("heading", 0.0))
        }
    except Exception as e:
        print(f">> PARSE_ERROR: {str(e)}", flush=True)
        return None

def run_adapter(ip, port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

    try:
        sock.bind((ip, port))
        print(f">> STATELESS ADAPTER LISTENING ON {ip}:{port}", flush=True)
    except Exception as e:
        print(f">> FATAL: Failed to bind to {ip}:{port} - {e}", flush=True)
        sys.exit(1)

    while True:
        try:
            raw_bytes, addr = sock.recvfrom(4096)
            parsed = parse_packet(raw_bytes)
            if parsed:
                print(json.dumps(parsed), flush=True)
        except Exception as e:
            print(f">> RUNTIME_ERROR: {e}", flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fleet Telemetry Adapter")
    parser.add_argument("--listen-ip", type=str, default="0.0.0.0", help="IP to bind to")
    parser.add_argument("--listen-port", type=int, default=${port}, help="UDP port to listen on")

    args = parser.parse_args()
    run_adapter(args.listen_ip, args.listen_port)
`;

export default function AdapterStudioPage() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [adapters, setAdapters] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [code, setCode] = useState(getBoilerplate(14555));
  const [listenPort, setListenPort] = useState(14555);
  const [saveStatus, setSaveStatus] = useState('');

  // Streaming & Validation States
  const [isSniffing, setIsSniffing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [rawLogs, setRawLogs] = useState([]);
  const [parsedLogs, setParsedLogs] = useState([]);

  // Ollama & AI States
  const [isLlmModalOpen, setIsLlmModalOpen] = useState(false);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [llmInstruction, setLlmInstruction] = useState('Extract nested telemetry parameters and normalize them to fleet standard format.');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');

  const rawRef = useRef(null);
  const parsedRef = useRef(null);

  // Theme Constants
  const bgMain = isDark ? '#08080a' : '#f4f4f5';
  const bgCard = isDark ? '#121217' : '#ffffff';
  const bgInput = isDark ? '#1a1a22' : '#f0f0f2';
  const borderColor = isDark ? '#2a2a35' : '#e4e4e7';
  const textColor = isDark ? '#ffffff' : '#111111';
  const subtextColor = isDark ? '#888899' : '#71717a';

  useEffect(() => {
    fetch('http://localhost:8080/api/studio/adapters')
      .then(res => res.json())
      .then(data => {
        setAdapters(data);
        if (data.length > 0) setSelectedFile(data[0]);
      })
      .catch(err => console.error("Failed to load adapters:", err));
  }, []);

  useEffect(() => {
    if (selectedFile && selectedFile !== 'custom_code.py') {
      fetch(`http://localhost:8080/api/studio/adapters/${selectedFile}`)
        .then(res => res.json())
        .then(data => {
          if (data.code) setCode(data.code);
        })
        .catch(err => console.error("Failed to load code:", err));
    }
  }, [selectedFile]);

  useEffect(() => {
    fetch('http://localhost:8080/api/studio/ollama/models')
      .then(res => res.json())
      .then(models => {
        setOllamaModels(models);
        if (models.length > 0) setSelectedModel(models[0]);
      })
      .catch(err => console.error("Failed to load Ollama models:", err));
  }, []);

  const validateGroundStationSchema = (parsedJson) => {
    const requiredKeys = Object.keys(REQUIRED_SCHEMA);
    for (let key of requiredKeys) {
      if (parsedJson[key] === undefined || parsedJson[key] === null) {
        return false;
      }
    }
    return true;
  };

  useEffect(() => {
    const socket = new SockJS('http://localhost:8080/ws-telemetry');
    const stompClient = new Client({
      webSocketFactory: () => socket,
      onConnect: () => {
        stompClient.subscribe('/topic/studio.raw', (message) => {
          setRawLogs(prev => [...prev, message.body]);
        });

        stompClient.subscribe('/topic/studio.parsed', (message) => {
          const line = message.body;
          setParsedLogs(prev => [...prev, line]);

          if (line.trim().startsWith('{')) {
            try {
              const jsonObj = JSON.parse(line);
              if (validateGroundStationSchema(jsonObj)) {
                setParsedLogs(prev => [...prev, `>> [✅ SUCCESS] Valid schema format. Ready for Java Router.`]);
              } else {
                setParsedLogs(prev => [...prev, `>> [❌ ERROR] Missing required Ground Station fields.`]);
              }
            } catch (e) {}
          }
        });
      }
    });

    stompClient.activate();

    return () => {
      fetch('http://localhost:8080/api/studio/sandbox/stop', { method: 'POST' }).catch(() => {});
      stompClient.deactivate();
    };
  }, []);

  const handlePortChange = (e) => {
    const newPort = e.target.value;
    setListenPort(newPort);

    setCode(prev => {
      let updated = prev;
      if (updated.includes('default=')) {
        updated = updated.replace(/default=\d+/, `default=${newPort}`);
      }
      if (updated.includes('PORT')) {
        updated = updated.replace(/(PORT\s*=\s*)\d+/, `$1${newPort}`);
      }
      return updated;
    });
  };

  const toggleRawSniffer = async () => {
    if (isSniffing) {
      setIsSniffing(false);
      try {
        await fetch('http://localhost:8080/api/studio/sandbox/stop', { method: 'POST' });
        setRawLogs(prev => [...prev, `>> SNIFFER DETACHED FROM PORT ${listenPort}`]);
      } catch (err) {
        console.error("Failed to stop sniffer", err);
      }
    } else {
      if (isTesting) {
         setRawLogs(prev => [...prev, `>> PLEASE STOP THE TEST ADAPTER TO USE THE PORT FOR SNIFFING.`]);
         return;
      }
      setIsSniffing(true);
      setRawLogs([`>> BINDING UDP WIRE SNIFFER TO PORT ${listenPort}...`, `>> WAITING FOR REAL PACKETS...`]);
      try {
        await fetch(`http://localhost:8080/api/studio/sandbox/sniff/start?port=${listenPort}`, { method: 'POST' });
      } catch (err) {
        setRawLogs(prev => [...prev, `>> ERROR: Failed to reach backend API.`]);
        setIsSniffing(false);
      }
    }
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaveStatus('saving');
    try {
      const res = await fetch(`http://localhost:8080/api/studio/adapters/${selectedFile}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      if (res.ok) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(''), 2500);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
  };

  const handleSaveAs = async () => {
    const newName = prompt("Enter new adapter filename (e.g., custom_adapter.py):", selectedFile || "new_adapter.py");
    if (!newName || !newName.trim()) return;

    let filename = newName.trim();
    if (!filename.endsWith('.py')) {
      filename += '.py';
    }

    setSaveStatus('saving');
    try {
      const res = await fetch(`http://localhost:8080/api/studio/adapters/${filename}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      if (res.ok) {
        setSaveStatus('saved');
        // Refresh adapters list and select the new file
        const listRes = await fetch('http://localhost:8080/api/studio/adapters');
        const data = await listRes.json();
        setAdapters(data);
        setSelectedFile(filename);
        setTimeout(() => setSaveStatus(''), 2500);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
  };

  const toggleAdapterTest = async () => {
    if (isTesting) {
      setIsTesting(false);
      try {
        await fetch('http://localhost:8080/api/studio/sandbox/stop', { method: 'POST' });
        setParsedLogs(prev => [...prev, `>> ADAPTER ENGINE TERMINATED.`]);
      } catch (err) {
        console.error("Failed to stop test", err);
      }
    } else {
      if (isSniffing) {
          setIsSniffing(false);
          setRawLogs(prev => [...prev, `>> AUTO-STOPPED SNIFFER TO FREE PORT FOR TESTER.`]);
      }

      setIsTesting(true);
      setParsedLogs([`>> COMPILING AND EXECUTING LIVE EDITOR CODE ON PORT ${listenPort}...`, `>> WAITING FOR LIVE STREAM OR INJECTED SAMPLES...`]);

      try {
        await fetch(`http://localhost:8080/api/studio/sandbox/test/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: code,
            port: listenPort,
            rawSample: getLatestRawSample()
          })
        });
      } catch (err) {
        setParsedLogs(prev => [...prev, `>> ERROR: Failed to execute backend process.`]);
        setIsTesting(false);
      }
    }
  };

  const getLatestRawSample = () => {
    for (let i = rawLogs.length - 1; i >= 0; i--) {
      if (rawLogs[i].trim().startsWith('{')) {
        return rawLogs[i];
      }
    }
    return '{"header": "CUSTOM_STREAM", "uav_id": "d9fa697d-bd67-4035-8df4-f38f94b4a8fb", "telemetry": {"loc": [37.765, -122.417], "alt_m": 150.0}, "pwr": {"bat_pct": 85}, "velocity_kts": 12.0, "yaw": 90.0}';
  };

  const handleLlmGenerate = async () => {
    setIsGenerating(true);
    setGenerationError('');

    const contextualInstruction = `${llmInstruction} CRITICAL: The adapter must bind to and listen exclusively on UDP port ${listenPort}.`;

    const payload = {
      model: selectedModel,
      instruction: contextualInstruction,
      rawSample: getLatestRawSample(),
      targetSchema: JSON.stringify(REQUIRED_SCHEMA, null, 2),
      currentCode: code
    };

    try {
      const res = await fetch('http://localhost:8080/api/studio/adapters/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.code && !data.code.startsWith('# Error')) {
        setCode(data.code);
        setAdapters(prev => prev.includes('custom_code.py') ? prev : [...prev, 'custom_code.py']);
        setSelectedFile('custom_code.py');
        setIsLlmModalOpen(false);
      } else {
        setGenerationError(data.code || 'Failed to generate code with Ollama.');
      }
    } catch (err) {
      setGenerationError('Failed to communicate with Ollama backend. Ensure `ollama serve` is running.');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (rawRef.current) rawRef.current.scrollTop = rawRef.current.scrollHeight;
  }, [rawLogs]);

  useEffect(() => {
    if (parsedRef.current) parsedRef.current.scrollTop = parsedRef.current.scrollHeight;
  }, [parsedLogs]);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: bgMain, color: textColor, overflow: 'hidden' }}>
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .animate-spin {
            animation: spin 1s linear infinite;
          }
        `}
      </style>

      {/* HEADER COMMAND BAR */}
      <header style={{ padding: '12px 24px', background: bgCard, borderBottom: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/')}
            onMouseOver={(e) => { e.currentTarget.style.color = '#00E5FF'; e.currentTarget.style.background = isDark ? '#1a1a22' : '#f0f0f2'; }}
            onMouseOut={(e) => { e.currentTarget.style.color = subtextColor; e.currentTarget.style.background = 'transparent'; }}
            style={{ padding: '8px 12px', borderRadius: '12px', background: 'transparent', border: 'none', color: subtextColor, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', transition: 'all 0.2s ease' }}
          >
            <ArrowLeft size={16} /> Portal
          </button>
          <div style={{ width: '1px', height: '24px', background: borderColor }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileCode color="#00E5FF" size={20} />
            <span style={{ fontWeight: '700', fontSize: '16px', letterSpacing: '-0.3px' }}>Adapter Studio</span>
          </div>

          <select
            value={selectedFile}
            onChange={(e) => setSelectedFile(e.target.value)}
            style={{ padding: '8px 16px', background: bgInput, border: `1px solid ${borderColor}`, color: textColor, borderRadius: '12px', marginLeft: '12px', outline: 'none', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease' }}
            onMouseOver={(e) => e.currentTarget.style.borderColor = '#00E5FF'}
            onMouseOut={(e) => e.currentTarget.style.borderColor = borderColor}
          >
            {adapters.length === 0 ? <option value="">No Adapters Found</option> : adapters.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>

          {/* TARGET PORT SELECTOR */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px', background: bgInput, padding: '6px 14px', borderRadius: '12px', border: `1px solid ${borderColor}` }}>
            <Plug color={subtextColor} size={14} />
            <span style={{ fontSize: '12px', color: subtextColor, fontWeight: '600' }}>TARGET PORT:</span>
            <input
              type="number"
              value={listenPort}
              onChange={handlePortChange}
              style={{ width: '64px', background: 'transparent', border: 'none', color: '#00E5FF', fontWeight: '700', fontSize: '14px', outline: 'none' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => setIsLlmModalOpen(true)}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(168, 85, 247, 0.25)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
            style={{ padding: '8px 18px', background: isDark ? 'rgba(168, 85, 247, 0.12)' : '#f3e8ff', border: '1px solid rgba(168, 85, 247, 0.4)', color: isDark ? '#d8b4fe' : '#7e22ce', borderRadius: '24px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s ease' }}
          >
            <Sparkles size={16} /> Ollama Code Builder
          </button>

          <button
            onClick={handleSave}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 229, 255, 0.25)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
            style={{ padding: '8px 20px', background: saveStatus === 'saved' ? '#10b981' : '#00E5FF', color: '#000', border: 'none', borderRadius: '24px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s ease' }}
          >
            {saveStatus === 'saved' ? <><CheckCircle2 size={16} /> Saved</> : <><Save size={16} /> Save</>}
          </button>

          <button
            onClick={handleSaveAs}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 229, 255, 0.25)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
            style={{ padding: '8px 20px', background: isDark ? '#2a2a35' : '#e4e4e7', color: textColor, border: `1px solid ${borderColor}`, borderRadius: '24px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s ease' }}
          >
            <Copy size={16} /> Save As...
          </button>

          <div style={{ paddingLeft: '8px' }}>
             <ThemeToggle />
          </div>
        </div>
      </header>

      {/* WORKSPACE */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.2fr 1fr', overflow: 'hidden', minHeight: 0 }}>
        {/* LEFT: MONACO CODE EDITOR */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: `1px solid ${borderColor}`, background: isDark ? '#1e1e1e' : '#fff', minHeight: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 20px', background: isDark ? '#0d0d11' : '#f9f9fb', borderBottom: `1px solid ${borderColor}`, fontSize: '11px', color: subtextColor, fontFamily: 'monospace', fontWeight: '600', letterSpacing: '0.5px', flexShrink: 0 }}>
            EDITING: {selectedFile || "None"} | INJECTED PORT: {listenPort}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <Editor
              height="100%"
              language="python"
              theme={isDark ? 'vs-dark' : 'light'}
              value={code}
              onChange={(newVal) => setCode(newVal || '')}
              options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: "monospace", padding: { top: 16 } }}
            />
          </div>
        </div>

        {/* RIGHT: SPLIT STREAM INSPECTORS */}
        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', background: bgCard, overflow: 'hidden', minHeight: 0 }}>
          {/* TOP RIGHT: RAW WIRE SNIFFER */}
          <div style={{ display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${borderColor}`, minHeight: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isDark ? '#111116' : '#f4f4f6', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Database color={subtextColor} size={16} />
                <span style={{ fontSize: '13px', fontWeight: '700', letterSpacing: '0.5px' }}>1. RAW UDP STREAM</span>
              </div>
              <button
                onClick={toggleRawSniffer}
                style={{ padding: '6px 16px', background: isSniffing ? 'rgba(255, 59, 48, 0.1)' : 'transparent', border: `1px solid ${isSniffing ? '#ff3b30' : subtextColor}`, color: isSniffing ? '#ff3b30' : textColor, borderRadius: '16px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
              >
                {isSniffing ? 'Stop Sniffing' : 'Start Sniffing'}
              </button>
            </div>
            <div ref={rawRef} style={{ flex: 1, background: isDark ? '#050508' : '#fafafa', padding: '16px', fontFamily: 'monospace', fontSize: '12px', color: '#a855f7', overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: '1.6', minHeight: 0 }}>
              {rawLogs.map((log, i) => <div key={i} style={{ marginBottom: '4px' }}>{log}</div>)}
            </div>
          </div>

          {/* BOTTOM RIGHT: ADAPTER OUTPUT */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isDark ? '#111116' : '#f4f4f6', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Terminal color="#00E5FF" size={16} />
                <span style={{ fontSize: '13px', fontWeight: '700', letterSpacing: '0.5px' }}>2. PARSED ADAPTER OUTPUT</span>
              </div>
              <button
                onClick={toggleAdapterTest}
                style={{ padding: '6px 16px', background: isTesting ? '#ff3b30' : '#00E5FF', color: isTesting ? '#fff' : '#000', border: 'none', borderRadius: '16px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', gap: '6px', alignItems: 'center' }}
              >
                {isTesting ? <Square fill="currentColor" size={14} /> : <Play fill="currentColor" size={14} />}
                {isTesting ? 'Stop Test' : 'Test Code'}
              </button>
            </div>

            <div ref={parsedRef} style={{ flex: 1, background: isDark ? '#050508' : '#fafafa', padding: '16px', fontFamily: 'monospace', fontSize: '12px', color: '#00ff88', overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: '1.6', minHeight: 0 }}>
               {parsedLogs.map((log, i) => (
                 <div key={i} style={{
                   marginBottom: '4px',
                   color: log.includes('✅ SUCCESS') ? '#10b981' : (log.includes('❌ ERROR') ? '#ff3b30' : '#00ff88')
                 }}>
                   {log}
                 </div>
               ))}
            </div>
          </div>
        </div>
      </div>

      {/* OLLAMA AI ASSISTANT MODAL */}
      {isLlmModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div style={{ width: '680px', maxHeight: '90vh', background: bgCard, border: `1px solid ${borderColor}`, borderRadius: '24px', padding: '28px', boxShadow: '0 25px 50px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ padding: '8px', background: 'rgba(168, 85, 247, 0.15)', borderRadius: '12px' }}>
                  <Cpu color="#a855f7" size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700' }}>Local Ollama Adapter Synthesizer</h3>
                  <span style={{ fontSize: '11px', color: subtextColor }}>Zero cloud dependencies • Running entirely on localhost</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '11px', fontWeight: '700', color: subtextColor }}>MODEL:</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  style={{ padding: '6px 12px', background: bgInput, border: `1px solid ${borderColor}`, color: textColor, borderRadius: '12px', fontSize: '12px', outline: 'none', fontWeight: '600', cursor: 'pointer' }}
                >
                  {ollamaModels.length === 0 ? (
                    <option value="">No models detected</option>
                  ) : (
                    ollamaModels.map((m) => <option key={m} value={m}>{m}</option>)
                  )}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '14px', flexShrink: 0 }}>
              <label style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', color: subtextColor, display: 'block', marginBottom: '6px' }}>Task Instructions</label>
              <textarea
                rows={2}
                value={llmInstruction}
                onChange={(e) => setLlmInstruction(e.target.value)}
                placeholder="Describe how to parse the fields..."
                style={{ width: '100%', padding: '12px 14px', background: bgInput, border: `1px solid ${borderColor}`, color: textColor, borderRadius: '14px', fontSize: '13px', outline: 'none', resize: 'none' }}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', background: isDark ? '#08080c' : '#f5f5f7', border: `1px dashed ${borderColor}`, borderRadius: '14px', padding: '14px', fontSize: '11px', fontFamily: 'monospace', lineHeight: '1.5', marginBottom: '16px' }}>
              <div style={{ color: '#a855f7', fontWeight: '700', marginBottom: '4px' }}>[1] SAMPLE INPUT (LATEST FROM WIRE):</div>
              <div style={{ color: subtextColor, marginBottom: '12px', wordBreak: 'break-all' }}>{getLatestRawSample()}</div>

              <div style={{ color: '#00E5FF', fontWeight: '700', marginBottom: '4px' }}>[2] TARGET OUTPUT SCHEMA (FLEET STANDARD):</div>
              <div style={{ color: subtextColor, marginBottom: '12px' }}>{JSON.stringify(REQUIRED_SCHEMA, null, 2)}</div>
            </div>

            {generationError && (
              <div style={{ padding: '8px 12px', background: 'rgba(255, 59, 48, 0.1)', border: '1px solid #ff3b30', borderRadius: '12px', color: '#ff3b30', fontSize: '12px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={15} />
                <span>{generationError}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
              <button
                onClick={() => setIsLlmModalOpen(false)}
                style={{ flex: 1, padding: '12px', background: 'transparent', border: `1px solid ${borderColor}`, color: textColor, borderRadius: '14px', cursor: 'pointer', fontWeight: '600' }}
              >
                Cancel
              </button>

              <button
                onClick={handleLlmGenerate}
                disabled={isGenerating || !selectedModel}
                style={{ flex: 2, padding: '12px', background: '#a855f7', color: '#fff', border: 'none', borderRadius: '14px', cursor: isGenerating ? 'not-allowed' : 'pointer', fontWeight: '700', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', opacity: isGenerating ? 0.8 : 1 }}
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Synthesizing Adapter...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Generate & Autofill Editor
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}