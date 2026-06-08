export function getYoloWebSocketUrl(): string {
  const configured = process.env.NEXT_PUBLIC_YOLO_WS_URL?.trim();
  if (configured) {
    return configured;
  }

  if (typeof window === "undefined") {
    return "ws://localhost:8765";
  }

  const isHttps = window.location.protocol === "https:";
  const scheme = isHttps ? "wss" : "ws";
  const host = window.location.hostname || "localhost";
  return `${scheme}://${host}:8765`;
}
