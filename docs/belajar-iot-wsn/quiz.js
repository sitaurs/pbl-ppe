// ═══════════════════════════════════════════════════════════════
//  Quiz Page — Logic
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  initProgressBar();
  initNavbar();
  initQuiz();
});

function initProgressBar() {
  const bar = document.getElementById('progressBar');
  if (!bar) return;
  const update = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = scrollable > 0 ? `${(window.scrollY / scrollable) * 100}%` : '0%';
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

function initNavbar() {
  const nav = document.getElementById('navbar');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 30);
  }, { passive: true });
}

// ─────────────── QUIZ STATE ───────────────
const state = {
  mode: 'all',
  questions: [],
  idx: 0,
  score: 0,
  streak: 0,
  bestStreak: 0,
  startTime: 0,
  wrongAnswers: [],
  answered: false,
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestionSet(mode) {
  switch (mode) {
    case 'iot':
      return shuffle(QUIZ_BY_CAT.iot.concat(QUIZ_BY_CAT.security));
    case 'wsn':
      return shuffle(QUIZ_BY_CAT.wsn);
    case 'project':
      return shuffle(QUIZ_BY_CAT.project);
    case 'quick':
      return shuffle(QUIZ_BANK).slice(0, 10);
    case 'hardcore':
      return shuffle(QUIZ_BANK.filter(q => q.diff === 'hard' || q.diff === 'medium'));
    case 'all':
    default:
      return shuffle(QUIZ_BANK);
  }
}

// ─────────────── INIT ───────────────
function initQuiz() {
  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => startQuiz(card.dataset.mode));
  });

  document.getElementById('btnBack').addEventListener('click', backToMode);
}

function startQuiz(mode) {
  state.mode = mode;
  state.questions = buildQuestionSet(mode);
  state.idx = 0;
  state.score = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.startTime = Date.now();
  state.wrongAnswers = [];
  state.answered = false;

  document.getElementById('modeSelect').classList.add('hidden');
  document.getElementById('resultStage').classList.add('hidden');
  document.getElementById('quizStage').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  renderQuestion();
}

function backToMode() {
  document.getElementById('quizStage').classList.add('hidden');
  document.getElementById('resultStage').classList.add('hidden');
  document.getElementById('modeSelect').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─────────────── RENDER QUESTION ───────────────
function renderQuestion() {
  const total = state.questions.length;
  if (state.idx >= total) return showResult();

  const q = state.questions[state.idx];
  state.answered = false;

  // update meta
  document.getElementById('quizCounter').textContent = `Soal ${state.idx + 1} / ${total}`;
  document.getElementById('quizScore').textContent = `Skor: ${state.score}`;
  document.getElementById('quizStreak').textContent = `🔥 Streak: ${state.streak}`;
  document.getElementById('quizProgressBar').style.width = `${((state.idx) / total) * 100}%`;

  const catLabel = {
    iot: '🌐 IoT',
    wsn: '📡 WSN',
    project: '🛡️ Project',
    security: '🔐 Security',
  }[q.cat] || q.cat;

  const card = document.getElementById('quizCard');
  card.innerHTML = `
    <div class="quiz-card-q">
      <span class="q-cat ${q.cat}">${catLabel} · ${q.diff}</span>
      <div class="q-text">${state.idx + 1}. ${q.q}</div>
      <div class="q-options" id="qOptions">
        ${q.options.map((opt, i) => `
          <button class="q-option" data-i="${i}">
            <span class="qo-letter">${String.fromCharCode(65 + i)}</span>
            <span class="qo-text">${opt}</span>
          </button>
        `).join('')}
      </div>
      <div class="q-explain" id="qExplain"></div>
      <div class="q-actions">
        <span class="kb-hint">Pilih jawaban dengan <kbd>A</kbd>-<kbd>D</kbd> atau klik</span>
        <button class="btn btn-primary hidden" id="btnNext">${state.idx + 1 === total ? '🏁 Selesai' : 'Soal Berikutnya →'}</button>
      </div>
    </div>
  `;

  card.querySelectorAll('.q-option').forEach(btn => {
    btn.addEventListener('click', () => answer(parseInt(btn.dataset.i, 10)));
  });

  document.getElementById('btnNext').addEventListener('click', nextQuestion);

  // keyboard shortcut
  document.removeEventListener('keydown', handleKey);
  document.addEventListener('keydown', handleKey);
}

function handleKey(e) {
  if (state.answered) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
      e.preventDefault();
      nextQuestion();
    }
    return;
  }
  const k = e.key.toLowerCase();
  const map = { a: 0, b: 1, c: 2, d: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
  if (map[k] !== undefined) {
    answer(map[k]);
  }
}

