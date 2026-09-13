// ---------- Dictionary setup ----------

function parseWords(raw, len) {
  const set = new Set();
  raw.split(/\s+/).forEach(w => {
    if (w.length === len && /^[A-Z]+$/.test(w)) set.add(w);
  });
  return Array.from(set);
}

const DICTS = {
  4: parseWords(RAW_WORDS_4, 4),
  5: parseWords(RAW_WORDS_5, 5),
};

function differsByOne(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diff++;
    if (diff > 1) return false;
  }
  return diff === 1;
}

function diffPosition(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

// Build adjacency graph: bucket words by wildcard pattern (fast neighbor lookup)
function buildGraph(words) {
  const buckets = new Map();
  words.forEach(w => {
    for (let i = 0; i < w.length; i++) {
      const key = w.slice(0, i) + '_' + w.slice(i + 1);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(w);
    }
  });
  const graph = new Map();
  words.forEach(w => graph.set(w, new Set()));
  buckets.forEach(group => {
    if (group.length < 2) return;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        graph.get(group[i]).add(group[j]);
        graph.get(group[j]).add(group[i]);
      }
    }
  });
  return graph;
}

const GRAPHS = { 4: buildGraph(DICTS[4]), 5: buildGraph(DICTS[5]) };

function bfsDistances(graph, start) {
  const dist = new Map([[start, 0]]);
  const queue = [start];
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    for (const next of graph.get(cur)) {
      if (!dist.has(next)) {
        dist.set(next, dist.get(cur) + 1);
        queue.push(next);
      }
    }
  }
  return dist;
}

function bfsPath(graph, start, end) {
  if (start === end) return [start];
  const prev = new Map([[start, null]]);
  const queue = [start];
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    if (cur === end) break;
    for (const next of graph.get(cur)) {
      if (!prev.has(next)) {
        prev.set(next, cur);
        queue.push(next);
      }
    }
  }
  if (!prev.has(end)) return null;
  const path = [];
  let cur = end;
  while (cur !== null) { path.unshift(cur); cur = prev.get(cur); }
  return path;
}

// ---------- Seeded RNG ----------

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
  return h;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- Puzzle generation ----------

function pickPuzzle(len, rng) {
  const graph = GRAPHS[len];
  const words = DICTS[len].filter(w => graph.get(w).size > 0);
  if (words.length === 0) return null;

  for (let attempt = 0; attempt < 60; attempt++) {
    const start = words[Math.floor(rng() * words.length)];
    const dist = bfsDistances(graph, start);
    const minD = 3, maxD = 7;
    const candidates = [];
    dist.forEach((d, w) => { if (d >= minD && d <= maxD) candidates.push(w); });
    if (candidates.length > 0) {
      const target = candidates[Math.floor(rng() * candidates.length)];
      return { start, target, optimal: dist.get(target) };
    }
  }
  // fallback: just take the farthest reachable word from a random start
  const start = words[Math.floor(rng() * words.length)];
  const dist = bfsDistances(graph, start);
  let best = start, bestD = 0;
  dist.forEach((d, w) => { if (d > bestD) { bestD = d; best = w; } });
  return { start, target: best, optimal: bestD };
}

// ---------- Game state ----------

const state = {
  mode: 'daily',
  len: 5,
  start: null,
  target: null,
  optimal: 0,
  chain: [],
  hintsUsed: 0,
  startTime: null,
  timerId: null,
  finished: false,
};

const els = {
  modeDaily: document.getElementById('mode-daily'),
  modePractice: document.getElementById('mode-practice'),
  len4: document.getElementById('len-4'),
  len5: document.getElementById('len-5'),
  newPuzzle: document.getElementById('new-puzzle'),
  statTime: document.getElementById('stat-time'),
  statMoves: document.getElementById('stat-moves'),
  statStreak: document.getElementById('stat-streak'),
  targetTiles: document.getElementById('target-tiles'),
  ladder: document.getElementById('ladder'),
  form: document.getElementById('guess-form'),
  input: document.getElementById('guess-input'),
  message: document.getElementById('message'),
  hintBtn: document.getElementById('hint-btn'),
  undoBtn: document.getElementById('undo-btn'),
  winModal: document.getElementById('win-modal'),
  winTitle: document.getElementById('win-title'),
  winSummary: document.getElementById('win-summary'),
  winCopy: document.getElementById('win-copy'),
  winClose: document.getElementById('win-close'),
};

