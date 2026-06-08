"""
SafeGuard APD — TUI Manager v4
================================
Pure Rich + msvcrt terminal UI.  No Textual.
Terminus-dark palette, htop-style, ASCII-only indicators.

Keys : 1-6 tabs | s start-all | x stop-all | r restart-all
       h health-check | b browser | w wizard | c config | q quit
       (in SETUP tab: a-i to run setup steps)
"""

from __future__ import annotations

import base64
import getpass
import msvcrt
import os
import platform
import secrets
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
from rich.rule import Rule
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

def _find_cloudflared() -> str | None:
    """Find cloudflared binary. Checks PATH first, then common MSI install paths."""
    found = shutil.which("cloudflared")
    if found:
        return found
    # MSI installer puts it here but doesn't always add to PATH
    for p in [
        r"C:\Program Files (x86)\cloudflared\cloudflared.exe",
        r"C:\Program Files\cloudflared\cloudflared.exe",
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "cloudflared", "cloudflared.exe"),
    ]:
        if os.path.isfile(p):
            return p
    return None

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
    ("h", "Cloudflare Token Tunnel (dari CF Dashboard)",    None,                                                      "cf_full"),
    ("i", "Cloudflare Quick Tunnel (tanpa domain)",         None,                                                      "cf_quick"),
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
    _preflight  : list  = []          # cached preflight results
    _preflight_t: float = 0.0         # last preflight check time
    _start_blocked: bool = False      # True if last start was blocked
    cf_tunnel_proc = None             # Cloudflare tunnel subprocess
    cf_tunnel_url  = ""               # Quick tunnel public URL
    config_request = False            # flag to enter config editor
    cf_setup_request = False          # flag to enter CF tunnel setup

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
#  PREFLIGHT CHECK
# ══════════════════════════════════════════════════════════

def preflight_check(force: bool = False) -> list[dict]:
    """Check all env vars and config readiness. Returns list of check items.
    Each item: {name, status ('ok'|'empty'|'missing'|'mismatch'), severity ('critical'|'optional'), value}
    Results cached for 10s to avoid hammering disk.
    """
    now = time.time()
    if not force and S._preflight and (now - S._preflight_t) < 10:
        return S._preflight

    checks: list[dict] = []
    env  = read_env(ENV_FILE)  if ENV_FILE.exists()  else {}
    envl = read_env(ENV_LOCAL) if ENV_LOCAL.exists() else {}

    # File existence
    checks.append({"name": ".env file",     "status": "ok" if ENV_FILE.exists()  else "missing", "severity": "critical", "value": ""})
    checks.append({"name": ".env.local",    "status": "ok" if ENV_LOCAL.exists() else "missing", "severity": "critical", "value": ""})

    # Token sync
    t1 = env.get("APD_SERVICE_TOKEN", "")
    t2 = envl.get("APD_SERVICE_TOKEN", "")
    if t1 and t2 and t1 == t2:
        checks.append({"name": "APD_SERVICE_TOKEN sync", "status": "ok", "severity": "critical", "value": mask(t1)})
    elif t1 or t2:
        checks.append({"name": "APD_SERVICE_TOKEN sync", "status": "mismatch", "severity": "critical", "value": "root != local"})
    else:
        checks.append({"name": "APD_SERVICE_TOKEN sync", "status": "empty", "severity": "critical", "value": ""})

    # Critical env vars
    for key in ["AES_KEY", "MQTT_HOSTNAME", "MQTT_USERNAME", "MQTT_PASSWORD"]:
        v = env.get(key, "")
        st = "ok" if v else "empty"
        checks.append({"name": key, "status": st, "severity": "critical", "value": mask(v) if v and is_secret(key) else (v[:30] if v else "")})

    # Optional env vars
    for key in ["WA_API_URL", "WA_API_USER", "WA_API_PASS", "WA_DEVICE_ID"]:
        v = env.get(key, "")
        st = "ok" if v else "empty"
        checks.append({"name": key, "status": st, "severity": "optional", "value": v[:30] if v else ""})

    # Database
    if DB_FILE.exists():
        checks.append({"name": "Database (safeguard.db)", "status": "ok", "severity": "critical", "value": f"{DB_FILE.stat().st_size // 1024} KB"})
    else:
        checks.append({"name": "Database (safeguard.db)", "status": "missing", "severity": "critical", "value": "run prisma migrate"})

    # Cloudflare tunnel
    cf_installed = bool(_find_cloudflared())
    cf_status = "ok" if S.cf_tunnel_proc and S.cf_tunnel_proc.poll() is None else ("empty" if cf_installed else "missing")
    cf_val = S.cf_tunnel_url if S.cf_tunnel_url else ("installed" if cf_installed else "not installed")
    checks.append({"name": "Cloudflare Tunnel", "status": cf_status, "severity": "optional", "value": cf_val})

    S._preflight = checks
    S._preflight_t = now
    return checks


def preflight_critical_issues() -> list[str]:
    """Return names of critical items that are not ok."""
    return [c["name"] for c in preflight_check() if c["severity"] == "critical" and c["status"] != "ok"]


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


def svc_start_all_guarded():
    """Start all services with pre-flight guard. Block if critical issues found."""
    issues = preflight_critical_issues()
    if issues and not S._start_blocked:
        S._start_blocked = True
        S.emit(f"[#e55561]BLOCKED[/] — {len(issues)} critical config issues: {', '.join(issues)}")
        S.emit(f"[#ffcc55]Press [c] to configure, or [s] again to force start anyway.[/]")
        return
    # Second press or no issues → start
    S._start_blocked = False
    if issues:
        S.emit(f"[#ffcc55]WARN[/] — force starting with {len(issues)} unresolved issues")
    for sid in SERVICES:
        svc_start(sid)
    # Also start CF tunnel if token configured
    _cf_auto_start()

def _cf_auto_start():
    """Start CF tunnel if token is set and tunnel not already running."""
    if S.cf_tunnel_proc and S.cf_tunnel_proc.poll() is None:
        return  # already running
    env = read_env(ENV_FILE) if ENV_FILE.exists() else {}
    token = env.get("CF_TUNNEL_TOKEN", "").strip()
    if not token:
        return  # no token, skip
    cf_bin = _find_cloudflared()
    if not cf_bin:
        return  # not installed, skip
    try:
        proc = subprocess.Popen(
            [cf_bin, "tunnel", "run", "--token", token],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if platform.system() == "Windows" else 0,
        )
        S.cf_tunnel_proc = proc
        S.cf_tunnel_url = "CF Token Tunnel (connecting...)"
        S.step_states["h"] = "done"
        S.emit("[#23c18b]CF Tunnel started[/] (background)")
    except Exception as e:
        S.emit(f"[#e55561]CF Tunnel error: {e}[/]")

