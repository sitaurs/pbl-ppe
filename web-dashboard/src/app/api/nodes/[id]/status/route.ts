/**
 * GET /api/nodes/:id/status  (sector-scoped, service-token allowed)
 *
 * TCP-probe ke camera (RTSP/HTTP) dan MQTT broker untuk live status.
 */
import { NextResponse, type NextRequest } from "next/server";
import net from "net";
import { migrateNode } from "@/lib/node-migration";
import { assertSectorAccess } from "@/lib/rbac/sector-scope";
import { getRequestContext } from "@/lib/rbac/context";
import { prisma } from "@/lib/prisma";

interface DbNodeRow {
  id: number;
  sektorId: string;
  sektorName: string;
  picName: string;
  picPhone: string;
  cameraSource: string;
  enabled: boolean;
  camera: string | null;
  esp32: string | null;
  detection: string | null;
}

function parseJsonNullable<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function rowToNode(row: DbNodeRow): ReturnType<typeof migrateNode> {
  return migrateNode({
    id: row.id,
    sektorId: row.sektorId,
    sektorName: row.sektorName,
    picName: row.picName,
    picPhone: row.picPhone,
    cameraSource: row.cameraSource,
    enabled: row.enabled,
    camera: parseJsonNullable(row.camera),
    esp32: parseJsonNullable(row.esp32),
    detection: parseJsonNullable(row.detection),
  });
}

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
    socket.on("error", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
  });
}

function parseRtspUrl(url: string): { host: string; port: number } | null {
  try {
    const parsed = new URL(url.replace(/^rtsp:\/\//, "http://"));
    const host = parsed.hostname;
    const port = parsed.port ? parseInt(parsed.port, 10) : 554;
    if (!host) return null;
    return { host, port };
  } catch {
    return null;
  }
}

function parseMqttBroker(broker: string): { host: string; port: number } | null {
  if (!broker || broker.trim() === "") return null;
  let cleanBroker = broker.trim();
  if (cleanBroker.includes("://")) {
    try {
      const parsed = new URL(
        cleanBroker.replace(/^mqtts?:\/\//, "https://").replace(/^mqtt:\/\//, "http://"),
      );
      const host = parsed.hostname;
      const port = parsed.port ? parseInt(parsed.port, 10) : 8883;
      if (!host) return null;
      return { host, port };
    } catch {
      // fall through
    }
  }
  const parts = cleanBroker.split(":");
  if (parts.length === 2) {
    const port = parseInt(parts[1], 10);
    return { host: parts[0], port: isNaN(port) ? 8883 : port };
  }
  return { host: cleanBroker, port: 8883 };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: "Node not found" }, { status: 404 });
  }
  const row = await prisma.node.findUnique({ where: { id: numericId } });
  if (!row) return NextResponse.json({ error: "Node not found" }, { status: 404 });
  if (!assertSectorAccess(row.sektorId, ctx)) {
    return NextResponse.json({ error: "Node not found" }, { status: 404 });
  }
  const node = rowToNode(row as DbNodeRow);

  const TCP_TIMEOUT = 3000;

  let cameraStatus: "online" | "offline" | "unconfigured";
  if (!node.camera) {
    cameraStatus = "unconfigured";
  } else if (node.camera.protocol === "local") {
    cameraStatus = "online";
  } else if (!node.camera.url || node.camera.url.trim() === "") {
    cameraStatus = "unconfigured";
  } else {
    const parsed = parseRtspUrl(node.camera.url);
    cameraStatus = parsed
      ? (await tcpProbe(parsed.host, parsed.port, TCP_TIMEOUT))
        ? "online"
        : "offline"
      : "offline";
  }

  let esp32Status: "connected" | "disconnected" | "unconfigured";
  if (!node.esp32 || !node.esp32.enabled) {
    esp32Status = "unconfigured";
  } else if (!node.esp32.mqttBroker || node.esp32.mqttBroker.trim() === "") {
    esp32Status = "unconfigured";
  } else {
    const parsed = parseMqttBroker(node.esp32.mqttBroker);
    esp32Status = parsed
      ? (await tcpProbe(parsed.host, parsed.port, TCP_TIMEOUT))
        ? "connected"
        : "disconnected"
      : "disconnected";
  }

  return NextResponse.json({
    camera: cameraStatus,
    esp32: esp32Status,
    lastUpdated: new Date().toISOString(),
  });
}
