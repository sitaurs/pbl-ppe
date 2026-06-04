"""
SafeGuard APD — TUI Manager v4
================================
Pure Rich + msvcrt terminal UI.  No Textual.
Terminus-dark palette, htop-style, ASCII-only indicators.

Keys : 1-6 tabs | s start-all | x stop-all | r restart-all
       h health-check | b browser | q quit
       (in SETUP tab: a-g to run setup steps)
"""

from __future__ import annotations

import msvcrt
import os
import platform
import shutil
import socket
import subprocess
import sys
import threading
import time
from collections import deque
from datetime import datetime
from pathlib import Path

import psutil
from rich.columns import Columns
from rich.console import Console, Group
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

# ══════════════════════════════════════════════════════════
#  PATHS
# ══════════════════════════════════════════════════════════
BASE_DIR      = Path(__file__).resolve().parent
DASHBOARD_DIR = BASE_DIR / "web-dashboard"
ENV_FILE      = BASE_DIR / ".env"
ENV_LOCAL     = DASHBOARD_DIR / ".env.local"
DB_FILE       = DASHBOARD_DIR / "data" / "safeguard.db"
LOG_FILE      = BASE_DIR / "apd_detection.log"

SERVICES: dict = {
    "nextjs": {
        "name": "Next.js Dashboard",
        "port": 3000,
        "cmd":  ["npm", "run", "dev"],
        "cwd":  str(DASHBOARD_DIR),
    },
    "python": {
        "name": "Python Backend (YOLO)",
        "port": 8765,
        "cmd":  [sys.executable, "ServiceAPDBackend.py"],
        "cwd":  str(BASE_DIR),
    },
}

STEPS = [
    ("a", "Cek Python >= 3.10  &  Node.js >= 18",          None,                                                      "version_check"),
    ("b", "npm install  (web-dashboard deps)",              ["npm", "install"],                                         None),
    ("c", "npm run setup:env  (generate .env.local tokens)","npm run setup:env".split(),                                None),
    ("d", "npx prisma migrate deploy",                      "npx prisma migrate deploy".split(),                        None),
    ("e", "npm run seed  (buat akun admin default)",        "npm run seed".split(),                                     None),
    ("f", "Sync APD_SERVICE_TOKEN ke root .env",            None,                                                      "sync_token"),
    ("g", "pip install -r requirements.txt",                [sys.executable, "-m", "pip", "install", "-r",
                                                             "requirements.txt"],                                        None),
]

# ══════════════════════════════════════════════════════════
#  SHARED STATE
# ══════════════════════════════════════════════════════════
class S:
    tab         = "overview"
    running     = True
    log         : deque = deque(maxlen=300)
    setup_out   : deque = deque(maxlen=300)
    step_states : dict  = {s[0]: "idle" for s in STEPS}
    cpu_hist    : deque = deque(maxlen=40)
    net_rx      = 0.0
    net_tx      = 0.0
    _net0       = None
    _net_t      = 0.0
    _si         : dict  = {}
    svc_procs   : dict  = {}
    svc_t0      : dict  = {}
    _lock               = threading.Lock()

    @classmethod
    def emit(cls, msg: str):
        with cls._lock:
            cls.log.append(f"[dim]{datetime.now().strftime('%H:%M:%S')}[/dim]  {msg}")

# ══════════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════════
_SPARK = " ▁▂▃▄▅▆▇█"

def spark(data: list, width: int = 36) -> str:
    if not data:
        return "─" * width
    samples = list(data)[-width:]
    chars = [_SPARK[min(8, max(0, int(v / 100 * 8)))] for v in samples]
    while len(chars) < width:
        chars.insert(0, " ")
    return "".join(chars)

def bar(pct: float, width: int = 26) -> str:
    f = max(0, min(width, int(pct / 100 * width)))
    return "█" * f + "░" * (width - f)

