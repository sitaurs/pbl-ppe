// ═══════════════════════════════════════════════════════════════
//  IoT & WSN Visual Learning — Interactive Script
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  initProgressBar();
  initNavbar();
  initNetworkCanvas();
  initRevealOnScroll();
  initArchStack();
  initWsnLayer();
  initNodeAnatomy();
  initTopologyAnimations();
  initMQTT();
  initChallenges();
  initBlockDiagram();
  initQuiz();
});

// ───────────── PROGRESS BAR ─────────────
function initProgressBar() {
  const bar = document.getElementById('progressBar');
  if (!bar) return;
  const update = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const scrolled = window.scrollY;
    bar.style.width = scrollable > 0 ? `${(scrolled / scrollable) * 100}%` : '0%';
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

// ───────────── NAVBAR ─────────────
function initNavbar() {
  const nav = document.getElementById('navbar');
  const toggle = document.getElementById('navToggle');
  const links = document.querySelector('.nav-links');

  window.addEventListener('scroll', () => {
    if (window.scrollY > 30) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  }, { passive: true });

  toggle?.addEventListener('click', () => {
    toggle.classList.toggle('active');
    links.classList.toggle('open');
  });

  links?.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      toggle.classList.remove('active');
      links.classList.remove('open');
    });
  });
}

// ───────────── HERO NETWORK CANVAS ─────────────
function initNetworkCanvas() {
  const svg = document.getElementById('networkCanvas');
  if (!svg) return;

  const NS = 'http://www.w3.org/2000/svg';
  const width = window.innerWidth;
  const height = Math.max(window.innerHeight, 700);

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');

  const nodes = [];
  const NODE_COUNT = window.innerWidth < 760 ? 18 : 36;

  for (let i = 0; i < NODE_COUNT; i++) {
    nodes.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: 1.5 + Math.random() * 2,
      hue: Math.random() > 0.5 ? '#22d3ee' : '#a78bfa',
    });
  }

  // create node circles
  const circles = nodes.map(n => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', n.r);
    c.setAttribute('fill', n.hue);
    c.setAttribute('opacity', '0.85');
    c.setAttribute('filter', 'drop-shadow(0 0 4px ' + n.hue + ')');
    svg.appendChild(c);
    return c;
  });

  const linesGroup = document.createElementNS(NS, 'g');
  svg.insertBefore(linesGroup, svg.firstChild);

  const MAX_DIST = 160;

  function tick() {
    // update positions
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > width) n.vx *= -1;
      if (n.y < 0 || n.y > height) n.vy *= -1;
      circles[i].setAttribute('cx', n.x);
      circles[i].setAttribute('cy', n.y);
    }

    // rebuild lines
    linesGroup.innerHTML = '';
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAX_DIST) {
          const opacity = 0.18 * (1 - dist / MAX_DIST);
          const line = document.createElementNS(NS, 'line');
          line.setAttribute('x1', nodes[i].x);
          line.setAttribute('y1', nodes[i].y);
          line.setAttribute('x2', nodes[j].x);
          line.setAttribute('y2', nodes[j].y);
          line.setAttribute('stroke', '#22d3ee');
          line.setAttribute('stroke-width', '0.7');
          line.setAttribute('opacity', opacity);
          linesGroup.appendChild(line);
        }
      }
    }
    requestAnimationFrame(tick);
  }
  tick();

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = Math.max(window.innerHeight, 700);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  });
}

