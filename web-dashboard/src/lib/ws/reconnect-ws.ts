/**
 * WebSocket reconnect wrapper dengan exponential backoff.
 *
 * Sesuai design.md §WebSocket Reconnect Strategy dan Req 15.6.
 *
 * Backoff array: [1000, 2000, 4000, 8000, 30000] ms.
 * Setelah 10 detik tanpa koneksi, callback `onStatusChange` dipanggil
 * dengan `disconnected` agar UI menampilkan banner.
 */

const DELAYS = [1000, 2000, 4000, 8000, 30000];
const DISCONNECT_BANNER_MS = 10_000;

export type ConnStatus = "connecting" | "connected" | "disconnected";

export interface ReconnectOptions {
  url: string;
  onMessage?: (event: MessageEvent) => void;
  onStatusChange?: (status: ConnStatus) => void;
  onError?: (event: Event) => void;
}

export interface ReconnectHandle {
  close: () => void;
  send: (data: string | ArrayBufferLike | Blob | ArrayBufferView) => boolean;
}

export function reconnectWs(opts: ReconnectOptions): ReconnectHandle {
  let attempt = 0;
  let ws: WebSocket | null = null;
  let stopped = false;
  let bannerTimer: ReturnType<typeof setTimeout> | null = null;

  function emit(status: ConnStatus): void {
    opts.onStatusChange?.(status);
  }

  function clearBannerTimer(): void {
    if (bannerTimer) {
      clearTimeout(bannerTimer);
      bannerTimer = null;
    }
  }

  function connect(): void {
    if (stopped) return;
    emit("connecting");
    bannerTimer = setTimeout(() => {
      emit("disconnected");
    }, DISCONNECT_BANNER_MS);

    ws = new WebSocket(opts.url);
    ws.onopen = () => {
      attempt = 0;
      clearBannerTimer();
      emit("connected");
    };
    ws.onmessage = (event) => {
      opts.onMessage?.(event);
    };
    ws.onerror = (event) => {
      opts.onError?.(event);
    };
    ws.onclose = () => {
      if (stopped) return;
      clearBannerTimer();
      emit("disconnected");
      const delay = DELAYS[Math.min(attempt, DELAYS.length - 1)];
      attempt += 1;
      setTimeout(() => connect(), delay);
    };
  }

  connect();

  return {
    close: () => {
      stopped = true;
      clearBannerTimer();
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    },
    send: (data) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      try {
        ws.send(data);
        return true;
      } catch {
        return false;
      }
    },
  };
}