def fmt_bytes(b: float) -> str:
    for u in ("B", "KB", "MB", "GB"):
        if b < 1024:
            return f"{b:.1f} {u}"
        b /= 1024
    return f"{b:.1f} TB"

def fmt_spd(b: float) -> str:
    return fmt_bytes(b) + "/s"

def bcol(pct: float) -> str:
    if pct >= 90: return "#e55561"
    if pct >= 70: return "#ffcc55"
    return "#23c18b"

def port_open(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.2)
        return s.connect_ex(("127.0.0.1", port)) == 0

def pid_for(port: int) -> int | None:
    try:
        for c in psutil.net_connections("inet"):
            if c.laddr.port == port and c.status == "LISTEN":
                return c.pid
    except Exception:
        pass
    return None

def proc_stats(pid: int | None) -> tuple[float, int]:
    if not pid:
        return 0.0, 0
    try:
        p = psutil.Process(pid)
        return p.cpu_percent(interval=None), p.memory_info().rss
    except Exception:
        return 0.0, 0

def read_env(path: Path) -> dict:
    out: dict = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            out[k.strip()] = v.strip()
    return out

def is_secret(k: str) -> bool:
    return any(x in k.upper() for x in ("PASSWORD", "TOKEN", "KEY", "SECRET", "PASS"))

def mask(v: str) -> str:
    return v[:2] + "****" + v[-2:] if len(v) > 4 else "****"

def tick_metrics():
    S.cpu_hist.append(psutil.cpu_percent(interval=None))
    try:
        net = psutil.net_io_counters()
        now = time.time()
        dt  = now - S._net_t
        if dt >= 0.8 and S._net0:
            S.net_rx  = (net.bytes_recv - S._net0.bytes_recv) / dt
            S.net_tx  = (net.bytes_sent - S._net0.bytes_sent) / dt
            S._net0   = net
            S._net_t  = now
    except Exception:
        pass

# ══════════════════════════════════════════════════════════
#  SERVICE MANAGEMENT
# ══════════════════════════════════════════════════════════
def svc_alive(sid: str) -> bool:
    p = S.svc_procs.get(sid)
    if p and p.poll() is None:
        return True
    return port_open(SERVICES[sid]["port"])

def svc_pid(sid: str) -> int | None:
    p = S.svc_procs.get(sid)
    if p and p.poll() is None:
        return p.pid
    return pid_for(SERVICES[sid]["port"])

def svc_uptime(sid: str) -> str:
    t0 = S.svc_t0.get(sid)
    if not t0 or not svc_alive(sid):
        return "---"
    sec = int(time.time() - t0)
    h, rem = divmod(sec, 3600)
    m, sec  = divmod(rem, 60)
    return f"{h}h{m:02d}m" if h else (f"{m}m{sec:02d}s" if m else f"{sec}s")

def svc_start(sid: str):
    if svc_alive(sid):
        S.emit(f"already running — {SERVICES[sid]['name']}")
        return
    try:
        cfg  = SERVICES[sid]
        fl   = subprocess.CREATE_NEW_PROCESS_GROUP if platform.system() == "Windows" else 0
        proc = subprocess.Popen(
            cfg["cmd"], cwd=cfg["cwd"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=fl, shell=(platform.system() == "Windows"),
        )
        S.svc_procs[sid] = proc
        S.svc_t0[sid]    = time.time()
        S.emit(f"started PID {proc.pid} — {cfg['name']}")
    except Exception as e:
        S.emit(f"error starting {SERVICES[sid]['name']}: {e}")

def svc_stop(sid: str):
    p = S.svc_procs.get(sid)
    if p and p.poll() is None:
        try:
            if platform.system() == "Windows":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], capture_output=True)
            else:
                p.terminate(); p.wait(timeout=5)
        except Exception:
            pass
        S.svc_procs.pop(sid, None)
        S.svc_t0.pop(sid, None)
    pid = pid_for(SERVICES[sid]["port"])
    if pid:
        try:
            psutil.Process(pid).terminate()
        except Exception:
            pass
    S.emit(f"stopped — {SERVICES[sid]['name']}")