// ───────────── REVEAL ON SCROLL ─────────────
function initRevealOnScroll() {
  document.querySelectorAll('section, .compare-card, .topo-card, .qos-card, .cheat-card').forEach(el => {
    el.classList.add('reveal');
  });

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

// ───────────── ARSITEKTUR IoT (3-tier / 5-tier) ─────────────
const ARCH_DATA = {
  '3': [
    {
      name: 'Application Layer',
      icon: '📊',
      desc: 'Menyajikan data ke pengguna, analitik, dan keputusan',
      detail: 'Lapisan paling atas yang berinteraksi langsung dengan end-user. Bertugas memvisualisasikan data, mengeluarkan keputusan berbasis AI/ML, dan mengirim perintah ke device.',
      tags: ['Dashboard', 'Mobile App', 'AI/ML', 'Database', 'Notifikasi'],
      project: 'Next.js Dashboard, deteksi YOLOv8, notifikasi WhatsApp via GoWA, SQLite storage',
    },
    {
      name: 'Network Layer',
      icon: '📡',
      desc: 'Transmisi data antara device dan server',
      detail: 'Lapisan tengah yang menjamin data sampai dengan andal. Berisi gateway, broker, dan protokol komunikasi yang mengabstraksi medium fisik.',
      tags: ['WiFi', 'MQTT', 'HTTP', 'Gateway', 'Broker', 'TLS'],
      project: 'WiFi 802.11n, broker MQTT HiveMQ Cloud (TLS port 8883), Cloudflare Tunnel',
    },
    {
      name: 'Perception Layer',
      icon: '👁️',
      desc: 'Sensor, aktuator, mikrokontroler — interaksi fisik',
      detail: 'Lapisan paling bawah yang langsung bersentuhan dengan dunia fisik. Sensor mengubah fenomena fisik jadi data digital, aktuator melakukan kebalikannya.',
      tags: ['Sensor', 'Aktuator', 'MCU', 'ADC', 'GPIO'],
      project: 'IP Camera (RTSP), MQ-135 (gas), ESP32, speaker MAX98357A, LED merah',
    },
  ],
  '5': [
    {
      name: 'Business Layer',
      icon: '💼',
      desc: 'Model bisnis, regulasi, ROI',
      detail: 'Aspek non-teknis: kebijakan, regulasi (GDPR, UU PDP), kepatuhan industri, model monetisasi, dan analytics bisnis.',
      tags: ['Regulasi', 'Kebijakan K3', 'ROI', 'Audit', 'Compliance'],
      project: 'Kebijakan wajib catat pelanggaran APD, PIC sektor sebagai penanggung jawab, audit log',
    },
    {
      name: 'Application Layer',
      icon: '📊',
      desc: 'End-user app dan dashboard',
      detail: 'Aplikasi yang dilihat pengguna akhir. Bisa web, mobile, atau desktop.',
      tags: ['Dashboard', 'Web', 'Mobile App', 'API'],
      project: 'Next.js Dashboard, WhatsApp PIC, halaman violations, audit log',
    },
    {
      name: 'Processing Layer',
      icon: '🧠',
      desc: 'Cloud computing, AI/ML, database',
      detail: 'Tempat data di-aggregate, dianalisis (analytics atau AI), dan disimpan jangka panjang. Bisa di cloud, fog, atau edge.',
      tags: ['AI/ML', 'Database', 'Analytics', 'Cloud', 'Storage'],
      project: 'Backend Python YOLOv8 inference, SQLite via Prisma ORM, audit log append-only',
    },
    {
      name: 'Network Layer',
      icon: '📡',
      desc: 'Gateway, protokol, broker',
      detail: 'Mentransmisikan data antara perception dan processing layer.',
      tags: ['MQTT', 'WiFi', 'HTTPS', 'TLS', 'Broker'],
      project: 'HiveMQ broker, Cloudflare Tunnel, WiFi 802.11n',
    },
    {
      name: 'Perception Layer',
      icon: '👁️',
      desc: 'Sensor, aktuator',
      detail: 'Berinteraksi langsung dengan dunia fisik.',
      tags: ['Sensor', 'Aktuator', 'MCU'],
      project: 'IP Camera, MQ-135, ESP32, speaker, LED',
    },
  ],
};

function initArchStack() {
  const stack = document.getElementById('archStack');
  const detail = document.getElementById('archDetail');
  const buttons = document.querySelectorAll('.arch-btn');
  if (!stack) return;

  let currentMode = '3';

  function render(mode) {
    currentMode = mode;
    stack.innerHTML = '';
    ARCH_DATA[mode].forEach((layer, i) => {
      const el = document.createElement('div');
      el.className = 'arch-layer';
      el.dataset.idx = i;
      el.innerHTML = `
        <div class="arch-num">${ARCH_DATA[mode].length - i}</div>
        <div class="arch-info-block">
          <div class="arch-name">${layer.name}</div>
          <div class="arch-desc">${layer.desc}</div>
        </div>
        <div class="arch-icon-svg" style="font-size:1.6rem">${layer.icon}</div>
      `;
      el.addEventListener('click', () => showDetail(mode, i, el));
      stack.appendChild(el);
    });
    detail.innerHTML = '<div class="arch-detail-empty">Klik salah satu lapisan untuk melihat detailnya</div>';
  }

  function showDetail(mode, i, el) {
    document.querySelectorAll('.arch-layer').forEach(l => l.classList.remove('active'));
    el.classList.add('active');
    const layer = ARCH_DATA[mode][i];
    detail.innerHTML = `
      <div class="arch-detail-content">
        <h4>${layer.icon} ${layer.name}</h4>
        <p>${layer.detail}</p>
        <div class="arch-tags">
          ${layer.tags.map(t => `<span class="arch-tag">${t}</span>`).join('')}
        </div>
        <div class="arch-project"><strong>Di project SafeGuard APD:</strong> ${layer.project}</div>
      </div>
    `;
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render(btn.dataset.mode);
    });
  });

  render('3');
}

// ───────────── SENSOR NODE ANATOMY ─────────────
const NODE_INFO = {
  sensing: {
    title: 'Sensing Unit',
    role: 'Akuisisi sinyal dari dunia fisik',
    desc: 'Berisi sensor (transduser) dan ADC untuk mengubah fenomena fisik (gas, suhu, cahaya, getaran) menjadi nilai digital yang bisa diproses MCU.',
    impl: 'MQ-135 → AOUT → GPIO 34 (ADC1_CH6 12-bit) ESP32',
  },
  processing: {
    title: 'Processing Unit',
    role: 'Otak — komputasi dan kontrol',
    desc: 'Mikrokontroler dengan CPU, RAM, dan flash. Menjalankan firmware untuk membaca sensor, eksekusi logika, enkripsi, dan komunikasi. Resource-constrained: hemat clock, hemat memori.',
    impl: 'ESP32 dual-core Xtensa LX6, 240 MHz, 320 KB RAM, 4 MB flash',
  },
  comm: {
    title: 'Communication Unit',
    role: 'Transmisi data nirkabel',
    desc: 'Radio yang mengirim/menerima data ke node lain atau gateway. Pilihan tergantung use case: WiFi (bandwidth tinggi), ZigBee (mesh low-power), LoRa (long range), BLE (personal area).',
    impl: 'WiFi 802.11 b/g/n bawaan ESP32 + MQTT TLS port 8883',
  },
  power: {
    title: 'Power Unit',
    role: 'Sumber energi',
    desc: 'Constraint kritis WSN. Bisa baterai, energy harvesting (solar, vibrasi), atau adaptor wall. Manajemen daya menentukan lifetime node — strategi: duty cycling, deep sleep antar sampling.',
    impl: 'Adaptor wall 5V 1A (project ini bukan duty-cycle karena tidak portabel)',
  },
};