def _cf_stop():
    """Stop CF tunnel if running."""
    if S.cf_tunnel_proc and S.cf_tunnel_proc.poll() is None:
        try:
            if platform.system() == "Windows":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(S.cf_tunnel_proc.pid)], capture_output=True)
            else:
                S.cf_tunnel_proc.terminate()
                S.cf_tunnel_proc.wait(timeout=5)
        except Exception:
            pass
        S.cf_tunnel_proc = None
        S.cf_tunnel_url = ""
        S.step_states["h"] = "idle"
        S.emit("stopped — CF Tunnel")

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
    pairs = [("1-6","tabs"),("s","start"),("x","stop"),
             ("r","restart"),("h","health"),("b","browser"),("w","wizard"),("c","config"),("q","quit")]
    if S.tab == "setup":
        pairs.insert(-1, ("a-i","run step"))
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

    # readiness check panel
    checks = preflight_check()
    rdy_txt = Text("\n")
    crit_issues = 0
    for c in checks:
        st = c["status"]
        if st == "ok":
            icon, color = "[+]", "#23c18b"
        elif st in ("empty", "missing", "mismatch"):
            if c["severity"] == "critical":
                icon, color = "[!]", "#e55561"
                crit_issues += 1
            else:
                icon, color = "[-]", "#ffcc55"
        else:
            icon, color = "[?]", "#555555"
        rdy_txt.append(f"  ", style="")
        rdy_txt.append(f"{icon}", style=f"bold {color}")
        rdy_txt.append(f"  {c['name']:<28}", style="#c8c8c8")
        label = st.upper() if st != "ok" else "OK"
        rdy_txt.append(f"{label:<10}", style=color)
        if c["value"]:
            rdy_txt.append(f"{c['value']}", style="#555555")
        rdy_txt.append("\n")
    rdy_txt.append("\n")
    if crit_issues > 0:
        rdy_txt.append(f"  {crit_issues} critical issues — press [c] to configure\n", style="bold #e55561")
    else:
        rdy_txt.append(f"  All critical items OK — ready to start\n", style="#23c18b")
    rdy_border = "#e55561" if crit_issues > 0 else "#23c18b"
    rdy_panel = Panel(rdy_txt, title="[#5294e2]READINESS CHECK[/]",
                      border_style=rdy_border, style="on #1a1a1a")

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

    # ── Connection Status panel ──
    conn_txt = Text("\n")

    # CF Tunnel
    cf_up = S.cf_tunnel_proc and S.cf_tunnel_proc.poll() is None
    cf_icon = "[+]" if cf_up else "[-]"
    cf_color = "#23c18b" if cf_up else "#555555"
    conn_txt.append(f"  ", style="")
    conn_txt.append(cf_icon, style=f"bold {cf_color}")
    conn_txt.append(f"  {'CF Tunnel':<20}", style="#c8c8c8")
    conn_txt.append("CONNECTED" if cf_up else "OFF", style=cf_color)
    if cf_up and S.cf_tunnel_url:
        conn_txt.append(f"   {S.cf_tunnel_url[:40]}", style="#555555")
    elif not cf_up:
        cf_bin = _find_cloudflared()
        env = read_env(ENV_FILE) if ENV_FILE.exists() else {}
        tok = env.get("CF_TUNNEL_TOKEN", "")
        if not cf_bin:
            conn_txt.append("   not installed", style="#e55561")
        elif not tok:
            conn_txt.append("   no token — press [H] in SETUP", style="#ffcc55")
        else:
            conn_txt.append("   ready — press [s] to start", style="#ffcc55")
    conn_txt.append("\n")

    # WhatsApp GoWA
    env = read_env(ENV_FILE) if ENV_FILE.exists() else {}
    wa_url = env.get("WA_API_URL", "")
    wa_dev = env.get("WA_DEVICE_ID", "")
    wa_configured = bool(wa_url and wa_dev)
    wa_icon = "[+]" if wa_configured else "[-]"
    wa_color = "#23c18b" if wa_configured else "#ffcc55"
    conn_txt.append(f"  ", style="")
    conn_txt.append(wa_icon, style=f"bold {wa_color}")
    conn_txt.append(f"  {'WhatsApp GoWA':<20}", style="#c8c8c8")
    if wa_configured:
        conn_txt.append("CONFIGURED", style=wa_color)
        conn_txt.append(f"   {wa_url[:30]}  dev={wa_dev[:12]}", style="#555555")
    else:
        conn_txt.append("NOT SET", style=wa_color)
        conn_txt.append("   press [c] to configure", style="#555555")
    conn_txt.append("\n")

    # MQTT Broker
    mqtt_host = env.get("MQTT_HOSTNAME", "")
    mqtt_configured = bool(mqtt_host and env.get("MQTT_USERNAME", ""))
    mq_icon = "[+]" if mqtt_configured else "[!]"
    mq_color = "#23c18b" if mqtt_configured else "#e55561"
    conn_txt.append(f"  ", style="")
    conn_txt.append(mq_icon, style=f"bold {mq_color}")
    conn_txt.append(f"  {'MQTT Broker':<20}", style="#c8c8c8")
    if mqtt_configured:
        conn_txt.append("CONFIGURED", style=mq_color)
        conn_txt.append(f"   {mqtt_host[:40]}", style="#555555")
    else:
        conn_txt.append("NOT SET", style=mq_color)
    conn_txt.append("\n")

    conn_txt.append("\n")
    # Legend
    conn_txt.append("  ", style="")
    conn_txt.append("[+]", style="bold #23c18b")
    conn_txt.append(" aktif/configured  ", style="#555555")
    conn_txt.append("[-]", style="bold #ffcc55")
    conn_txt.append(" opsional/off  ", style="#555555")
    conn_txt.append("[!]", style="bold #e55561")
    conn_txt.append(" error/missing\n", style="#555555")

    conn_panel = Panel(conn_txt, title="[#5294e2]CONNECTIONS[/]",
                       border_style="#2e2e2e", style="on #1a1a1a")

    top = Columns([sys_panel, svc_panel], equal=True, expand=True)
    return Group(top, conn_panel, rdy_panel, env_panel)

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
        title="[#5294e2]INDIVIDUAL STEPS[/]  [dim](A-G jalankan step)[/dim]",
        border_style="#2e2e2e", style="on #1a1a1a",
    )

    hint = Panel(
        "  [bold #5294e2]w[/]  [#c8c8c8]Setup Wizard[/]  [dim]— konfigurasi proyek dari awal:[/dim]"
        " install deps, isi MQTT/WA, generate .env, prisma migrate, seed admin\n"
        "  [bold #5294e2]c[/]  [#c8c8c8]Quick Config[/]  [dim]— edit MQTT, AES key, WA di .env tanpa wizard penuh[/dim]\n"
        "  [dim]Tekan [/dim][bold #5294e2]a-i[/][dim] untuk step individual, [/dim]"
        "[bold #5294e2]h[/][dim]=CF full, [/dim][bold #5294e2]i[/][dim]=CF quick tunnel[/dim]",
        border_style="#5294e2", style="on #111a27", height=5,
    )

    out_lines = list(S.setup_out)[-(max(4, h - 22)):]
    out_txt   = "\n".join(out_lines) if out_lines else "[dim]  Tekan A-G untuk menjalankan step individual, atau [bold]w[/bold] untuk full wizard...[/dim]"
    out_panel = Panel(
        out_txt,
        title="[#5294e2]OUTPUT[/]",
        border_style="#2e2e2e", style="on #111111",
        height=max(6, h - 20),
    )
    return Group(hint, steps_panel, out_panel)

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
  [dim]s[/dim]     start all services  (blocks if critical config missing)
  [dim]x[/dim]     stop all services
  [dim]r[/dim]     restart all services
  [dim]h[/dim]     health check  (GET /api/health on port 3000)
  [dim]b[/dim]     open browser  (http://localhost:3000)
  [dim]w[/dim]     full setup wizard  (from-zero project setup)
  [dim]c[/dim]     quick config editor  (edit MQTT, AES, WA in .env)
  [dim]q[/dim]     quit
  [dim]a-i[/dim]   run setup step  (only works while SETUP tab is active)


  STARTUP ORDER  (penting!)
  ─────────────────────────────────────────────────────
  1.  Start Next.js first — tunggu port 3000 OPEN di tab SERVICES
  2.  Lalu start Python backend (fetch node list dari Next.js saat boot)
  3.  Opsional: jalankan Cloudflare Tunnel untuk akses remote


  SETUP STEPS  (tab 3)
  ─────────────────────────────────────────────────────
  A  Cek Python >= 3.10 & Node.js >= 18
  B  npm install
  C  npm run setup:env  →  buat .env.local + token random
  D  npx prisma migrate deploy
  E  npm run seed  →  buat akun admin default (catat passwordnya!)
  F  Sync APD_SERVICE_TOKEN dari .env.local ke root .env
  G  pip install -r requirements.txt
  H  Cloudflare Token Tunnel  (token dari CF Dashboard)
  I  Cloudflare Quick Tunnel  (tanpa domain, demo cepat)


  READINESS CHECK  (overview tab)
  ─────────────────────────────────────────────────────
  Panel hijau  = semua konfigurasi OK, siap start
  Panel merah  = ada konfigurasi kritis yg kosong
  Tekan [c] untuk edit konfigurasi kritis (MQTT, AES, WA)
  Tekan [s] → blocked kalau ada issue → [s] lagi untuk force start


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

    if special == "cf_quick":
        _run_cf_quick_tunnel()
        return

    if special == "cf_full":
        _run_cf_token_tunnel()
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


def _run_cf_quick_tunnel():
    """Start a Cloudflare Quick Tunnel (no domain needed, demo only)."""
    cf_bin = _find_cloudflared()
    if not cf_bin:
        S.setup_out.append("  cloudflared NOT FOUND.")
        S.setup_out.append("  Download: https://github.com/cloudflare/cloudflared/releases")
        S.step_states["i"] = "error"
        return

    # Kill existing tunnel
    if S.cf_tunnel_proc and S.cf_tunnel_proc.poll() is None:
        S.setup_out.append("  Stopping existing tunnel...")
        try:
            S.cf_tunnel_proc.terminate()
            S.cf_tunnel_proc.wait(timeout=5)
        except Exception:
            pass
        S.cf_tunnel_url = ""

    S.step_states["i"] = "run"
    S.setup_out.append("  Starting Cloudflare Quick Tunnel...")
    S.setup_out.append(f"  $ cloudflared tunnel --url http://127.0.0.1:3000")

    try:
        proc = subprocess.Popen(
            [cf_bin, "tunnel", "--url", "http://127.0.0.1:3000"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
        )
        S.cf_tunnel_proc = proc

        # Read output until we find the URL (usually within first 20 lines)
        import re
        url_pattern = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")
        for i, line in enumerate(proc.stdout):
            line = line.strip()
            if line:
                S.setup_out.append(f"  {line[:80]}")
            match = url_pattern.search(line)
            if match:
                S.cf_tunnel_url = match.group(0)
                S.setup_out.append(f"")
                S.setup_out.append(f"  ╔══════════════════════════════════════════════╗")
                S.setup_out.append(f"  ║  PUBLIC URL: {S.cf_tunnel_url:<33}║")
                S.setup_out.append(f"  ╚══════════════════════════════════════════════╝")
                S.setup_out.append(f"")
                S.setup_out.append(f"  Share this URL to access dashboard from anywhere!")
                S.setup_out.append(f"  NOTE: URL changes every restart. For permanent URL,")
                S.setup_out.append(f"        use step [H] (full tunnel with custom domain).")
                S.step_states["i"] = "done"
                # Force preflight refresh
                S._preflight_t = 0
                S.emit(f"[#23c18b]Cloudflare Tunnel UP[/] — {S.cf_tunnel_url}")
                break
            if i > 30:  # timeout
                break

        if not S.cf_tunnel_url:
            S.setup_out.append("  Could not detect tunnel URL. Check output above.")
            S.step_states["i"] = "error"
    except Exception as e:
        S.setup_out.append(f"  Error: {e}")
        S.step_states["i"] = "error"


def _run_cf_token_tunnel():
    """Start Cloudflare Tunnel with token from CF Zero Trust dashboard.
    Token is read from .env (CF_TUNNEL_TOKEN) or prompted in output.
    Runs: cloudflared tunnel run --token <TOKEN>
    """
    cf_bin = _find_cloudflared()
    if not cf_bin:
        S.setup_out.append("  cloudflared NOT FOUND.")
        S.setup_out.append("  Download & install: https://github.com/cloudflare/cloudflared/releases")
        S.setup_out.append("  Pilih file: cloudflared-windows-amd64.msi")
        S.step_states["h"] = "error"
        return

    # Read token from .env
    env = read_env(ENV_FILE) if ENV_FILE.exists() else {}
    token = env.get("CF_TUNNEL_TOKEN", "").strip()

    if not token:
        # Exit Live → interactive CF setup prompt
        S.cf_setup_request = True
        S.running = False
        S.step_states["h"] = "idle"
        return

    # Kill existing tunnel
    if S.cf_tunnel_proc and S.cf_tunnel_proc.poll() is None:
        S.setup_out.append("  Stopping existing tunnel...")
        try:
            S.cf_tunnel_proc.terminate()
            S.cf_tunnel_proc.wait(timeout=5)
        except Exception:
            pass
        S.cf_tunnel_url = ""

    S.step_states["h"] = "run"
    S.setup_out.append("  Starting Cloudflare Token Tunnel...")
    S.setup_out.append(f"  $ cloudflared tunnel run --token <TOKEN>")

    try:
        proc = subprocess.Popen(
            [cf_bin, "tunnel", "run", "--token", token],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
        )
        S.cf_tunnel_proc = proc

        # Read output to confirm tunnel is connected
        import re
        connected = False
        for i, line in enumerate(proc.stdout):
            line = line.strip()
            if line:
                S.setup_out.append(f"  {line[:80]}")
            # cloudflared prints "Registered tunnel connection" when ready
            if "registered" in line.lower() and "connection" in line.lower():
                connected = True
                S.setup_out.append("")
                S.setup_out.append("  ╔══════════════════════════════════════════════╗")
                S.setup_out.append("  ║  TUNNEL CONNECTED!                          ║")
                S.setup_out.append("  ║  Domain dikonfigurasi di CF Dashboard       ║")
                S.setup_out.append("  ╚══════════════════════════════════════════════╝")
                S.setup_out.append("")
                S.setup_out.append("  Tunnel berjalan di background.")
                S.setup_out.append("  Domain/route diatur dari CF Zero Trust dashboard:")
                S.setup_out.append("  → Networks → Tunnels → Public Hostname")
                S.cf_tunnel_url = "CF Token Tunnel (see dashboard)"
                S.step_states["h"] = "done"
                S._preflight_t = 0  # force refresh preflight
                S.emit("[#23c18b]Cloudflare Token Tunnel UP[/] — check dashboard for domain")
                break
            if i > 50:
                break

        if not connected:
            if proc.poll() is not None:
                S.setup_out.append(f"  Process exited with code {proc.returncode}")
                S.step_states["h"] = "error"
            else:
                S.setup_out.append("  Tunnel process started but connection not confirmed yet.")
                S.setup_out.append("  It may still be connecting — check LOGS tab.")
                S.cf_tunnel_url = "CF Token Tunnel (connecting...)"
                S.step_states["h"] = "done"
                S.emit("[#ffcc55]CF Tunnel started[/] — waiting for connection confirmation")
    except Exception as e:
        S.setup_out.append(f"  Error: {e}")
        S.step_states["h"] = "error"


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
    elif k == b"w":
        # exit Live loop → wizard → restart
        S.wizard_request = True
        S.running = False
    elif k in _TAB_MAP:
        S.tab = _TAB_MAP[k]
    elif k == b"s":
        svc_start_all_guarded()
    elif k == b"x":
        for sid in SERVICES:
            svc_stop(sid)
        _cf_stop()
    elif k == b"r":
        for sid in SERVICES:
            svc_stop(sid)
        _cf_stop()
        time.sleep(0.3)
        svc_start_all_guarded()
    elif k == b"c":
        # Exit Live loop → config editor → restart
        S.config_request = True
        S.running = False
    elif S.tab == "setup" and k in b"abcdefghi":
        # SETUP tab: a-i run setup steps (must be checked BEFORE h/b global handlers)
        key_char = k.decode()
        if S.step_states.get(key_char) != "run":
            threading.Thread(target=_run_step, args=(key_char,), daemon=True).start()
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

# ══════════════════════════════════════════════════════════
#  SETUP WIZARD — from-zero project setup
# ══════════════════════════════════════════════════════════

# ── wizard helpers ────────────────────────────────────────
_WIZ_ENV = {**os.environ, "PYTHONIOENCODING": "utf-8",
            "FORCE_COLOR": "0", "NO_COLOR": "1"}

_STEP_LABELS = [
    "Sys Check", "Dependencies", "YOLO Model",
    "Network",   "WhatsApp",    "Init DB",  "Verify"
]

def _wiz_banner(step: int, total: int, title: str) -> None:
    done  = step - 1
    bar_w = 36
    filled = int(done / total * bar_w)
    pbar  = "[#5294e2]" + "━" * filled + "[/][dim]" + "╌" * (bar_w - filled) + "[/dim]"
    labels_txt = "  ".join(
        f"[bold #5294e2]{l}[/]" if i+1 == step else f"[dim]{l}[/dim]"
        for i, l in enumerate(_STEP_LABELS)
    )
    console.print()
    console.print(Rule(style="#2e2e2e"))
    console.print(f"  {pbar}  [dim]step {step}/{total}[/dim]")
    console.print(f"  [bold #c8c8c8]{title.upper()}[/]")
    console.print(f"  [dim]{labels_txt}[/dim]")
    console.print(Rule(style="#2e2e2e"))

def _ok(msg: str)   -> None: console.print(f"  [#23c18b] OK [/]  {msg}")
def _err(msg: str)  -> None: console.print(f"  [#e55561]FAIL[/]  {msg}")
def _inf(msg: str)  -> None: console.print(f"  [#555555]  —  [/]  {msg}")
def _warn(msg: str) -> None: console.print(f"  [#ffcc55]WARN[/]  {msg}")

def _field(label: str, value: str = "", note: str = "") -> None:
    """Print a labelled input field header."""
    t = Text(f"  {label}", style="bold #8ab4f8")
    if value:
        t.append(f"  (default: {value})", style="dim")
    if note:
        t.append(f"  — {note}", style="#555555")
    console.print(t)

def _ask(label: str, default: str = "", secret: bool = False) -> str:
    _field(label, default)
    try:
        val = getpass.getpass("  > ") if secret else input("  > ").strip()
    except (EOFError, KeyboardInterrupt):
        val = ""
    result = val.strip() or default
    if result and not secret:
        console.print(f"  [dim]└ {result}[/dim]")
    return result

def _ask_yn(label: str, default: bool = False) -> bool:
    tag = "[Y/n]" if default else "[y/N]"
    console.print(f"  [bold #8ab4f8]{label}[/bold #8ab4f8] [dim]{tag}[/dim]")
    try:
        ans = input("  > ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        ans = ""
    return (ans in ("y", "ya", "yes")) if ans else default

# line filter for noisy tool output
_SKIP_PREFIXES = (
    "Requirement already satisfied",
    "already up to date",
    "A new release of pip",
    "To update, run:",
    "  └",
)

def _run_wiz_cmd(cmd: list, cwd: str, label: str) -> bool:
    display = " ".join(str(c) for c in cmd)
    console.print(f"\n  [dim]$ {display}[/dim]")
    buf: list[str] = []
    ok  = True
    try:
        proc = subprocess.Popen(
            cmd, cwd=cwd,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
            encoding="utf-8", errors="replace",
            shell=(platform.system() == "Windows"),
            env=_WIZ_ENV,
        )
        spin = r"|/-\\"
        idx  = 0
        for raw in proc.stdout:
            line = raw.rstrip()
            buf.append(line)
            # live spinner (overwrites same line, no scroll)
            sys.stdout.write(f"\r  [{spin[idx % 4]}] {line[:70]:<70}")
            sys.stdout.flush()
            idx += 1
        proc.wait()
        ok = proc.returncode == 0
    except Exception as e:
        _err(f"exception: {e}")
        return False

    # clear spinner line
    sys.stdout.write("\r" + " " * 78 + "\r")
    sys.stdout.flush()

    # print only interesting output (filter noise)
    shown = [l for l in buf if l.strip() and not any(l.startswith(p) for p in _SKIP_PREFIXES)]
    for l in shown[-12:]:
        console.print(f"  [dim]{l}[/dim]")

    if ok:
        _ok(label)
    else:
        _err(f"{label}  (exit {proc.returncode})")
    return ok

def _gen_env_files(cfg: dict) -> tuple[str, str, str]:
    """Generate .env and .env.local, return (token, enc_key, jwt_secret)."""
    token      = secrets.token_hex(32)
    enc_key    = base64.b64encode(secrets.token_bytes(32)).decode()
    jwt_secret = secrets.token_hex(32)
    na_secret  = secrets.token_hex(32)
    now_str    = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    env_root = f"""# SafeGuard APD — Backend Configuration
# Generated by TUI Setup Wizard  {now_str}

# Database (SQLite, relative to project root)
DATABASE_URL="file:./web-dashboard/data/safeguard.db"

# Auth
JWT_SECRET={jwt_secret}
NEXTAUTH_URL={cfg.get('app_url', 'http://localhost:3000')}

# Service token — MUST match .env.local
APD_SERVICE_TOKEN={token}
APD_ENCRYPTION_KEY={enc_key}

# YOLO model
YOLO_MODEL_PATH={cfg.get('model_path', './best.pt')}

# Node detection endpoint (where Next.js runs)
NODE_DETECTION_URL={cfg.get('app_url', 'http://localhost:3000')}

# MQTT broker (HiveMQ Cloud / TLS)
MQTT_HOSTNAME={cfg.get('mqtt_host', '')}
MQTT_PORT={cfg.get('mqtt_tls', '8883')}
MQTT_USERNAME={cfg.get('mqtt_user', '')}
MQTT_PASSWORD={cfg.get('mqtt_pass', '')}

# AES-128-CBC Encryption
AES_KEY={cfg.get('aes_key', secrets.token_hex(16))}

# WhatsApp / GoWA (optional)
WA_API_URL={cfg.get('wa_url', '')}
WA_API_USER={cfg.get('wa_user', 'admin')}
WA_API_PASS={cfg.get('wa_pass', '')}
WA_DEVICE_ID={cfg.get('wa_device', '')}

# Cloudflare Tunnel (optional)
CF_TUNNEL_TOKEN={cfg.get('cf_token', '')}
"""

    env_local = f"""# SafeGuard APD — Next.js Configuration
# Generated by TUI Setup Wizard  {now_str}

# Database (relative to web-dashboard/)
DATABASE_URL="file:./data/safeguard.db"

# NextAuth
NEXTAUTH_SECRET={na_secret}
NEXTAUTH_URL={cfg.get('app_url', 'http://localhost:3000')}

# Service token — MUST match root .env
APD_SERVICE_TOKEN={token}
APD_ENCRYPTION_KEY={enc_key}
"""

    ENV_FILE.write_text(env_root,  encoding="utf-8")
    ENV_LOCAL.write_text(env_local, encoding="utf-8")
    return token, enc_key, jwt_secret


def run_wizard() -> None:
    """
    Full from-zero setup wizard.
    Runs outside the Live display (uses regular terminal I/O).
    """
    console.clear()

    # ── Welcome banner ────────────────────────────────────
    console.print()
    console.print(Panel(
        Text.from_markup(
            "  [bold #5294e2]SAFEGUARD APD — SETUP WIZARD[/bold #5294e2]\n"
            "  [dim]Konfigurasi proyek dari awal. Tekan Enter untuk nilai default.[/dim]\n"
            "  [dim]Ctrl+C kapan saja untuk keluar.[/dim]"
        ),
        border_style="#5294e2", style="on #0d1117", padding=(1, 2),
    ))

    tbl_steps = Table(show_header=False, box=None, padding=(0,1), style="on #0d1117")
    tbl_steps.add_column("n",   style="bold #5294e2", width=3)
    tbl_steps.add_column("ttl", style="#7a7a7a")
    for i, (_, lbl) in enumerate(zip(range(8), [
        "System Requirements Check",
        "Install Python & Node.js dependencies",
        "YOLO model path",
        "App URL & MQTT broker",
        "WhatsApp notification (optional)",
        "Cloudflare Tunnel (optional)",
        "Generate .env files & init database",
        "Verification summary",
    ])):
        tbl_steps.add_row(f"{i+1}.", lbl)
    console.print(tbl_steps)
    console.print()

    TOTAL = 8
    cfg: dict = {}

    # ── STEP 1: System requirements ──────────────────────
    _wiz_banner(1, TOTAL, "System Requirements Check")
    all_ok = True

    pv  = platform.python_version()
    p_ok = tuple(int(x) for x in pv.split(".")[:2]) >= (3, 10)
    (_ok if p_ok else _err)(f"Python {pv}  {'OK' if p_ok else 'requires >= 3.10'}")
    all_ok = all_ok and p_ok

    node_bin = shutil.which("node") or shutil.which("node.exe")
    if node_bin:
        try:
            r   = subprocess.run([node_bin, "--version"], capture_output=True, text=True, timeout=5)
            nv  = r.stdout.strip().lstrip("v")
            n_ok = int(nv.split(".")[0]) >= 18
            (_ok if n_ok else _err)(f"Node.js v{nv}  {'OK' if n_ok else 'requires >= 18'}")
            all_ok = all_ok and n_ok
        except Exception:
            _err("Node.js — versi tidak terbaca")
            all_ok = False
    else:
        _err("Node.js — NOT FOUND  (install dari https://nodejs.org)")
        all_ok = False

    npm_bin = shutil.which("npm") or shutil.which("npm.cmd")
    (_ok if npm_bin else _err)(f"npm — {'found: ' + str(npm_bin) if npm_bin else 'NOT FOUND'}")
    all_ok = all_ok and bool(npm_bin)

    git_bin = shutil.which("git")
    (_ok if git_bin else _warn)(f"git — {'found' if git_bin else 'tidak ditemukan (opsional)'}")

    if not all_ok:
        _warn("Ada requirement yang belum terpenuhi. Install dulu lalu jalankan ulang wizard.")
        if not _ask_yn("Lanjut tetap?", default=False):
            return

    # ── STEP 2: Install dependencies ─────────────────────
    _wiz_banner(2, TOTAL, "Install Dependencies")

    console.print("  [dim]Menginstall Python packages...[/dim]")
    _run_wiz_cmd(
        [sys.executable, "-m", "pip", "install", "-r", "requirements.txt"],
        str(BASE_DIR), "pip install -r requirements.txt"
    )

    console.print()
    if not DASHBOARD_DIR.exists():
        _err(f"web-dashboard/ tidak ditemukan di {BASE_DIR}")
        _warn("Pastikan repo di-clone lengkap.")
    else:
        console.print("  [dim]Menginstall Node.js packages (npm install)...[/dim]")
        _run_wiz_cmd(["npm", "install"], str(DASHBOARD_DIR), "npm install")

    # ── STEP 3: Model path ────────────────────────────────
    _wiz_banner(3, TOTAL, "YOLO Model Configuration")

    # scan for .pt files
    pt_files = sorted(BASE_DIR.rglob("*.pt"), key=lambda p: p.stat().st_size, reverse=True)[:8]
    if pt_files:
        console.print("  [dim]File model (.pt) yang ditemukan:[/dim]")
        tbl = Table(show_header=False, box=None, padding=(0,2))
        tbl.add_column("", style="#8ab4f8")
        tbl.add_column("", style="#555555")
        for f in pt_files:
            tbl.add_row(str(f.relative_to(BASE_DIR)), fmt_bytes(f.stat().st_size))
        console.print(tbl)
    else:
        _warn("Tidak ada file .pt ditemukan. Masukkan path manual.")

    cfg["model_path"] = _ask(
        "Path ke YOLO model (.pt)",
        default=str(pt_files[0].relative_to(BASE_DIR)) if pt_files else "./best.pt"
    )
    # normalize to forward slashes
    cfg["model_path"] = cfg["model_path"].replace("\\", "/")

    # ── STEP 4: App & MQTT config ─────────────────────────
    _wiz_banner(4, TOTAL, "Aplikasi & Network Configuration")

    cfg["app_url"] = _ask("URL Aplikasi (Next.js)", default="http://localhost:3000")

    console.print()
    console.print("  [bold]MQTT Broker[/bold]  [dim](untuk komunikasi ESP32/sensor)[/dim]")
    cfg["mqtt_host"] = _ask("  MQTT Broker host", default="broker.hivemq.com")
    cfg["mqtt_port"] = _ask("  MQTT Port (non-TLS)", default="1883")
    cfg["mqtt_tls"]  = _ask("  MQTT Port TLS",      default="8883")
    cfg["mqtt_user"] = _ask("  MQTT Username",      default="")
    if cfg["mqtt_user"]:
        cfg["mqtt_pass"] = _ask("  MQTT Password", default="", secret=True)
    else:
        cfg["mqtt_pass"] = ""

    # ── STEP 5: WhatsApp ──────────────────────────────────
    _wiz_banner(5, TOTAL, "WhatsApp Notification (opsional)")
    _inf("WhatsApp digunakan untuk kirim alert pelanggaran APD ke admin.")

    use_wa = _ask_yn("Aktifkan notifikasi WhatsApp?", default=False)
    if use_wa:
        cfg["wa_url"]    = _ask("  GoWA API URL",  default="http://157.245.206.36:3000")
        cfg["wa_user"]   = _ask("  GoWA Username (Basic Auth)", default="admin")
        cfg["wa_pass"]   = _ask("  GoWA Password", default="", secret=True)
        cfg["wa_device"] = _ask("  GoWA Device ID", default="pbl-alarm")
    else:
        cfg["wa_url"] = cfg["wa_device"] = cfg["wa_user"] = cfg["wa_pass"] = ""
        _inf("Dilewati. Bisa dikonfigurasi nanti di Config tab.")

    # ── STEP 6: Cloudflare Tunnel ───────────────────────
    _wiz_banner(6, TOTAL, "Cloudflare Tunnel (opsional)")
    _inf("Cloudflare Tunnel membuat dashboard bisa diakses dari internet.")
    _inf("Kamu perlu install cloudflared dan punya token dari CF Dashboard.")
    console.print()

    cf_bin = _find_cloudflared()
    if cf_bin:
        _ok(f"cloudflared ditemukan: {cf_bin}")
    else:
        _warn("cloudflared belum terinstall.")
        console.print("  [dim]Download:[/dim] [#8ab4f8]https://github.com/cloudflare/cloudflared/releases[/]")
        console.print("  [dim]Pilih:[/dim]   cloudflared-windows-amd64.msi")
        console.print()

    use_cf = _ask_yn("Konfigurasi Cloudflare Tunnel sekarang?", default=False)
    if use_cf:
        console.print()
        console.print("  [bold]Cara mendapatkan token:[/]")
        console.print("  [dim]1.[/dim] Buka [#8ab4f8]https://one.dash.cloudflare.com[/] → Networks → Tunnels")
        console.print("  [dim]2.[/dim] Buat tunnel / pilih yang ada")
        console.print("  [dim]3.[/dim] Copy token dari: cloudflared service install [#23c18b]<TOKEN>[/]")
        console.print()
        cfg["cf_token"] = _ask("  CF Tunnel Token", default="")
    else:
        cfg["cf_token"] = ""
        _inf("Dilewati. Bisa dikonfigurasi nanti via [H] di SETUP tab.")

    # ── STEP 7: Generate .env & init DB ───────────────
    _wiz_banner(7, TOTAL, "Generate Config & Inisialisasi Database")

    # Backup existing (fix filenames)
    if ENV_FILE.exists():
        bak = ENV_FILE.parent / ".env.bak"
        ENV_FILE.replace(bak)
        _inf(f".env lama disimpan ke  .env.bak")
    if ENV_LOCAL.exists():
        bak2 = ENV_LOCAL.parent / ".env.local.bak"
        ENV_LOCAL.replace(bak2)
        _inf(f".env.local lama disimpan ke  .env.local.bak")

    # Generate
    token, enc_key, jwt_secret = _gen_env_files(cfg)
    _ok(f".env  →  {ENV_FILE}")
    _ok(f".env.local  →  {ENV_LOCAL}")
    console.print(f"  [dim]APD_SERVICE_TOKEN  {token[:8]}...{token[-4:]}  (disimpan ke kedua file)[/dim]")

    # Ensure DB dir exists
    db_dir = DASHBOARD_DIR / "data"
    db_dir.mkdir(parents=True, exist_ok=True)
    _ok(f"Direktori database: {db_dir}")

    # Prisma migrate
    console.print()
    console.print("  [dim]Menjalankan prisma migrate deploy...[/dim]")
    _run_wiz_cmd(
        ["npx", "prisma", "migrate", "deploy"],
        str(DASHBOARD_DIR), "prisma migrate deploy"
    )

    # npm run seed
    console.print()
    console.print("  [dim]Menjalankan npm run seed (buat akun admin)...[/dim]")
    seed_ok = _run_wiz_cmd(
        ["npm", "run", "seed"],
        str(DASHBOARD_DIR), "npm run seed"
    )
    if seed_ok:
        _warn("Catat password admin yang tampil di output di atas!")

    # ── STEP 8: Verifikasi ────────────────────────────────
    _wiz_banner(8, TOTAL, "Verifikasi")

    # Check .env files
    (_ok if ENV_FILE.exists()  else _err)(f".env  {'ada' if ENV_FILE.exists() else 'TIDAK ADA'}")
    (_ok if ENV_LOCAL.exists() else _err)(f".env.local  {'ada' if ENV_LOCAL.exists() else 'TIDAK ADA'}")
    (_ok if DB_FILE.exists()   else _inf)(f"Database  {'ada ({} KB)'.format(DB_FILE.stat().st_size//1024) if DB_FILE.exists() else 'belum ada (normal — akan dibuat saat dijalankan)'}")

    # Check token sync
    t1 = read_env(ENV_FILE).get("APD_SERVICE_TOKEN","")
    t2 = read_env(ENV_LOCAL).get("APD_SERVICE_TOKEN","")
    (_ok if (t1 and t1==t2) else _err)("APD_SERVICE_TOKEN sync" if (t1 and t1==t2) else "APD_SERVICE_TOKEN MISMATCH")

    # Check model
    model_p = BASE_DIR / cfg.get("model_path","best.pt")
    (_ok if model_p.exists() else _warn)(
        f"Model {cfg.get('model_path')}  {'ditemukan' if model_p.exists() else 'TIDAK ADA — letakkan file .pt sebelum menjalankan backend'}"
    )

    # Summary table
    console.print()
    t_sum = Table(show_header=True, header_style="bold #5294e2",
                  style="on #0e1a13", border_style="#23c18b",
                  show_edge=True, padding=(0, 1))
    t_sum.add_column("Key")
    t_sum.add_column("Value", style="#c8c8c8")
    t_sum.add_row("Model",        cfg.get('model_path', '-'))
    t_sum.add_row("App URL",      cfg.get('app_url', '-'))
    t_sum.add_row("MQTT host",    cfg.get('mqtt_host', '-'))
    t_sum.add_row("MQTT port",    cfg.get('mqtt_port', '-'))
    t_sum.add_row("WhatsApp",     "aktif" if cfg.get('wa_url') else "tidak aktif")
    t_sum.add_row(".env",         "[#23c18b]OK[/]" if ENV_FILE.exists()  else "[#e55561]MISSING[/]")
    t_sum.add_row(".env.local",   "[#23c18b]OK[/]" if ENV_LOCAL.exists() else "[#e55561]MISSING[/]")
    t_sum.add_row("Token sync",   "[#23c18b]SYNCED[/]" if (t1 and t1 == t2) else "[#e55561]MISMATCH[/]")
    console.print(Panel(
        Group(
            Text("  SETUP SELESAI!", style="bold #23c18b"),
            Text(""),
            t_sum,
            Text(""),
            Text("  Langkah selanjutnya:", style="bold"),
            Text(f"  1. python tui.py  →  tekan  s  Start All", style="#c8c8c8"),
            Text(f"  2. Buka browser →  {cfg.get('app_url', 'http://localhost:3000')}", style="#c8c8c8"),
            Text( "  3. Login dengan akun admin dari output seed di atas", style="#c8c8c8"),
        ),
        border_style="#23c18b", style="on #0e1a13", padding=(1, 2),
    ))
    console.print()
    input("  Tekan Enter untuk kembali ke TUI...")


# ══════════════════════════════════════════════════════════
#  QUICK CONFIG EDITOR  (press 'c')
# ══════════════════════════════════════════════════════════

def run_config_editor() -> None:
    """Quick config editor — edit critical .env vars inline.
    Exits Live display, prompts user, writes .env, returns to Live."""
    console.clear()
    console.print(Panel(
        Text.from_markup(
            "  [bold #5294e2]QUICK CONFIG EDITOR[/]\n"
            "  [dim]Edit konfigurasi kritis di .env. Tekan Enter untuk skip (keep current value).[/dim]\n"
            "  [dim]Ctrl+C untuk batal.[/dim]"
        ),
        border_style="#5294e2", style="on #0d1117", padding=(1, 2),
    ))

    env = read_env(ENV_FILE) if ENV_FILE.exists() else {}

    # Show current issues
    issues = preflight_critical_issues()
    if issues:
        console.print(f"\n  [bold #e55561]Issues found:[/] {', '.join(issues)}\n")
    else:
        console.print(f"\n  [#23c18b]All critical items OK.[/] Edit values below to change.\n")

    try:
        # MQTT
        console.print("  [bold]MQTT Broker[/]  [dim](HiveMQ Cloud)[/dim]")
        new_host = _ask("  MQTT Hostname", default=env.get("MQTT_HOSTNAME", ""))
        new_user = _ask("  MQTT Username", default=env.get("MQTT_USERNAME", ""))
        new_pass = ""
        if new_user:
            new_pass = _ask("  MQTT Password", default=env.get("MQTT_PASSWORD", ""), secret=True)

        # AES
        console.print()
        cur_aes = env.get("AES_KEY", "")
        if cur_aes:
            _inf(f"Current AES_KEY: {cur_aes[:8]}...{cur_aes[-4:]}")
            gen_new = _ask_yn("Generate new AES key?", default=False)
            new_aes = secrets.token_hex(16) if gen_new else cur_aes
        else:
            _warn("AES_KEY is empty — generating new one.")
            new_aes = secrets.token_hex(16)
        if new_aes != cur_aes:
            console.print(f"  [dim]New AES_KEY: {new_aes}[/dim]")
            _warn("Update AES_KEY_HEX in alarm_apd.ino to match!")

        # WA (optional)
        console.print()
        console.print("  [bold]WhatsApp GoWA[/]  [dim](optional)[/dim]")
        new_wa_url  = _ask("  WA Server URL",            default=env.get("WA_API_URL", ""))
        new_wa_user = _ask("  WA Username (Basic Auth)",  default=env.get("WA_API_USER", "admin"))
        new_wa_pass = _ask("  WA Password",               default=env.get("WA_API_PASS", ""), secret=True)
        new_wa_dev  = _ask("  WA Device ID",              default=env.get("WA_DEVICE_ID", ""))

        # Write changes to .env
        console.print()
        if ENV_FILE.exists():
            content = ENV_FILE.read_text(encoding="utf-8")
            updates = {
                "MQTT_HOSTNAME": new_host,
                "MQTT_USERNAME": new_user,
                "MQTT_PASSWORD": new_pass,
                "AES_KEY": new_aes,
                "WA_API_URL": new_wa_url,
                "WA_API_USER": new_wa_user,
                "WA_API_PASS": new_wa_pass,
                "WA_DEVICE_ID": new_wa_dev,
            }

            # Cloudflare Tunnel (optional)
            console.print()
            console.print("  [bold]Cloudflare Tunnel[/]  [dim](optional)[/dim]")
            cur_cf = env.get("CF_TUNNEL_TOKEN", "")
            if cur_cf:
                _inf(f"Current token: {cur_cf[:12]}...{cur_cf[-6:]}")
            new_cf_token = _ask("  CF Tunnel Token", default=cur_cf)
            if new_cf_token:
                updates["CF_TUNNEL_TOKEN"] = new_cf_token

            lines = content.splitlines()
            for i, line in enumerate(lines):
                stripped = line.strip()
                if stripped and not stripped.startswith("#") and "=" in stripped:
                    key = stripped.split("=", 1)[0].strip()
                    if key in updates:
                        lines[i] = f"{key}={updates[key]}"
                        del updates[key]
            # Append any keys that weren't found
            for key, val in updates.items():
                lines.append(f"{key}={val}")
            ENV_FILE.write_text("\n".join(lines), encoding="utf-8")
            _ok("Changes saved to .env")
        else:
            _err(".env not found! Run wizard (w) first.")

        # Force preflight refresh
        S._preflight_t = 0

    except KeyboardInterrupt:
        console.print("\n  [dim]Cancelled.[/dim]")

    console.print()
    input("  Tekan Enter untuk kembali ke TUI...")


# ══════════════════════════════════════════════════════════
#  CLOUDFLARE TUNNEL SETUP  (press 'h' in SETUP tab when no token)
# ══════════════════════════════════════════════════════════

def run_cf_setup() -> None:
    """Interactive CF Tunnel setup — prompts for token, saves to .env,
    optionally starts tunnel. Runs outside Live display."""
    console.clear()
    console.print(Panel(
        Text.from_markup(
            "  [bold #5294e2]CLOUDFLARE TUNNEL SETUP[/]\n"
            "  [dim]Konfigurasi Cloudflare Tunnel untuk akses dashboard dari internet.[/dim]\n"
            "  [dim]Ctrl+C untuk batal.[/dim]"
        ),
        border_style="#5294e2", style="on #0d1117", padding=(1, 2),
    ))

    console.print()
    console.print("  [bold]Cara mendapatkan token:[/]")
    console.print("  [dim]1.[/dim] Buka [#8ab4f8]https://one.dash.cloudflare.com[/] → Networks → Tunnels")
    console.print("  [dim]2.[/dim] Buat tunnel baru / pilih yang sudah ada")
    console.print("  [dim]3.[/dim] Di halaman 'Install and run connectors', copy token dari command:")
    console.print("       [dim]cloudflared service install [/dim][#23c18b]eyJhIjoiMm...[/]")
    console.print("  [dim]4.[/dim] Paste token di bawah")
    console.print()
    console.print("  [bold]Konfigurasi Public Hostname di CF Dashboard:[/]")
    console.print("  [dim]Subdomain 1:[/dim]  apd.domain.com  →  [#8ab4f8]http://localhost:3000[/]  [dim](Next.js)[/dim]")
    console.print("  [dim]Subdomain 2:[/dim]  ws-apd.domain.com  →  [#8ab4f8]http://localhost:8765[/]  [dim](WebSocket)[/dim]")
    console.print()

    try:
        env = read_env(ENV_FILE) if ENV_FILE.exists() else {}
        cur_token = env.get("CF_TUNNEL_TOKEN", "")

        if cur_token:
            _inf(f"Token saat ini: {cur_token[:12]}...{cur_token[-6:]}")

        console.print("  [bold #8ab4f8]Paste CF Tunnel Token[/]  [dim](dari cloudflared service install <TOKEN>)[/dim]")
        new_token = _ask("  Token", default=cur_token)

        if not new_token:
            _warn("Token kosong — tunnel tidak bisa distart.")
            input("\n  Tekan Enter untuk kembali ke TUI...")
            return

        # Save to .env
        if ENV_FILE.exists():
            content = ENV_FILE.read_text(encoding="utf-8")
            if "CF_TUNNEL_TOKEN=" in content:
                lines = content.splitlines()
                for i, line in enumerate(lines):
                    if line.strip().startswith("CF_TUNNEL_TOKEN="):
                        lines[i] = f"CF_TUNNEL_TOKEN={new_token}"
                        break
                ENV_FILE.write_text("\n".join(lines), encoding="utf-8")
            else:
                with open(ENV_FILE, "a", encoding="utf-8") as f:
                    f.write(f"\n# Cloudflare Tunnel\nCF_TUNNEL_TOKEN={new_token}\n")
            _ok("Token tersimpan ke .env")
            S._preflight_t = 0  # force refresh
        else:
            _err(".env tidak ditemukan! Jalankan wizard (w) dulu.")
            input("\n  Tekan Enter untuk kembali ke TUI...")
            return

        # Check cloudflared
        cf_bin = _find_cloudflared()
        if not cf_bin:
            console.print()
            _warn("cloudflared belum terinstall!")
            console.print("  [dim]Download:[/dim] [#8ab4f8]https://github.com/cloudflare/cloudflared/releases[/]")
            console.print("  [dim]Pilih:[/dim]   cloudflared-windows-amd64.msi")
            console.print()
            console.print("  [dim]Setelah install, tekan [H] di SETUP tab untuk start tunnel.[/dim]")
            input("\n  Tekan Enter untuk kembali ke TUI...")
            return

        # Offer to start tunnel now
        console.print()
        if _ask_yn("Start tunnel sekarang?", default=True):
            console.print()
            _inf("Starting Cloudflare Tunnel...")
            console.print(f"  [dim]$ cloudflared tunnel run --token <TOKEN>[/dim]")
            console.print()

            proc = subprocess.Popen(
                [cf_bin, "tunnel", "run", "--token", new_token],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, bufsize=1,
            )
            S.cf_tunnel_proc = proc

            # Wait for connection confirmation
            import re
            connected = False
            for i, line in enumerate(proc.stdout):
                line = line.strip()
                if line:
                    console.print(f"  [dim]{line[:80]}[/dim]")
                if "registered" in line.lower() and "connection" in line.lower():
                    connected = True
                    console.print()
                    _ok("TUNNEL CONNECTED!")
                    console.print("  [dim]Domain/route diatur dari CF Zero Trust Dashboard:[/dim]")
                    console.print("  [dim]→ Networks → Tunnels → Public Hostname[/dim]")
                    S.cf_tunnel_url = "CF Token Tunnel (see dashboard)"
                    S.step_states["h"] = "done"
                    S._preflight_t = 0
                    S.emit("[#23c18b]Cloudflare Token Tunnel UP[/]")
                    break
                if i > 50:
                    break

            if not connected:
                if proc.poll() is not None:
                    _err(f"Process exited with code {proc.returncode}")
                    S.step_states["h"] = "error"
                else:
                    _warn("Tunnel started tapi belum dikonfirmasi connected.")
                    console.print("  [dim]Mungkin masih connecting — cek di LOGS tab.[/dim]")
                    S.cf_tunnel_url = "CF Token Tunnel (connecting...)"
                    S.step_states["h"] = "done"
        else:
            _inf("Token tersimpan. Tekan [H] di SETUP tab kapan saja untuk start.")

    except KeyboardInterrupt:
        console.print("\n  [dim]Cancelled.[/dim]")

    console.print()
    input("  Tekan Enter untuk kembali ke TUI...")


# ══════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════

def main():
    # ── first-run detection ────────────────────────────────
    if not ENV_LOCAL.exists():
        console.clear()
        console.print(Panel(
            "[bold #ffcc55]Setup belum dilakukan![/bold #ffcc55]\n"
            "[dim].env.local tidak ditemukan. Jalankan Setup Wizard untuk\n"
            "mengkonfigurasi proyek dari awal.[/dim]",
            border_style="#ffcc55", style="on #1a170e"
        ))
        if _ask_yn("Mulai Setup Wizard sekarang?", default=True):
            run_wizard()
        console.print()

    # prime psutil
    psutil.cpu_percent(interval=None)
    try:
        S._net0  = psutil.net_io_counters()
        S._net_t = time.time()
    except Exception:
        pass

    # background sysinfo
    threading.Thread(target=_load_sysinfo, daemon=True).start()
    # keyboard thread
    threading.Thread(target=keyboard_loop, daemon=True).start()

    S.emit("SafeGuard APD TUI ready  |  1-6 tabs  |  w=wizard  |  s start-all  |  q quit")

    while True:
        S.running        = True
        S.wizard_request = False
        S.config_request = False
        S.cf_setup_request = False

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
            break

        # if wizard was requested, run it then loop back
        if getattr(S, "wizard_request", False):
            run_wizard()
        elif getattr(S, "config_request", False):
            run_config_editor()
        elif getattr(S, "cf_setup_request", False):
            run_cf_setup()
        else:
            break

    console.clear()
    console.print("\n  [#5294e2]SafeGuard APD TUI — bye.[/]\n")


if __name__ == "__main__":
    main()
