// ============================================================
// SafeGuard APD — Interactive Architecture Visualization
// Animated data-flow engine + clickable diagram + scenarios
// ============================================================

/* ---------------- Component detail panel ---------------- */
const COMPONENT_DETAILS = {
  browser: { name: "Browser Pengguna", tag: "Client",
    desc: "Aplikasi browser di laptop atau ponsel. Satu-satunya titik interaksi dengan manusia.",
    items: [
      { label: "Tugas", value: "Menampilkan UI, mengirim form, menerima notifikasi" },
      { label: "Ke Next.js", value: "HTTP dengan cookie sesi dan token CSRF" },
      { label: "Ke Python", value: "WebSocket untuk frame video live" },
    ]},
  nextjs: { name: "Next.js", tag: "Web Fullstack",
    desc: "Frontend React dan backend API dalam satu proses pada port 3000.",
    items: [
      { label: "Port", value: "127.0.0.1:3000" },
      { label: "Database", value: "SQLite melalui Prisma" },
      { label: "Tugas", value: "Login, RBAC, CRUD, dashboard, audit log" },
      { label: "Jalankan", value: "npm run start" },
    ]},
  python: { name: "Python YOLO", tag: "Deteksi AI",
    desc: "Menangkap video, menjalankan deteksi YOLOv8, dan berkomunikasi dengan perangkat.",
    items: [
      { label: "WebSocket", value: "0.0.0.0:8765 untuk frame live" },
      { label: "Model", value: "YOLOv8 helm dan rompi + deteksi orang" },
      { label: "Output", value: "WhatsApp, MQTT, laporan ke Next.js" },
      { label: "Jalankan", value: "python ServiceAPDBackend.py" },
    ]},
  sqlite: { name: "SQLite", tag: "Database",
    desc: "Penyimpanan data permanen, hanya diakses Next.js melalui Prisma.",
    items: [
      { label: "Lokasi", value: "web-dashboard/data/safeguard.db" },
      { label: "Mode", value: "WAL untuk akses bersamaan" },
      { label: "Tabel", value: "User, Role, Permission, Session, Node, Violation, AuditLog" },
    ]},
  cf: { name: "Cloudflare Edge", tag: "Tunnel",
    desc: "Menerima permintaan dari internet dan meneruskan ke laptop melalui tunnel.",
    items: [
      { label: "Mode", value: "Named tunnel, bukan WARP atau Access" },
      { label: "TLS", value: "Otomatis di edge" },
      { label: "Auth", value: "Tetap di aplikasi (Argon2 + RBAC)" },
    ]},
  cloudflared: { name: "cloudflared", tag: "Daemon",
    desc: "Daemon di laptop yang menjaga koneksi tunnel ke Cloudflare.",
    items: [
      { label: "Jalan sebagai", value: "Windows Service auto-start" },
      { label: "Meneruskan", value: "127.0.0.1:3000 dan 127.0.0.1:8765" },
    ]},
  gowa: { name: "GoWA VPS", tag: "Gateway WhatsApp",
    desc: "Gateway WhatsApp swakelola di VPS.",
    items: [
      { label: "Endpoint", value: "POST /send/image dan /send/message" },
      { label: "Pemanggil", value: "Python saat mendeteksi pelanggaran" },
      { label: "Cooldown", value: "120 detik per node" },
    ]},
  hivemq: { name: "HiveMQ (MQTT)", tag: "Message Broker",
    desc: "Perantara pesan antara Python dan ESP32.",
    items: [
      { label: "Port", value: "8883 dengan TLS" },
      { label: "Topik", value: "APD_Violation" },
      { label: "Enkripsi", value: "AES-128 pada lapisan aplikasi" },
    ]},
  ipcam: { name: "Kamera", tag: "Perangkat",
    desc: "Sumber video untuk deteksi. Hanya diakses Python.",
    items: [
      { label: "Sumber", value: "RTSP, HTTP, atau index webcam" },
      { label: "Akses", value: "Hanya Python, tidak ke Next.js" },
    ]},
  esp32: { name: "ESP32", tag: "Perangkat",
    desc: "Mikrokontroler dengan speaker untuk alarm fisik.",
    items: [
      { label: "MQTT", value: "Berlangganan APD_Violation" },
      { label: "Audio", value: "MP3 via DAC ke speaker" },
      { label: "LED", value: "Indikator status koneksi dan alarm" },
    ]},
};

