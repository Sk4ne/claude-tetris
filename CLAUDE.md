# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Tetris in vanilla JavaScript + HTML5 Canvas. No dependencies, no build step, no tests, no linter. The README and UI text are in Spanish; keep user-facing strings in Spanish.

## Running

Open `index.html` directly in a browser, or serve the folder (e.g. `python3 -m http.server 8000`) and visit `http://localhost:8000`.

## Architecture

Everything lives in three files: `index.html` (canvases `#board` 300x600 and `#next-canvas` 120x120, HUD spans, `#overlay`), `style.css`, and `game.js` (all logic, loaded as a classic script, `'use strict'`).

`game.js` is a single global-state module:
- State is module-level `let` variables (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, ...) reset by `init()`, which is also the restart-button handler.
- `board` is a `ROWS x COLS` matrix of 0 or a piece-type index (1–8); that index selects the color in `COLORS` and the shape in `PIECES`. Type 8 (`NUT`) is the 3x3 "tuerca" ring with an empty center; `drawNutHole` draws its hole circle on the falling/ghost/next pieces. Pieces are `{type, shape, x, y}` with `shape` a copied matrix; rotation (`rotateCW`) produces a new matrix, with horizontal wall kicks `[0,-1,1,-2,2]` in `tryRotate`.
- Game loop: `loop(ts)` via `requestAnimationFrame` accumulates `dropAccum` against `dropInterval` (recomputed in `clearLines` from level: `max(100, 1000 - (level-1)*90)`), then calls `draw()`. Pause/game-over stop the loop with `cancelAnimationFrame(animId)`; unpausing restarts it.
- Piece lifecycle: `lockPiece()` → `merge()` → `clearLines()` → `spawn()`; `spawn()` ends the game if the new piece collides immediately.
- Input is a single `keydown` handler (arrows, X rotate, Space hard drop, P pause). Soft/hard drop add score directly (1 / 2 per row); line-clear scoring uses `LINE_SCORES * level`.
- The HUD is updated imperatively via `updateHUD()`; the keydown handler calls it after every key.
- Records (localStorage `tetris-records`): `{ top: [{name, score, lines, level, date}] (max 5, desc), bestCombo, maxLines }`, always in try/catch (`loadRecords`/`saveRecords`). A start screen (`#start-overlay`) is shown on load; `init()` only runs when "Jugar" is clicked (`started` gates the keydown handler before that). `combo`/`maxCombo` are computed in `lockPiece()` (consecutive locks that clear lines) and reset in `init()`. `endGame()` calls `showGameOverRecords()`: it persists bestCombo/maxLines and, if the score qualifies, shows the name input (`pendingRecord`, committed by Enter/Guardar/Reiniciar). The keydown handler ignores events whose target is an `INPUT`.

## Menú de pausa

`P`/`Escape` llama a `togglePause()`, que abre `#pause-menu` (separado de `#overlay`, que solo se usa en game over). Con `paused` activo el handler de `keydown` bloquea las teclas del juego (`preventDefault`); `closePauseMenu()` hace blur de los controles y fija `inputBlockedUntil` (~150 ms de gracia). `startLevel` (localStorage `tetris-start-level`, 1–10) lo aplica `init()`; `clearLines` usa `Math.max(startLevel, ...)`.