# ══════════════════════════════════════════════════════════
#  RENDERING  (Rich)
# ══════════════════════════════════════════════════════════

# ── chrome ────────────────────────────────────────────────
def render_header() -> Panel:
    t = Text()
    t.append("  SAFEGUARD APD", style="bold #5294e2")
    t.append(" │ ", style="#2e2e2e")
    t.append("Access Point Detection System", style="#7a7a7a")
    t.append(f"  {datetime.now().strftime('%H:%M:%S')}", style="#5294e2")
    return Panel(t, style="on #1a1a1a", border_style="#2e2e2e", height=3)

def render_nav() -> Text:
    TABS = [("1","OVERVIEW"),("2","SERVICES"),("3","SETUP"),
            ("4","LOGS"),   ("5","CONFIG"),  ("6","HELP")]
    t = Text("  ")
    for i, (k, name) in enumerate(TABS):
        if S.tab == name.lower():
            t.append(f" {k} {name} ", style="bold #5294e2 on #222222")
        else:
            t.append(f" {k} {name} ", style="#555555 on #1a1a1a")
        t.append("  ")
    return t

def render_footer() -> Text:
    pairs = [("1-6","tabs"),("s","start-all"),("x","stop-all"),
             ("r","restart"),("h","health"),("b","browser"),("q","quit")]
    if S.tab == "setup":
        pairs.append(("a-g","run step"))
    t = Text("  ")
    for k, d in pairs:
        t.append(f" {k} ", style="bold #000000 on #5294e2")
        t.append(f" {d}   ", style="#555555")
    return t

def divider(w: int = 120) -> Text:
    return Text("─" * w, style="#2e2e2e")