const detailPanel = document.getElementById("detailPanel");
document.querySelectorAll(".component").forEach((comp) => {
  comp.addEventListener("click", () => {
    document.querySelectorAll(".component").forEach((c) => c.classList.remove("selected"));
    comp.classList.add("selected");
    const data = COMPONENT_DETAILS[comp.dataset.component];
    if (!data) return;
    detailPanel.innerHTML =
      `<span class="detail-tag">${data.tag}</span>` +
      `<h3>${data.name}</h3>` +
      `<p style="color:var(--text-muted);font-size:14px;margin-bottom:14px;">${data.desc}</p>` +
      `<ul class="detail-list">${data.items.map((i) => `<li><strong>${i.label}</strong>${i.value}</li>`).join("")}</ul>`;
  });
});

/* ============================================================
   ANIMATION ENGINE
   Each flow = ordered list of hops. A hop moves the packet from
   node A to node B along a wire, lights both nodes, shows text.
   ============================================================ */

// Node center positions are read live from the DOM (responsive-safe).
const stage = document.getElementById("stage");
const wiresSvg = document.getElementById("wires");
const packet = document.getElementById("packet");

const NODE_IDS = ["browser", "mw", "api", "db", "python", "cam", "mqtt", "esp", "gowa"];

function nodeEl(key) { return document.getElementById("n-" + key); }

// Returns center {x,y} in stage pixel coords.
function nodeCenter(key) {
  const el = nodeEl(key);
  const s = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 };
}

/* ---- Flow definitions ----
   from/to = node keys; label = short tag on packet; text = narration.
   dir 'rev' just for color cue (response). */
const FLOWS = {
  login: {
    title: "Login Pengguna",
    steps: [
      { from: "browser", to: "mw", label: "POST /login", text: "<span class='nb-from'>Browser</span> mengirim username dan password ke <span class='nb-to'>Middleware</span>." },
      { from: "mw", to: "api", label: "lolos cek", text: "<span class='nb-from'>Middleware</span> memeriksa rate limit, lalu meneruskan ke <span class='nb-to'>API Route</span> login." },
      { from: "api", to: "db", label: "cari user", text: "<span class='nb-from'>API</span> meminta data pengguna ke <span class='nb-to'>SQLite</span> dan memverifikasi password dengan Argon2id." },
      { from: "db", to: "api", label: "data user", text: "<span class='nb-from'>SQLite</span> mengembalikan data pengguna. Password cocok." },
      { from: "api", to: "db", label: "buat sesi", text: "<span class='nb-from'>API</span> menyimpan sesi baru dan mencatat audit log ke <span class='nb-to'>SQLite</span>." },
      { from: "api", to: "browser", label: "cookie + CSRF", text: "<span class='nb-from'>API</span> mengirim cookie sesi dan token CSRF. <span class='nb-to'>Browser</span> diarahkan ke dashboard." },
    ],
  },
  detect: {
    title: "Deteksi Pelanggaran",
    steps: [
      { from: "cam", to: "python", label: "frame video", text: "<span class='nb-from'>Kamera</span> mengirim frame ke <span class='nb-to'>Python YOLO</span>." },
      { from: "python", to: "python", label: "inferensi", text: "<span class='nb-from'>Python</span> menjalankan YOLOv8: mendeteksi orang tanpa helm atau rompi." },
      { from: "python", to: "mqtt", label: "alarm", text: "<span class='nb-from'>Python</span> mempublikasikan alarm terenkripsi ke <span class='nb-to'>MQTT</span>." },
      { from: "mqtt", to: "esp", label: "trigger", text: "<span class='nb-from'>MQTT</span> meneruskan ke <span class='nb-to'>ESP32</span>. Alarm berbunyi." },
      { from: "python", to: "gowa", label: "foto + pesan", text: "<span class='nb-from'>Python</span> mengirim foto pelanggaran ke <span class='nb-to'>GoWA</span> untuk diteruskan ke WhatsApp PIC." },
      { from: "python", to: "api", label: "POST /violations", text: "<span class='nb-from'>Python</span> melaporkan pelanggaran ke <span class='nb-to'>API</span> dengan service token (jalur loopback)." },
      { from: "api", to: "db", label: "simpan", text: "<span class='nb-from'>API</span> menyimpan pelanggaran dan audit log ke <span class='nb-to'>SQLite</span>." },
    ],
  },
  monitor: {
    title: "Live Monitor",
    steps: [
      { from: "browser", to: "api", label: "GET /monitor", text: "<span class='nb-from'>Browser</span> membuka halaman live monitor dari <span class='nb-to'>Next.js</span>." },
      { from: "api", to: "browser", label: "halaman", text: "<span class='nb-from'>Next.js</span> mengirim halaman. Browser lalu membuka koneksi WebSocket." },
      { from: "cam", to: "python", label: "frame", text: "<span class='nb-from'>Kamera</span> mengalirkan frame ke <span class='nb-to'>Python</span>." },
      { from: "python", to: "browser", label: "WS frame", text: "<span class='nb-from'>Python</span> menyiarkan frame ber-anotasi langsung ke <span class='nb-to'>Browser</span> via WebSocket port 8765." },
    ],
  },
  wizard: {
    title: "Tambah Node",
    steps: [
      { from: "browser", to: "mw", label: "POST /nodes", text: "<span class='nb-from'>Browser</span> mengirim data node baru dari wizard ke <span class='nb-to'>Middleware</span>." },
      { from: "mw", to: "api", label: "cek node:create", text: "<span class='nb-from'>Middleware</span> memeriksa izin node:create dan token CSRF, lalu meneruskan ke <span class='nb-to'>API</span>." },
      { from: "api", to: "db", label: "simpan node", text: "<span class='nb-from'>API</span> menyimpan node baru ke <span class='nb-to'>SQLite</span> dan mencatat audit log." },
      { from: "api", to: "browser", label: "berhasil", text: "<span class='nb-from'>API</span> mengonfirmasi. Daftar node di <span class='nb-to'>Browser</span> diperbarui." },
      { from: "python", to: "api", label: "GET /nodes", text: "Pada siklus refresh, <span class='nb-from'>Python</span> mengambil daftar node terbaru dari <span class='nb-to'>API</span> dan mulai memantau kamera baru." },
    ],
  },
};

