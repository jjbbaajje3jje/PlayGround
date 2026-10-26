import { Game } from './game.js';
import { AudioSystem } from './audio.js';
import {
  STRUCTURE_BLUEPRINTS, UNIT_BLUEPRINTS, BUILD_ORDER, TRAIN_ORDER,
  TUTORIAL_STEPS, PLAYER_COLORS, ENEMY_COLORS
} from './config.js';
import { drawIconFor, drawPixelText } from './art.js';

const $ = (sel) => document.querySelector(sel);

const canvas = $('#game');
const minimapCanvas = $('#minimap');
const bigmapCanvas = $('#bigmap');
const topHud = $('#topHud');
const commandDock = $('#commandDock');
const menu = $('#menu');
const manual = $('#manual');
const pauseScreen = $('#pauseScreen');
const endScreen = $('#endScreen');
const mapOverlay = $('#mapOverlay');
const buildBanner = $('#buildBanner');
const buildBannerText = $('#buildBannerText');
const commandCards = $('#commandCards');
const dockHint = $('#dockHint');
const toastStack = $('#toastStack');
const ticker = $('#alertTicker');
const tickerText = $('#tickerText');
const selIcon = $('#selIcon');
const selIconCtx = selIcon.getContext('2d');
const creditsEl = $('#credits');
const threatTimer = $('#threatTimer');
const threatChip = $('#threatChip');
const objectiveBar = $('#objectiveBar');
const objectiveText = $('#objectiveText');
const selEyebrow = $('#selEyebrow');
const selName = $('#selName');
const selMeta = $('#selMeta');
const selHp = $('#selHp');
const selCount = $('#selCount');

const audio = new AudioSystem();
const game = new Game(canvas, audio);
game.minimapCanvas = minimapCanvas;
game.bigmapCanvas = bigmapCanvas;
window.__nexusGame = game;

const ui = {
  tab: 'build',
  cardsKey: '',
  selIconKey: '',
  menuOpen: true,
  soundMuted: false,
  tickerTimer: null,
  tutorialTimers: [],
  toastMemory: new Map(),
  mapInterval: null,
  minimapLastTap: 0
};

const hudEls = {
  cards: new Map(),
  buildHint: 'BARRACKS UNLOCKS INFANTRY // FACTORY UNLOCKS ARMOR',
  trainHint: 'TRAIN UNITS TO HOLD THE LINE'
};

function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function setMuted(muted) {
  ui.soundMuted = muted;
  audio.setMuted(muted);
  $('#btnSound').classList.toggle('is-muted', muted);
  $('#btnSound').setAttribute('aria-label', muted ? 'Enable audio' : 'Mute audio');
}

function showToast(text, tone = 'info', duration = 3200) {
  const now = performance.now();
  const last = ui.toastMemory.get(text) || 0;
  if (now - last < 700) return;
  ui.toastMemory.set(text, now);
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.textContent = text;
  toastStack.appendChild(el);
  while (toastStack.children.length > 3) toastStack.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, duration);
}

function showAlert(text, tone = 'info') {
  tickerText.textContent = text;
  ticker.classList.remove('is-danger');
  if (tone === 'danger' || tone === 'warn') ticker.classList.add('is-danger');
  ticker.classList.add('is-live');
  clearTimeout(ui.tickerTimer);
  ui.tickerTimer = setTimeout(() => ticker.classList.remove('is-live'), 4300);
}

function clearToasts() {
  toastStack.innerHTML = '';
  ui.toastMemory.clear();
}

function queueTutorial() {
  clearTutorialTimers();
  for (const step of TUTORIAL_STEPS) {
    const id = setTimeout(() => {
      if (game.mode === 'playing') showToast(step.text, 'info', 4300);
    }, step.delay);
    ui.tutorialTimers.push(id);
  }
}

function clearTutorialTimers() {
  for (const id of ui.tutorialTimers) clearTimeout(id);
  ui.tutorialTimers = [];
}

// ── Command cards ─────────────────────────────────────────────────────────