function initNodeAnatomy() {
  const parts = document.querySelectorAll('.node-part');
  const info = document.getElementById('nodeInfo');
  if (!parts.length || !info) return;

  function show(part) {
    parts.forEach(p => p.classList.remove('active'));
    part.classList.add('active');
    const data = NODE_INFO[part.dataset.part];
    info.innerHTML = `
      <div class="info-content">
        <h4>${data.title}</h4>
        <div class="info-role">${data.role}</div>
        <p class="info-desc">${data.desc}</p>
        <div class="info-impl">
          <div class="info-impl-label">Implementasi project</div>
          <div class="info-impl-text">${data.impl}</div>
        </div>
      </div>
    `;
  }

  parts.forEach(p => {
    p.addEventListener('mouseenter', () => show(p));
    p.addEventListener('click', () => show(p));
    p.addEventListener('focus', () => show(p));
  });
}

// ───────────── TOPOLOGY ANIMATIONS ─────────────
function initTopologyAnimations() {
  // pulses on each topology — periodic
  setupTopoPulse('topoStar', getStarPaths());
  setupTopoPulse('topoMesh', getMeshPaths());
  setupTopoPulse('topoTree', getTreePaths());
}

function setupTopoPulse(svgId, paths) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  const pulseGroup = svg.querySelector('.topo-pulses');
  if (!pulseGroup) return;

  function emit() {
    const path = paths[Math.floor(Math.random() * paths.length)];
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', '3');
    c.setAttribute('class', 'topo-pulse');
    pulseGroup.appendChild(c);

    const start = performance.now();
    const dur = 1200;

    function frame(t) {
      const p = (t - start) / dur;
      if (p >= 1) {
        c.remove();
        return;
      }
      // ease in out
      const eased = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
      const x = path.x1 + (path.x2 - path.x1) * eased;
      const y = path.y1 + (path.y2 - path.y1) * eased;
      c.setAttribute('cx', x);
      c.setAttribute('cy', y);
      c.setAttribute('opacity', Math.sin(p * Math.PI));
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  setInterval(emit, 700);
}

function getStarPaths() {
  const sink = { x: 100, y: 100 };
  const nodes = [
    { x: 100, y: 30 }, { x: 170, y: 65 }, { x: 170, y: 135 },
    { x: 100, y: 170 }, { x: 30, y: 135 }, { x: 30, y: 65 },
  ];
  return nodes.map(n => ({ x1: n.x, y1: n.y, x2: sink.x, y2: sink.y }));
}

function getMeshPaths() {
  const nodes = [
    [40, 50], [100, 50], [160, 50],
    [40, 100], [100, 100], [160, 100],
    [40, 150], [100, 150], [160, 150],
  ];
  // pick neighboring connections
  const pairs = [
    [0, 1], [1, 2], [3, 4], [4, 5], [6, 7], [7, 8],
    [0, 3], [1, 4], [2, 5], [3, 6], [4, 7], [5, 8],
  ];
  return pairs.map(([a, b]) => ({
    x1: nodes[a][0], y1: nodes[a][1],
    x2: nodes[b][0], y2: nodes[b][1],
  }));
}

function getTreePaths() {
  return [
    { x1: 20, y1: 160, x2: 50, y2: 90 },
    { x1: 80, y1: 160, x2: 50, y2: 90 },
    { x1: 120, y1: 160, x2: 150, y2: 90 },
    { x1: 180, y1: 160, x2: 150, y2: 90 },
    { x1: 50, y1: 90, x2: 100, y2: 30 },
    { x1: 150, y1: 90, x2: 100, y2: 30 },
  ];
}

// ───────────── MQTT PUB/SUB ─────────────
function initMQTT() {
  const track = document.getElementById('mqttTrack');
  const btnPub = document.getElementById('btnPub');
  const btnTele = document.getElementById('btnTele');
  if (!track) return;

  function spawnMsg(text, type = 'pub') {
    const msg = document.createElement('div');
    msg.className = 'mqtt-msg' + (type === 'tele' ? ' tele' : '');
    msg.textContent = text;
    track.appendChild(msg);
    setTimeout(() => msg.remove(), 1700);
  }

  btnPub?.addEventListener('click', () => {
    spawnMsg('🔒 AES-128 alarm payload', 'pub');
  });

  btnTele?.addEventListener('click', () => {
    spawnMsg('📊 gas: 387 (alert: false)', 'tele');
  });

  // auto pulse every now and then for ambient feel
  let auto = true;
  setInterval(() => {
    if (!auto) return;
    if (Math.random() > 0.5) spawnMsg('📡 heartbeat node 1', 'tele');
    else spawnMsg('🚨 violation: no_helmet', 'pub');
  }, 3500);
}

// ───────────── CHALLENGE CARDS ─────────────
const CHALLENGES = [
  {
    emoji: '🔋', num: '01', title: 'Energi Terbatas',
    desc: 'Node sering pakai baterai sulit di-charge. Komunikasi wireless paling boros: 1 byte transmit ≈ ribuan instruksi CPU.',
    solution: 'Duty cycling, energy harvesting (solar), low-power radio',
    project: 'Mitigasi: pakai adaptor 5V (trade-off: tidak portabel, butuh stop kontak)',
  },
  {
    emoji: '📶', num: '02', title: 'Bandwidth & Latensi',
    desc: 'Bandwidth wireless terbatas. Banyak node simultan kirim data → kongesti.',
    solution: 'Kompresi, agregasi di cluster head, kontrol QoS',
    project: 'Payload MQTT ringkas (~200 byte JSON terenkripsi), HiveMQ free 100 koneksi',
  },
  {
    emoji: '🛡️', num: '03', title: 'Reliability',
    desc: 'Node bisa rusak (overheat, baterai habis). Sinyal wireless terganggu interferensi.',
    solution: 'Redundansi, mesh networking, retry policy, heartbeat',
    project: 'Auto-reconnect WiFi/MQTT exponential backoff, heartbeat 60s, deteksi offline 90s',
  },
  {
    emoji: '🔐', num: '04', title: 'Keamanan',
    desc: 'Node fisik mudah diakses, jaringan wireless gampang disadap. Resource terbatas → kripto berat sulit.',
    solution: 'Enkripsi ringan (AES-128), TLS, secure boot, replay protection',
    project: 'AES-128-CBC payload + IV random, TLS 8883, root CA verify, NTP timestamp ±5 menit',
  },
  {
    emoji: '📈', num: '05', title: 'Skalabilitas',
    desc: 'WSN bisa puluhan sampai ribuan node. Routing dan addressing harus scale.',
    solution: 'Hierarki cluster, broker terdistribusi, naming scheme',
    project: 'Topik MQTT pakai {nodeId} di path — tinggal tambah ID baru',
  },
  {
    emoji: '🔀', num: '06', title: 'Heterogenitas',
    desc: 'Node beda merek, beda OS, beda protokol. Integrasi data sulit.',
    solution: 'Standar terbuka (MQTT, CoAP), middleware abstraction',
    project: 'IP Camera + ESP32 + browser → semua via standar (RTSP, MQTT, HTTPS)',
  },
  {
    emoji: '🕵️', num: '07', title: 'Privasi Data',
    desc: 'WSN sering pantau aktivitas manusia (kamera APD = data biometrik).',
    solution: 'Anonymization, retention policy, akses kontrol',
    project: 'RBAC 5 peran + 34 izin, audit log append-only, isolasi data per sektor',
  },
  {
    emoji: '⏱️', num: '08', title: 'Sinkronisasi Waktu',
    desc: 'Banyak aplikasi butuh timestamp akurat antar node. Clock drift di MCU murah cukup besar.',
    solution: 'NTP, PTP, beacon sync (TPSN, FTSP)',
    project: 'ESP32 sync NTP pool.ntp.org saat boot, dipakai validasi anti-replay pesan MQTT',
  },
  {
    emoji: '💰', num: '09', title: 'Biaya Deployment',
    desc: 'Pemasangan node di lokasi sulit (atap, area bahaya). Maintenance baterai dan kalibrasi sensor.',
    solution: 'OTA firmware update, remote diagnostics',
    project: 'Audio alarm di-stream HTTP dari VPS — bisa diganti tanpa re-flash ESP32',
  },
  {
    emoji: '🌡️', num: '10', title: 'Lingkungan Fisik',
    desc: 'Suhu ekstrim, kelembapan, debu mempengaruhi sensor. MQ-135 sensitif kelembapan.',
    solution: 'Housing IP-rated, kalibrasi periodik, kompensasi suhu/RH',
    project: 'MQ-135 warm-up 2-5 menit, threshold empiris 2200 ADC (kalibrasi per environment)',
  },
];

function initChallenges() {
  const grid = document.getElementById('challengeGrid');
  if (!grid) return;

  CHALLENGES.forEach((ch, idx) => {
    const card = document.createElement('div');
    card.className = 'challenge-card';
    card.tabIndex = 0;
    card.innerHTML = `
      <div class="challenge-inner">
        <div class="challenge-front">
          <div class="ch-num">${ch.num}</div>
          <div class="ch-emoji">${ch.emoji}</div>
          <h4>${ch.title}</h4>
          <div class="ch-hint">↻ Klik untuk solusi</div>
        </div>
        <div class="challenge-back">
          <h4>${ch.emoji} ${ch.title}</h4>
          <p class="ch-desc">${ch.desc}</p>
          <div class="ch-solution"><strong>Solusi:</strong> ${ch.solution}</div>
          <div class="ch-project"><strong>Project:</strong> ${ch.project}</div>
        </div>
      </div>
    `;
    card.addEventListener('click', () => card.classList.toggle('flipped'));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.classList.toggle('flipped');
      }
    });
    grid.appendChild(card);
  });
}