# ── overview ──────────────────────────────────────────────
def render_overview(w: int, h: int):
    cpu  = S.cpu_hist[-1] if S.cpu_hist else 0.0
    mem  = psutil.virtual_memory()
    dsk  = psutil.disk_usage(str(BASE_DIR))
    bw   = max(20, w // 2 - 18)
    sw   = max(20, w // 2 - 12)

    # system panel
    sp  = spark(list(S.cpu_hist), width=sw)
    sys_txt = Text()
    sys_txt.append("\n")
    sys_txt.append(f"  CPU  ", style="bold")
    sys_txt.append(bar(cpu, bw), style=bcol(cpu))
    sys_txt.append(f"  {cpu:5.1f}%\n", style=bcol(cpu))
    sys_txt.append(f"       {sp}\n", style="#555555")
    sys_txt.append("\n")
    sys_txt.append(f"  MEM  ", style="bold")
    sys_txt.append(bar(mem.percent, bw), style=bcol(mem.percent))
    sys_txt.append(f"  {mem.percent:5.1f}%\n", style=bcol(mem.percent))
    sys_txt.append(f"       {fmt_bytes(mem.used)} / {fmt_bytes(mem.total)}\n", style="#555555")
    sys_txt.append("\n")
    sys_txt.append(f"  DSK  ", style="bold")
    sys_txt.append(bar(dsk.percent, bw), style=bcol(dsk.percent))
    sys_txt.append(f"  {dsk.percent:5.1f}%\n", style=bcol(dsk.percent))
    sys_txt.append(f"       {fmt_bytes(dsk.used)} / {fmt_bytes(dsk.total)}\n", style="#555555")
    sys_txt.append("\n")
    sys_txt.append("  NET  ", style="bold")
    sys_txt.append("RX ", style="cyan")
    sys_txt.append(f"{fmt_spd(S.net_rx):<16}")
    sys_txt.append("TX ", style="cyan")
    sys_txt.append(fmt_spd(S.net_tx))
    sys_panel = Panel(sys_txt, title="[#5294e2]SYSTEM RESOURCES[/]",
                      border_style="#2e2e2e", style="on #1a1a1a")

    # services panel
    svc_txt = Text("\n")
    for sid, cfg in SERVICES.items():
        up  = svc_alive(sid)
        pid = svc_pid(sid)
        cs, ms = proc_stats(pid)
        svc_txt.append("  [+] " if up else "  [-] ",
                        style="#23c18b bold" if up else "#e55561 bold")
        svc_txt.append(f"{cfg['name']}\n", style="bold #c8c8c8")
        svc_txt.append(f"  status  ", style="#555555")
        svc_txt.append("RUNNING\n" if up else "STOPPED\n",
                        style="#23c18b" if up else "#e55561")
        svc_txt.append(f"  port    {cfg['port']}   pid  {pid or '----'}\n", style="#555555")
        svc_txt.append(f"  uptime  {svc_uptime(sid)}   cpu  {cs:.1f}%   mem  {fmt_bytes(ms)}\n",
                       style="#555555")
        svc_txt.append("\n")
    svc_panel = Panel(svc_txt, title="[#5294e2]SERVICES[/]",
                      border_style="#2e2e2e", style="on #1a1a1a")

    # env bar
    si   = S._si
    e1   = "[#23c18b]OK[/]"       if ENV_FILE.exists()  else "[#e55561]MISSING[/]"
    e2   = "[#23c18b]OK[/]"       if ENV_LOCAL.exists() else "[#e55561]MISSING[/]"
    t1   = read_env(ENV_FILE).get("APD_SERVICE_TOKEN", "")
    t2   = read_env(ENV_LOCAL).get("APD_SERVICE_TOKEN", "")
    sync = "[#23c18b]SYNCED[/]"   if (t1 and t1 == t2)  else "[#ffcc55]MISMATCH[/]"
    db_s = (f"[dim]{DB_FILE.stat().st_size // 1024} KB[/dim]"
            if DB_FILE.exists() else "[#e55561]not found[/]")
    env_txt = (
        f"\n"
        f"  [dim]Python[/dim] {si.get('python','?')}   "
        f"[dim]Node[/dim] {si.get('node','?')}   "
        f"[dim]npm[/dim] {si.get('npm','?')}   "
        f"[dim]GPU[/dim] {si.get('gpu','N/A')}   "
        f"[dim]CUDA[/dim] {si.get('cuda','N/A')}\n"
        f"  .env {e1}   .env.local {e2}   token {sync}   db {db_s}"
    )
    env_panel = Panel(env_txt, title="[#5294e2]ENVIRONMENT[/]",
                      border_style="#2e2e2e", style="on #1a1a1a")

    top = Columns([sys_panel, svc_panel], equal=True, expand=True)
    return Group(top, env_panel)

# ── services ──────────────────────────────────────────────
def render_services(w: int, h: int):
    # control table
    ctl = Table(show_header=True, header_style="bold #5294e2",
                style="on #1a1a1a", show_edge=True, border_style="#2e2e2e",
                padding=(0, 1))
    for col in ("Service", "Port", "Status", "PID", "Uptime", "CPU%", "MEM RSS"):
        ctl.add_column(col)
    for sid, cfg in SERVICES.items():
        up  = svc_alive(sid)
        pid = svc_pid(sid)
        cs, ms = proc_stats(pid)
        ctl.add_row(
            cfg["name"], str(cfg["port"]),
            "[#23c18b]RUNNING[/]" if up else "[#e55561]STOPPED[/]",
            str(pid) if pid else "----",
            svc_uptime(sid),
            f"{cs:.1f}%" if up else "---",
            fmt_bytes(ms) if up else "---",
        )

    # port scanner
    pts = Table(show_header=True, header_style="bold #5294e2",
                style="on #1a1a1a", show_edge=True, border_style="#2e2e2e",
                padding=(0, 1))
    for col in ("Service", "Port", "State", "PID"):
        pts.add_column(col)
    for label, port in [("Next.js", 3000), ("YOLO WebSocket", 8765),
                         ("MQTT local", 1883), ("MQTT cloud TLS", 8883)]:
        op  = port_open(port)
        pid_ = pid_for(port)
        pts.add_row(label, str(port),
                    "[#23c18b]OPEN[/]" if op else "[#e55561]CLOSED[/]",
                    str(pid_) if pid_ else "---")

    hint = Text(
        "  s start-all   x stop-all   r restart-all   "
        "(individual: not yet implemented — use s/x globally)",
        style="#555555"
    )
    return Group(
        Panel(ctl,  title="[#5294e2]SERVICE RESOURCE USAGE[/]",  border_style="#2e2e2e"),
        Panel(pts,  title="[#5294e2]PORT SCANNER[/]",            border_style="#2e2e2e"),
        hint,
    )

# ── setup ─────────────────────────────────────────────────
def render_setup(w: int, h: int):
    icons = {"idle": ("[dim][ ][/dim]", "#555555"),
             "run":  ("[#ffcc55][~][/]", "#ffcc55"),
             "done": ("[#23c18b][+][/]", "#23c18b"),
             "error":("[#e55561][!][/]", "#e55561")}

    tbl = Table(show_header=False, style="on #1a1a1a",
                show_edge=False, padding=(0, 1))
    tbl.add_column("Key",   style="#5294e2", width=5)
    tbl.add_column("State", width=5)
    tbl.add_column("Title", style="#c8c8c8")

    for key, title, _, _ in STEPS:
        st    = S.step_states.get(key, "idle")
        icon, _ = icons.get(st, icons["idle"])
        tbl.add_row(f"[{key.upper()}]", icon, title)

    steps_panel = Panel(
        tbl,
        title="[#5294e2]SETUP WIZARD[/]  [dim](press A-G to run step)[/dim]",
        border_style="#2e2e2e", style="on #1a1a1a",
    )

    out_lines = list(S.setup_out)[-(max(4, h - 18)):]
    out_txt   = "\n".join(out_lines) if out_lines else "[dim]  Press A-G to run a setup step...[/dim]"
    out_panel = Panel(
        out_txt,
        title="[#5294e2]OUTPUT[/]",
        border_style="#2e2e2e", style="on #111111",
        height=max(6, h - 16),
    )
    return Group(steps_panel, out_panel)

# ── logs ──────────────────────────────────────────────────
def render_logs(w: int, h: int):
    half = max(5, (h - 8) // 2)

    if LOG_FILE.exists():
        raw   = LOG_FILE.read_text(encoding="utf-8", errors="replace").splitlines()[-half:]
        lines = []
        for l in raw:
            if "ERROR" in l:
                lines.append(f"[#e55561]{l}[/]")
            elif "WARN" in l:
                lines.append(f"[#ffcc55]{l}[/]")
            else:
                lines.append(f"[dim]{l}[/dim]")
        file_txt = "\n".join(lines)
    else:
        file_txt = "[dim]  apd_detection.log not found — start the Python backend first.[/dim]"

    rt_lines = list(S.log)[-half:]
    rt_txt   = "\n".join(rt_lines) if rt_lines else "[dim]  No runtime events yet.[/dim]"

    return Group(
        Panel(file_txt, title=f"[#5294e2]apd_detection.log[/]  [dim](last {half} lines, refresh 4s)[/dim]",
              border_style="#2e2e2e", style="on #111111"),
        Panel(rt_txt,   title="[#5294e2]RUNTIME LOG[/]  [dim](services started from TUI)[/dim]",
              border_style="#2e2e2e", style="on #111111"),
    )

# ── config ────────────────────────────────────────────────
def render_config(w: int, h: int):
    env  = read_env(ENV_FILE)
    envl = read_env(ENV_LOCAL)

    def make_table(data: dict) -> Table:
        t = Table(show_header=True, header_style="bold #5294e2",
                  style="on #1a1a1a", show_edge=True, border_style="#2e2e2e",
                  padding=(0, 1))
        t.add_column("Key",    style="#8ab4f8")
        t.add_column("Value",  style="#c8c8c8")
        t.add_column("Secret", style="#555555", width=7)
        for k, v in data.items():
            val = mask(v) if is_secret(k) else (v or "[dim]<empty>[/dim]")
            sec = "[#ffcc55]yes[/]" if is_secret(k) else "[dim]no[/dim]"
            t.add_row(k, val, sec)
        return t

    t1v = env.get("APD_SERVICE_TOKEN", "")
    t2v = envl.get("APD_SERVICE_TOKEN", "")
    if not ENV_FILE.exists():
        banner = Panel("[#e55561]  .env not found — copy from .env.example[/]",
                       border_style="#e55561", style="on #1a0e0e", height=3)
    elif not ENV_LOCAL.exists():
        banner = Panel("[#ffcc55]  .env.local not found — Setup tab → step C (npm run setup:env)[/]",
                       border_style="#ffcc55", style="on #1a170e", height=3)
    elif t1v and t2v and t1v == t2v:
        banner = Panel("[#23c18b]  [+] APD_SERVICE_TOKEN in sync between .env and .env.local[/]",
                       border_style="#23c18b", style="on #0e1a13", height=3)
    else:
        banner = Panel("[#ffcc55]  [!] APD_SERVICE_TOKEN MISMATCH — Setup tab → step F (Sync Token)[/]",
                       border_style="#ffcc55", style="on #1a170e", height=3)

    return Group(
        banner,
        Panel(make_table(env),  title="[#5294e2].env  (Python backend root)[/]",  border_style="#2e2e2e"),
        Panel(make_table(envl), title="[#5294e2].env.local  (web-dashboard)[/]",   border_style="#2e2e2e"),
    )

# ── help ──────────────────────────────────────────────────
HELP_TXT = """\

  NAVIGATION
  ─────────────────────────────────────────────────────
  [dim]1-6[/dim]    switch tabs  (OVERVIEW / SERVICES / SETUP / LOGS / CONFIG / HELP)
  [dim]s[/dim]     start all services
  [dim]x[/dim]     stop all services
  [dim]r[/dim]     restart all services
  [dim]h[/dim]     health check  (GET /api/health on port 3000)
  [dim]b[/dim]     open browser  (http://localhost:3000)
  [dim]q[/dim]     quit
  [dim]a-g[/dim]   run setup step  (only works while SETUP tab is active)


  STARTUP ORDER  (penting!)
  ─────────────────────────────────────────────────────
  1.  Start Next.js first — tunggu port 3000 OPEN di tab SERVICES
  2.  Lalu start Python backend (fetch node list dari Next.js saat boot)
  3.  Opsional: jalankan Cloudflare Tunnel untuk akses remote


  SETUP WIZARD  (tab 3)
  ─────────────────────────────────────────────────────
  A  Cek Python >= 3.10 & Node.js >= 18
  B  npm install
  C  npm run setup:env  →  buat .env.local + token random
  D  npx prisma migrate deploy
  E  npm run seed  →  buat akun admin default (catat passwordnya!)
  F  Sync APD_SERVICE_TOKEN dari .env.local ke root .env
  G  pip install -r requirements.txt


  TROUBLESHOOTING
  ─────────────────────────────────────────────────────
  Login 400           Hapus .next/ lalu restart Next.js
  Backend 401         APD_SERVICE_TOKEN mismatch → Setup step F
  Live monitor blank  Python backend tidak running / port 8765 CLOSED
  RTSP timeout        Device harus satu LAN dengan server
  WhatsApp gagal      Cek VPS, WA_DEVICE_ID, WA_API_URL di .env
"""

def render_help(w: int, h: int):
    return Panel(HELP_TXT, title="[#5294e2]HELP[/]", border_style="#2e2e2e", style="on #111111")

# ══════════════════════════════════════════════════════════
#  LAYOUT ASSEMBLY
# ══════════════════════════════════════════════════════════
CONTENT_FNS = {
    "overview": render_overview,
    "services": render_services,
    "setup":    render_setup,
    "logs":     render_logs,
    "config":   render_config,
    "help":     render_help,
}

def make_screen() -> Layout:
    console_h = console.size.height
    console_w = console.size.width

    tick_metrics()

    fn      = CONTENT_FNS.get(S.tab, render_overview)
    content = fn(console_w, console_h - 6)

    layout = Layout()
    layout.split_column(
        Layout(name="header",  size=3),
        Layout(name="nav",     size=1),
        Layout(name="div1",    size=1),
        Layout(name="body"),
        Layout(name="div2",    size=1),
        Layout(name="footer",  size=1),
    )
    layout["header"].update(render_header())
    layout["nav"].update(render_nav())
    layout["div1"].update(divider(console_w))
    layout["body"].update(content)
    layout["div2"].update(divider(console_w))
    layout["footer"].update(render_footer())
    return layout

# ══════════════════════════════════════════════════════════
#  SETUP STEP RUNNER
# ══════════════════════════════════════════════════════════
def _run_step(key: str):
    step = next((s for s in STEPS if s[0] == key), None)
    if not step:
        return
    _, title, cmd, special = step

    S.step_states[key] = "run"
    S.setup_out.append(f"\n  ──── {title} ────")

    if special == "version_check":
        ok  = True
        pv  = platform.python_version()
        p_ok = tuple(int(x) for x in pv.split(".")[:2]) >= (3, 10)
        S.setup_out.append(f"  Python {pv}  {'OK' if p_ok else 'requires >=3.10'}")
        ok = ok and p_ok
        nv = S._si.get("node", "?").lstrip("v")
        if nv and nv != "?":
            try:
                n_ok = int(nv.split(".")[0]) >= 18
                S.setup_out.append(f"  Node.js {nv}  {'OK' if n_ok else 'requires >=18'}")
                ok = ok and n_ok
            except Exception:
                pass
        else:
            S.setup_out.append("  Node.js  NOT FOUND")
            ok = False
        S.step_states[key] = "done" if ok else "error"
        return

    if special == "sync_token":
        try:
            envl  = read_env(ENV_LOCAL)
            token = envl.get("APD_SERVICE_TOKEN", "")
            if not token:
                S.setup_out.append("  APD_SERVICE_TOKEN tidak ada di .env.local — jalankan step C dulu")
                S.step_states[key] = "error"
                return
            content = ENV_FILE.read_text(encoding="utf-8") if ENV_FILE.exists() else ""
            if "APD_SERVICE_TOKEN=" in content:
                lines = [
                    f"APD_SERVICE_TOKEN={token}"
                    if l.startswith("APD_SERVICE_TOKEN=") else l
                    for l in content.splitlines()
                ]
                ENV_FILE.write_text("\n".join(lines), encoding="utf-8")
            else:
                with open(ENV_FILE, "a", encoding="utf-8") as f:
                    f.write(f"\nAPD_SERVICE_TOKEN={token}\n")
            S.setup_out.append(f"  token synced  ({mask(token)})")
            S.step_states[key] = "done"
        except Exception as e:
            S.setup_out.append(f"  error: {e}")
            S.step_states[key] = "error"
        return

    if not cmd:
        S.step_states[key] = "done"
        return

    cwd = str(DASHBOARD_DIR) if any(x in cmd for x in ("npm", "npx")) else str(BASE_DIR)
    try:
        proc = subprocess.Popen(
            cmd, cwd=cwd,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
            shell=(platform.system() == "Windows"),
        )
        for line in proc.stdout:
            S.setup_out.append(f"  {line.rstrip()}")
        proc.wait()
        ok = proc.returncode == 0
        S.setup_out.append(f"  exit {proc.returncode}  {'success' if ok else 'FAILED'}")
        S.step_states[key] = "done" if ok else "error"
    except Exception as e:
        S.setup_out.append(f"  exception: {e}")
        S.step_states[key] = "error"

# ══════════════════════════════════════════════════════════
#  KEYBOARD HANDLER
# ══════════════════════════════════════════════════════════
_TAB_MAP: dict[bytes, str] = {
    b"1": "overview", b"2": "services", b"3": "setup",
    b"4": "logs",     b"5": "config",   b"6": "help",
}

def handle_key(raw: bytes):
    k = raw.lower()
    if k in (b"q", b"\x03"):
        S.running = False
    elif k in _TAB_MAP:
        S.tab = _TAB_MAP[k]
    elif k == b"s":
        for sid in SERVICES:
            svc_start(sid)
    elif k == b"x":
        for sid in SERVICES:
            svc_stop(sid)
    elif k == b"r":
        for sid in SERVICES:
            svc_stop(sid)
        time.sleep(0.3)
        for sid in SERVICES:
            svc_start(sid)
    elif k == b"h":
        try:
            import urllib.request
            with urllib.request.urlopen("http://127.0.0.1:3000/api/health", timeout=3) as r:
                S.emit(f"[#23c18b]health OK[/] — {r.read().decode()[:60]}")
        except Exception as e:
            S.emit(f"[#e55561]health FAIL[/] — {e}")
    elif k == b"b":
        import webbrowser
        webbrowser.open("http://localhost:3000")
    elif S.tab == "setup" and k in b"abcdefg":
        key_char = k.decode()
        if S.step_states.get(key_char) != "run":
            threading.Thread(target=_run_step, args=(key_char,), daemon=True).start()

def keyboard_loop():
    while S.running:
        try:
            if msvcrt.kbhit():
                handle_key(msvcrt.getch())
        except Exception:
            pass
        time.sleep(0.05)

# ══════════════════════════════════════════════════════════
#  SYSINFO PRELOAD (background)
# ══════════════════════════════════════════════════════════
def _load_sysinfo():
    d: dict = {
        "python": platform.python_version(),
        "node":   "?", "npm": "?",
        "gpu":    "N/A", "cuda": "N/A",
    }
    for exe in ("node", "node.exe"):
        p = shutil.which(exe)
        if p:
            try:
                r = subprocess.run([p, "--version"], capture_output=True, text=True, timeout=4)
                d["node"] = r.stdout.strip()
            except Exception:
                pass
            break
    for exe in ("npm", "npm.cmd"):
        p = shutil.which(exe)
        if p:
            try:
                r = subprocess.run([p, "--version"], capture_output=True, text=True, timeout=4)
                d["npm"] = r.stdout.strip()
            except Exception:
                pass
            break
    try:
        import torch
        d["gpu"]  = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU only"
        d["cuda"] = torch.version.cuda if torch.cuda.is_available() else "N/A"
    except ImportError:
        d["gpu"] = "PyTorch not found"
    S._si = d

# ══════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════
console = Console(markup=True, highlight=False)

def main():
    # prime psutil
    psutil.cpu_percent(interval=None)
    try:
        S._net0 = psutil.net_io_counters()
        S._net_t = time.time()
    except Exception:
        pass

    # background sysinfo
    threading.Thread(target=_load_sysinfo, daemon=True).start()

    # keyboard thread
    threading.Thread(target=keyboard_loop, daemon=True).start()

    S.emit("SafeGuard APD TUI ready  |  1-6 tabs  |  s start-all  |  q quit")

    try:
        with Live(
            make_screen(),
            console=console,
            refresh_per_second=4,
            screen=True,
        ) as live:
            while S.running:
                try:
                    live.update(make_screen(), refresh=True)
                except Exception:
                    pass
                time.sleep(0.25)
    except KeyboardInterrupt:
        pass

    console.clear()
    console.print("\n  [#5294e2]SafeGuard APD TUI — bye.[/]\n")


if __name__ == "__main__":
    main()