function cardMarkup({ id, name, sub, cost, hotkey = '', action, kind }) {
  return `
    <button class="cmd-card" type="button" data-action="${action}" data-id="${id}" data-kind="${kind}">
      <span class="cmd-hotkey">${hotkey}</span>
      <span class="cmd-status" hidden></span>
      <span class="cmd-lock" hidden></span>
      <canvas class="cmd-icon" width="120" height="78" aria-hidden="true"></canvas>
      <span class="cmd-name">${name}</span>
      <span class="cmd-sub">${sub}</span>
      <span class="cmd-cost${cost === null ? ' no-cost' : ''}">${cost === null ? '—' : `<i></i>${cost}`}</span>
      <span class="cmd-progress" hidden><i></i></span>
    </button>`;
}

function renderCards() {
  commandCards.innerHTML = '';
  hudEls.cards.clear();
  if (ui.tab === 'build') {
    buildBanner.hidden = !game.buildMode;
    for (const id of BUILD_ORDER) {
      const def = STRUCTURE_BLUEPRINTS[id];
      const wrap = document.createElement('div');
      wrap.innerHTML = cardMarkup({
        id, name: def.name, sub: def.desc, cost: def.cost,
        hotkey: def.key || '', action: 'build', kind: 'structure'
      });
      const card = wrap.firstElementChild;
      commandCards.appendChild(card);
      const ctx = card.querySelector('canvas').getContext('2d');
      drawIconFor(id, 'structure', ctx, 120, 78, 1, game.art);
      if (id === 'turret') drawTurretIcon(ctx);
      hudEls.cards.set(card.dataset.id, card);
    }
  } else if (ui.tab === 'train') {
    for (const id of TRAIN_ORDER) {
      const def = UNIT_BLUEPRINTS[id];
      const wrap = document.createElement('div');
      wrap.innerHTML = cardMarkup({
        id, name: def.name, sub: def.desc, cost: def.cost,
        hotkey: def.key || '', action: 'train', kind: 'unit'
      });
      const card = wrap.firstElementChild;
      commandCards.appendChild(card);
      const ctx = card.querySelector('canvas').getContext('2d');
      drawIconFor(id, 'unit', ctx, 120, 78, 1, game.art);
      hudEls.cards.set(card.dataset.id, card);
    }
  } else {
    const actions = [
      { id: 'all', name: 'ALL ARMY', sub: 'SELECT COMBAT', hotkey: 'A' },
      { id: 'hold', name: 'HOLD', sub: 'BRACE POSITION', hotkey: 'H' },
      { id: 'stop', name: 'STOP', sub: 'CANCEL ORDERS', hotkey: 'S' },
      { id: 'rally', name: 'REGROUP', sub: 'RECALL TO AEGIS', hotkey: 'R' }
    ];
    for (const a of actions) {
      const wrap = document.createElement('div');
      wrap.innerHTML = cardMarkup({
        id: a.id, name: a.name, sub: a.sub, cost: null,
        hotkey: a.hotkey, action: 'army', kind: 'action'
      });
      const card = wrap.firstElementChild;
      commandCards.appendChild(card);
      const ctx = card.querySelector('canvas').getContext('2d');
      drawActionIcon(a.id, ctx);
      hudEls.cards.set(card.dataset.id, card);
    }
  }
  updateCards();
}