// ───────────── BLOCK DIAGRAM PROJECT ─────────────
const BD_INFO = {
  cam: {
    title: '📷 IP Camera',
    text: 'Sumber video utama untuk deteksi APD. Stream <code>RTSP H.264</code> via WiFi/Ethernet ke laptop. Resolution dan FPS bisa dikonfig per sektor.',
  },
  gas: {
    title: '🌫️ MQ-135 Gas Sensor',
    text: 'Sensor resistif untuk CO2, NH3, asap. ADC 12-bit di ESP32 baca <code>GPIO 34</code>. Threshold default 2200 dengan moving average 5 sample.',
  },
  user: {
    title: '👤 User Browser',
    text: 'PIC, supervisor, atau admin akses dashboard via HTTPS (Cloudflare Tunnel). Login dengan password Argon2id + opsional 2FA TOTP.',
  },
  py: {
    title: '🐍 Backend Python',
    text: 'Menjalankan YOLOv8 inference, WebSocket streaming ke browser, MQTT publisher/subscriber, dan integrasi WhatsApp via GoWA. <code>python ServiceAPDBackend.py</code>',
  },
  esp: {
    title: '🤖 ESP32 Firmware',
    text: 'Subscribe topik <code>apd/alarm/{nodeId}</code>, decrypt AES-128, putar audio via I2S, sample sensor gas, publish telemetri. State machine 4 status.',
  },
  nx: {
    title: '⚛️ Next.js Dashboard',
    text: 'Fullstack web app: halaman React + API <code>/api/*</code>. RBAC dengan 34 izin, CSRF protection, audit log, isolasi data per sektor.',
  },
  db: {
    title: '💾 SQLite Database',
    text: 'Storage internal Next.js via Prisma ORM. Tabel: User, Role, Node, Violation, AuditLog, Setting. Hanya diakses oleh Next.js, tidak langsung.',
  },
  wa: {
    title: '💬 WhatsApp PIC',
    text: 'Notifikasi pelanggaran APD dan gas alert ke PIC sektor via GoWA gateway (HTTP POST). Foto pelanggaran ikut dikirim sebagai bukti.',
  },
  alarm: {
    title: '🔊 Speaker + LED',
    text: 'MAX98357A I2S amplifier driving speaker 3W untuk audio alarm. LED merah GPIO 13 sebagai indikator visual gas alert.',
  },
  dash: {
    title: '📊 Live Dashboard',
    text: 'Halaman live monitor (frame video via WebSocket :8765), violations list, statistik, audit log, manajemen node dan user.',
  },
};