// ---------- Persistence ----------

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem('wld-stats')) || {
      currentStreak: 0, maxStreak: 0, lastCompletedDate: null, completedToday: {},
    };
  } catch { return { currentStreak: 0, maxStreak: 0, lastCompletedDate: null, completedToday: {} }; }
}

function saveStats(s) { localStorage.setItem('wld-stats', JSON.stringify(s)); }

// ---------- Rendering ----------

function renderTile(letter, cls) {
  const div = document.createElement('div');
  div.className = 'tile' + (cls ? ' ' + cls : '');
  div.textContent = letter;
  return div;
}

function renderTarget() {
  els.targetTiles.innerHTML = '';
  state.target.split('').forEach(l => els.targetTiles.appendChild(renderTile(l)));
}

function renderLadder() {
  els.ladder.innerHTML = '';
  state.chain.forEach((word, idx) => {
    const row = document.createElement('div');
    row.className = 'ladder-row';
    const prev = idx > 0 ? state.chain[idx - 1] : null;
    const changedPos = prev ? diffPosition(prev, word) : -1;
    word.split('').forEach((letter, i) => {
      let cls = '';
      if (idx === 0) cls = 'start';
      else if (i === changedPos) cls = 'changed';
      if (letter === state.target[i]) cls += ' match';
      row.appendChild(renderTile(letter, cls.trim()));
    });
    els.ladder.appendChild(row);
  });
}

