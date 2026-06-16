// ═══════════════════════════════════════════════════════════════
//  Studi Kasus Data — 6 skenario soal UAS dengan jawaban lengkap
//  Format: scenario, analysis, blockDiagram, topology, hardware,
//          justification, challenges
// ═══════════════════════════════════════════════════════════════

const CASES = [
  // ────────────── KASUS 1 ──────────────
  {
    id: 'smart-farming',
    emoji: '🌾',
    title: 'Smart Farming — Monitoring Kelembapan Tanah dan Irigasi Otomatis',
    desc: 'Petani ingin pantau kelembapan tanah di lahan 5 hektar dan otomatis menyalakan pompa air saat tanah kering.',
    tags: ['IoT', 'WSN', 'Block Diagram', 'Topologi'],
    type: ['t-iot', 't-wsn', 't-block', 't-topo'],

    scenario: `
      <p><strong>Soal:</strong> Sebuah lahan pertanian seluas 5 hektar (10 zona tanam) ingin dipasang sistem IoT/WSN untuk:</p>
      <ul>
        <li>Memantau kelembapan tanah secara real-time tiap zona</li>
        <li>Otomatis menyalakan pompa air saat kelembapan turun di bawah ambang batas</li>
        <li>Petani bisa lihat data dari smartphone</li>
        <li>Lokasi outdoor jauh dari listrik PLN, koneksi internet via 4G di gudang</li>
      </ul>
      <p>Rancang arsitektur sistem, gambar block diagram, dan tentukan topologi WSN yang sesuai.</p>
    `,

    analysis: {
      tujuan: 'Otomatisasi irigasi berbasis kelembapan tanah dengan monitoring jarak jauh',
      input: ['Kelembapan tanah per zona (sensor capacitive soil moisture)', 'Suhu &amp; kelembapan udara (DHT22)', 'Status manual override dari smartphone'],
      processing: ['Baca sensor tiap 5 menit', 'Bandingkan dengan threshold per zona', 'Aktivasi relay pompa', 'Kirim data ke gateway → cloud', 'Aplikasi mobile menerima notifikasi'],
      output: ['Pompa air ON/OFF (relay)', 'LED status per zona', 'Notifikasi smartphone (push notification)', 'Grafik kelembapan harian di dashboard'],
    },

    blockDiagram: {
      input: [
        { e: '🌱', t: 'Sensor Kelembapan Tanah', s: 'Capacitive · per zona' },
        { e: '🌡️', t: 'Sensor Suhu Udara', s: 'DHT22 · 1 unit' },
        { e: '📱', t: 'Manual Override', s: 'Dari aplikasi mobile' },
      ],
      processing: [
        { e: '🤖', t: 'ESP32 Node', s: 'Baca ADC + control relay' },
        { e: '📡', t: 'Gateway LoRa', s: 'Aggregator multi-node' },
        { e: '☁️', t: 'Cloud Server', s: 'MQTT broker + DB' },
        { e: '💾', t: 'Database', s: 'TimescaleDB / InfluxDB' },
      ],
      output: [
        { e: '💧', t: 'Pompa Air', s: 'Via relay 5V' },
        { e: '💡', t: 'LED Status', s: 'Per zona' },
        { e: '📲', t: 'App Mobile', s: 'Notifikasi + grafik' },
      ],
      arrowIn: 'LoRa 915MHz',
      arrowOut: 'MQTT + HTTPS',
    },

    topology: {
      pick: 'Star (LoRa)',
      svg: 'star',
      reason: `Pilih <strong>topologi star</strong> dengan transport <strong>LoRa</strong> karena:
      <ul>
        <li>Lahan luas 5 hektar = jangkauan 200-500m antar zona, LoRa cocok (sampai 2km LoS)</li>
        <li>Kelembapan tanah berubah lambat → sampling 5 menit cukup, tidak butuh bandwidth tinggi</li>
        <li>Node tenaga surya → harus hemat energi → LoRa ultra-low-power</li>
        <li>Star sederhana: 1 gateway di gudang menerima semua node</li>
        <li>Tidak butuh mesh karena gateway bisa cover semua zona dengan antena yang cukup tinggi</li>
      </ul>`,
    },

    hardware: [
      { name: 'ESP32 + LoRa SX1278', qty: '10', note: 'Per zona, dibungkus enclosure IP66' },
      { name: 'Capacitive Soil Moisture v2', qty: '10', note: 'Tahan air vs resistive' },
      { name: 'DHT22', qty: '1', note: 'Suhu/RH udara di tengah lahan' },
      { name: 'Relay 5V SSR', qty: '10', note: 'Trigger pompa per zona' },
      { name: 'Solar panel 5W + LiPo 18650', qty: '10', note: 'Catu daya off-grid per node' },
      { name: 'LoRa Gateway (SX1302)', qty: '1', note: 'Di gudang, terhubung 4G' },
      { name: 'Pompa air submersible 12V', qty: '10', note: 'Tergantung debit zona' },
    ],

    justification: `
      <ul>
        <li><strong>ESP32 vs Arduino:</strong> ESP32 ada deep sleep + LoRa support, hemat baterai 6 bulan dengan duty cycling.</li>
        <li><strong>LoRa vs WiFi:</strong> WiFi range 30m + boros (~100mA), LoRa range 2km + ultra hemat (~20mA TX, &lt;1mA sleep).</li>
        <li><strong>Capacitive vs Resistive sensor:</strong> Capacitive tahan korosi → cocok untuk kontak tanah lembap jangka panjang.</li>
        <li><strong>Cloud + MQTT:</strong> Gateway forward MQTT ke cloud (HiveMQ/AWS IoT) supaya app mobile bisa subscribe real-time.</li>
        <li><strong>Manual override:</strong> Aplikasi publish ke topic <code>farm/control/{zoneId}</code> → ESP32 listen → bypass otomasi.</li>
      </ul>
    `,

    challenges: [
      { title: 'Energi off-grid', text: 'Tidak ada listrik PLN di lapangan.', mit: 'Solar panel + baterai LiPo + duty cycling 5 menit (sleep 99% waktu).' },
      { title: 'Cuaca buruk', text: 'Hujan, debu, panas terik bisa rusak elektronik.', mit: 'Enclosure IP66, sensor kalibrasi ulang per musim.' },
      { title: 'Animal damage', text: 'Tikus/serangga gigit kabel.', mit: 'Pakai pipa PVC, kabel terpendam 30cm.' },
      { title: 'Range terbatas', text: 'Antar zona &gt;500m bisa drop signal LoRa.', mit: 'Antena gateway tinggi 6m + spreading factor SF10.' },
      { title: 'Konektivitas internet', text: 'Sinyal 4G di pedesaan tidak stabil.', mit: 'Buffer data lokal di gateway, sync saat sinyal kembali.' },
    ],
  },

  // ────────────── KASUS 2 ──────────────
  {
    id: 'smart-parking',
    emoji: '🚗',
    title: 'Smart Parking Mall — Sensor per Slot &amp; Display Outdoor',
    desc: 'Mall ingin pasang sistem parkir pintar: tiap slot ada sensor, display di pintu masuk menunjukkan jumlah slot kosong.',
    tags: ['IoT', 'WSN', 'Block Diagram'],
    type: ['t-iot', 't-wsn', 't-block'],

    scenario: `
      <p><strong>Soal:</strong> Sebuah mall ingin sistem parkir pintar dengan spec:</p>
      <ul>
        <li>200 slot parkir indoor di basement</li>
        <li>Tiap slot ada sensor untuk deteksi mobil (kosong/terisi)</li>
        <li>Display LED di pintu masuk menunjukkan jumlah slot kosong</li>
        <li>Aplikasi mobile menampilkan peta slot kosong real-time</li>
        <li>Server di ruang IT lantai 1, ada WiFi mall</li>
      </ul>
      <p>Buatkan rancangan arsitektur, block diagram (input-process-output), dan tentukan komponen yang dibutuhkan.</p>
    `,

    analysis: {
      tujuan: 'Visualisasi real-time slot parkir kosong untuk pengguna mall',
      input: ['Sensor ultrasonik HC-SR04 (deteksi kendaraan tiap slot)', 'Sensor RFID di gate (opsional, identifikasi member)', 'Tap user di mobile app (booking slot)'],
      processing: ['ESP32 baca sensor tiap 1 detik', 'Publish ke MQTT broker lokal', 'Server backend agregasi data 200 sensor', 'Hitung slot kosong per zona', 'API REST untuk mobile app'],
      output: ['Display LED 7-segment besar di pintu masuk (jumlah kosong)', 'Indikator LED hijau/merah per slot (di plafon)', 'Peta interaktif di app mobile', 'Database history occupancy'],
    },

    blockDiagram: {
      input: [
        { e: '📏', t: 'Ultrasonik HC-SR04', s: '200 sensor (per slot)' },
        { e: '🎫', t: 'RFID Reader', s: 'Di gate masuk' },
        { e: '📱', t: 'User App Tap', s: 'Booking/check slot' },
      ],
      processing: [
        { e: '🤖', t: 'ESP32 Node', s: '20 sub-controller (10 slot/node)' },
        { e: '📡', t: 'MQTT Broker', s: 'Mosquitto di server lokal' },
        { e: '🖥️', t: 'Backend API', s: 'Node.js + Express' },
        { e: '💾', t: 'Database', s: 'PostgreSQL (slot status + history)' },
      ],
      output: [
        { e: '🔢', t: 'Display 7-Segment', s: 'Total kosong di pintu masuk' },
        { e: '💡', t: 'LED Slot', s: 'Hijau (kosong) / merah (terisi)' },
        { e: '🗺️', t: 'Mobile App Map', s: 'Real-time peta slot' },
      ],
      arrowIn: 'WiFi 802.11n',
      arrowOut: 'MQTT + REST API',
    },

    topology: {
      pick: 'Star (WiFi via AP mall)',
      svg: 'star',
      reason: `Pilih <strong>topologi star</strong> via WiFi mall karena:
      <ul>
        <li>Indoor basement = jangkauan WiFi cukup dengan beberapa AP</li>
        <li>Mall sudah punya infrastruktur WiFi enterprise</li>
        <li>Tidak butuh mesh karena AP coverage sudah cukup</li>
        <li>20 ESP32 sub-controller (1 untuk 10 slot) lebih efisien daripada 200 ESP32 individual</li>
        <li>WiFi punya bandwidth tinggi untuk update real-time 200 sensor tiap detik</li>
      </ul>`,
    },

    hardware: [
      { name: 'ESP32 DevKit', qty: '20', note: '1 ESP32 handle 10 slot via multiplexer' },
      { name: 'HC-SR04 Ultrasonic', qty: '200', note: 'Tiap slot, dipasang di plafon' },
      { name: 'CD74HC4067 Multiplexer 16ch', qty: '20', note: 'Untuk handle banyak sensor per ESP32' },
      { name: 'LED 5mm hijau/merah', qty: '400', note: '2 LED per slot' },
      { name: 'Display 7-Segment besar 4 digit', qty: '2', note: 'Pintu masuk basement' },
      { name: 'RFID Reader RC522', qty: '4', note: 'Di tiap pintu masuk gate' },
      { name: 'Server (existing IT room)', qty: '1', note: 'Mosquitto + Node.js + PostgreSQL' },
      { name: 'AP WiFi (existing)', qty: '-', note: 'Pakai infrastruktur mall' },
    ],

    justification: `
      <ul>
        <li><strong>Kenapa 1 ESP32 untuk 10 slot:</strong> Hemat biaya, ESP32 punya banyak GPIO + ADC, bisa pakai multiplexer untuk skalabel.</li>
        <li><strong>HC-SR04 vs sensor magnetik:</strong> HC-SR04 lebih murah dan akurat untuk slot indoor; magnetik mahal dan butuh kalibrasi presisi.</li>
        <li><strong>MQTT lokal vs cloud:</strong> Mosquitto lokal = latensi rendah (&lt;10ms), tidak bergantung internet untuk display real-time.</li>
        <li><strong>PostgreSQL vs MongoDB:</strong> Data structured (slot_id, status, timestamp), PostgreSQL cocok untuk query agregasi (occupancy rate per jam).</li>
        <li><strong>Topik MQTT:</strong> <code>parking/slot/{floor}/{slotId}</code> → mobile app subscribe ke wildcard <code>parking/slot/B1/+</code>.</li>
      </ul>
    `,

    challenges: [
      { title: 'False positive HC-SR04', text: 'Bayangan/refleksi bisa trigger sensor.', mit: 'Threshold jarak tegas + filter moving average 3 sample.' },
      { title: 'Many connection', text: '20 ESP32 + ratusan client mobile bebani broker.', mit: 'Mosquitto skala 10K connection. Mobile pakai REST API + websocket bukan langsung MQTT.' },
      { title: 'WiFi blackspot', text: 'Sudut tertentu basement signal lemah.', mit: 'Audit + tambah AP mesh atau ESP32 yang signal lemah pakai LAN ethernet.' },
      { title: 'Listrik mati', text: 'Sistem mati saat blackout.', mit: 'UPS server + ESP32 PoE, display beralih ke offline mode.' },
    ],
  },

  // ────────────── KASUS 3 ──────────────
  {
    id: 'forest-fire',
    emoji: '🔥',
    title: 'Forest Fire Detection — Sensor Asap di Hutan Lindung',
    desc: 'Pemerintah ingin deteksi dini kebakaran hutan: 50 sensor tersebar di area 10 km², notifikasi ke BPBD.',
    tags: ['WSN', 'Mesh Topology', 'Block Diagram'],
    type: ['t-wsn', 't-topo', 't-block'],

    scenario: `
      <p><strong>Soal:</strong> Hutan lindung seluas 10 km² rawan kebakaran perlu sistem deteksi dini:</p>
      <ul>
        <li>50 node sensor tersebar tiap 400-500 meter</li>
        <li>Tiap node punya sensor asap, suhu, dan kelembapan</li>
        <li>Tidak ada listrik dan internet di lapangan</li>
        <li>Saat alert, kirim koordinat node ke BPBD via SMS dan dashboard online</li>
        <li>Sistem harus tetap jalan saat satu node rusak</li>
      </ul>
      <p>Rancang topologi WSN yang sesuai dan jelaskan alasan pilihan, lengkap dengan block diagram.</p>
    `,

    analysis: {
      tujuan: 'Deteksi dini kebakaran hutan dengan jaringan sensor wireless tahan banting',
      input: ['Sensor asap MQ-2/MQ-7', 'Sensor suhu LM35', 'Sensor kelembapan DHT22', 'Module GPS NEO-6M (untuk koordinat node)'],
      processing: ['Sensor sampling tiap 30 detik', 'Local edge analytics (deteksi anomali)', 'Mesh routing antar node ke gateway', 'Gateway forward via 4G/satellite ke cloud', 'Cloud server agregasi + decision engine'],
      output: ['SMS ke nomor BPBD (via Twilio/4G modem)', 'Pin lokasi di dashboard maps', 'Sirine + lampu peringatan di pos jaga', 'Email notifikasi resmi'],
    },

    blockDiagram: {
      input: [
        { e: '🌫️', t: 'Sensor Asap MQ-2', s: '50 node · semi-quantitative' },
        { e: '🌡️', t: 'Sensor Suhu LM35', s: 'Deteksi spike suhu' },
        { e: '💧', t: 'DHT22', s: 'Kelembapan udara' },
        { e: '📍', t: 'GPS NEO-6M', s: 'Koordinat node' },
      ],
      processing: [
        { e: '🤖', t: 'ESP32 Node + LoRa', s: 'Mesh routing capable' },
        { e: '📡', t: 'LoRa Gateway 4G', s: 'Bridge ke cloud' },
        { e: '☁️', t: 'Cloud Server', s: 'AWS IoT / Thingspeak' },
        { e: '🧠', t: 'Decision Engine', s: 'Threshold + ML anomaly' },
        { e: '💾', t: 'TimescaleDB', s: 'Time-series data' },
      ],
      output: [
        { e: '📱', t: 'SMS BPBD', s: 'Twilio API · alert + lat/lon' },
        { e: '🗺️', t: 'Dashboard Map', s: 'Web GIS · pin lokasi' },
        { e: '🚨', t: 'Sirine Pos Jaga', s: 'Local audio alert' },
        { e: '📧', t: 'Email Alert', s: 'Laporan resmi' },
      ],
      arrowIn: 'LoRa Mesh',
      arrowOut: 'MQTT + HTTPS + SMS',
    },

    topology: {
      pick: 'Mesh (LoRa-Mesh)',
      svg: 'mesh',
      reason: `Pilih <strong>topologi mesh</strong> dengan LoRa karena:
      <ul>
        <li><strong>Redundansi</strong>: Kalau 1 node rusak (tertimpa pohon, hewan), node tetangga jadi router → data tetap sampai gateway. Star tidak punya ini.</li>
        <li><strong>Jangkauan luas</strong>: 10 km² area, mesh multi-hop bisa cover semua tanpa harus jangkau gateway langsung.</li>
        <li><strong>Self-healing</strong>: Topologi adaptif, auto-discover route saat ada perubahan.</li>
        <li><strong>Hemat energi gateway</strong>: Hanya 1-2 gateway yang konek 4G (paling boros), node lain cuma LoRa-to-LoRa.</li>
        <li><strong>Skalabel</strong>: Tinggal tambah node, mesh otomatis adjust routing.</li>
      </ul>
      Trade-off: routing kompleks + latensi sedikit naik per hop. OK karena alert kebakaran latensi 1-2 detik masih dalam toleransi.`,
    },

    hardware: [
      { name: 'ESP32 + LoRa SX1276 + GPS', qty: '50', note: 'Per node + enclosure tahan cuaca' },
      { name: 'MQ-2 Smoke Sensor', qty: '50', note: 'Sensitif asap rokok &amp; kebakaran' },
      { name: 'DHT22', qty: '50', note: 'Suhu + RH (kebakaran kelembapan turun drastis)' },
      { name: 'Solar panel 10W + LiPo 4400mAh', qty: '50', note: 'Off-grid 24/7' },
      { name: 'LoRa Gateway 4G (RAK7240)', qty: '2', note: 'Redundansi gateway' },
      { name: 'Modem 4G/Satellite', qty: '2', note: 'Backup link' },
      { name: 'Cloud Server (AWS IoT)', qty: '1', note: 'Subscribe + decision' },
    ],

    justification: `
      <ul>
        <li><strong>LoRa-Mesh vs ZigBee-Mesh:</strong> LoRa range jauh lebih panjang (km vs ratusan meter), cocok area hutan luas.</li>
        <li><strong>Kenapa 2 gateway:</strong> Redundansi → kalau 1 gateway mati (banjir, vandalisme), sistem tetap operasional.</li>
        <li><strong>Local edge analytics:</strong> ESP32 bisa pre-filter data, hanya kirim saat anomali → hemat bandwidth + baterai.</li>
        <li><strong>SMS via Twilio:</strong> Lebih reliable dari email saat darurat, tidak bergantung internet penerima.</li>
        <li><strong>Threshold + ML:</strong> Threshold tidak cukup (false positive dari pembakaran lahan legal), ML bisa belajar pola baseline.</li>
      </ul>
    `,

    challenges: [
      { title: 'Hewan/cuaca', text: 'Hujan badai, hewan liar bisa rusak node.', mit: 'Enclosure IP67, mounting di pohon ketinggian 4m, lapisan anti-rodent.' },
      { title: 'False positive', text: 'Pembakaran lahan legal trigger alarm.', mit: 'ML anomaly detection + cross-check antar node sebelum alert (3+ node trigger).' },
      { title: 'Baterai habis', text: 'Solar panel tertutup salju/daun.', mit: 'Battery capacity 7 hari + heartbeat untuk deteksi node mati.' },
      { title: 'Routing failure', text: 'Banyak node mati simultan (kebakaran berantai) bisa putus jaringan.', mit: 'Backup gateway via satellite (Iridium SBD untuk emergency).' },
      { title: 'Vandalisme', text: 'Penebang liar rusak sensor disengaja.', mit: 'Tamper detection (accelerometer), alert + tracking lokasi terakhir.' },
    ],
  },

  // ────────────── KASUS 4 ──────────────
  {
    id: 'cold-chain',
    emoji: '❄️',
    title: 'Cold Chain Vaksin — Monitoring Suhu Truk Distribusi',
    desc: 'Distribusi vaksin butuh suhu 2-8°C. Pantau suhu real-time selama perjalanan + alert jika out-of-range.',
    tags: ['IoT', 'Block Diagram', 'Mobile'],
    type: ['t-iot', 't-block'],

    scenario: `
      <p><strong>Soal:</strong> Perusahaan farmasi distribusi vaksin lewat truk berpendingin:</p>
      <ul>
        <li>Suhu wajib 2-8°C selama transportasi (10 truk armada)</li>
        <li>Tiap truk dipantau real-time + log untuk audit BPOM</li>
        <li>Alert ke supir + manajer jika suhu out-of-range &gt;5 menit</li>
        <li>Lokasi truk juga harus terlihat di dashboard</li>
        <li>Truk bergerak antar kota dengan koneksi seluler bervariasi</li>
      </ul>
      <p>Rancang sistem IoT lengkap dengan block diagram dan justifikasi pilihan teknologi.</p>
    `,

    analysis: {
      tujuan: 'Monitoring real-time suhu cold chain + GPS tracking + audit log',
      input: ['Sensor suhu DS18B20 dalam kompartemen pendingin', 'GPS NEO-M8N (lokasi truk)', 'Sensor pintu (magnetic switch)', 'Tombol panic supir'],
      processing: ['Microcontroller di tiap truk (ESP32)', 'Sampling suhu tiap 30 detik', 'Buffer data lokal saat sinyal hilang', 'Upload via 4G ke cloud', 'Backend agregasi + decision engine', 'Audit log immutable'],
      output: ['Display LCD di kabin supir (suhu real-time)', 'Buzzer warning suhu out-of-range', 'Push notification ke app manajer', 'Dashboard web (peta + grafik suhu)', 'PDF report harian untuk BPOM'],
    },

    blockDiagram: {
      input: [
        { e: '🌡️', t: 'DS18B20 Probe', s: '3 sensor per truk (atas/tengah/bawah)' },
        { e: '📍', t: 'GPS NEO-M8N', s: 'Lokasi tracking' },
        { e: '🚪', t: 'Door Switch', s: 'Deteksi pintu terbuka' },
        { e: '🆘', t: 'Panic Button', s: 'Supir laporan masalah' },
      ],
      processing: [
        { e: '🤖', t: 'ESP32 Truk', s: 'Per kendaraan + buffer SD' },
        { e: '📶', t: '4G Module', s: 'SIM7600 LTE Cat-4' },
        { e: '☁️', t: 'Cloud Backend', s: 'Node.js + MQTT' },
        { e: '💾', t: 'Database', s: 'TimescaleDB + audit log' },
        { e: '📨', t: 'Notification Engine', s: 'FCM + SMS gateway' },
      ],
      output: [
        { e: '📺', t: 'LCD Kabin', s: '20×4 char · suhu live' },
        { e: '🔊', t: 'Buzzer Warning', s: 'Out-of-range alert' },
        { e: '📱', t: 'App Manajer', s: 'Live map + grafik' },
        { e: '📄', t: 'PDF Audit BPOM', s: 'Laporan harian otomatis' },
      ],
      arrowIn: '4G LTE',
      arrowOut: 'MQTT + REST + FCM',
    },

    topology: {
      pick: 'Star (per truk → cloud)',
      svg: 'star',
      reason: `Pilih <strong>star topology</strong> via 4G karena:
      <ul>
        <li>Tiap truk = 1 node mandiri, tidak butuh komunikasi antar truk</li>
        <li>Truk bergerak terus, tidak ada infrastruktur lokal yang tetap</li>
        <li>4G LTE coverage Indonesia sudah cukup luas di jalur distribusi</li>
        <li>Cloud sebagai sink terpusat = lokasi storage + dashboard manajer</li>
      </ul>
      Yang penting: <strong>buffer lokal di SD card</strong> saat sinyal 4G hilang (terowongan, daerah remote), sync otomatis saat sinyal kembali.`,
    },

    hardware: [
      { name: 'ESP32 + SIM7600 4G', qty: '10', note: 'Per truk, mounting di kabin' },
      { name: 'DS18B20 Waterproof Probe', qty: '30', note: '3 per truk (multi-point monitoring)' },
      { name: 'GPS NEO-M8N', qty: '10', note: 'Akurasi 2.5m' },
      { name: 'Magnetic Door Switch', qty: '10', note: 'Compartment pendingin' },
      { name: 'Buzzer 5V + LCD 20×4', qty: '10', note: 'In-cabin feedback' },
      { name: 'MicroSD 16GB', qty: '10', note: 'Buffer offline + audit log' },
      { name: 'Cloud Server (existing)', qty: '1', note: 'Backend Node.js + DB' },
    ],

    justification: `
      <ul>
        <li><strong>DS18B20 vs DHT22:</strong> DS18B20 akurasi ±0.5°C cocok untuk vaksin, DHT22 ±2°C terlalu kasar.</li>
        <li><strong>3 sensor per truk:</strong> Suhu kompartemen tidak homogen, multi-point sensing untuk akurasi.</li>
        <li><strong>Buffer SD lokal:</strong> Wajib untuk audit BPOM — data tidak boleh hilang meskipun sinyal hilang.</li>
        <li><strong>MQTT QoS 1:</strong> At-least-once delivery → boleh duplikat (filtered di server) tapi tidak boleh hilang.</li>
        <li><strong>Audit log immutable:</strong> Append-only DB + hash chain untuk anti-tamper (regulasi farmasi).</li>
        <li><strong>Threshold 5 menit:</strong> Spike sesaat normal (buka pintu), alert hanya jika sustained &gt;5 menit.</li>
      </ul>
    `,

    challenges: [
      { title: 'Sinyal hilang', text: 'Terowongan, daerah remote tidak ada 4G.', mit: 'Buffer SD card, sync saat sinyal kembali. Tetap log lokal.' },
      { title: 'Vibrasi truk', text: 'Konektor sensor longgar.', mit: 'Solder + heat shrink, mounting bracket tahan getaran.' },
      { title: 'Kalibrasi drift', text: 'DS18B20 akurasi turun seiring waktu.', mit: 'Kalibrasi 6 bulan sekali + cross-check 3 sensor.' },
      { title: 'Audit compliance', text: 'BPOM butuh log akurat &amp; tidak bisa diubah.', mit: 'Append-only DB + checksum + signed log per truk.' },
      { title: 'Power supply', text: 'Truk start-stop, voltage tidak stabil.', mit: 'DC-DC buck converter + supercapacitor untuk shutdown gracefully.' },
    ],
  },

  // ────────────── KASUS 5 ──────────────
  {
    id: 'air-quality',
    emoji: '🏭',
    title: 'Air Quality Monitoring — Kawasan Industri 4 Pabrik',
    desc: 'Pemerintah ingin pantau kualitas udara di sekitar kawasan industri (PM2.5, CO, NO₂) + warning untuk warga.',
    tags: ['IoT', 'WSN', 'Block Diagram', 'Topologi'],
    type: ['t-iot', 't-wsn', 't-block', 't-topo'],

    scenario: `
      <p><strong>Soal:</strong> Kawasan industri dengan 4 pabrik dan permukiman warga di sekitarnya:</p>
      <ul>
        <li>Pasang 12 sensor air quality (3 sensor per pabrik) di posisi strategis</li>
        <li>Sensor: PM2.5, CO, NO₂, suhu, kelembapan</li>
        <li>Real-time dashboard publik untuk warga (web + mobile)</li>
        <li>Warning otomatis ke warga via WhatsApp Group jika polusi tinggi</li>
        <li>Data harus bisa diakses Dinas Lingkungan Hidup untuk audit</li>
      </ul>
      <p>Rancang arsitektur lengkap, tentukan topologi, dan jelaskan komponen processing untuk klasifikasi kualitas udara (Good/Moderate/Unhealthy).</p>
    `,

    analysis: {
      tujuan: 'Transparansi kualitas udara untuk publik + alert dini polusi tinggi',
      input: ['PMS7003 (PM2.5)', 'MQ-7 (CO)', 'MICS-2714 (NO₂)', 'BME280 (suhu+RH+tekanan)'],
      processing: ['ESP32 sampling tiap 60 detik', 'WiFi mesh ke gateway pabrik', 'Gateway forward MQTT ke cloud', 'Backend hitung AQI (Air Quality Index)', 'Klasifikasi: Good/Moderate/Unhealthy', 'WhatsApp Bot untuk alert warga'],
      output: ['Dashboard publik (heatmap AQI)', 'WhatsApp alert ke grup warga', 'Email harian ke DLH', 'API public terbuka untuk peneliti', 'Display LED RGB di tiap kelurahan (warna AQI)'],
    },

    blockDiagram: {
      input: [
        { e: '🌫️', t: 'PMS7003', s: 'PM2.5 (laser scattering)' },
        { e: '🚬', t: 'MQ-7', s: 'CO (carbon monoxide)' },
        { e: '🧪', t: 'MICS-2714', s: 'NO₂ (nitrogen dioxide)' },
        { e: '🌡️', t: 'BME280', s: 'T/RH/Pressure' },
      ],
      processing: [
        { e: '🤖', t: 'ESP32 Sensor Node', s: '12 unit' },
        { e: '📡', t: 'Gateway Pabrik', s: '4 unit (1 per pabrik)' },
        { e: '☁️', t: 'Cloud MQTT Broker', s: 'HiveMQ Cloud' },
        { e: '🧠', t: 'AQI Calculator', s: 'EPA formula + ML' },
        { e: '💾', t: 'TimescaleDB', s: 'Long-term historical' },
        { e: '🤖', t: 'WhatsApp Bot', s: 'GoWA / WAHA gateway' },
      ],
      output: [
        { e: '🗺️', t: 'Public Dashboard', s: 'Heatmap kawasan' },
        { e: '💬', t: 'WhatsApp Group', s: 'Alert ke warga' },
        { e: '📧', t: 'Email DLH', s: 'Laporan harian' },
        { e: '🔌', t: 'API Public', s: 'OpenData untuk peneliti' },
        { e: '🚦', t: 'LED RGB Kelurahan', s: 'Hijau/Kuning/Merah' },
      ],
      arrowIn: 'WiFi mesh',
      arrowOut: 'MQTT + WA + REST',
    },

    topology: {
      pick: 'Hybrid Cluster Tree',
      svg: 'tree',
      reason: `Pilih <strong>cluster tree</strong> hybrid karena:
      <ul>
        <li>3 sensor per pabrik = cluster lokal, gateway pabrik = cluster head</li>
        <li>Cluster head agregasi data + filter noise sebelum forward ke cloud → hemat bandwidth</li>
        <li>4 gateway pabrik = redundansi, kalau 1 gateway mati, sensor sektor lain tetap online</li>
        <li>Tree topology bagus untuk hierarki ini: sensor → gateway pabrik → cloud</li>
        <li>Antar gateway tidak perlu komunikasi langsung, hanya ke cloud → lebih sederhana dari mesh penuh</li>
      </ul>`,
    },

    hardware: [
      { name: 'ESP32 + WiFi', qty: '12', note: 'Sensor node' },
      { name: 'PMS7003 PM2.5 Sensor', qty: '12', note: 'Laser-based, akurasi industrial' },
      { name: 'MQ-7 CO Sensor', qty: '12', note: 'Resistive, perlu warm-up' },
      { name: 'MICS-2714 NO₂', qty: '12', note: 'MOX gas sensor' },
      { name: 'BME280 T/RH/P', qty: '12', note: 'I2C, kompensasi pembacaan gas' },
      { name: 'Raspberry Pi Gateway', qty: '4', note: 'Per pabrik, run Mosquitto + edge analytics' },
      { name: 'Solar Panel 20W', qty: '12', note: 'Lokasi outdoor' },
      { name: 'LED RGB WS2812B (per kelurahan)', qty: '8', note: 'Display warna AQI publik' },
    ],

    justification: `
      <ul>
        <li><strong>PMS7003 vs SDS011:</strong> PMS7003 lebih akurat dan stabil untuk monitoring jangka panjang.</li>
        <li><strong>WiFi vs LoRa:</strong> Kawasan industri biasanya ada infrastruktur WiFi pabrik, lebih cepat update.</li>
        <li><strong>RPi gateway vs ESP32:</strong> RPi bisa run Mosquitto + analytics + buffering, ESP32 untuk sensor saja.</li>
        <li><strong>AQI EPA formula:</strong> Standar internasional, output Good (0-50), Moderate (51-100), Unhealthy (101+).</li>
        <li><strong>Public API:</strong> Mendorong transparansi dan kolaborasi dengan peneliti/akademisi.</li>
        <li><strong>WhatsApp bot:</strong> Lebih banyak penetrasi vs aplikasi khusus, warga sudah punya WA.</li>
      </ul>
    `,

    challenges: [
      { title: 'Cross-sensitivity', text: 'MQ sensor sensitive ke banyak gas (false reading).', mit: 'Cross-check dengan sensor sekitar + kompensasi suhu/RH.' },
      { title: 'Calibration', text: 'Drift seiring waktu, terutama outdoor.', mit: 'Kalibrasi rutin 3 bulan dengan reference gas, ML auto-calibration.' },
      { title: 'Privacy', text: 'Data publik bisa disalahgunakan (misal harga properti).', mit: 'Data agregat per kelurahan, tidak per titik presisi.' },
      { title: 'Spam alert', text: 'Polusi sering tinggi → warga mute group.', mit: 'Alert hanya saat threshold tinggi sustained, bukan tiap menit.' },
      { title: 'Vandalism', text: 'Pabrik bisa "ganggu" sensor agar reading rendah.', mit: 'Tamper detection + redundansi 3 sensor per pabrik di lokasi rahasia.' },
    ],
  },

  // ────────────── KASUS 6 ──────────────
  {
    id: 'smart-class',
    emoji: '🏫',
    title: 'Smart Classroom — Kontrol AC, Lampu, Proyektor Otomatis',
    desc: 'Sekolah ingin otomasi 20 ruang kelas: AC nyala saat ada orang, lampu adaptive cahaya, proyektor on saat mulai jam pelajaran.',
    tags: ['IoT', 'Block Diagram', 'Topologi'],
    type: ['t-iot', 't-block', 't-topo'],

    scenario: `
      <p><strong>Soal:</strong> Sekolah ingin smart classroom di 20 ruang kelas:</p>
      <ul>
        <li>AC nyala otomatis saat ada orang (PIR sensor) + suhu &gt;28°C</li>
        <li>Lampu adaptif: terang jika cahaya alami kurang (LDR sensor)</li>
        <li>Proyektor on otomatis saat jadwal mulai pelajaran (sesuai schedule)</li>
        <li>Guru bisa override manual via tablet di tiap kelas</li>
        <li>Admin lihat dashboard energi total sekolah</li>
        <li>Sekolah punya WiFi enterprise + server lokal</li>
      </ul>
      <p>Rancang arsitektur sistem dan buat block diagram input-processing-output.</p>
    `,

    analysis: {
      tujuan: 'Otomasi efisiensi energi kelas + manajemen terpusat',
      input: ['PIR motion sensor (deteksi orang)', 'LDR (cahaya alami)', 'DHT22 (suhu/RH)', 'Tablet guru (manual override)', 'Schedule master (jadwal pelajaran dari admin)'],
      processing: ['ESP32 per kelas', 'Decision engine: rule-based (motion + suhu → AC; LDR + waktu → lampu; schedule → proyektor)', 'Server lokal aggregator', 'Dashboard energi total', 'Logging untuk audit'],
      output: ['Relay AC', 'Dimmer lampu LED', 'IR transmitter on/off proyektor', 'Status indicator di tablet', 'Dashboard admin (kWh/kelas)'],
    },

    blockDiagram: {
      input: [
        { e: '👤', t: 'PIR Motion Sensor', s: 'Deteksi orang di kelas' },
        { e: '☀️', t: 'LDR', s: 'Cahaya alami (analog)' },
        { e: '🌡️', t: 'DHT22', s: 'Suhu/kelembapan ruangan' },
        { e: '📱', t: 'Tablet Guru', s: 'Manual override + jadwal' },
        { e: '📅', t: 'Master Schedule', s: 'Dari sistem akademik' },
      ],
      processing: [
        { e: '🤖', t: 'ESP32 per Kelas', s: '20 unit · rule engine lokal' },
        { e: '🖥️', t: 'Server Lokal', s: 'MQTT broker + DB + scheduler' },
        { e: '⚙️', t: 'Decision Engine', s: 'Logic: motion+suhu+schedule' },
        { e: '💾', t: 'Database', s: 'Logging + energy metering' },
      ],
      output: [
        { e: '❄️', t: 'AC (via Relay)', s: 'On saat ada orang &amp; &gt;28°C' },
        { e: '💡', t: 'Lampu LED Dimmable', s: 'Adaptif LDR' },
        { e: '📽️', t: 'Proyektor (IR)', s: 'On per jadwal pelajaran' },
        { e: '📊', t: 'Dashboard Admin', s: 'kWh + uptime per kelas' },
        { e: '📲', t: 'Status Tablet', s: 'Live state di kelas' },
      ],
      arrowIn: 'WiFi enterprise',
      arrowOut: 'MQTT + REST',
    },

    topology: {
      pick: 'Star (WiFi infrastructure)',
      svg: 'star',
      reason: `Pilih <strong>topologi star</strong> via WiFi sekolah:
      <ul>
        <li>20 ESP32 langsung connect ke AP WiFi enterprise sekolah</li>
        <li>Server lokal sebagai sink terpusat (MQTT broker + dashboard)</li>
        <li>Tidak perlu mesh karena AP coverage bangunan sekolah cukup</li>
        <li>Mudah maintenance: tiap ESP32 independen, kalau 1 rusak yang lain tetap jalan</li>
        <li>Server lokal = latensi rendah + tidak bergantung internet (sekolah offline tetap jalan)</li>
      </ul>`,
    },

    hardware: [
      { name: 'ESP32 DevKit', qty: '20', note: 'Per kelas' },
      { name: 'PIR HC-SR501', qty: '20', note: 'Range 7m, adjustable timeout' },
      { name: 'LDR + voltage divider', qty: '20', note: 'Analog ke ADC ESP32' },
      { name: 'DHT22', qty: '20', note: 'I2C, 1 per kelas' },
      { name: 'Relay 5V SPDT', qty: '20', note: 'Trigger AC compressor line' },
      { name: 'IR LED + transistor', qty: '20', note: 'Untuk control proyektor' },
      { name: 'PWM Dimmer LED', qty: '20', note: 'Adjustable brightness' },
      { name: 'Tablet Android (existing)', qty: '20', note: 'Sudah ada, tinggal install app' },
      { name: 'Server lokal (existing)', qty: '1', note: 'Sekolah sudah punya' },
    ],

    justification: `
      <ul>
        <li><strong>Rule engine lokal di ESP32:</strong> Latensi rendah + tetap jalan saat WiFi disconnect.</li>
        <li><strong>Server lokal:</strong> Tidak bergantung internet = sekolah pelosok tetap fungsional.</li>
        <li><strong>IR proyektor vs WiFi proyektor:</strong> IR universal, banyak proyektor lama tidak punya WiFi.</li>
        <li><strong>Tablet override:</strong> Guru pasti sometimes butuh manual control (presentasi spesial), wajib disediakan.</li>
        <li><strong>Energy monitoring:</strong> Pakai PZEM-004T jika butuh metering presisi, atau estimasi via runtime relay.</li>
        <li><strong>Schedule integration:</strong> ESP32 fetch jadwal harian dari server tiap pagi → cache lokal.</li>
      </ul>
    `,

    challenges: [
      { title: 'PIR false trigger', text: 'Tirai bergerak, hewan kecil bisa trigger.', mit: 'Sensitivity adjust + dual sensor confirmation.' },
      { title: 'AC compatibility', text: 'AC lama hanya nyala via remote IR.', mit: 'IR transmitter belajar pola remote (IRremote library).' },
      { title: 'Listrik mati', text: 'Sistem reset, schedule hilang.', mit: 'Schedule cache di EEPROM ESP32 + RTC backup baterai.' },
      { title: 'Resistensi guru', text: 'Guru tidak suka kontrol otomatis.', mit: 'Override manual selalu tersedia, training + sosialisasi sebelum deploy.' },
      { title: 'Privacy', text: 'PIR motion = tracking aktivitas guru/siswa.', mit: 'Data motion hanya anonim count, tidak identitas.' },
    ],
  },
];