function initBlockDiagram() {
  const blocks = document.querySelectorAll('.bd-block');
  const info = document.getElementById('bdInfo');
  if (!blocks.length) return;

  function show(block) {
    blocks.forEach(b => b.style.borderColor = '');
    block.style.borderColor = 'var(--cyan)';
    const data = BD_INFO[block.dataset.bd];
    if (!data) return;
    info.innerHTML = `
      <div class="bd-info-content">
        <h4>${data.title}</h4>
        <p>${data.text}</p>
      </div>
    `;
  }

  blocks.forEach(b => {
    b.addEventListener('mouseenter', () => show(b));
    b.addEventListener('click', () => show(b));
  });
}

// ───────────── KUIS ─────────────
const QUIZ = [
  {
    q: 'WSN paling tepat didefinisikan sebagai…',
    options: [
      'Jaringan komputer kantor yang memakai WiFi',
      'Kumpulan sensor node terdistribusi yang terhubung wireless untuk memantau lingkungan',
      'Sistem cloud yang menyimpan data IoT',
      'Protokol komunikasi pengganti HTTP',
    ],
    a: 1,
    explain: 'WSN = Wireless Sensor Network. Ciri kuncinya: banyak node sensor, tersebar spasial, terhubung wireless, fokus pada sensing/monitoring.',
  },
  {
    q: 'Empat subsistem minimal sebuah sensor node WSN adalah:',
    options: [
      'Display, keyboard, CPU, RAM',
      'Sensing, processing, communication, power',
      'WiFi, Bluetooth, GPS, LTE',
      'Server, client, broker, gateway',
    ],
    a: 1,
    explain: 'Mnemonic: SPCP — Sensing (sensor + ADC), Processing (MCU), Communication (radio), Power (baterai).',
  },
  {
    q: 'Topologi yang dipakai di project SafeGuard APD adalah…',
    options: ['Mesh', 'Tree / cluster tree', 'Star', 'Ring'],
    a: 2,
    explain: 'Star: semua ESP32 langsung ke broker MQTT (sink) tanpa multi-hop. Sederhana, mudah debug.',
  },
  {
    q: 'Arsitektur IoT 3-lapisan dari bawah ke atas adalah:',
    options: [
      'Application → Network → Perception',
      'Perception → Network → Application',
      'Network → Perception → Application',
      'Cloud → Fog → Edge',
    ],
    a: 1,
    explain: 'Mnemonic: PNA — Perception (sensor) → Network (transport) → Application (dashboard).',
  },
  {
    q: 'Kelebihan MQTT dibanding HTTP untuk IoT adalah, kecuali:',
    options: [
      'Header overhead jauh lebih kecil',
      'Mendukung pub/sub native',
      'Latensi lebih rendah',
      'Selalu lebih aman karena pakai TLS by default',
    ],
    a: 3,
    explain: 'MQTT tidak otomatis pakai TLS — TLS harus dikonfigurasi (port 8883). Kelebihan utama: header kecil, pub/sub, hemat baterai.',
  },
  {
    q: 'QoS MQTT yang menjamin pesan sampai minimal sekali (boleh duplikat) adalah:',
    options: ['QoS 0', 'QoS 1', 'QoS 2', 'QoS 3'],
    a: 1,
    explain: 'QoS 0 = fire and forget. QoS 1 = at least once (ada ACK). QoS 2 = exactly once (4-way handshake). Project pakai QoS 1.',
  },
  {
    q: 'Salah satu tantangan utama WSN adalah energi terbatas. Strategi penghematan energi yang BUKAN solusi standar:',
    options: [
      'Duty cycling (tidur kebanyakan waktu)',
      'Data aggregation di cluster head',
      'Mempercepat clock CPU sampai maksimal',
      'Energy harvesting (solar)',
    ],
    a: 2,
    explain: 'Mempercepat clock justru lebih boros energi. Strategi yang benar: turunkan clock, duty cycle, agregasi data.',
  },
  {
    q: 'Edge computing artinya:',
    options: [
      'Komputasi dilakukan di server cloud yang jauh',
      'Komputasi dilakukan langsung di device atau dekat sumber data',
      'Data dikirim ke gateway pusat untuk diproses',
      'Pemrosesan paralel di banyak server cluster',
    ],
    a: 1,
    explain: 'Edge = di device. Fog = di server lokal/gateway. Cloud = di server jauh. Project: ESP32 = edge, laptop YOLOv8 = fog.',
  },
  {
    q: 'Anti replay attack pada komunikasi MQTT di project diimplementasikan dengan:',
    options: [
      'Membatasi jumlah pesan per detik',
      'Validasi timestamp pesan terhadap NTP ±5 menit',
      'Mengganti AES key setiap 1 jam',
      'Mengirim pesan via channel TCP terpisah',
    ],
    a: 1,
    explain: 'ESP32 sync NTP saat boot, lalu validasi timestamp setiap pesan. Jika selisih > 5 menit, pesan ditolak — attacker tidak bisa replay nanti.',
  },
  {
    q: 'Pernyataan yang BENAR tentang hubungan IoT dan WSN adalah:',
    options: [
      'IoT dan WSN sama persis',
      'IoT adalah subset dari WSN',
      'WSN adalah subset/fondasi dari banyak sistem IoT',
      'IoT dan WSN tidak ada hubungan sama sekali',
    ],
    a: 2,
    explain: 'WSN fokus sensing terdistribusi wireless. Begitu WSN terhubung internet dan ada layer aplikasi/cloud, ia menjadi sistem IoT lengkap.',
  },
];

