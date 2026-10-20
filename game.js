'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca (gris metálico)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (reto)
];

const NUT = 8;

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

const THEME_KEY = 'tetris-theme';
const themeToggle = document.getElementById('theme-toggle');
let themeColors = { grid: '#22222e', shine: 'rgba(255,255,255,0.12)', ghostAlpha: 0.2 };

function readThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  themeColors = {
    grid: styles.getPropertyValue('--grid').trim(),
    shine: styles.getPropertyValue('--shine').trim(),
    ghostAlpha: parseFloat(styles.getPropertyValue('--ghost-alpha')),
  };
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === 'dark' ? '☀️ Modo claro' : '🌙 Modo oscuro';
  readThemeColors();
  // El loop no repinta en pausa / game over
  if (current && next) { draw(); drawNext(); }
}

function loadTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch (e) {
    return 'dark';
  }
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let started = false;
let combo = 0, maxCombo = 0;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  if (clearLines() > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
  } else {
    combo = 0;
  }
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = themeColors.shine;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

// Círculo en el centro de la tuerca (origen de la pieza en x, y; el hueco es la celda central)
function drawNutHole(context, x, y, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  context.strokeStyle = COLORS[NUT];
  context.lineWidth = 2;
  context.beginPath();
  context.arc((x + 1.5) * size, (y + 1.5) * size, size * 0.3, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = themeColors.grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, themeColors.ghostAlpha);
  if (current.type === NUT) drawNutHole(ctx, current.x, gy, BLOCK, themeColors.ghostAlpha);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.type === NUT) drawNutHole(ctx, current.x, current.y, BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.type === NUT) drawNutHole(nextCtx, offX, offY, NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  showGameOverRecords();
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (!gameOver) animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  started = true;
  combo = 0;
  maxCombo = 0;
  commitPendingRecord(); // reiniciar sin pulsar Guardar conserva el récord
  gameOverResetBtn.classList.add('hidden');
  newRecordEl.classList.add('hidden');
  nameForm.classList.add('hidden');
  overlayRecords.classList.add('hidden');
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  startOverlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return; // escribiendo el nombre
  if (!started) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeToggle.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* almacenamiento no disponible */ }
  applyTheme(theme);
  themeToggle.blur(); // evita que Espacio active el botón en vez de la caída
});

// ---- Récords locales ----
const RECORDS_KEY = 'tetris-records';
const NAME_KEY = 'tetris-last-name';
const MAX_TOP = 5;
const startOverlay = document.getElementById('start-overlay');
const startRecords = document.getElementById('start-records');
const overlayRecords = document.getElementById('overlay-records');
const newRecordEl = document.getElementById('new-record');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const gameOverResetBtn = document.querySelector('#overlay .reset-records-btn');
let pendingRecord = null; // entrada del top aún sin nombre confirmado

function loadRecords() {
  const empty = { top: [], bestCombo: 0, maxLines: 0 };
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!data || !Array.isArray(data.top)) return empty;
    return {
      top: data.top.filter(e => e && Number.isFinite(e.score)).sort((a, b) => b.score - a.score).slice(0, MAX_TOP),
      bestCombo: Number(data.bestCombo) || 0,
      maxLines: Number(data.maxLines) || 0,
    };
  } catch (e) {
    return empty;
  }
}

function saveRecords(rec) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(rec)); } catch (e) { /* almacenamiento no disponible */ }
}

function loadName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; }
}

function qualifies(rec, s) {
  return s > 0 && (rec.top.length < MAX_TOP || s > rec.top[rec.top.length - 1].score);
}

// Pinta la tabla (Top 5 + estadísticas) en el contenedor; highlight = entrada a resaltar
function renderRecords(container, highlight) {
  const rec = loadRecords();
  container.textContent = '';
  const title = document.createElement('div');
  title.className = 'records-title';
  title.textContent = 'MEJORES PUNTUACIONES';
  const table = document.createElement('table');
  if (!rec.top.length) {
    const tr = table.insertRow();
    tr.className = 'empty';
    const td = tr.insertCell();
    td.colSpan = 4;
    td.textContent = 'Sin récords todavía';
  }
  rec.top.forEach((e, i) => {
    const tr = table.insertRow();
    if (highlight && e.date === highlight.date && e.score === highlight.score && e.name === highlight.name) tr.className = 'highlight';
    tr.insertCell().textContent = `${i + 1}.`;
    tr.insertCell().textContent = String(e.name);
    const s = tr.insertCell(); s.className = 'num'; s.textContent = e.score.toLocaleString();
    const l = tr.insertCell(); l.className = 'num'; l.textContent = `${e.lines || 0} L`;
  });
  const stats = document.createElement('div');
  stats.className = 'records-stats';
  const bc = document.createElement('span');
  bc.textContent = `Mejor combo: ${rec.bestCombo}`;
  const ml = document.createElement('span');
  ml.textContent = `Máx. líneas: ${rec.maxLines}`;
  stats.append(bc, ml);
  container.append(title, table, stats);
}

function showGameOverRecords() {
  const rec = loadRecords();
  const qualified = qualifies(rec, score);
  // combo y líneas máximas se guardan siempre al terminar la partida
  rec.bestCombo = Math.max(rec.bestCombo, maxCombo);
  rec.maxLines = Math.max(rec.maxLines, lines);
  saveRecords(rec);
  gameOverResetBtn.classList.remove('hidden');
  if (qualified) {
    pendingRecord = { score, lines, level };
    nameInput.value = loadName();
    newRecordEl.classList.remove('hidden');
    nameForm.classList.remove('hidden');
    overlayRecords.classList.add('hidden');
    setTimeout(() => { nameInput.focus(); nameInput.select(); }, 0);
  } else {
    pendingRecord = null;
    newRecordEl.classList.add('hidden');
    nameForm.classList.add('hidden');
    overlayRecords.classList.remove('hidden');
    renderRecords(overlayRecords, null);
  }
}

function commitPendingRecord() {
  if (!pendingRecord) return;
  const name = nameInput.value.trim().slice(0, 12) || 'Anónimo';
  const entry = { name, score: pendingRecord.score, lines: pendingRecord.lines, level: pendingRecord.level, date: Date.now() };
  pendingRecord = null;
  const rec = loadRecords();
  rec.top.push(entry);
  rec.top.sort((a, b) => b.score - a.score);
  rec.top = rec.top.slice(0, MAX_TOP);
  saveRecords(rec);
  try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* almacenamiento no disponible */ }
  nameForm.classList.add('hidden');
  overlayRecords.classList.remove('hidden');
  renderRecords(overlayRecords, entry);
}

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  commitPendingRecord();
  if (document.activeElement) document.activeElement.blur();
});

restartBtn.addEventListener('click', () => restartBtn.blur());

document.getElementById('start-btn').addEventListener('click', e => { e.target.blur(); init(); });

document.querySelectorAll('.reset-records-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.blur();
    if (!confirm('¿Borrar todos los récords?')) return;
    try { localStorage.removeItem(RECORDS_KEY); } catch (e) { /* almacenamiento no disponible */ }
    renderRecords(startRecords, null);
    if (!overlayRecords.classList.contains('hidden')) renderRecords(overlayRecords, null);
  });
});

applyTheme(loadTheme());
renderRecords(startRecords, null);
document.getElementById('start-btn').focus();