function renderStats() {
  const stats = loadStats();
  els.statStreak.textContent = stats.currentStreak || 0;
  els.statMoves.textContent = Math.max(0, state.chain.length - 1);
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function tickTimer() {
  if (state.startTime == null) return;
  els.statTime.textContent = formatTime(Date.now() - state.startTime);
}

function setMessage(text, cls) {
  els.message.textContent = text;
  els.message.className = 'message' + (cls ? ' ' + cls : '');
}

// ---------- Game flow ----------

function startNewGame() {
  clearInterval(state.timerId);
  const len = state.len;

  let rng;
  if (state.mode === 'daily') {
    rng = mulberry32(hashString(todayKey() + '-' + len));
  } else {
    rng = mulberry32((Date.now() ^ Math.floor(Math.random() * 1e9)) | 0);
  }

  const puzzle = pickPuzzle(len, rng);
  state.start = puzzle.start;
  state.target = puzzle.target;
  state.optimal = puzzle.optimal;
  state.chain = [puzzle.start];
  state.hintsUsed = 0;
  state.finished = false;
  state.startTime = Date.now();

  els.winModal.classList.add('hidden');
  els.input.disabled = false;
  els.input.value = '';
  els.form.querySelector('button').disabled = false;
  els.hintBtn.disabled = false;
  els.undoBtn.disabled = false;
  els.newPuzzle.disabled = state.mode === 'daily';

  renderTarget();
  renderLadder();
  renderStats();

  const stats = loadStats();
  if (state.mode === 'daily' && stats.completedToday && stats.completedToday[todayKey() + '-' + len]) {
    finishGame(true, stats.completedToday[todayKey() + '-' + len], true);
  } else {
    setMessage('Turn "' + state.start + '" into "' + state.target + '" one letter at a time.', 'info');
    state.timerId = setInterval(tickTimer, 250);
    els.input.focus();
  }
}

function submitGuess(raw) {
  if (state.finished) return;
  const guess = raw.trim().toUpperCase();
  const len = state.len;
  const current = state.chain[state.chain.length - 1];

  if (guess.length !== len) { shake(`Word must be ${len} letters.`); return; }
  if (!DICTS[len].includes(guess)) { shake(`"${guess}" isn't in the dictionary.`); return; }
  if (state.chain.includes(guess)) { shake(`Already used "${guess}".`); return; }
  if (!differsByOne(current, guess)) { shake(`Change exactly one letter from "${current}".`); return; }

  state.chain.push(guess);
  els.input.value = '';
  renderLadder();
  renderStats();
  setMessage('', '');

  if (guess === state.target) {
    finishGame(true);
  }
}

function shake(msg) {
  setMessage(msg, '');
  els.input.classList.remove('shake');
  void els.input.offsetWidth;
  els.input.classList.add('shake');
}

function finishGame(won, replaySummary, alreadyDone) {
  state.finished = true;
  clearInterval(state.timerId);
  els.input.disabled = true;
  els.form.querySelector('button').disabled = true;
  els.hintBtn.disabled = true;
  els.undoBtn.disabled = true;

  const elapsedMs = replaySummary ? replaySummary.elapsedMs : Date.now() - state.startTime;
  const moves = replaySummary ? replaySummary.moves : state.chain.length - 1;
  const hints = replaySummary ? replaySummary.hints : state.hintsUsed;

  if (!alreadyDone && state.mode === 'daily') {
    const stats = loadStats();
    const key = todayKey() + '-' + state.len;
    if (!stats.completedToday) stats.completedToday = {};
    if (!stats.completedToday[key]) {
      // streak bookkeeping based on calendar day continuity
      const last = stats.lastCompletedDate;
      const today = todayKey();
      if (last) {
        const lastDate = new Date(last);
        const diffDays = Math.round((new Date(today) - lastDate) / 86400000);
        stats.currentStreak = diffDays === 1 ? stats.currentStreak + 1 : (diffDays === 0 ? stats.currentStreak : 1);
      } else {
        stats.currentStreak = 1;
      }
      stats.lastCompletedDate = today;
      stats.maxStreak = Math.max(stats.maxStreak || 0, stats.currentStreak);
      stats.completedToday[key] = { elapsedMs, moves, hints };
      saveStats(stats);
    }
  }

  renderStats();

  const overPar = moves - state.optimal;
  const parLine = overPar <= 0 ? 'Optimal solve! 🏆' : `+${overPar} over the optimal ${state.optimal}-move path.`;

  els.winTitle.textContent = alreadyDone ? '✅ Already solved today' : '🎉 Solved it!';
  els.winSummary.textContent =
    `${state.start} → ${state.target}\n` +
    `Time: ${formatTime(elapsedMs)}   Moves: ${moves}   Hints: ${hints}\n${parLine}`;
  els.winModal.classList.remove('hidden');
}

function useHint() {
  if (state.finished) return;
  const graph = GRAPHS[state.len];
  const current = state.chain[state.chain.length - 1];
  const path = bfsPath(graph, current, state.target);
  if (!path || path.length < 2) {
    setMessage("No path from here — try Undo to backtrack.", '');
    return;
  }
  state.hintsUsed++;
  els.input.value = path[1];
  setMessage(`Hint: try "${path[1]}"`, 'good');
}

function undoMove() {
  if (state.finished || state.chain.length <= 1) return;
  state.chain.pop();
  renderLadder();
  renderStats();
  setMessage('Move undone.', 'info');
}

// ---------- Events ----------

els.form.addEventListener('submit', e => {
  e.preventDefault();
  submitGuess(els.input.value);
});

els.hintBtn.addEventListener('click', useHint);
els.undoBtn.addEventListener('click', undoMove);
els.winClose.addEventListener('click', () => els.winModal.classList.add('hidden'));

els.winCopy.addEventListener('click', () => {
  const text = `Word Ladder Duel: ${state.start} → ${state.target}\n${els.winSummary.textContent}`;
  navigator.clipboard?.writeText(text).then(() => {
    els.winCopy.textContent = '✅ Copied!';
    setTimeout(() => { els.winCopy.textContent = '📋 Copy Result'; }, 1500);
  }).catch(() => {});
});

function setMode(mode) {
  state.mode = mode;
  els.modeDaily.classList.toggle('active', mode === 'daily');
  els.modePractice.classList.toggle('active', mode === 'practice');
  startNewGame();
}

function setLen(len) {
  state.len = len;
  els.len4.classList.toggle('active', len === 4);
  els.len5.classList.toggle('active', len === 5);
  startNewGame();
}

els.modeDaily.addEventListener('click', () => setMode('daily'));
els.modePractice.addEventListener('click', () => setMode('practice'));
els.len4.addEventListener('click', () => setLen(4));
els.len5.addEventListener('click', () => setLen(5));
els.newPuzzle.addEventListener('click', () => { if (state.mode === 'practice') startNewGame(); });

// ---------- Init ----------

renderStats();
startNewGame();