// ─────────────── ANSWER ───────────────
function answer(choice) {
  if (state.answered) return;
  state.answered = true;

  const q = state.questions[state.idx];
  const isCorrect = choice === q.a;

  if (isCorrect) {
    state.score++;
    state.streak++;
    if (state.streak > state.bestStreak) state.bestStreak = state.streak;
  } else {
    state.streak = 0;
    state.wrongAnswers.push({
      q: q.q,
      chosen: q.options[choice],
      correct: q.options[q.a],
      explain: q.explain,
    });
  }

  document.getElementById('quizScore').textContent = `Skor: ${state.score}`;
  document.getElementById('quizStreak').textContent = `🔥 Streak: ${state.streak}`;

  // mark options
  const opts = document.querySelectorAll('.q-option');
  opts.forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.a) btn.classList.add('correct');
    else if (i === choice) btn.classList.add('wrong');
  });

  // show explanation + cheat sheet
  const exp = document.getElementById('qExplain');
  const cheatHtml = q.cheat ? `
    <div class="exp-cheat">
      <div class="exp-cheat-title">💡 Cheat Sheet · ${q.cheat.title}</div>
      <ul>
        ${q.cheat.items.map(item => `<li>${item}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  const projectHtml = q.project ? `
    <div class="exp-project">
      <strong>Project SafeGuard APD</strong>
      ${q.project}
    </div>
  ` : '';

  exp.innerHTML = `
    <div class="exp-head">
      <span class="exp-badge ${isCorrect ? 'right' : 'wrong'}">
        ${isCorrect ? '✓ Benar' : '✗ Belum tepat'}
      </span>
      <h4>Pembahasan</h4>
    </div>
    <div class="exp-text">${q.explain}</div>
    ${cheatHtml}
    ${projectHtml}
  `;
  exp.classList.add('show');

  document.getElementById('btnNext').classList.remove('hidden');

  // confetti for streak milestone
  if (isCorrect && state.streak > 0 && state.streak % 5 === 0) {
    burstConfetti();
  }
}

function nextQuestion() {
  state.idx++;
  renderQuestion();
}

// ─────────────── RESULT ───────────────
function showResult() {
  document.getElementById('quizStage').classList.add('hidden');
  document.getElementById('resultStage').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const total = state.questions.length;
  const correct = state.score;
  const wrong = total - correct;
  const pct = Math.round((correct / total) * 100);
  const elapsed = Math.round((Date.now() - state.startTime) / 1000);

  let emoji = '🎉', verdict = 'Mantap!';
  if (pct === 100) { emoji = '🏆'; verdict = 'Sempurna! Master IoT/WSN'; }
  else if (pct >= 90) { emoji = '🔥'; verdict = 'Hampir sempurna!'; }
  else if (pct >= 75) { emoji = '👍'; verdict = 'Bagus, sudah siap UAS'; }
  else if (pct >= 50) { emoji = '💪'; verdict = 'Lumayan, perlu latihan lagi'; }
  else { emoji = '📚'; verdict = 'Yuk baca materi visual dulu'; }

  document.getElementById('resultEmoji').textContent = emoji;
  document.getElementById('resultVerdict').textContent = verdict;
  document.getElementById('resultScoreNum').textContent = correct;
  document.getElementById('resultTotal').textContent = total;
  document.getElementById('resultPct').textContent = `${pct}%`;
  document.getElementById('rstatCorrect').textContent = correct;
  document.getElementById('rstatWrong').textContent = wrong;
  document.getElementById('rstatStreak').textContent = state.bestStreak;
  document.getElementById('rstatTime').textContent = formatTime(elapsed);

  // review wrong answers
  const reviewList = document.getElementById('reviewList');
  if (state.wrongAnswers.length === 0) {
    reviewList.innerHTML = `<div class="review-empty">🎯 Semua jawaban benar! Tidak ada yang perlu di-review.</div>`;
  } else {
    reviewList.innerHTML = state.wrongAnswers.map((w, i) => `
      <div class="review-item">
        <div class="review-q">${i + 1}. ${w.q}</div>
        <div class="review-a">Jawabanmu: <em>${w.chosen}</em> · Benar: <strong>${w.correct}</strong></div>
      </div>
    `).join('');
  }

  // bind result actions
  document.getElementById('btnRetry').onclick = () => startQuiz(state.mode);
  document.getElementById('btnNewMode').onclick = backToMode;

  // confetti for high score
  if (pct >= 80) {
    setTimeout(() => burstConfetti(50), 400);
  }
}

function formatTime(s) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
}

// ─────────────── CONFETTI ───────────────
function burstConfetti(count = 30) {
  const colors = ['#22d3ee', '#a78bfa', '#f472b6', '#fbbf24', '#34d399'];
  for (let i = 0; i < count; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + '%';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDelay = Math.random() * 0.5 + 's';
    c.style.animationDuration = (2 + Math.random() * 2) + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4000);
  }
}
