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
  clearLines();
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

// ---- Skins ----
// Cada skin: { colors[0..8], bg (null = fondo del tema CSS), grid (null = themeColors.grid), drawBlock(context, px, py, size, colorIndex) }
// drawBlock de un skin recibe píxeles (px, py), tamaño y color ya resueltos; la opacidad la gestiona drawBlock global.
const SKINS = {
  retro: {
    colors: COLORS,
    bg: null,
    grid: null,
    drawBlock(context, px, py, size, color) {
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      context.fillStyle = themeColors.shine;
      context.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },
  neon: {
    colors: [null, '#00f0ff', '#ffee00', '#d500f9', '#39ff14', '#ff1744', '#2979ff', '#ff9100', '#e0e0e0'],
    bg: '#000000',
    grid: '#1a1a22',
    drawBlock(context, px, py, size, color) {
      context.shadowColor = color;
      context.shadowBlur = 12;
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(px + 3, py + 3, size - 6, size - 6);
      context.fillStyle = color;
      context.globalAlpha *= 0.35;
      context.fillRect(px + 3, py + 3, size - 6, size - 6);
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
    },
  },
  pastel: {
    colors: [null, '#a8e6ef', '#fff1b8', '#d9b8f0', '#c1e8c4', '#f5b8b8', '#b8d4f5', '#fcd5a5', '#cfd8dc'],
    bg: null,
    grid: null,
    drawBlock(context, px, py, size, color) {
      const r = size * 0.28;
      const x = px + 1.5, y = py + 1.5, w = size - 3;
      context.beginPath();
      context.moveTo(x + r, y);
      context.arcTo(x + w, y, x + w, y + w, r);
      context.arcTo(x + w, y + w, x, y + w, r);
      context.arcTo(x, y + w, x, y, r);
      context.arcTo(x, y, x + w, y, r);
      context.closePath();
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,0.7)';
      context.lineWidth = 1.5;
      context.stroke();
    },
  },
  pixel: {
    colors: [null, '#29adff', '#ffec27', '#7e2553', '#00e436', '#ff004d', '#1d2b53', '#ffa300', '#83769c'],
    bg: null,
    grid: null,
    drawBlock(context, px, py, size, color) {
      const u = size / 6; // rejilla de 6x6 "píxeles" por bloque
      context.fillStyle = color;
      context.fillRect(px, py, size, size);
      // luz arriba/izquierda, sombra abajo/derecha
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.fillRect(px, py, size, u);
      context.fillRect(px, py, u, size);
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.fillRect(px, py + size - u, size, u);
      context.fillRect(px + size - u, py, u, size);
      // patrón de tramado (ditherizado) interior
      context.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 1; i < 5; i++)
        for (let j = 1; j < 5; j++)
          if ((i + j) % 2 === 0) context.fillRect(px + j * u, py + i * u, u, u);
    },
  },
};

const SKIN_KEY = 'tetris-skin';
const skinSelect = document.getElementById('skin-select');
let skinName = 'retro';

function activeSkin() { return SKINS[skinName]; }

function applySkin(name) {
  skinName = SKINS[name] ? name : 'retro';
  skinSelect.value = skinName;
  if (current && next) { draw(); drawNext(); }
}

function loadSkin() {
  try {
    const v = localStorage.getItem(SKIN_KEY);
    return SKINS[v] ? v : 'retro';
  } catch (e) {
    return 'retro';
  }
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = activeSkin();
  context.globalAlpha = alpha ?? 1;
  skin.drawBlock(context, x * size, y * size, size, skin.colors[colorIndex]);
  context.globalAlpha = 1;
  context.shadowBlur = 0;
}

// Círculo en el centro de la tuerca (origen de la pieza en x, y; el hueco es la celda central)
function drawNutHole(context, x, y, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  context.strokeStyle = activeSkin().colors[NUT];
  context.lineWidth = 2;
  context.beginPath();
  context.arc((x + 1.5) * size, (y + 1.5) * size, size * 0.3, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = activeSkin().grid || themeColors.grid;
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
  const skinBg = activeSkin().bg;
  if (skinBg) { ctx.fillStyle = skinBg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
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
  const skinBg = activeSkin().bg;
  if (skinBg) { nextCtx.fillStyle = skinBg; nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height); }
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
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
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

skinSelect.addEventListener('change', () => {
  try { localStorage.setItem(SKIN_KEY, skinSelect.value); } catch (e) { /* almacenamiento no disponible */ }
  applySkin(skinSelect.value);
  skinSelect.blur(); // evita que las flechas/Espacio cambien el select durante el juego
});

applySkin(loadSkin());
applyTheme(loadTheme());
init();
