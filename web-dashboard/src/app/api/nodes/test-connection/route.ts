import { NextResponse } from 'next/server';
import net from 'net';
import mqtt from 'mqtt';
import type { ConnectionTestRequest, ConnectionTestResponse } from '@/lib/node-types';

/**
 * POST /api/nodes/test-connection
 * Tests connectivity to a camera (RTSP via TCP probe) or MQTT broker.
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */
export async function POST(req: Request) {
  let body: ConnectionTestRequest;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Body request tidak valid (bukan JSON)' },
      { status: 400 }
    );
  }

  // Validate type parameter (Requirement 10.5)
  if (!body.type || (body.type !== 'camera' && body.type !== 'mqtt')) {
    return NextResponse.json(
      { error: 'Parameter "type" tidak valid. Harus "camera" atau "mqtt".' },
      { status: 400 }
    );
  }

  // Validate required fields per type (Requirement 10.5)
  if (body.type === 'camera') {
    if (!body.url || typeof body.url !== 'string' || body.url.trim() === '') {
      return NextResponse.json(
        { error: 'Parameter "url" wajib diisi untuk type "camera".' },
        { status: 400 }
      );
    }
    return handleCameraTest(body.url);
  }

  if (body.type === 'mqtt') {
    if (!body.broker || typeof body.broker !== 'string' || body.broker.trim() === '') {
      return NextResponse.json(
        { error: 'Parameter "broker" wajib diisi untuk type "mqtt".' },
        { status: 400 }
      );
    }
    if (body.port === undefined || body.port === null || typeof body.port !== 'number') {
      return NextResponse.json(
        { error: 'Parameter "port" wajib diisi (integer) untuk type "mqtt".' },
        { status: 400 }
      );
    }
    if (!body.username || typeof body.username !== 'string') {
      return NextResponse.json(
        { error: 'Parameter "username" wajib diisi untuk type "mqtt".' },
        { status: 400 }
      );
    }
    if (!body.password || typeof body.password !== 'string') {
      return NextResponse.json(
        { error: 'Parameter "password" wajib diisi untuk type "mqtt".' },
        { status: 400 }
      );
    }
    return handleMqttTest(body.broker, body.port, body.username, body.password);
  }

  // Should never reach here
  return NextResponse.json({ error: 'Unknown error' }, { status: 500 });
}

/**
 * Camera test: TCP socket probe to RTSP host:port with 10s timeout.
 * Parses the RTSP URL to extract host and port (default 554).
 * Returns reachable/unreachable/timeout. (Requirements 10.2, 10.4)
 */
async function handleCameraTest(url: string): Promise<NextResponse> {
  const TIMEOUT_MS = 10_000;

  // Parse RTSP URL to extract host and port
  let host: string;
  let port: number;

  try {
    // RTSP URLs follow the pattern: rtsp://[user:pass@]host[:port]/path
    const urlWithHttp = url.replace(/^rtsp:\/\//, 'http://');
    const parsed = new URL(urlWithHttp);
    host = parsed.hostname;
    port = parsed.port ? parseInt(parsed.port, 10) : 554;

    if (!host) {
      throw new Error('Host tidak ditemukan dalam URL');
    }
  } catch {
    return NextResponse.json({
      status: 'unreachable',
      error: 'URL RTSP tidak valid. Format: rtsp://host[:port]/path',
    } satisfies ConnectionTestResponse);
  }

  try {
    const result = await tcpProbe(host, port, TIMEOUT_MS);
    if (result.connected) {
      const response: ConnectionTestResponse = {
        status: 'reachable',
      };
      return NextResponse.json(response);
    } else {
      const response: ConnectionTestResponse = {
        status: 'unreachable',
        error: result.error || 'Tidak dapat terhubung ke kamera RTSP.',
      };
      return NextResponse.json(response);
    }
  } catch {
    const response: ConnectionTestResponse = {
      status: 'timeout',
      error: 'Koneksi melebihi batas waktu 10 detik.',
    };
    return NextResponse.json(response);
  }
}

/**
 * MQTT test: TLS connection to broker with 10s timeout, measures latency.
 * Returns connected/failed/timeout. (Requirements 10.3, 10.4)
 */
async function handleMqttTest(
  broker: string,
  port: number,
  username: string,
  password: string
): Promise<NextResponse> {
  const TIMEOUT_MS = 10_000;
  const startTime = Date.now();

  return new Promise<NextResponse>((resolve) => {
    let resolved = false;

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          client.end(true);
        } catch {
          // Ignore cleanup errors
        }
        const response: ConnectionTestResponse = {
          status: 'timeout',
          error: 'Koneksi melebihi batas waktu 10 detik.',
        };
        resolve(NextResponse.json(response));
      }
    }, TIMEOUT_MS);

    const brokerUrl = `mqtts://${broker}:${port}`;

    const client = mqtt.connect(brokerUrl, {
      username,
      password,
      connectTimeout: TIMEOUT_MS,
      rejectUnauthorized: false, // Allow self-signed certs for testing
    });

    client.on('connect', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        const latency = Date.now() - startTime;
        client.end(true);
        const response: ConnectionTestResponse = {
          status: 'connected',
          latency,
        };
        resolve(NextResponse.json(response));
      }
    });

    client.on('error', (err: Error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        try {
          client.end(true);
        } catch {
          // Ignore cleanup errors
        }
        const response: ConnectionTestResponse = {
          status: 'failed',
          error: `Koneksi MQTT gagal: ${err.message}`,
        };
        resolve(NextResponse.json(response));
      }
    });
  });
}

/**
 * TCP probe utility: attempts to open a TCP socket to host:port.
 * Resolves with { connected: true } on success, or { connected: false, error } on failure.
 * Rejects on timeout.
 */
function tcpProbe(
  host: string,
  port: number,
  timeoutMs: number
): Promise<{ connected: boolean; error?: string }> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();

    const timeoutId = setTimeout(() => {
      socket.destroy();
      reject(new Error('timeout'));
    }, timeoutMs);

    socket.connect(port, host, () => {
      clearTimeout(timeoutId);
      socket.destroy();
      resolve({ connected: true });
    });

    socket.on('error', (err: Error) => {
      clearTimeout(timeoutId);
      socket.destroy();
      resolve({ connected: false, error: err.message });
    });
  });
}
