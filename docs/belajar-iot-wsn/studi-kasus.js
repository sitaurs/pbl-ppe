// ═══════════════════════════════════════════════════════════════
//  Studi Kasus — Logic
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  initProgressBar();
  initNavbar();
  renderCaseList();
  initBackBtn();
});

function initProgressBar() {
  const bar = document.getElementById('progressBar');
  if (!bar) return;
  const update = () => {
    const sc = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = sc > 0 ? `${(window.scrollY / sc) * 100}%` : '0%';
  };
  window.addEventListener('scroll', update, { passive: true });
}

function initNavbar() {
  const nav = document.getElementById('navbar');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 30);
  }, { passive: true });
}

// ───────── Render Case List ─────────
function renderCaseList() {
  const grid = document.getElementById('casesGrid');
  if (!grid) return;
  grid.innerHTML = CASES.map((c, i) => `
    <button class="case-card" data-id="${c.id}">
      <div class="case-emoji">${c.emoji}</div>
      <div class="case-num">KASUS ${String(i + 1).padStart(2, '0')}</div>
      <div class="case-title">${c.title}</div>
      <div class="case-desc">${c.desc}</div>
      <div class="case-tags">
        ${c.tags.map((t, j) => `<span class="case-tag ${c.type[j] || ''}">${t}</span>`).join('')}
      </div>
    </button>
  `).join('');

  grid.querySelectorAll('.case-card').forEach(btn => {
    btn.addEventListener('click', () => showCase(btn.dataset.id));
  });
}