function initQuiz() {
  const wrap = document.getElementById('quizWrap');
  const card = document.getElementById('quizCard');
  const counter = document.getElementById('quizCounter');
  const scoreEl = document.getElementById('quizScore');
  const progBar = document.getElementById('quizProgressBar');
  if (!card) return;

  let idx = 0;
  let score = 0;
  let answered = false;

  function render() {
    answered = false;
    if (idx >= QUIZ.length) {
      const pct = Math.round((score / QUIZ.length) * 100);
      let emoji = '🎉', verdict = 'Mantap!';
      if (pct < 50) { emoji = '💪'; verdict = 'Coba lagi, kamu pasti bisa!'; }
      else if (pct < 80) { emoji = '👍'; verdict = 'Lumayan, masih bisa diperbaiki'; }
      else if (pct < 100) { emoji = '🔥'; verdict = 'Keren!'; }

      card.innerHTML = `
        <div class="quiz-result">
          <div class="quiz-result-emoji">${emoji}</div>
          <h3>${verdict}</h3>
          <div class="quiz-result-score">Skor akhir: <strong>${score}</strong> / ${QUIZ.length} (${pct}%)</div>
          <button class="btn btn-primary" id="quizRestart">🔄 Ulangi Kuis</button>
        </div>
      `;
      progBar.style.width = '100%';
      counter.textContent = 'Selesai';
      scoreEl.textContent = `Skor: ${score} / ${QUIZ.length}`;
      document.getElementById('quizRestart').addEventListener('click', () => {
        idx = 0;
        score = 0;
        render();
      });
      return;
    }

    const q = QUIZ[idx];
    counter.textContent = `Soal ${idx + 1} / ${QUIZ.length}`;
    scoreEl.textContent = `Skor: ${score}`;
    progBar.style.width = `${((idx) / QUIZ.length) * 100}%`;

    card.innerHTML = `
      <div class="quiz-q">${idx + 1}. ${q.q}</div>
      <div class="quiz-options">
        ${q.options.map((opt, i) => `
          <button class="quiz-option" data-i="${i}">
            <span class="qo-letter">${String.fromCharCode(65 + i)}</span>
            <span>${opt}</span>
          </button>
        `).join('')}
      </div>
      <div class="quiz-feedback" id="quizFeedback"></div>
      <button class="btn btn-primary quiz-next" id="quizNext">Soal berikutnya →</button>
    `;

    card.querySelectorAll('.quiz-option').forEach(btn => {
      btn.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const chosen = parseInt(btn.dataset.i, 10);
        const isCorrect = chosen === q.a;
        if (isCorrect) score++;
        scoreEl.textContent = `Skor: ${score}`;

        card.querySelectorAll('.quiz-option').forEach((b, i) => {
          b.disabled = true;
          if (i === q.a) b.classList.add('correct');
          else if (i === chosen) b.classList.add('wrong');
        });

        const fb = document.getElementById('quizFeedback');
        fb.classList.add('show', isCorrect ? 'right' : 'wrong');
        fb.innerHTML = `<strong>${isCorrect ? '✅ Benar' : '❌ Belum tepat'}</strong>${q.explain}`;

        document.getElementById('quizNext').classList.add('show');
      });
    });

    document.getElementById('quizNext').addEventListener('click', () => {
      idx++;
      render();
    });
  }

  render();
}