/* ---- Wire endpoints used per flow (for drawing static lines) ---- */
const SPEED_MS = { 1: 1600, 2: 1000, 3: 550 };

let currentFlow = "login";
let stepIndex = -1;
let playing = false;
let playTimer = null;

const flowTitleEl = document.getElementById("flowTitle");
const stepCounterEl = document.getElementById("stepCounter");
const narrationBodyEl = document.getElementById("narrationBody");
const speedEl = document.getElementById("speed");

/* Draw the wires for the active flow as faint lines between hop pairs. */
function drawWires() {
  const flow = FLOWS[currentFlow];
  wiresSvg.innerHTML = "";
  const s = stage.getBoundingClientRect();
  const vbW = 1000, vbH = (s.height / s.width) * 1000;
  wiresSvg.setAttribute("viewBox", `0 0 ${vbW} ${vbH}`);
  const seen = new Set();
  flow.steps.forEach((st, i) => {
    if (st.from === st.to) return;
    const key = st.from + "-" + st.to;
    if (seen.has(key)) return;
    seen.add(key);
    const a = nodeCenter(st.from), b = nodeCenter(st.to);
    // convert px -> viewBox units
    const ax = (a.x / s.width) * vbW, ay = (a.y / s.height) * vbH;
    const bx = (b.x / s.width) * vbW, by = (b.y / s.height) * vbH;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", ax); line.setAttribute("y1", ay);
    line.setAttribute("x2", bx); line.setAttribute("y2", by);
    line.setAttribute("class", "wire");
    line.dataset.pair = key;
    wiresSvg.appendChild(line);
  });
}

function clearLit() {
  NODE_IDS.forEach((k) => nodeEl(k).classList.remove("lit"));
  wiresSvg.querySelectorAll(".wire").forEach((w) => w.classList.remove("active"));
}