function drawTurretIcon(ctx) {
  // drawIconFor cannot resolve the composite turret; draw its base + gun portrait.
  ctx.clearRect(0, 0, 120, 78);
  const base = game.art.structures.turretBase;
  const gun = game.art.structures.turretGun;
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = PLAYER_COLORS.primary;
  ctx.beginPath();
  ctx.ellipse(60, 61, 31, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.drawImage(base, 33, 21, 56, 56);
  ctx.save();
  ctx.translate(61, 49);
  ctx.rotate(-0.22);
  ctx.drawImage(gun, -27, -14, 62, 36);
  ctx.restore();
}

function drawActionIcon(id, ctx) {
  ctx.clearRect(0, 0, 120, 78);
  ctx.imageSmoothingEnabled = false;
  const cx = 60;
  const cy = 40;
  const mint = PLAYER_COLORS.primary;
  const amber = PLAYER_COLORS.accent;
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = mint;
  ctx.beginPath();
  ctx.ellipse(cx, 62, 32, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  if (id === 'all') {
    for (const [x, y, s] of [[32, 49, 0.8], [60, 42, 1], [88, 49, 0.8]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.fillStyle = '#152c28';
      ctx.fillRect(-10, -10, 20, 18);
      ctx.fillStyle = mint;
      ctx.fillRect(-6, -5, 12, 4);
      ctx.fillStyle = PLAYER_COLORS.dark;
      ctx.fillRect(-8, 8, 5, 5);
      ctx.fillRect(3, 8, 5, 5);
      ctx.fillStyle = mint;
      ctx.fillRect(5, -1, 8, 2);
      ctx.restore();
    }
  } else if (id === 'hold') {
    ctx.fillStyle = '#132b27';
    ctx.beginPath();
    ctx.moveTo(cx, 17);
    ctx.lineTo(cx + 21, 25);
    ctx.lineTo(cx + 18, 49);
    ctx.lineTo(cx, 61);
    ctx.lineTo(cx - 18, 49);
    ctx.lineTo(cx - 21, 25);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = mint;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = mint;
    ctx.fillRect(cx - 2, 27, 4, 18);
    ctx.fillRect(cx - 7, 32, 14, 4);
  } else if (id === 'stop') {
    ctx.strokeStyle = PLAYER_COLORS.hostile;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PLAYER_COLORS.hostile;
    ctx.fillRect(cx - 14, cy - 2, 28, 4);
  } else if (id === 'rally') {
    ctx.fillStyle = '#1a302c';
    ctx.fillRect(cx - 2, 14, 3, 42);
    ctx.fillStyle = amber;
    ctx.beginPath();
    ctx.moveTo(cx + 1, 14);
    ctx.lineTo(cx + 27, 21);
    ctx.lineTo(cx + 1, 30);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = mint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, 61, 17, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function updateCards() {
  const snap = game.getSnapshot();
  for (const [id, card] of hudEls.cards) {
    card.classList.remove('is-disabled', 'is-unavailable', 'is-selected');
    const status = card.querySelector('.cmd-status');
    const lock = card.querySelector('.cmd-lock');
    const progress = card.querySelector('.cmd-progress');
    if (status) status.hidden = true;
    if (lock) lock.hidden = true;
    if (progress) progress.hidden = true;
    if (card.dataset.action === 'build') {
      const def = STRUCTURE_BLUEPRINTS[id];
      const req = id === 'factory' && !game.hasCompletedStructure('barracks') ? 'BARRACKS' : null;
      if (req) {
        card.classList.add('is-unavailable');
        if (lock) { lock.hidden = false; lock.textContent = 'REQ ' + req; }
      } else if (snap.credits < def.cost) {
        card.classList.add('is-disabled');
      }
      if (game.buildMode === id) card.classList.add('is-selected');
    } else if (card.dataset.action === 'train') {
      const def = UNIT_BLUEPRINTS[id];
      const building = game.trainingBuilding(id);
      const count = game.queueCount(id);
      if (!building) {
        card.classList.add('is-unavailable');
        if (lock) {
          lock.hidden = false;
          lock.textContent = def.from === 'hq' ? 'NO HQ' : 'REQ ' + def.from.toUpperCase();
        }
      } else if (snap.credits < def.cost) {
        card.classList.add('is-disabled');
      }
      if (count > 0) {
        if (status) {
          status.hidden = false;
          status.textContent = count > 1 ? `x${count}` : 'Q';
        }
        const p = game.queueProgress(id);
        if (progress && p > 0) {
          progress.hidden = false;
          progress.firstElementChild.style.width = `${Math.round(p * 100)}%`;
        }
      }
    } else if (card.dataset.action === 'army') {
      if (id === 'hold') {
        const units = game.getSelected().filter((u) => u.kind === 'unit');
        if (units.length && units.every((u) => u.hold)) card.classList.add('is-selected');
      }
    }
  }
}

function setTab(tab) {
  if (ui.tab === tab) return;
  ui.tab = tab;
  for (const btn of document.querySelectorAll('.dock-tab')) {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  }
  audio.click();
  renderCards();
  updateDockHint();
}

function updateDockHint() {
  if (game.buildMode) {
    const def = STRUCTURE_BLUEPRINTS[game.buildMode];
    dockHint.textContent = `${def.name} // TAP A LINKED GRID SITE`;
    return;
  }
  if (ui.tab === 'build') {
    dockHint.textContent = game.hasCompletedStructure('barracks')
      ? 'FACTORY UNLOCKED // DEPLOY ARMOR'
      : 'BARRACKS UNLOCKS INFANTRY // FACTORY UNLOCKS ARMOR';
  } else if (ui.tab === 'train') {
    const snap = game.getSnapshot();
    dockHint.textContent = `${snap.army} COMBAT // ${snap.haulers} HAULERS // ${snap.credits} TITANIUM`;
  } else {
    dockHint.textContent = 'TAP MAP TO MOVE // TAP HOSTILE TO ATTACK';
  }
}

// ── HUD ───────────────────────────────────────────────────────────────────

function updateHud() {
  const snap = game.getSnapshot();
  creditsEl.textContent = String(Math.floor(snap.credits));
  threatTimer.textContent = formatClock(snap.threat);
  threatChip.classList.toggle('is-critical', snap.threat <= 10 && snap.mode === 'playing');
  objectiveBar.style.width = `${Math.max(0, Math.min(100, (snap.nexusHp / snap.nexusMax) * 100))}%`;
  objectiveText.textContent = snap.nexusAlive ? 'DESTROY ASHEN NEXUS' : 'SECTOR SECURED';

  selName.textContent = snap.selName;
  selMeta.textContent = snap.selCount ? snap.selMeta : 'STANDBY';
  selEyebrow.textContent = snap.selCount ? (snap.selKind === 'structure' ? 'STRUCTURE' : 'FIRE TEAM') : 'NO SELECTION';
  selCount.textContent = snap.selCount ? String(snap.selCount).padStart(2, '0') : '--';
  const pct = Math.round(snap.selHpPct * 100);
  selHp.style.width = `${snap.selCount ? pct : 0}%`;
  selHp.classList.toggle('low', snap.selCount > 0 && pct <= 55 && pct > 25);
  selHp.classList.toggle('critical', snap.selCount > 0 && pct <= 25);
  const key = snap.selType ? `${snap.selKind}:${snap.selType}` : `none:${snap.selCount}`;
  if (key !== ui.selIconKey) {
    ui.selIconKey = key;
    selIconCtx.clearRect(0, 0, 72, 72);
    if (snap.selType) {
      if (snap.selType === 'turret') {
        selIconCtx.drawImage(game.art.structures.turretBase, 6, 6, 60, 60);
        selIconCtx.save();
        selIconCtx.translate(36, 35);
        selIconCtx.rotate(-0.2);
        selIconCtx.drawImage(game.art.structures.turretGun, -23, -12, 52, 30);
        selIconCtx.restore();
      } else {
        drawIconFor(snap.selType, snap.selKind, selIconCtx, 72, 72, 1, game.art);
      }
    } else {
      selIconCtx.fillStyle = 'rgba(131,255,217,0.35)';
      selIconCtx.fillRect(33, 20, 6, 32);
      selIconCtx.fillRect(20, 33, 32, 6);
    }
  }

  buildBanner.hidden = !game.buildMode;
  if (game.buildMode) {
    const def = STRUCTURE_BLUEPRINTS[game.buildMode];
    buildBannerText.textContent = `DEPLOY ${def.name} // ${def.cost} CR`;
    buildBanner.classList.toggle('is-invalid', game.buildGhost ? !game.buildGhost.valid : false);
  }

  updateCards();
  updateDockHint();
  if (mapOverlay.hidden === false) game.renderBigMap();
}

// ── Event bridge ──────────────────────────────────────────────────────────

function handleGameEvent(ev) {
  if (ev.type === 'toast') showToast(ev.text, ev.tone);
  else if (ev.type === 'alert') showAlert(ev.text, ev.tone);
  else if (ev.type === 'sound') {
    if (ev.sound === 'alert') audio.alert();
    else if (ev.sound === 'build') audio.build();
    else if (ev.sound === 'train') audio.train();
    else if (ev.sound === 'select') audio.select();
    else if (ev.sound === 'click') audio.click();
  } else if (ev.type === 'gameover') {
    showEndScreen(ev.victory);
  }
}

// ── Menu / game flow ──────────────────────────────────────────────────────

function startGame() {
  if (!ui.menuOpen) return;
  audio.init();
  setMuted(ui.soundMuted);
  ui.menuOpen = false;
  game.reset('playing');
  clearToasts();
  menu.classList.add('is-leaving');
  setTimeout(() => {
    menu.hidden = true;
    menu.classList.remove('is-leaving');
  }, 440);
  topHud.classList.remove('is-muted');
  commandDock.classList.remove('is-muted');
  pauseScreen.hidden = true;
  endScreen.hidden = true;
  manual.hidden = true;
  mapOverlay.hidden = true;
  ui.tab = 'build';
  for (const btn of document.querySelectorAll('.dock-tab')) {
    btn.classList.toggle('is-active', btn.dataset.tab === 'build');
    btn.setAttribute('aria-selected', btn.dataset.tab === 'build' ? 'true' : 'false');
  }
  renderCards();
  showAlert('DROP COMPLETE // ESTABLISH FORWARD OPERATIONS');
  setTimeout(() => {
    if (game.mode === 'playing') showToast('PRIMARY TARGET: ASHEN NEXUS // NORTH', 'info', 4200);
  }, 700);
  queueTutorial();
}

function openMenu() {
  clearTutorialTimers();
  clearToasts();
  ui.menuOpen = true;
  game.reset('menu');
  menu.hidden = false;
  menu.classList.remove('is-leaving');
  topHud.classList.add('is-muted');
  commandDock.classList.add('is-muted');
  pauseScreen.hidden = true;
  endScreen.hidden = true;
  manual.hidden = true;
  mapOverlay.hidden = true;
  ticker.classList.remove('is-live');
  ui.selIconKey = '';
}

function restartGame() {
  clearTutorialTimers();
  clearToasts();
  game.reset('playing');
  menu.hidden = true;
  topHud.classList.remove('is-muted');
  commandDock.classList.remove('is-muted');
  pauseScreen.hidden = true;
  endScreen.hidden = true;
  mapOverlay.hidden = true;
  manual.hidden = true;
  ui.tab = 'build';
  for (const btn of document.querySelectorAll('.dock-tab')) {
    btn.classList.toggle('is-active', btn.dataset.tab === 'build');
    btn.setAttribute('aria-selected', btn.dataset.tab === 'build' ? 'true' : 'false');
  }
  renderCards();
  showAlert('OPERATION RESTARTED // FORWARD BASE ONLINE');
  queueTutorial();
}

function pauseGame() {
  if (game.mode !== 'playing') return;
  game.mode = 'paused';
  pauseScreen.hidden = false;
  audio.click();
}

function resumeGame() {
  if (game.mode !== 'paused') return;
  game.mode = 'playing';
  pauseScreen.hidden = true;
  audio.click();
}

function showEndScreen(victory) {
  clearTutorialTimers();
  endScreen.hidden = false;
  endScreen.classList.toggle('is-defeat', !victory);
  $('#endStamp').textContent = victory ? 'OPERATION COMPLETE' : 'SIGNAL LOST';
  $('#endTitle').textContent = victory ? 'NEXUS BREACHED' : 'AEGIS DOWN';
  $('#endCopy').textContent = victory
    ? 'The Ashen command node is ash. K-7 belongs to the living.'
    : 'The forward base has fallen. The Legion moves unopposed.';
  const snap = game.getSnapshot();
  $('#statTime').textContent = formatClock(snap.elapsed);
  $('#statKills').textContent = String(snap.stats.kills);
  $('#statUnits').textContent = String(snap.stats.units);
  $('#statMined').textContent = String(Math.floor(snap.stats.mined));
  if (victory) {
    $('#statMined').textContent = String(Math.floor(snap.stats.mined));
  }
}

function openManual() {
  manual.hidden = false;
  audio.init();
  audio.click();
}

function closeManual() {
  manual.hidden = true;
  audio.click();
}

function openMap() {
  if (ui.menuOpen || game.mode === 'menu') return;
  mapOverlay.hidden = false;
  game.renderBigMap();
  clearInterval(ui.mapInterval);
  ui.mapInterval = setInterval(() => {
    if (!mapOverlay.hidden) game.renderBigMap();
  }, 350);
  audio.click();
}

function closeMap() {
  mapOverlay.hidden = true;
  clearInterval(ui.mapInterval);
  ui.mapInterval = null;
  audio.click();
}

// ── UI events ─────────────────────────────────────────────────────────────

for (const btn of document.querySelectorAll('.dock-tab')) {
  btn.addEventListener('click', () => setTab(btn.dataset.tab));
}

commandCards.addEventListener('click', (e) => {
  const card = e.target.closest('.cmd-card');
  if (!card) return;
  const action = card.dataset.action;
  const id = card.dataset.id;
  if (action === 'build') {
    const result = game.beginBuild(id);
    if (!result.ok) {
      showToast(result.message, 'warn');
      audio.deny();
    } else {
      showToast(result.message, 'info');
      renderCards();
    }
  } else if (action === 'train') {
    const result = game.train(id);
    if (!result.ok) {
      showToast(result.message, 'warn');
      audio.deny();
    }
    updateCards();
  } else if (action === 'army') {
    game.armyAction(id);
    updateCards();
  }
});

$('#cancelBuild').addEventListener('click', () => {
  game.cancelBuild();
  renderCards();
});

$('#minimapWrap').addEventListener('pointerdown', (e) => {
  if (ui.menuOpen) return;
  e.preventDefault();
  const rect = minimapCanvas.getBoundingClientRect();
  const fx = (e.clientX - rect.left) / rect.width;
  const fy = (e.clientY - rect.top) / rect.height;
  game.centerOnMapFraction(Math.max(0, Math.min(1, fx)), Math.max(0, Math.min(1, fy)));
  game.updateMinimap();
  const now = performance.now();
  if (now - ui.minimapLastTap < 360) {
    openMap();
    ui.minimapLastTap = 0;
  } else {
    ui.minimapLastTap = now;
  }
});

bigmapCanvas.addEventListener('pointerdown', (e) => {
  const rect = bigmapCanvas.getBoundingClientRect();
  const fx = (e.clientX - rect.left) / rect.width;
  const fy = (e.clientY - rect.top) / rect.height;
  game.centerOnMapFraction(Math.max(0, Math.min(1, fx)), Math.max(0, Math.min(1, fy)));
  closeMap();
});

$('#btnDeploy').addEventListener('click', startGame);
$('#btnManual').addEventListener('click', openManual);
$('#btnCloseManual').addEventListener('click', closeManual);
$('#btnResume').addEventListener('click', resumeGame);
$('#btnRestart').addEventListener('click', restartGame);
$('#btnTitle').addEventListener('click', openMenu);
$('#btnRedeploy').addEventListener('click', () => {
  endScreen.hidden = true;
  restartGame();
});
$('#btnPause').addEventListener('click', () => {
  if (game.mode === 'playing') pauseGame();
  else if (game.mode === 'paused') resumeGame();
});
$('#btnSound').addEventListener('click', () => {
  audio.init();
  setMuted(!ui.soundMuted);
  if (!ui.soundMuted) audio.select();
});
$('#btnCloseMap').addEventListener('click', closeMap);

document.addEventListener('keydown', (e) => {
  if (ui.menuOpen) {
    if (e.key === 'Enter') startGame();
    return;
  }
  if (e.key === 'Escape') {
    if (!manual.hidden) { closeManual(); return; }
    if (!mapOverlay.hidden) { closeMap(); return; }
    if (game.buildMode) {
      game.cancelBuild();
      renderCards();
      return;
    }
    if (game.mode === 'playing') pauseGame();
    else if (game.mode === 'paused') resumeGame();
    return;
  }
  if (!manual.hidden || !mapOverlay.hidden) return;
  const key = e.key.toLowerCase();
  if (key === 'b') setTab('build');
  else if (key === 't') setTab('train');
  else if (key === 'a') setTab('army');
  else if (key === 'm') { if (mapOverlay.hidden) openMap(); else closeMap(); }
  else if (key === 'h') game.toggleHold();
  else if (key === 's') game.stopSelected();
  else if (key === 'r') game.regroup();
  else if (e.key === ' ') {
    e.preventDefault();
    if (game.mode === 'playing') pauseGame();
    else if (game.mode === 'paused') resumeGame();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'playing') pauseGame();
});

window.addEventListener('resize', () => {
  game.resize();
  game.updateMinimap();
  if (!mapOverlay.hidden) game.renderBigMap();
});
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    game.resize();
    game.updateMinimap();
  }, 350);
});

// ── Loop ──────────────────────────────────────────────────────────────────

let lastTime = performance.now();
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - lastTime) / 1000));
  lastTime = now;
  game.update(dt);
  game.render();
  for (const ev of game.drainEvents()) handleGameEvent(ev);
  requestAnimationFrame(frame);
}

renderCards();
updateHud();
requestAnimationFrame(frame);

setInterval(() => {
  if (game.mode !== 'menu') {
    updateHud();
    game.updateMinimap();
  }
}, 130);
