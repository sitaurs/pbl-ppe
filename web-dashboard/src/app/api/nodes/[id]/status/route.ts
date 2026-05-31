import { NextResponse, NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import net from 'net';
import { migrateNode } from '@/lib/node-migration';

const dbPath = path.join(process.cwd(), 'data', 'db.json');

function getDb() {
  if (!fs.existsSync(dbPath)) return { nodes: [] };
  const file = fs.readFileSync(dbPath, 'utf8');
  try {
    return JSON.parse(file);
  } catch {
    return { nodes: [] };
  }
}

/**
 * TCP probe to a host:port with a given timeout.
 * Resolves true if connection succeeds, false otherwise.
 */
function tcpProbe(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);

    socket.connect(port, host, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Parse host and port from an RTSP URL.
 * e.g. "rtsp://192.168.88.10/live/ch00_1" → { host: "192.168.88.10", port: 554 }
 * e.g. "rtsp://192.168.88.10:8554/live" → { host: "192.168.88.10", port: 8554 }
 */
function parseRtspUrl(url: string): { host: string; port: number } | null {
  try {
    // Replace rtsp:// with http:// so URL constructor can parse it
    const parsed = new URL(url.replace(/^rtsp:\/\//, 'http://'));
    const host = parsed.hostname;
    const port = parsed.port ? parseInt(parsed.port, 10) : 554;
    if (!host) return null;
    return { host, port };
  } catch {
    return null;
  }
}

/**
 * Parse host and port from an MQTT broker string.
 * Handles formats: "host:port", "host" (default port 1883), or full URL "mqtt://host:port"
 */
function parseMqttBroker(broker: string): { host: string; port: number } | null {
  if (!broker || broker.trim() === '') return null;

  let cleanBroker = broker.trim();

  // If it has a protocol prefix, use URL parsing
  if (cleanBroker.includes('://')) {
    try {
      const parsed = new URL(cleanBroker.replace(/^mqtts?:\/\//, 'https://').replace(/^mqtt:\/\//, 'http://'));
      const host = parsed.hostname;
      const port = parsed.port ? parseInt(parsed.port, 10) : 8883;
      if (!host) return null;
      return { host, port };
    } catch {
      // Fall through to simple parsing
    }
  }

  // Simple "host:port" or just "host" format
  const parts = cleanBroker.split(':');
  if (parts.length === 2) {
    const port = parseInt(parts[1], 10);
    return { host: parts[0], port: isNaN(port) ? 8883 : port };
  }

  // Just hostname — use 8883 for TLS MQTT (HiveMQ Cloud default)
  return { host: cleanBroker, port: 8883 };
}

/**
 * GET /api/nodes/[id]/status
 *
 * Returns the live status of a node's camera and ESP32 components.
 * - Camera: "online" | "offline" | "unconfigured"
 * - ESP32: "connected" | "disconnected" | "unconfigured"
 *
 * Uses TCP probes with 3s timeout for reachability checks.
 * Requirements: 9.5
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawNode = db.nodes.find((n: any) => n.id.toString() === id);

  if (!rawNode) {
    return NextResponse.json({ error: 'Node not found' }, { status: 404 });
  }

  // Apply migration to get camera/esp32 fields
  const node = migrateNode(rawNode);

  const TCP_TIMEOUT = 3000; // 3 second timeout

  // --- Camera status check ---
  let cameraStatus: 'online' | 'offline' | 'unconfigured';

  if (!node.camera) {
    cameraStatus = 'unconfigured';
  } else if (node.camera.protocol === 'local') {
    // Local camera (webcam index) is always considered online
    cameraStatus = 'online';
  } else if (!node.camera.url || node.camera.url.trim() === '') {
    cameraStatus = 'unconfigured';
  } else {
    // RTSP or HTTP camera — TCP probe to host:port
    const parsed = parseRtspUrl(node.camera.url);
    if (!parsed) {
      cameraStatus = 'offline';
    } else {
      const reachable = await tcpProbe(parsed.host, parsed.port, TCP_TIMEOUT);
      cameraStatus = reachable ? 'online' : 'offline';
    }
  }

  // --- ESP32 status check ---
  let esp32Status: 'connected' | 'disconnected' | 'unconfigured';

  if (!node.esp32 || !node.esp32.enabled) {
    esp32Status = 'unconfigured';
  } else if (!node.esp32.mqttBroker || node.esp32.mqttBroker.trim() === '') {
    esp32Status = 'unconfigured';
  } else {
    // TCP probe to MQTT broker
    const parsed = parseMqttBroker(node.esp32.mqttBroker);
    if (!parsed) {
      esp32Status = 'disconnected';
    } else {
      const reachable = await tcpProbe(parsed.host, parsed.port, TCP_TIMEOUT);
      esp32Status = reachable ? 'connected' : 'disconnected';
    }
  }

  return NextResponse.json({
    camera: cameraStatus,
    esp32: esp32Status,
    lastUpdated: new Date().toISOString(),
  });
}