function animatePacket(fromKey, toKey, dur) {
  return new Promise((resolve) => {
    const a = nodeCenter(fromKey);
    const b = nodeCenter(toKey);
    // self-loop: pulse in place
    if (fromKey === toKey) {
      packet.style.transition = "none";
      packet.style.left = a.x + "px";
      packet.style.top = a.y + "px";
      packet.style.opacity = "1";
      nodeEl(fromKey).classList.add("lit");
      setTimeout(() => { packet.style.opacity = "0"; resolve(); }, dur);
      return;
    }
    // place at start
    packet.style.transition = "none";
    packet.style.left = a.x + "px";
    packet.style.top = a.y + "px";
    packet.style.opacity = "1";
    nodeEl(fromKey).classList.add("lit");
    // highlight wire
    const w = wiresSvg.querySelector(`.wire[data-pair="${fromKey}-${toKey}"]`)
           || wiresSvg.querySelector(`.wire[data-pair="${toKey}-${fromKey}"]`);
    if (w) w.classList.add("active");
    // force reflow then move
    void packet.offsetWidth;
    packet.style.transition = `left ${dur}ms ease-in-out, top ${dur}ms ease-in-out`;
    packet.style.left = b.x + "px";
    packet.style.top = b.y + "px";
    setTimeout(() => {
      nodeEl(toKey).classList.add("lit");
      packet.style.opacity = "0";
      resolve();
    }, dur);
  });
}

async function runStep(i) {
  const flow = FLOWS[currentFlow];
  if (i < 0 || i >= flow.steps.length) return;
  const st = flow.steps[i];
  clearLit();
  stepIndex = i;
  stepCounterEl.textContent = `${i + 1} / ${flow.steps.length}`;
  narrationBodyEl.innerHTML = st.text;
  packet.dataset.label = st.label || "";
  packet.classList.toggle("label", !!st.label);
  const dur = SPEED_MS[speedEl.value] || 1000;
  await animatePacket(st.from, st.to, dur);
}

function resetFlow() {
  playing = false;
  if (playTimer) { clearTimeout(playTimer); playTimer = null; }
  stepIndex = -1;
  clearLit();
  packet.style.opacity = "0";
  const flow = FLOWS[currentFlow];
  flowTitleEl.textContent = flow.title;
  stepCounterEl.textContent = `0 / ${flow.steps.length}`;
  narrationBodyEl.innerHTML = "Tekan <strong>Putar</strong> untuk memulai animasi.";
  document.getElementById("btnPlay").textContent = "▶ Putar";
}

async function playAll() {
  if (playing) { // pause
    playing = false;
    document.getElementById("btnPlay").textContent = "▶ Lanjut";
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    return;
  }
  playing = true;
  document.getElementById("btnPlay").textContent = "⏸ Jeda";
  const flow = FLOWS[currentFlow];
  let i = stepIndex < 0 || stepIndex >= flow.steps.length - 1 ? 0 : stepIndex + 1;
  if (stepIndex >= flow.steps.length - 1) i = 0; // restart if finished
  const loop = async () => {
    if (!playing) return;
    await runStep(i);
    i++;
    if (i >= flow.steps.length) {
      playing = false;
      document.getElementById("btnPlay").textContent = "▶ Ulang";
      return;
    }
    playTimer = setTimeout(loop, 350);
  };
  loop();
}

async function stepOnce() {
  playing = false;
  if (playTimer) { clearTimeout(playTimer); playTimer = null; }
  document.getElementById("btnPlay").textContent = "▶ Putar";
  const flow = FLOWS[currentFlow];
  let next = stepIndex + 1;
  if (next >= flow.steps.length) next = 0;
  await runStep(next);
}

/* ---- Wire up controls ---- */
document.getElementById("btnPlay").addEventListener("click", playAll);
document.getElementById("btnStep").addEventListener("click", stepOnce);
document.getElementById("btnReset").addEventListener("click", resetFlow);

document.querySelectorAll("#playerTabs .ptab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#playerTabs .ptab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentFlow = tab.dataset.flow;
    drawWires();
    resetFlow();
  });
});

/* Redraw wires on resize (positions are responsive). */
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { drawWires(); }, 150);
});

/* Init after layout settles. */
window.addEventListener("load", () => {
  drawWires();
  resetFlow();
});
// Fallback init in case load already fired
setTimeout(() => { drawWires(); resetFlow(); }, 300);