// ───────────── WSN LAYER ARCHITECTURE ─────────────
const WSN_DATA = {
  stack: {
    layers: [
      {
        name: 'Application Layer',
        icon: '📊',
        desc: 'Logika aplikasi, query data, agregasi tingkat tinggi',
        detail: 'Lapisan paling atas yang berisi logika spesifik aplikasi: query data dari node, agregasi statistik, antarmuka ke user/aplikasi luar. Berisi protokol query seperti SMP, TADAP.',
        tags: ['SMP', 'TADAP', 'SQTL', 'Query', 'Aggregation'],
        project: 'YOLOv8 inference + dashboard Next.js + WhatsApp notifikasi PIC',
      },
      {
        name: 'Transport Layer',
        icon: '🚛',
        desc: 'End-to-end reliability dan flow control',
        detail: 'Menjamin pengiriman data antara source dan sink. Di WSN sering disederhanakan atau dilewati karena overhead TCP terlalu besar untuk node hemat energi. Banyak WSN hanya pakai UDP-like atau custom transport.',
        tags: ['CTP', 'Flush', 'PSFQ', 'Reliability'],
        project: 'Project pakai TCP+TLS (MQTT di atas TCP). Trade-off: aman tapi overhead besar — OK karena ESP32 punya power adaptor.',
      },
      {
        name: 'Network Layer',
        icon: '🛣️',
        desc: 'Routing antar node menuju sink',
        detail: 'Menentukan path multi-hop dari source ke sink. Ini lapisan paling banyak dipelajari di WSN karena harus energy-aware dan adaptif terhadap topologi yang berubah.',
        tags: ['LEACH', 'PEGASIS', 'AODV', 'Directed Diffusion', 'GPSR'],
        project: 'Project pakai topologi star — tidak butuh routing kompleks. Setiap ESP32 langsung ke broker.',
      },
      {
        name: 'Data Link / MAC Layer',
        icon: '🔗',
        desc: 'Akses media (CSMA/TDMA), framing, error control',
        detail: 'Mengatur akses ke radio channel agar tidak collision. Di WSN penting untuk hemat energi: protocol MAC seperti S-MAC, B-MAC mengizinkan node tidur saat tidak transmit.',
        tags: ['S-MAC', 'B-MAC', 'T-MAC', 'X-MAC', 'CSMA/CA', 'TDMA'],
        project: 'WiFi 802.11n pakai CSMA/CA bawaan. Tidak custom MAC karena ESP32 high-performance.',
      },
      {
        name: 'Physical Layer',
        icon: '📻',
        desc: 'Radio, modulasi, encoding bit ke sinyal',
        detail: 'Lapisan terbawah: konversi bit jadi gelombang radio. Pilih frekuensi (2.4GHz, 868MHz, 433MHz), modulasi (OQPSK, FSK, LoRa CSS), dan power TX. Trade-off: range vs power consumption.',
        tags: ['802.15.4', 'LoRa CSS', 'BLE PHY', 'WiFi PHY', 'OQPSK'],
        project: 'WiFi 802.11n di 2.4GHz, ~80mA TX. Alternatif: LoRa SX1276 untuk hemat energi.',
      },
    ],
    planes: [
      {
        name: 'Power Management Plane',
        icon: '🔋',
        detail: 'Mengelola konsumsi energi di setiap layer: kapan node tidur, level transmit power, sleep schedule. Cross-layer karena sleep MAC mempengaruhi routing dan transport.',
        tags: ['Sleep/Wake', 'Duty cycling', 'TX power adapt', 'Battery monitor'],
      },
      {
        name: 'Mobility Management Plane',
        icon: '📍',
        detail: 'Tracking pergerakan node (jika node mobile, bukan static). Update rute saat node pindah lokasi, handover antar cluster head.',
        tags: ['Position tracking', 'Handover', 'Geographic routing'],
      },
      {
        name: 'Task Management Plane',
        icon: '⚙️',
        detail: 'Distribusi task ke node sesuai kemampuan dan beban. Mana node yang sense, mana yang routing, mana yang sleep.',
        tags: ['Task allocation', 'Load balancing', 'Role assignment'],
      },
    ],
  },
  ref: {
    tiers: [
      {
        num: 'III',
        name: 'Application / User Layer',
        icon: '🖥️',
        sub: 'End-user interface, server, storage',
        detail: 'Tier paling atas: tempat pengguna akhir berinteraksi dengan data. Berisi server backend, database, dashboard, mobile app, sistem notifikasi.',
        tags: ['Dashboard', 'Database', 'Mobile App', 'Analytics'],
        project: 'Next.js dashboard, SQLite via Prisma, WhatsApp PIC, halaman violations',
      },
      {
        num: 'II',
        name: 'Network / Routing Layer',
        icon: '📡',
        sub: 'Sink, gateway, multi-hop routing',
        detail: 'Tier tengah: sink/gateway yang mengumpulkan data dari sensor field dan meneruskannya ke server. Bisa juga melakukan agregasi atau filtering di gateway (edge computing).',
        tags: ['Sink', 'Gateway', 'Routing', 'Aggregation', 'MQTT Broker'],
        project: 'Broker HiveMQ Cloud + Cloudflare Tunnel (edge gateway untuk dashboard)',
      },
      {
        num: 'I',
        name: 'Sensor Field / Source Layer',
        icon: '🌐',
        sub: 'Sensor nodes — akuisisi data fisik',
        detail: 'Tier paling bawah: kumpulan sensor node yang tersebar di area monitoring. Setiap node berisi sensor + MCU + radio + power. Melakukan sensing dan transmit ke sink.',
        tags: ['Sensor Node', 'MCU', 'Radio TX', 'Battery'],
        project: 'ESP32 + MQ-135 di tiap sektor + IP Camera RTSP',
      },
    ],
  },
};

