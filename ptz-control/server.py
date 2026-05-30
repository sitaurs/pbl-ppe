"""
PTZ Control Server — Web interface untuk kontrol kamera V380 via ONVIF.
Jalankan: python server.py
Buka: http://localhost:8080

Kontrol: TAHAN tombol untuk gerak, LEPAS untuk berhenti.
"""

import time
import threading
import json
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

import cv2
from onvif import ONVIFCamera

# ── Konfigurasi Kamera ─────────────────────
CAMERA_IP = "192.168.88.10"
ONVIF_PORT = 8899
ONVIF_USER = "admin"
ONVIF_PASS = ""
RTSP_URL = f"rtsp://{CAMERA_IP}/live/ch00_1"
PTZ_SPEED = 0.3
SERVER_PORT = 8080

# ── Global State ───────────────────────────
ptz_service = None
ptz_profile = None
latest_frame = None
frame_lock = threading.Lock()
is_moving = False


def init_camera():
    """Inisialisasi koneksi ONVIF dan PTZ."""
    global ptz_service, ptz_profile
    print(f"Connecting ONVIF: {CAMERA_IP}:{ONVIF_PORT}...")
    cam = ONVIFCamera(CAMERA_IP, ONVIF_PORT, ONVIF_USER, ONVIF_PASS)
    media = cam.create_media_service()
    ptz_service = cam.create_ptz_service()
    ptz_profile = media.GetProfiles()[0]
    print(f"PTZ ready! Profile: {ptz_profile.token}")


def start_move(direction):
    """Mulai gerak (dipanggil saat tombol DITEKAN)."""
    global is_moving
    if not ptz_service or not ptz_profile:
        return

    velocities = {
        "left":  {"x": -PTZ_SPEED, "y": 0.0},
        "right": {"x": PTZ_SPEED, "y": 0.0},
        "up":    {"x": 0.0, "y": PTZ_SPEED},
        "down":  {"x": 0.0, "y": -PTZ_SPEED},
    }

    if direction not in velocities:
        return

    vel = velocities[direction]
    req = ptz_service.create_type("ContinuousMove")
    req.ProfileToken = ptz_profile.token
    req.Velocity = {"PanTilt": {"x": vel["x"], "y": vel["y"]}, "Zoom": {"x": 0.0}}
    ptz_service.ContinuousMove(req)
    is_moving = True


def stop_move():
    """Stop gerak (dipanggil saat tombol DILEPAS)."""
    global is_moving
    if ptz_service and ptz_profile:
        ptz_service.Stop({"ProfileToken": ptz_profile.token})
    is_moving = False


def video_capture_loop():
    """Loop capture frame — low latency."""
    global latest_frame
    cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    # Force low latency
    cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)

    print(f"RTSP stream: {RTSP_URL}")

    while True:
        ret, frame = cap.read()
        if not ret:
            time.sleep(0.5)
            cap.release()
            cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            continue

        # Resize ke 640px
        h, w = frame.shape[:2]
        new_w = 640
        new_h = int(h * (new_w / w))
        resized = cv2.resize(frame, (new_w, new_h))

        _, buffer = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 70])
        with frame_lock:
            latest_frame = buffer.tobytes()


# ── HTTP Handler ───────────────────────────
class PTZHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/" or parsed.path == "/index.html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML_PAGE.encode("utf-8"))

        elif parsed.path == "/frame":
            # Buang frame lama, ambil yang terbaru
            with frame_lock:
                frame_data = latest_frame
            if frame_data:
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Connection", "close")
                self.end_headers()
                self.wfile.write(frame_data)
            else:
                self.send_response(503)
                self.end_headers()

        elif parsed.path == "/start":
            # Mulai gerak — dipanggil saat mousedown/touchstart
            params = parse_qs(parsed.query)
            direction = params.get("dir", [None])[0]
            if direction:
                threading.Thread(target=start_move, args=(direction,), daemon=True).start()
                self._json_ok({"moving": direction})
            else:
                self.send_response(400)
                self.end_headers()

        elif parsed.path == "/stop":
            # Stop gerak — dipanggil saat mouseup/touchend
            threading.Thread(target=stop_move, daemon=True).start()
            self._json_ok({"moving": False})

        else:
            self.send_response(404)
            self.end_headers()

    def _json_ok(self, data):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_message(self, format, *args):
        pass