// ───────── Show Case Detail ─────────
function showCase(id) {
  const c = CASES.find(x => x.id === id);
  if (!c) return;
  const idx = CASES.findIndex(x => x.id === id);

  const list = document.getElementById('caseList');
  const detail = document.getElementById('caseDetail');
  const content = document.getElementById('caseContent');

  list.classList.add('hidden');
  detail.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  content.innerHTML = `
    <div class="case-detail-card">
      <div class="cd-head">
        <div class="cd-emoji">${c.emoji}</div>
        <div class="cd-head-text">
          <div class="cd-num">KASUS ${String(idx + 1).padStart(2, '0')}</div>
          <h2>${c.title}</h2>
          <div class="cd-meta">
            ${c.tags.map((t, j) => `<span class="cd-meta-pill">${t}</span>`).join('')}
          </div>
        </div>
      </div>

      <div class="cd-section scenario">
        <h3><span class="ico">📝</span> Skenario / Soal</h3>
        ${c.scenario}
      </div>

      <div class="cd-section analysis">
        <h3><span class="ico">🔍</span> Analisis Kebutuhan</h3>
        <p><strong>Tujuan:</strong> ${c.analysis.tujuan}</p>
        <div class="io-table">
          <div class="io-col col-input">
            <h4>Input</h4>
            <ul>${c.analysis.input.map(x => `<li>${x}</li>`).join('')}</ul>
          </div>
          <div class="io-col col-process">
            <h4>Processing</h4>
            <ul>${c.analysis.processing.map(x => `<li>${x}</li>`).join('')}</ul>
          </div>
          <div class="io-col col-output">
            <h4>Output</h4>
            <ul>${c.analysis.output.map(x => `<li>${x}</li>`).join('')}</ul>
          </div>
        </div>
      </div>

      <div class="cd-section diagram">
        <h3><span class="ico">📊</span> Block Diagram (Input → Processing → Output)</h3>
        <p>Format 3-kolom sesuai standar dosen.</p>
        ${renderBlockDiagram(c.blockDiagram)}
      </div>

      <div class="cd-section topology">
        <h3><span class="ico">🌐</span> Topologi Pilihan</h3>
        <div class="topo-pick">
          <svg class="topo-pick-svg" viewBox="0 0 200 200">${getTopoSvg(c.topology.svg)}</svg>
          <div class="topo-pick-info">
            <h4>${c.topology.pick}</h4>
            <div>${c.topology.reason}</div>
          </div>
        </div>
      </div>

      <div class="cd-section">
        <h3><span class="ico">🔧</span> Komponen Hardware</h3>
        <table class="hw-table">
          <thead><tr><th>Komponen</th><th>Qty</th><th>Catatan</th></tr></thead>
          <tbody>
            ${c.hardware.map(h => `<tr><td class="hw-component">${h.name}</td><td class="hw-qty">${h.qty}</td><td>${h.note}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="cd-section justify">
        <h3><span class="ico">✅</span> Justifikasi Pilihan</h3>
        ${c.justification}
      </div>

      <div class="cd-section challenges">
        <h3><span class="ico">⚠️</span> Tantangan &amp; Mitigasi</h3>
        <div class="cd-challenges">
          ${c.challenges.map(ch => `
            <div class="cdc-card">
              <div class="cdc-title">${ch.title}</div>
              <div class="cdc-text">${ch.text}</div>
              <div class="cdc-mit"><strong>Mitigasi:</strong> ${ch.mit}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

// ───────── Block Diagram Renderer ─────────
function renderBlockDiagram(bd) {
  const renderItems = (arr) => arr.map(it => `
    <div class="bd-block-item">
      <span class="bd-bi-emoji">${it.e}</span>
      <span class="bd-bi-text">${it.t}<small>${it.s}</small></span>
    </div>
  `).join('');

  return `
    <div class="bd-container">
      <div class="bd-3col">
        <div class="bd-section-col bd-input">
          <div class="bd-section-label">INPUT</div>
          ${renderItems(bd.input)}
        </div>
        <div class="bd-arrow-col">
          <span class="bd-arrow-label">${bd.arrowIn || ''}</span>
          <svg class="bd-arrow-svg" viewBox="0 0 60 24" fill="none" stroke="#22d3ee" stroke-width="2">
            <line x1="2" y1="12" x2="50" y2="12"/>
            <path d="M 44 6 L 56 12 L 44 18" fill="#22d3ee"/>
          </svg>
        </div>
        <div class="bd-section-col bd-proc">
          <div class="bd-section-label">PROCESSING</div>
          ${renderItems(bd.processing)}
        </div>
        <div class="bd-arrow-col">
          <span class="bd-arrow-label">${bd.arrowOut || ''}</span>
          <svg class="bd-arrow-svg" viewBox="0 0 60 24" fill="none" stroke="#fbbf24" stroke-width="2">
            <line x1="2" y1="12" x2="50" y2="12"/>
            <path d="M 44 6 L 56 12 L 44 18" fill="#fbbf24"/>
          </svg>
        </div>
        <div class="bd-section-col bd-output">
          <div class="bd-section-label">OUTPUT</div>
          ${renderItems(bd.output)}
        </div>
      </div>
    </div>
  `;
}

// ───────── Topology SVG ─────────
function getTopoSvg(type) {
  const styles = `
    <style>
      .tp-edge { stroke: rgba(255,255,255,0.25); stroke-width: 1.5; stroke-dasharray: 3 3; }
      .tp-node { fill: #22d3ee; }
      .tp-cluster { fill: #fbbf24; }
      .tp-sink { fill: #a78bfa; }
      .tp-label { fill: white; font-family: monospace; font-size: 7px; font-weight: 700; }
    </style>
  `;
  if (type === 'star') {
    return styles + `
      <g class="tp-edge"><line x1="100" y1="100" x2="100" y2="30"/><line x1="100" y1="100" x2="170" y2="65"/><line x1="100" y1="100" x2="170" y2="135"/><line x1="100" y1="100" x2="100" y2="170"/><line x1="100" y1="100" x2="30" y2="135"/><line x1="100" y1="100" x2="30" y2="65"/></g>
      <circle cx="100" cy="30" r="9" class="tp-node"/><circle cx="170" cy="65" r="9" class="tp-node"/><circle cx="170" cy="135" r="9" class="tp-node"/><circle cx="100" cy="170" r="9" class="tp-node"/><circle cx="30" cy="135" r="9" class="tp-node"/><circle cx="30" cy="65" r="9" class="tp-node"/>
      <circle cx="100" cy="100" r="13" class="tp-sink"/><text x="100" y="103" text-anchor="middle" class="tp-label">SINK</text>
    `;
  }
  if (type === 'mesh') {
    return styles + `
      <g class="tp-edge"><line x1="40" y1="50" x2="100" y2="50"/><line x1="100" y1="50" x2="160" y2="50"/><line x1="40" y1="100" x2="100" y2="100"/><line x1="100" y1="100" x2="160" y2="100"/><line x1="40" y1="150" x2="100" y2="150"/><line x1="100" y1="150" x2="160" y2="150"/><line x1="40" y1="50" x2="40" y2="150"/><line x1="100" y1="50" x2="100" y2="150"/><line x1="160" y1="50" x2="160" y2="150"/><line x1="40" y1="50" x2="100" y2="100"/><line x1="100" y1="50" x2="160" y2="100"/><line x1="40" y1="100" x2="100" y2="150"/><line x1="100" y1="100" x2="160" y2="150"/></g>
      <circle cx="40" cy="50" r="8" class="tp-node"/><circle cx="100" cy="50" r="8" class="tp-node"/><circle cx="160" cy="50" r="8" class="tp-node"/><circle cx="40" cy="100" r="8" class="tp-node"/><circle cx="100" cy="100" r="8" class="tp-node"/><circle cx="160" cy="100" r="8" class="tp-node"/><circle cx="40" cy="150" r="8" class="tp-node"/><circle cx="100" cy="150" r="8" class="tp-node"/><circle cx="160" cy="150" r="8" class="tp-node"/>
    `;
  }
  if (type === 'tree') {
    return styles + `
      <g class="tp-edge"><line x1="100" y1="30" x2="50" y2="90"/><line x1="100" y1="30" x2="150" y2="90"/><line x1="50" y1="90" x2="20" y2="160"/><line x1="50" y1="90" x2="80" y2="160"/><line x1="150" y1="90" x2="120" y2="160"/><line x1="150" y1="90" x2="180" y2="160"/></g>
      <circle cx="20" cy="160" r="7" class="tp-node"/><circle cx="80" cy="160" r="7" class="tp-node"/><circle cx="120" cy="160" r="7" class="tp-node"/><circle cx="180" cy="160" r="7" class="tp-node"/>
      <circle cx="50" cy="90" r="10" class="tp-cluster"/><circle cx="150" cy="90" r="10" class="tp-cluster"/>
      <circle cx="100" cy="30" r="13" class="tp-sink"/><text x="100" y="33" text-anchor="middle" class="tp-label">SINK</text>
    `;
  }
  return '';
}

// ───────── Back Button ─────────
function initBackBtn() {
  document.getElementById('backToList').addEventListener('click', () => {
    document.getElementById('caseDetail').classList.add('hidden');
    document.getElementById('caseList').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