function initWsnLayer() {
  const main = document.getElementById('wsnArchMain');
  const side = document.getElementById('wsnArchSide');
  const detail = document.getElementById('wsnDetail');
  const buttons = document.querySelectorAll('.wsn-layer-btn');
  if (!main) return;

  let mode = 'stack';

  function renderStack() {
    main.innerHTML = WSN_DATA.stack.layers.map((l, i) => `
      <div class="wsn-layer" data-type="layer" data-idx="${i}">
        <div class="wsn-layer-num">${5 - i}</div>
        <div class="wsn-layer-text">
          <div class="wsn-layer-name">${l.name}</div>
          <div class="wsn-layer-desc">${l.desc}</div>
        </div>
        <div class="wsn-layer-icon">${l.icon}</div>
      </div>
    `).join('');

    side.innerHTML = WSN_DATA.stack.planes.map((p, i) => `
      <div class="wsn-side-plane" data-type="plane" data-idx="${i}">
        <span>${p.icon} ${p.name}</span>
      </div>
    `).join('');

    side.style.display = 'flex';
    bindWsn();
  }

  function renderRef() {
    main.innerHTML = WSN_DATA.ref.tiers.map((t, i) => `
      <div class="wsn-tier wsn-tier-${i + 1}" data-type="tier" data-idx="${i}">
        <div class="wsn-tier-icon">${t.icon}</div>
        <div class="wsn-tier-name">Tier ${t.num} · ${t.name}</div>
        <div class="wsn-tier-sub">${t.sub}</div>
      </div>
      ${i < WSN_DATA.ref.tiers.length - 1 ? '<div class="wsn-tier-arrow">▲</div>' : ''}
    `).join('');

    side.innerHTML = '';
    side.style.display = 'none';
    bindWsn();
  }

  function bindWsn() {
    document.querySelectorAll('.wsn-layer, .wsn-side-plane, .wsn-tier').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.wsn-layer, .wsn-side-plane, .wsn-tier').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
        const t = el.dataset.type;
        const i = parseInt(el.dataset.idx, 10);
        let data;
        if (t === 'layer') data = WSN_DATA.stack.layers[i];
        else if (t === 'plane') data = WSN_DATA.stack.planes[i];
        else if (t === 'tier') data = WSN_DATA.ref.tiers[i];
        if (!data) return;

        const projectHtml = data.project ? `<div class="arch-project"><strong>Di project:</strong> ${data.project}</div>` : '';
        detail.innerHTML = `
          <div class="arch-detail-content">
            <h4>${data.icon} ${data.name}</h4>
            <p>${data.detail}</p>
            <div class="arch-tags">${data.tags.map(x => `<span class="arch-tag">${x}</span>`).join('')}</div>
            ${projectHtml}
          </div>
        `;
      });
    });
  }

  buttons.forEach(b => {
    b.addEventListener('click', () => {
      buttons.forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      mode = b.dataset.wsnMode;
      detail.innerHTML = '<div class="arch-detail-empty">Klik salah satu layer atau plane untuk melihat detailnya</div>';
      if (mode === 'stack') renderStack();
      else renderRef();
    });
  });

  renderStack();
}