# ── HTML Page ──────────────────────────────
HTML_PAGE = """<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>PTZ Control</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: system-ui, sans-serif;
  background: #0f1118;
  color: #e2e4e9;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px;
  overflow: hidden;
}
.container {
  width: 100%;
  max-width: 640px;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.header h1 {
  font-size: 1rem;
  font-weight: 600;
  color: #fff;
}
.live {
  background: #e8720b;
  color: white;
  font-size: 9px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
  text-transform: uppercase;
}
.video-box {
  width: 100%;
  background: #1a1d27;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #2a2d3a;
}
.video-box img {
  width: 100%;
  display: block;
}
.controls {
  display: grid;
  grid-template-areas:
    ". up ."
    "left stop right"
    ". down .";
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
  max-width: 200px;
  margin: 14px auto;
}
.btn {
  width: 100%;
  aspect-ratio: 1;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
  transition: background 0.1s, transform 0.1s;
}
.btn-dir {
  background: #1e2030;
  border: 1px solid #2a2d3a;
  color: #8a8d9a;
}
.btn-dir:hover { background: #262a3d; color: #e8720b; border-color: #e8720b; }
.btn-dir.active { background: #e8720b; color: #fff; border-color: #e8720b; transform: scale(0.93); }
.btn-stop {
  background: #1a3a6b;
  color: white;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
}
.btn-stop:hover { background: #15305a; }
.btn-stop:active { transform: scale(0.93); }
.btn[data-dir="up"] { grid-area: up; }
.btn[data-dir="down"] { grid-area: down; }
.btn[data-dir="left"] { grid-area: left; }
.btn[data-dir="right"] { grid-area: right; }
.btn[data-dir="stop"] { grid-area: stop; }
.hint {
  text-align: center;
  font-size: 10px;
  color: #4a4d5a;
  margin-top: 8px;
}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>PTZ Control</h1>
    <span class="live">● LIVE</span>
  </div>

  <div class="video-box">
    <img id="feed" src="/frame" alt="Feed">
  </div>

  <div class="controls">
    <button class="btn btn-dir" data-dir="up">▲</button>
    <button class="btn btn-dir" data-dir="left">◄</button>
    <button class="btn btn-stop" data-dir="stop">STOP</button>
    <button class="btn btn-dir" data-dir="right">►</button>
    <button class="btn btn-dir" data-dir="down">▼</button>
  </div>

  <div class="hint">Tahan tombol untuk gerak, lepas untuk berhenti. Keyboard: Arrow keys.</div>
</div>

<script>
const img = document.getElementById('feed');
// Low-latency frame refresh
function refreshFrame() {
  const next = new Image();
  next.onload = () => { img.src = next.src; requestAnimationFrame(refreshFrame); };
  next.onerror = () => { setTimeout(refreshFrame, 200); };
  next.src = '/frame?t=' + Date.now();
}
refreshFrame();

// PTZ: hold to move, release to stop
let activeDir = null;

document.querySelectorAll('.btn-dir').forEach(btn => {
  const dir = btn.dataset.dir;

  function startDir(e) {
    e.preventDefault();
    if (activeDir === dir) return;
    activeDir = dir;
    btn.classList.add('active');
    fetch('/start?dir=' + dir);
  }

  function endDir(e) {
    e.preventDefault();
    if (activeDir === dir) {
      activeDir = null;
      btn.classList.remove('active');
      fetch('/stop');
    }
  }

  // Mouse
  btn.addEventListener('mousedown', startDir);
  btn.addEventListener('mouseup', endDir);
  btn.addEventListener('mouseleave', endDir);

  // Touch
  btn.addEventListener('touchstart', startDir, {passive: false});
  btn.addEventListener('touchend', endDir, {passive: false});
  btn.addEventListener('touchcancel', endDir, {passive: false});
});

// Stop button
document.querySelector('[data-dir="stop"]').addEventListener('mousedown', (e) => {
  e.preventDefault();
  activeDir = null;
  document.querySelectorAll('.btn-dir').forEach(b => b.classList.remove('active'));
  fetch('/stop');
});
document.querySelector('[data-dir="stop"]').addEventListener('touchstart', (e) => {
  e.preventDefault();
  activeDir = null;
  document.querySelectorAll('.btn-dir').forEach(b => b.classList.remove('active'));
  fetch('/stop');
}, {passive: false});

// Keyboard: hold to move
const keyMap = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const keysDown = new Set();

document.addEventListener('keydown', (e) => {
  const dir = keyMap[e.key];
  if (!dir || keysDown.has(e.key)) return;
  e.preventDefault();
  keysDown.add(e.key);
  activeDir = dir;
  fetch('/start?dir=' + dir);
  const btn = document.querySelector(`[data-dir="${dir}"]`);
  if (btn) btn.classList.add('active');
});

document.addEventListener('keyup', (e) => {
  const dir = keyMap[e.key];
  if (!dir) return;
  e.preventDefault();
  keysDown.delete(e.key);
  if (activeDir === dir) {
    activeDir = null;
    fetch('/stop');
  }
  const btn = document.querySelector(`[data-dir="${dir}"]`);
  if (btn) btn.classList.remove('active');
});

// Space = emergency stop
document.addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    e.preventDefault();
    activeDir = null;
    keysDown.clear();
    document.querySelectorAll('.btn-dir').forEach(b => b.classList.remove('active'));
    fetch('/stop');
  }
});
</script>
</body>
</html>
"""

# ── Main ───────────────────────────────────
if __name__ == "__main__":
    init_camera()

    video_thread = threading.Thread(target=video_capture_loop, daemon=True)
    video_thread.start()

    server = HTTPServer(("0.0.0.0", SERVER_PORT), PTZHandler)
    print(f"\n  PTZ Control: http://localhost:{SERVER_PORT}")
    print(f"  Tahan tombol = gerak, lepas = berhenti\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        stop_move()
        print("\nStopped.")
