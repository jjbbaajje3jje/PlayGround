import {
  TILE, MAP_TILES, WORLD, PLAYER, ENEMY, PLAYER_COLORS, ENEMY_COLORS,
  UNIT_BLUEPRINTS, ENEMY_BLUEPRINTS, STRUCTURE_BLUEPRINTS,
  BUILD_ORDER, TRAIN_ORDER, WAVE_FIRST, WAVE_INTERVAL
} from './config.js';
import {
  createArt, generateTerrain, CRYSTAL_SITES, drawCrystalCluster,
  drawSelectionRing, drawStructureHealthBar, drawUnitHealthBar,
  drawBuildGhost, drawScaffold, drawTurretBaseRotated, drawMoveMarker,
  drawPixelText, px
} from './art.js';

const TAU = Math.PI * 2;
const LINK_RANGE = TILE * 6.6;
const AGGRO = TILE * 6.2;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function tileCenter(tx, ty) { return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }; }
function gridCenter(tx, ty, size) { return { x: (tx + size / 2) * TILE, y: (ty + size / 2) * TILE }; }

class MinHeap {
  constructor() { this.items = []; this.priority = []; }
  get size() { return this.items.length; }
  push(item, priority) {
    let i = this.items.length;
    this.items.push(item);
    this.priority.push(priority);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.priority[p] <= priority) break;
      this.items[i] = this.items[p];
      this.priority[i] = this.priority[p];
      i = p;
    }
    this.items[i] = item;
    this.priority[i] = priority;
  }
  pop() {
    const top = this.items[0];
    const lastItem = this.items.pop();
    const lastPriority = this.priority.pop();
    if (this.items.length) {
      let i = 0;
      const n = this.items.length;
      while (true) {
        let l = i * 2 + 1;
        let r = l + 1;
        if (l >= n) break;
        let c = l;
        if (r < n && this.priority[r] < this.priority[l]) c = r;
        if (this.priority[c] >= lastPriority) break;
        this.items[i] = this.items[c];
        this.priority[i] = this.priority[c];
        i = c;
      }
      this.items[i] = lastItem;
      this.priority[i] = lastPriority;
    }
    return top;
  }
}

export class Game {
  constructor(canvas, audio) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.audio = audio;
    this.art = createArt();
    this.terrain = generateTerrain(90210);
    this.viewW = 1;
    this.viewH = 1;
    this.dpr = 1;
    this.zoom = 1;
    this.camera = { x: WORLD / 2, y: WORLD / 2 };
    this.keys = new Set();
    this.pointers = new Map();
    this.drag = null;
    this.pinch = null;
    this.lastTap = null;
    this.hover = null;
    this.hoverWorld = { x: 0, y: 0 };
    this.events = [];
    this.id = 0;
    this.minimapCanvas = null;
    this.bigmapCanvas = null;
    this.mapDirty = true;
    this.resize();
    this.bindInput();
    this.reset('menu');
    this.lastFrame = performance.now();
  }

  // ── Setup ────────────────────────────────────────────────────────────────

  reset(mode = 'playing') {
    this.mode = mode;
    this.time = 0;
    this.elapsed = 0;
    this.credits = 350;
    this.wave = 0;
    this.waveTimer = WAVE_FIRST;
    this.waveWarned = false;
    this.enemySpawnTimer = 26;
    this.enemySpawnCount = 0;
    this.units = [];
    this.structures = [];
    this.crystals = [];
    this.projectiles = [];
    this.effects = [];
    this.decals = [];
    this.entityById = new Map();
    this.selected = new Set();
    this.buildMode = null;
    this.buildGhost = null;
    this.moveMarkers = [];
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.occ = new Uint8Array(MAP_TILES * MAP_TILES);
    this.fogVisible = new Uint8Array(MAP_TILES * MAP_TILES);
    this.fogExplored = new Uint8Array(MAP_TILES * MAP_TILES);
    this.fogTimer = 0;
    this.nexusDiscovered = false;
    this.pendingEnd = null;
    this.endEventSent = false;
    this._id = 0;
    this.stats = { kills: 0, units: 0, mined: 0, shots: 0, lost: 0 };
    this.menuTime = 0;
    this.menuAnchor = { x: 880, y: 1110 };
    this.events.length = 0;
    this.keys.clear();
    this.drag = null;
    this.pinch = null;
    this.pointers.clear();
    this.selectedTab = 'build';
    this.audioReady = false;

    this.setupWorld();
    this.updateVisibility(true);
    this.camera.x = 840;
    this.camera.y = mode === 'menu' ? 1080 : 1190;
    this.zoom = this.fitZoom();
    this.clampCamera();
    this.mapDirty = true;
    this.updateMinimap();
  }

  setupWorld() {
    this.createStructure('hq', PLAYER, gridCenter(19, 30, 3), true);
    this.createStructure('nexus', ENEMY, gridCenter(19, 7, 3), true);
    this.createStructure('spawner', ENEMY, gridCenter(17, 5, 2), true);
    this.createStructure('ashenTurret', ENEMY, gridCenter(15, 8, 1), true);
    this.createStructure('ashenTurret', ENEMY, gridCenter(25, 8, 1), true);

    this.createUnit('rifle', PLAYER, 740, 1346);
    this.createUnit('rifle', PLAYER, 846, 1350);
    this.createUnit('rifle', PLAYER, 912, 1414);
    this.createUnit('viper', PLAYER, 708, 1438);
    this.createUnit('hauler', PLAYER, 706, 1298);
    this.createUnit('hauler', PLAYER, 914, 1300);

    this.createUnit('raider', ENEMY, 760, 520, { guardX: 760, guardY: 520 });
    this.createUnit('raider', ENEMY, 904, 508, { guardX: 904, guardY: 508 });
    this.createUnit('stinger', ENEMY, 690, 450, { guardX: 690, guardY: 450 });
    this.createUnit('marauder', ENEMY, 842, 570, { guardX: 842, guardY: 570 });

    for (const site of CRYSTAL_SITES) {
      const x = (site.x + 0.5) * TILE;
      const y = (site.y + 0.5) * TILE;
      const c = {
        id: ++this._id,
        kind: 'crystal',
        x, y,
        amount: site.amount,
        maxAmount: site.amount,
        radius: 17
      };
      this.crystals.push(c);
    }
  }

  fitZoom() {
    const base = Math.min(this.viewW / 720, this.viewH / 680);
    const floor = this.viewW < 620 ? 0.82 : 0.72;
    return clamp(Math.max(floor, base), 0.62, 1.24);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.viewW = Math.max(1, rect.width);
    this.viewH = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.mode) {
      this.zoom = clamp(this.zoom, this.minZoom(), this.maxZoom());
      this.clampCamera();
    }
  }

  minZoom() { return 0.56; }
  maxZoom() { return 1.45; }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  drainEvents() {
    const out = this.events.slice();
    this.events.length = 0;
    return out;
  }

  // ── Entity creation ──────────────────────────────────────────────────────

  createUnit(type, team, x, y, options = {}) {
    const def = team === PLAYER ? UNIT_BLUEPRINTS[type] : ENEMY_BLUEPRINTS[type];
    if (!def) throw new Error(`Unknown unit ${type}`);
    const u = {
      id: ++this._id,
      type: 'unit',
      def,
      team,
      x, y,
      hp: def.hp,
      maxHp: def.hp,
      radius: def.radius,
      angle: options.angle ?? (team === ENEMY ? Math.PI * 0.5 : -Math.PI * 0.5),
      aimAngle: options.angle ?? (team === ENEMY ? Math.PI * 0.5 : -Math.PI * 0.5),
      speed: def.speed,
      cooldown: Math.random() * (def.cooldown || 0.5),
      target: null,
      targetId: null,
      order: null,
      path: [],
      pathIndex: 0,
      repathTimer: 0,
      moving: false,
      walkPhase: Math.random() * 10,
      hold: false,
      assault: !!options.assault,
      guardX: options.guardX ?? x,
      guardY: options.guardY ?? y,
      homeX: x,
      homeY: y,
      explicitTarget: false,
      state: type === 'hauler' ? 'seek' : 'idle',
      mineNode: null,
      mineTimer: 0,
      carried: 0,
      returning: false,
      spawnFlash: 0.8,
      dead: false,
      seekTimer: Math.random() * 1.5,
      smokeTimer: Math.random()
    };
    this.units.push(u);
    this.entityById.set(u.id, u);
    if (team === PLAYER) {
      this.stats.units++;
      this.addSpawnRing(x, y);
    }
    return u;
  }

  createStructure(type, team, center, completed = false) {
    const def = STRUCTURE_BLUEPRINTS[type];
    if (!def) throw new Error(`Unknown structure ${type}`);
    const originTx = Math.round(center.x / TILE - def.size / 2);
    const originTy = Math.round(center.y / TILE - def.size / 2);
    const x = (originTx + def.size / 2) * TILE;
    const y = (originTy + def.size / 2) * TILE;
    const s = {
      id: ++this._id,
      type: 'structure',
      def,
      team,
      x, y,
      originTx, originTy,
      hp: completed ? def.hp : Math.max(25, def.hp * 0.22),
      maxHp: def.hp,
      completed,
      progress: completed ? 1 : 0,
      queue: [],
      trainTimer: 0,
      cooldown: Math.random() * (def.cooldown || 1),
      aimAngle: team === ENEMY ? Math.PI * 0.5 : -Math.PI * 0.5,
      target: null,
      targetId: null,
      rally: null,
      smokeTimer: Math.random() * 2,
      dead: false
    };
    this.structures.push(s);
    this.entityById.set(s.id, s);
    this.markOccupancy(s, 1);
    return s;
  }

  markOccupancy(struct, value) {
    const size = struct.def.size;
    for (let ty = struct.originTy; ty < struct.originTy + size; ty++) {
      for (let tx = struct.originTx; tx < struct.originTx + size; tx++) {
        if (tx < 0 || ty < 0 || tx >= MAP_TILES || ty >= MAP_TILES) continue;
        this.occ[ty * MAP_TILES + tx] = value;
      }
    }
  }

  // ── Camera and screen ────────────────────────────────────────────────────

  clampCamera() {
    const halfW = this.viewW / (this.zoom * 2);
    const halfH = this.viewH / (this.zoom * 2);
    if (halfW * 2 >= WORLD) this.camera.x = WORLD / 2;
    else this.camera.x = clamp(this.camera.x, halfW, WORLD - halfW);
    if (halfH * 2 >= WORLD) this.camera.y = WORLD / 2;
    else this.camera.y = clamp(this.camera.y, halfH, WORLD - halfH);
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.viewW / 2) / this.zoom + this.camera.x,
      y: (sy - this.viewH / 2) / this.zoom + this.camera.y
    };
  }

  worldToScreen(x, y) {
    return {
      x: (x - this.camera.x) * this.zoom + this.viewW / 2,
      y: (y - this.camera.y) * this.zoom + this.viewH / 2
    };
  }

  centerOnWorld(x, y) {
    this.camera.x = x;
    this.camera.y = y;
    this.clampCamera();
    this.mapDirty = true;
  }

  centerOnMapFraction(fx, fy) {
    this.centerOnWorld(fx * WORLD, fy * WORLD);
  }

  worldToTile(x, y) {
    return { tx: clamp(Math.floor(x / TILE), 0, MAP_TILES - 1), ty: clamp(Math.floor(y / TILE), 0, MAP_TILES - 1) };
  }

  tileIdx(tx, ty) { return ty * MAP_TILES + tx; }

  isTileWalkable(tx, ty, flying = false) {
    if (tx < 0 || ty < 0 || tx >= MAP_TILES || ty >= MAP_TILES) return false;
    const i = this.tileIdx(tx, ty);
    if (flying) return true;
    if (this.terrain.blocked[i]) return false;
    if (this.occ[i]) return false;
    return true;
  }

  isBuildableTile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP_TILES || ty >= MAP_TILES) return false;
    const i = this.tileIdx(tx, ty);
    if (this.terrain.blocked[i] || this.occ[i]) return false;
    const wx = (tx + 0.5) * TILE;
    const wy = (ty + 0.5) * TILE;
    for (const c of this.crystals) {
      if (dist(wx, wy, c.x, c.y) < TILE * 1.3 && c.amount > 0) return false;
    }
    return true;
  }

  isVisibleWorld(x, y) {
    const { tx, ty } = this.worldToTile(x, y);
    return !!this.fogVisible[this.tileIdx(tx, ty)];
  }

  isExploredWorld(x, y) {
    const { tx, ty } = this.worldToTile(x, y);
    return !!this.fogExplored[this.tileIdx(tx, ty)];
  }

  // ── Input ────────────────────────────────────────────────────────────────

  bindInput() {
    const canvas = this.canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e, true));
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.drag) {
        this.hover = null;
      }
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.zoomAt(mx, my, Math.pow(1.0015, -e.deltaY));
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
  }

  onPointerDown(e) {
    if (this.mode === 'menu' || this.mode === 'ended') return;
    if (e.pointerType === 'mouse' && e.button !== 0) {
      if (e.button === 2) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        this.commandAt(this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top));
      }
      return;
    }
    try { this.canvas.setPointerCapture?.(e.pointerId); } catch { /* synthetic or stale pointer */ }
    const rect = this.canvas.getBoundingClientRect();
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top, id: e.pointerId, type: e.pointerType };
    this.pointers.set(e.pointerId, point);
    if (this.pointers.size === 1) {
      this.drag = {
        startX: point.x, startY: point.y, lastX: point.x, lastY: point.y,
        moved: false, time: performance.now(), pointerId: e.pointerId
      };
    } else if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      this.pinch = {
        dist: Math.hypot(dx, dy),
        midX: (pts[0].x + pts[1].x) / 2,
        midY: (pts[0].y + pts[1].y) / 2,
        zoom: this.zoom
      };
      if (this.drag) this.drag.moved = true;
    }
  }

  onPointerMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (this.pointers.has(e.pointerId)) {
      const p = this.pointers.get(e.pointerId);
      p.x = x; p.y = y;
    }
    if (this.pointers.size === 2 && this.pinch) {
      const pts = [...this.pointers.values()];
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const distNow = Math.max(12, Math.hypot(dx, dy));
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const before = this.screenToWorld(this.pinch.midX, this.pinch.midY);
      const nextZoom = clamp(this.pinch.zoom * (distNow / Math.max(12, this.pinch.dist)), this.minZoom(), this.maxZoom());
      this.zoom = nextZoom;
      const after = this.screenToWorld(midX, midY);
      this.camera.x += before.x - after.x;
      this.camera.y += before.y - after.y;
      this.pinch.midX = midX; this.pinch.midY = midY; this.pinch.dist = distNow; this.pinch.zoom = nextZoom;
      this.clampCamera();
      this.mapDirty = true;
      return;
    }
    this.hoverWorld = this.screenToWorld(x, y);
    if (e.pointerType === 'mouse') {
      this.updateHover();
    }
    if (this.drag && this.drag.pointerId === e.pointerId) {
      const dx = x - this.drag.lastX;
      const dy = y - this.drag.lastY;
      if (!this.drag.moved && dist(x, y, this.drag.startX, this.drag.startY) > 7) {
        this.drag.moved = true;
      }
      if (this.drag.moved) {
        this.camera.x -= dx / this.zoom;
        this.camera.y -= dy / this.zoom;
        this.clampCamera();
        this.mapDirty = true;
      }
      this.drag.lastX = x;
      this.drag.lastY = y;
    }
    if (this.buildMode) {
      this.updateBuildGhost(this.screenToWorld(x, y));
    }
  }

  onPointerUp(e, cancelled = false) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) {
      const drag = this.drag;
      this.drag = null;
      this.pinch = null;
      if (!cancelled && drag && drag.pointerId === e.pointerId && !drag.moved && performance.now() - drag.time < 700) {
        this.onTap(drag.lastX, drag.lastY);
      }
    } else if (this.pointers.size === 1) {
      this.pinch = null;
      const only = [...this.pointers.values()][0];
      this.drag = {
        startX: only.x, startY: only.y, lastX: only.x, lastY: only.y,
        moved: true, time: performance.now(), pointerId: only.id
      };
    }
  }

  zoomAt(sx, sy, factor) {
    const before = this.screenToWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, this.minZoom(), this.maxZoom());
    const after = this.screenToWorld(sx, sy);
    this.camera.x += before.x - after.x;
    this.camera.y += before.y - after.y;
    this.clampCamera();
    this.mapDirty = true;
  }

  updateHover() {
    const e = this.pickAt(this.hoverWorld.x, this.hoverWorld.y);
    this.hover = e;
    this.canvas.style.cursor = e ? (e.team === ENEMY ? 'crosshair' : 'pointer') : 'crosshair';
  }

  onTap(sx, sy) {
    if (this.mode !== 'playing') return;
    const world = this.screenToWorld(sx, sy);
    if (this.buildMode) {
      this.updateBuildGhost(world);
      this.tryPlaceBuild();
      return;
    }
    const hit = this.pickAt(world.x, world.y);
    const now = performance.now();
    if (hit) {
      if (hit.kind === 'unit' && hit.team === PLAYER) {
        const prev = this.lastTap;
        if (prev && prev.id === hit.id && now - prev.time < 340) {
          this.selectAllOfType(hit.def.id);
          this.emit('sound', { sound: 'select' });
          this.lastTap = null;
        } else {
          this.selectEntity(hit, false);
          this.audio.select();
          this.lastTap = { id: hit.id, time: now };
        }
        return;
      }
      if (hit.kind === 'structure' && hit.team === PLAYER) {
        this.selectEntity(hit, false);
        this.audio.select();
        this.lastTap = null;
        return;
      }
      if (hit.kind === 'crystal') {
        const harvesters = this.getSelected().filter((u) => u.kind === 'unit' && u.def.id === 'hauler');
        if (harvesters.length) {
          this.assignHarvest(harvesters, hit);
          return;
        }
      }
      if (hit.team === ENEMY) {
        const army = this.getSelected().filter((u) => u.kind === 'unit' && u.def.id !== 'hauler');
        if (army.length) {
          this.issueAttack(army, hit);
        } else {
          this.emit('toast', { text: 'HOSTILE CONTACT // SELECT COMBAT UNITS', tone: 'warn' });
          this.audio.deny();
        }
        return;
      }
    }

    const selectedUnits = this.getSelected().filter((e) => e.kind === 'unit');
    if (selectedUnits.length) {
      this.issueMove(selectedUnits, world.x, world.y);
      return;
    }
    const building = this.getSelected().find((e) => e.kind === 'structure' && e.team === PLAYER);
    if (building) {
      building.rally = { x: world.x, y: world.y };
      this.addMoveMarker(world.x, world.y);
      this.emit('toast', { text: `${building.def.name} RALLY SET`, tone: 'info' });
      this.audio.ack();
      return;
    }
    this.selected.clear();
    this.audio.click();
  }

  commandAt(world) {
    if (this.mode !== 'playing') return;
    const hit = this.pickAt(world.x, world.y);
    const selected = this.getSelected();
    const army = selected.filter((e) => e.kind === 'unit');
    if (!army.length) return;
    if (hit && hit.team === ENEMY) {
      this.issueAttack(army.filter((u) => u.def.id !== 'hauler'), hit);
    } else {
      this.issueMove(army, world.x, world.y);
    }
  }

  // ── Selection ────────────────────────────────────────────────────────────

  getSelected() {
    const out = [];
    for (const id of this.selected) {
      const e = this.entityById.get(id);
      if (e && !e.dead) out.push(e);
    }
    return out;
  }

  selectEntity(entity, additive = false) {
    if (!additive) this.selected.clear();
    if (entity.kind === 'structure') {
      if (!additive) this.selected.clear();
      this.selected.add(entity.id);
    } else if (this.selected.has(entity.id) && additive) {
      this.selected.delete(entity.id);
    } else {
      this.selected.add(entity.id);
    }
    if (!additive) {
      const all = this.getSelected();
      const hasUnits = all.some((e) => e.kind === 'unit');
      const hasBuildings = all.some((e) => e.kind === 'structure');
      if (hasUnits && hasBuildings) {
        for (const e of all) if (e.kind === 'structure') this.selected.delete(e.id);
      }
    }
  }

  selectAllOfType(type) {
    this.selected.clear();
    for (const u of this.units) {
      if (!u.dead && u.team === PLAYER && u.def.id === type) this.selected.add(u.id);
    }
    this.audio.select();
    this.emit('toast', { text: `${this.getSelected().length} ${UNIT_BLUEPRINTS[type]?.name || 'UNITS'} SELECTED`, tone: 'info' });
  }

  selectAllArmy() {
    this.selected.clear();
    for (const u of this.units) {
      if (!u.dead && u.team === PLAYER && u.def.id !== 'hauler') this.selected.add(u.id);
    }
    if (!this.selected.size) {
      this.emit('toast', { text: 'NO COMBAT UNITS AVAILABLE', tone: 'warn' });
      this.audio.deny();
    } else {
      this.audio.select();
      this.emit('toast', { text: `${this.selected.size} COMBAT UNITS SELECTED`, tone: 'info' });
    }
  }

  pickAt(x, y) {
    const margin = Math.max(7, 13 / this.zoom);
    let best = null;
    let bestD = Infinity;
    for (const u of this.units) {
      if (u.dead) continue;
      if (u.team === ENEMY && !this.isVisibleWorld(u.x, u.y)) continue;
      const d = dist(x, y, u.x, u.y);
      if (d < u.radius + margin && d < bestD) {
        best = u; bestD = d;
      }
    }
    if (best) return best;
    for (const s of this.structures) {
      if (s.dead) continue;
      if (s.team === ENEMY && !this.isVisibleWorld(s.x, s.y)) continue;
      const half = s.def.size * TILE * 0.5 + 2;
      if (x > s.x - half && x < s.x + half && y > s.y - half && y < s.y + half) {
        return s;
      }
    }
    let crystal = null;
    let crystalD = Infinity;
    for (const c of this.crystals) {
      if (c.amount <= 0) continue;
      const d = dist(x, y, c.x, c.y);
      if (d < TILE * 0.8 && d < crystalD) { crystal = c; crystalD = d; }
    }
    return crystal || null;
  }

  // ── Orders ───────────────────────────────────────────────────────────────

  issueMove(units, x, y) {
    const list = units.filter((u) => !u.dead && u.team === PLAYER);
    if (!list.length) return;
    const cols = Math.ceil(Math.sqrt(list.length));
    const spacing = 30;
    list.forEach((u, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const ox = (col - (cols - 1) / 2) * spacing;
      const oy = (row - (Math.ceil(list.length / cols) - 1) / 2) * spacing;
      const dx = x + ox;
      const dy = y + oy;
      u.order = { type: 'move', x: dx, y: dy };
      u.target = null;
      u.targetId = null;
      u.explicitTarget = false;
      u.hold = false;
      u.assault = false;
      u.moving = true;
      if (u.def.id === 'hauler') {
        u.state = 'idle';
        u.mineNode = null;
      }
      this.issuePath(u, dx, dy, true);
    });
    this.addMoveMarker(x, y);
    this.audio.ack();
  }

  issueAttack(units, target) {
    const list = units.filter((u) => !u.dead && u.team === PLAYER && u.def.id !== 'hauler');
    if (!list.length) return;
    for (const u of list) {
      u.order = null;
      u.target = target;
      u.targetId = target.id;
      u.explicitTarget = true;
      u.hold = false;
      u.path = [];
      u.pathIndex = 0;
      u.repathTimer = 0;
    }
    this.addMoveMarker(target.x, target.y, true);
    this.emit('toast', { text: `FOCUS FIRE // ${target.def.name || 'HOSTILE'}`, tone: 'info' });
    this.audio.ack();
  }

  assignHarvest(haulers, crystal) {
    for (const h of haulers) {
      h.state = 'seek';
      h.mineNode = crystal;
      h.order = null;
      h.target = null;
      h.returning = false;
      h.mineTimer = 0;
      h.path = [];
      this.issuePath(h, crystal.x + 15, crystal.y + 12, true);
    }
    this.emit('toast', { text: 'TITANITE NODE PRIORITIZED', tone: 'info' });
    this.audio.ack();
  }

  issuePath(unit, x, y, force = false) {
    const tx = clamp(Math.floor(x / TILE), 0, MAP_TILES - 1);
    const ty = clamp(Math.floor(y / TILE), 0, MAP_TILES - 1);
    const path = this.findPath(unit.x, unit.y, tx, ty, !!unit.def.flying);
    if (!path) {
      if (force) this.addMoveMarker(x, y);
      return false;
    }
    if (path.length) {
      const endTx = Math.floor(x / TILE);
      const endTy = Math.floor(y / TILE);
      if (this.isTileWalkable(endTx, endTy, !!unit.def.flying)) path[path.length - 1] = { x, y };
    } else {
      path.push({ x, y });
    }
    unit.path = path;
    unit.pathIndex = 0;
    return true;
  }

  findPath(sx, sy, gtx, gty, flying) {
    if (!this.isTileWalkable(gtx, gty, flying)) {
      const near = this.nearestWalkable(gtx, gty, flying);
      if (!near) return null;
      gtx = near.tx; gty = near.ty;
    }
    const stx = clamp(Math.floor(sx / TILE), 0, MAP_TILES - 1);
    const sty = clamp(Math.floor(sy / TILE), 0, MAP_TILES - 1);
    if (stx === gtx && sty === gty) return [{ x: sx, y: sy }];
    const n = MAP_TILES * MAP_TILES;
    const gScore = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const start = this.tileIdx(stx, sty);
    const goal = this.tileIdx(gtx, gty);
    const open = new MinHeap();
    gScore[start] = 0;
    open.push(start, 0);
    const dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]
    ];
    let found = false;
    let guard = 0;
    while (open.size && guard++ < 4000) {
      const current = open.pop();
      if (closed[current]) continue;
      if (current === goal) { found = true; break; }
      closed[current] = 1;
      const cx = current % MAP_TILES;
      const cy = Math.floor(current / MAP_TILES);
      for (const [dx, dy, cost] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.isTileWalkable(nx, ny, flying)) continue;
        if (dx && dy) {
          if (!this.isTileWalkable(cx + dx, cy, flying) || !this.isTileWalkable(cx, cy + dy, flying)) continue;
        }
        const ni = this.tileIdx(nx, ny);
        if (closed[ni]) continue;
        const tentative = gScore[current] + cost;
        if (tentative >= gScore[ni]) continue;
        came[ni] = current;
        gScore[ni] = tentative;
        const hx = Math.abs(nx - gtx);
        const hy = Math.abs(ny - gty);
        const h = (hx + hy) + (Math.SQRT2 - 2) * Math.min(hx, hy);
        open.push(ni, tentative + h);
      }
    }
    if (!found) return null;
    const tiles = [];
    let cur = goal;
    while (cur !== start) {
      const tx = cur % MAP_TILES;
      const ty = Math.floor(cur / MAP_TILES);
      tiles.push({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });
      cur = came[cur];
      if (cur < 0) return null;
    }
    tiles.reverse();
    // Smooth the grid path so units cut corners naturally.
    const smoothed = [];
    let anchorX = sx;
    let anchorY = sy;
    let i = 0;
    while (i < tiles.length) {
      let furthest = i;
      for (let j = tiles.length - 1; j >= i; j--) {
        if (this.lineClear(anchorX, anchorY, tiles[j].x, tiles[j].y, flying)) {
          furthest = j;
          break;
        }
      }
      smoothed.push(tiles[furthest]);
      anchorX = tiles[furthest].x;
      anchorY = tiles[furthest].y;
      i = furthest + 1;
    }
    return smoothed;
  }

  nearestWalkable(tx, ty, flying) {
    for (let r = 1; r < 8; r++) {
      for (let y = ty - r; y <= ty + r; y++) {
        for (let x = tx - r; x <= tx + r; x++) {
          if (Math.abs(x - tx) !== r && Math.abs(y - ty) !== r) continue;
          if (this.isTileWalkable(x, y, flying)) return { tx: x, ty: y };
        }
      }
    }
    return null;
  }

  lineClear(x1, y1, x2, y2, flying) {
    const d = dist(x1, y1, x2, y2);
    const steps = Math.max(1, Math.ceil(d / (TILE * 0.42)));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      const tx = clamp(Math.floor(x / TILE), 0, MAP_TILES - 1);
      const ty = clamp(Math.floor(y / TILE), 0, MAP_TILES - 1);
      if (!this.isTileWalkable(tx, ty, flying)) return false;
    }
    return true;
  }

  // ── Building ─────────────────────────────────────────────────────────────

  hasCompletedStructure(type, team = PLAYER) {
    return this.structures.some((s) => !s.dead && s.team === team && s.completed && s.def.id === type);
  }

  buildRequirement(type) {
    if (type === 'factory' && !this.hasCompletedStructure('barracks')) return 'BARRACKS REQUIRED';
    return null;
  }

  beginBuild(type) {
    if (this.mode !== 'playing') return { ok: false, message: 'LINK OFFLINE' };
    const def = STRUCTURE_BLUEPRINTS[type];
    if (!def) return { ok: false, message: 'INVALID STRUCTURE' };
    if (this.buildMode === type) { this.cancelBuild(); return { ok: false, message: 'DEPLOYMENT ABORTED' }; }
    const req = this.buildRequirement(type);
    if (req) return { ok: false, message: req };
    if (this.credits < def.cost) return { ok: false, message: 'INSUFFICIENT TITANIUM' };
    this.buildMode = type;
    const center = this.screenToWorld(this.viewW / 2, this.viewH / 2 - (this.viewH > 600 ? 60 : 40));
    this.hoverWorld = center;
    this.updateBuildGhost(center);
    if (this.buildGhost && !this.buildGhost.valid) {
      let best = null;
      let bestD = Infinity;
      for (let oy = -4; oy <= 4; oy++) {
        for (let ox = -4; ox <= 4; ox++) {
          if (!ox && !oy) continue;
          const candidate = { x: center.x + ox * TILE, y: center.y + oy * TILE };
          this.updateBuildGhost(candidate);
          if (this.buildGhost.valid) {
            const d = dist(candidate.x, candidate.y, center.x, center.y);
            if (d < bestD) { best = this.buildGhost; bestD = d; }
          }
        }
      }
      if (best) {
        this.buildGhost = best;
        this.hoverWorld = { x: best.x, y: best.y };
      } else {
        this.updateBuildGhost(center);
      }
    }
    this.audio.click();
    return { ok: true, message: `${def.name} // SELECT GRID SITE` };
  }

  cancelBuild() {
    this.buildMode = null;
    this.buildGhost = null;
    this.audio.click();
  }

  updateBuildGhost(world) {
    if (!this.buildMode) return;
    const def = STRUCTURE_BLUEPRINTS[this.buildMode];
    const size = def.size;
    let tx = Math.round(world.x / TILE - size / 2);
    let ty = Math.round(world.y / TILE - size / 2);
    tx = clamp(tx, 1, MAP_TILES - size - 2);
    ty = clamp(ty, 1, MAP_TILES - size - 2);
    const x = (tx + size / 2) * TILE;
    const y = (ty + size / 2) * TILE;
    let valid = true;
    for (let yy = ty; yy < ty + size; yy++) {
      for (let xx = tx; xx < tx + size; xx++) {
        if (!this.isBuildableTile(xx, yy)) valid = false;
      }
    }
    let linked = false;
    for (const s of this.structures) {
      if (s.dead || s.team !== PLAYER || !s.completed) continue;
      if (distActually(x, y, s.x, s.y) <= LINK_RANGE) { linked = true; break; }
    }
    if (!linked) valid = false;
    const nearCrystal = this.crystals.some((c) => c.amount > 0 && Math.abs(c.x - x) < TILE * 1.6 && Math.abs(c.y - y) < TILE * 1.6);
    if (nearCrystal) valid = false;
    this.buildGhost = { type: this.buildMode, x, y, tx, ty, valid, linked, def };
  }

  tryPlaceBuild() {
    if (!this.buildMode || !this.buildGhost) return false;
    const g = this.buildGhost;
    if (!g.valid) {
      this.emit('toast', {
        text: g.linked ? 'SITE BLOCKED // RELOCATE' : 'OUT OF LINK RANGE // BUILD NEAR COMMAND',
        tone: 'warn'
      });
      this.audio.deny();
      return false;
    }
    const def = STRUCTURE_BLUEPRINTS[this.buildMode];
    if (this.credits < def.cost) {
      this.emit('toast', { text: 'INSUFFICIENT TITANIUM', tone: 'warn' });
      this.audio.deny();
      return false;
    }
    this.credits -= def.cost;
    const s = this.createStructure(this.buildMode, PLAYER, { x: g.x, y: g.y }, false);
    s.progress = 0;
    s.hp = Math.max(20, def.hp * 0.2);
    this.emit('toast', { text: `${def.name} // CONSTRUCTION STARTED`, tone: 'info' });
    this.audio.buildSite();
    this.addBuildEffect(g.x, g.y);
    this.buildMode = null;
    this.buildGhost = null;
    this.lastTap = null;
    this.mapDirty = true;
    return true;
  }

  // ── Production ───────────────────────────────────────────────────────────

  trainingBuilding(type) {
    const def = UNIT_BLUEPRINTS[type];
    if (!def) return null;
    const options = this.structures.filter((s) =>
      !s.dead && s.team === PLAYER && s.completed && s.def.id === def.from && s.queue.length < 4
    );
    if (!options.length) return null;
    options.sort((a, b) => a.queue.length - b.queue.length);
    return options[0];
  }

  queueCount(type) {
    return this.structures.reduce((n, s) => n + (s.team === PLAYER && !s.dead ? s.queue.filter((q) => q === type).length : 0), 0);
  }

  queueProgress(type) {
    for (const s of this.structures) {
      if (s.team !== PLAYER || s.dead) continue;
      if (s.queue[0] === type) return clamp(s.trainTimer / UNIT_BLUEPRINTS[type].buildTime, 0, 1);
    }
    return 0;
  }

  train(type) {
    if (this.mode !== 'playing') return { ok: false, message: 'LINK OFFLINE' };
    const def = UNIT_BLUEPRINTS[type];
    if (!def) return { ok: false, message: 'INVALID UNIT' };
    if (this.credits < def.cost) return { ok: false, message: 'INSUFFICIENT TITANIUM' };
    const building = this.trainingBuilding(type);
    if (!building) {
      const req = def.from === 'hq' ? 'NO COMMAND NODE' : `${def.from.toUpperCase()} REQUIRED`;
      return { ok: false, message: req };
    }
    this.credits -= def.cost;
    building.queue.push(type);
    this.audio.train();
    this.emit('toast', { text: `${def.name} // QUEUED AT ${building.def.name}`, tone: 'info' });
    return { ok: true, message: `QUEUED ${def.name}` };
  }

  spawnUnitAt(type, building) {
    const def = UNIT_BLUEPRINTS[type];
    const offsets = [
      [0, 1], [-1, 1], [1, 1], [-1, 0], [1, 0], [0, 2], [-2, 1], [2, 1], [-2, 2], [2, 2]
    ];
    let pos = null;
    for (const [ox, oy] of offsets) {
      const x = building.x + ox * TILE * 0.75;
      const y = building.y + (building.def.size * TILE * 0.5) + 26 + oy * TILE * 0.35;
      if (this.isTileWalkable(Math.floor(x / TILE), Math.floor(y / TILE), !!def.flying)) {
        pos = { x, y };
        break;
      }
    }
    if (!pos) pos = { x: building.x + 20, y: building.y + building.def.size * TILE * 0.5 + 24 };
    const u = this.createUnit(type, PLAYER, pos.x, pos.y);
    u.angle = -Math.PI / 2;
    u.aimAngle = -Math.PI / 2;
    if (building.rally) {
      this.issueMove([u], building.rally.x, building.rally.y);
    } else {
      const target = {
        x: building.x + (Math.random() - 0.5) * 70,
        y: building.y + building.def.size * TILE * 0.5 + 70 + Math.random() * 40
      };
      this.issueMove([u], target.x, target.y);
    }
    this.mapDirty = true;
  }

  // ── Army commands ────────────────────────────────────────────────────────

  toggleHold() {
    const units = this.getSelected().filter((u) => u.kind === 'unit' && u.team === PLAYER);
    if (!units.length) {
      this.emit('toast', { text: 'NO UNITS SELECTED', tone: 'warn' });
      this.audio.deny();
      return;
    }
    const hold = !units.every((u) => u.hold);
    for (const u of units) {
      u.hold = hold;
      u.order = null;
      u.path = [];
      u.target = null;
      u.targetId = null;
      u.moving = false;
      if (u.def.id === 'hauler') u.state = 'idle';
    }
    this.emit('toast', { text: hold ? 'HOLD POSITION ENGAGED' : 'HOLD POSITION RELEASED', tone: 'info' });
    this.audio.ack();
  }

  stopSelected() {
    const units = this.getSelected().filter((u) => u.kind === 'unit' && u.team === PLAYER);
    if (!units.length) {
      this.emit('toast', { text: 'NO UNITS SELECTED', tone: 'warn' });
      this.audio.deny();
      return;
    }
    for (const u of units) {
      u.order = null;
      u.path = [];
      u.target = null;
      u.targetId = null;
      u.moving = false;
      u.hold = false;
      if (u.def.id === 'hauler') u.state = 'seek';
    }
    this.addMoveMarker(units[0].x, units[0].y);
    this.audio.ack();
    this.emit('toast', { text: 'ORDER CANCELLED', tone: 'info' });
  }

  regroup() {
    const hq = this.structures.find((s) => s.team === PLAYER && s.def.id === 'hq' && !s.dead);
    if (!hq) return;
    const army = this.units.filter((u) => u.team === PLAYER && !u.dead && u.def.id !== 'hauler');
    if (!army.length) {
      this.emit('toast', { text: 'NO COMBAT UNITS AVAILABLE', tone: 'warn' });
      return;
    }
    this.selected.clear();
    army.forEach((u) => this.selected.add(u.id));
    this.issueMove(army, hq.x, hq.y + 130);
    this.emit('toast', { text: 'ARMY RECALLED TO AEGIS', tone: 'info' });
  }

  armyAction(action) {
    if (action === 'all') this.selectAllArmy();
    else if (action === 'hold') this.toggleHold();
    else if (action === 'stop') this.stopSelected();
    else if (action === 'rally') this.regroup();
  }

  // ── Update ───────────────────────────────────────────────────────────────

  update(dt) {
    dt = Math.max(0, Math.min(dt, 0.05));
    this.time += dt;
    if (this.mode === 'menu') {
      this.menuTime += dt;
      const targetX = this.menuAnchor.x + Math.sin(this.menuTime * 0.085) * 68;
      const targetY = this.menuAnchor.y + Math.cos(this.menuTime * 0.06) * 30;
      this.camera.x += (targetX - this.camera.x) * Math.min(1, dt * 0.42);
      this.camera.y += (targetY - this.camera.y) * Math.min(1, dt * 0.42);
      this.clampCamera();
      this.updateEffects(dt);
      return;
    }
    if (this.mode === 'paused' || this.mode === 'ended') return;
    if (this.mode === 'ending') {
      this.updateEffects(dt);
      this.updateProjectiles(dt);
      this.pendingEnd.timer -= dt;
      if (this.pendingEnd.timer <= 0 && !this.endEventSent) {
        this.endEventSent = true;
        this.emit('gameover', { victory: this.pendingEnd.victory });
        this.mode = 'ended';
      }
      return;
    }

    this.elapsed += dt;
    this.updateCamera(dt);
    this.updateWave(dt);
    this.updateStructures(dt);
    this.updateUnits(dt);
    this.updateProjectiles(dt);
    this.updateEffects(dt);
    this.applySeparation(dt);
    this.fogTimer -= dt;
    if (this.fogTimer <= 0) {
      this.fogTimer = 0.2;
      this.updateVisibility();
      this.mapDirty = true;
    }
    if (this.selected.size) {
      for (const id of [...this.selected]) {
        const e = this.entityById.get(id);
        if (!e || e.dead) this.selected.delete(id);
      }
    }
    this.units = this.units.filter((u) => !u.dead);
    this.structures = this.structures.filter((s) => !s.dead);
    this.updateSmoke(dt);
    this.shake = Math.max(0, this.shake - dt * 20);
    this.shakeX = (Math.random() - 0.5) * this.shake;
    this.shakeY = (Math.random() - 0.5) * this.shake;
  }

  updateCamera(dt) {
    let dx = 0;
    let dy = 0;
    const speed = 620 / this.zoom;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;
    if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1;
      this.camera.x += (dx / len) * speed * dt;
      this.camera.y += (dy / len) * speed * dt;
      this.clampCamera();
      this.mapDirty = true;
    }
    this.shake = Math.max(0, this.shake - dt * 18);
    this.shakeX = (Math.random() - 0.5) * this.shake;
    this.shakeY = (Math.random() - 0.5) * this.shake;

  }

  updateWave(dt) {
    this.waveTimer -= dt;
    if (!this.waveWarned && this.waveTimer <= 10) {
      this.waveWarned = true;
      this.emit('alert', { text: 'HOSTILE ASSAULT IMMINENT // BRACE FOR CONTACT', tone: 'danger' });
      this.emit('sound', { sound: 'alert' });
    }
    if (this.waveTimer <= 0) {
      this.wave++;
      this.spawnWave();
      this.waveWarned = false;
      this.waveTimer = Math.max(32, WAVE_INTERVAL - this.wave * 2);
    }

    this.enemySpawnTimer -= dt;
    if (this.enemySpawnTimer <= 0) {
      this.enemySpawnTimer = Math.max(17, 29 - this.wave);
      const spawner = this.structures.find((s) => s.team === ENEMY && s.def.id === 'spawner' && !s.dead);
      const defenders = this.units.filter((u) => u.team === ENEMY && !u.dead && !u.assault).length;
      if (spawner && this.enemySpawnCount < 14 && defenders < 7) {
        this.enemySpawnCount++;
        const type = this.wave >= 3 && Math.random() > 0.7 ? 'stinger' : (this.wave >= 4 && Math.random() > 0.72 ? 'marauder' : 'raider');
        const x = spawner.x + (Math.random() - 0.5) * 70;
        const y = spawner.y + 42 + Math.random() * 20;
        const u = this.createUnit(type, ENEMY, x, y, { guardX: x, guardY: y });
        u.state = 'guard';
      }
    }
  }

  spawnWave() {
    const count = Math.min(9, 2 + Math.floor(this.wave * 0.75));
    const spawner = this.structures.find((s) => s.team === ENEMY && s.def.id === 'spawner' && !s.dead);
    const baseX = spawner ? spawner.x : gridCenter(20, 8, 3).x;
    const baseY = spawner ? spawner.y + 48 : gridCenter(20, 8, 3).y + 70;
    for (let i = 0; i < count; i++) {
      let type = 'raider';
      if (this.wave >= 2 && i % 4 === 3) type = 'stinger';
      if (this.wave >= 3 && i % 5 === 4) type = 'marauder';
      if (this.wave >= 6 && i % 3 === 2) type = 'stinger';
      const x = baseX + (i - count / 2) * 34 + (Math.random() - 0.5) * 18;
      const y = baseY + (i % 2) * 28 + Math.random() * 12;
      const u = this.createUnit(type, ENEMY, x, y, { assault: true });
      u.state = 'assault';
      u.assault = true;
      u.homeX = u.x;
      u.homeY = u.y;
    }
    this.emit('alert', { text: `HOSTILE ASSAULT // WAVE ${String(this.wave).padStart(2, '0')} INBOUND`, tone: 'danger' });
    this.emit('toast', { text: `WAVE ${String(this.wave).padStart(2, '0')} DETECTED // ${count} HOSTILES`, tone: 'danger' });
    this.audio.alert();
  }

  updateStructures(dt) {
    for (const s of this.structures) {
      if (s.dead) continue;
      if (!s.completed) {
        s.progress += dt / s.def.buildTime;
        s.hp = Math.min(s.maxHp, s.hp + (s.maxHp * 0.7 / s.def.buildTime) * dt);
        if (s.progress >= 1) {
          s.progress = 1;
          s.completed = true;
          s.hp = s.maxHp;
          this.emit('toast', { text: `${s.def.name} ONLINE`, tone: 'success' });
          this.audio.complete();
          this.addRing(s.x, s.y, PLAYER_COLORS.primary, 42);
          this.mapDirty = true;
        }
        continue;
      }
      if (s.queue.length) {
        const type = s.queue[0];
        const def = UNIT_BLUEPRINTS[type];
        s.trainTimer += dt;
        if (s.trainTimer >= def.buildTime) {
          s.trainTimer = 0;
          s.queue.shift();
          this.spawnUnitAt(type, s);
          this.emit('toast', { text: `${def.name} DEPLOYED`, tone: 'success' });
          this.audio.complete();
          this.addRing(s.x, s.y + s.def.size * TILE * 0.45, PLAYER_COLORS.primary, 24);
        }
      }
      if (s.def.damage && s.cooldown !== undefined) {
        s.cooldown -= dt;
        const target = this.validTarget(s.target, s.team) ? s.target : this.findTarget(s, s.def.range || 200, true, false);
        if (target) {
          s.target = target;
          s.targetId = target.id;
          const d = this.edgeDistance(s, target);
          s.aimAngle = Math.atan2(target.y - s.y, target.x - s.x);
          if (d <= (s.def.range || 200) && s.cooldown <= 0) {
            s.cooldown = s.def.cooldown || 1;
            this.fireAttack(s, target, s.def.id === 'turret' || s.def.id === 'ashenTurret' ? 'turret' : 'rifle');
          }
        } else {
          s.target = null;
          s.targetId = null;
        }
      }
    }
  }

  updateUnits(dt) {
    for (const u of this.units) {
      if (u.dead) continue;
      u.spawnFlash = Math.max(0, u.spawnFlash - dt);
      if (u.def.id === 'hauler') {
        this.updateHauler(u, dt);
        continue;
      }
      u.cooldown = Math.max(0, u.cooldown - dt);
      const target = this.validTarget(u.target, u.team) ? u.target : null;
      if (!target) {
        u.target = null;
        u.targetId = null;
      }
      if (u.team === PLAYER) {
        this.updatePlayerUnit(u, target, dt);
      } else {
        this.updateEnemyUnit(u, target, dt);
      }
      u.moving = !!(u.path && u.pathIndex < u.path.length);
      if (u.moving) u.walkPhase += dt * (u.def.id === 'scorpion' || u.def.id === 'marauder' ? 4 : 10);
    }
  }

  updatePlayerUnit(u, target, dt) {
    if (u.order && u.order.type === 'move') {
      const arrived = this.followPath(u, dt);
      if (arrived) {
        u.order = null;
        u.moving = false;
        u.stuckTries = 0;
      } else if (!u.path.length) {
        u.repathTimer -= dt;
        if (u.repathTimer <= 0) {
          u.repathTimer = 0.5;
          const ok = this.issuePath(u, u.order.x, u.order.y, true);
          u.stuckTries = ok ? 0 : (u.stuckTries || 0) + 1;
          if (u.stuckTries > 6) {
            u.order = null;
            u.moving = false;
            u.stuckTries = 0;
          }
        }
      }
      const opportunistic = this.findTarget(u, u.def.range || 140, false, false);
      if (opportunistic) {
        u.aimAngle = Math.atan2(opportunistic.y - u.y, opportunistic.x - u.x);
        if (u.cooldown <= 0) {
          u.cooldown = u.def.cooldown;
          this.fireAttack(u, opportunistic, u.def.id === 'scorpion' ? 'tank' : u.def.id === 'viper' ? 'drone' : 'rifle');
        }
      }
      return;
    }
    if (!target && !u.hold) {
      target = this.findTarget(u, AGGRO, true, true);
      if (target) {
        u.target = target;
        u.targetId = target.id;
        if (!u.order) u.explicitTarget = false;
      }
    }
    if (target) {
      const d = this.edgeDistance(u, target);
      u.aimAngle = Math.atan2(target.y - u.y, target.x - u.x);
      if (u.hold) {
        u.path = [];
        if (d <= (u.def.range || 140) && u.cooldown <= 0) {
          u.cooldown = u.def.cooldown;
          this.fireAttack(u, target, u.def.id === 'scorpion' ? 'tank' : u.def.id === 'viper' ? 'drone' : 'rifle');
        }
        return;
      }
      if (d <= (u.def.range || 140)) {
        u.path = [];
        u.moving = false;
        if (u.cooldown <= 0) {
          u.cooldown = u.def.cooldown;
          this.fireAttack(u, target, u.def.id === 'scorpion' ? 'tank' : u.def.id === 'viper' ? 'drone' : 'rifle');
        }
      } else {
        // A little leash for automatically acquired targets.
        if (!u.explicitTarget && dist(u.x, u.y, u.homeX, u.homeY) > 420) {
          u.target = null;
          u.targetId = null;
          u.explicitTarget = false;
          this.issuePath(u, u.homeX, u.homeY + 30, false);
          this.followPath(u, dt);
          return;
        }
        u.repathTimer -= dt;
        if (!u.path.length || u.repathTimer <= 0) {
          u.repathTimer = 0.7;
          this.issuePath(u, target.x, target.y, false);
        }
        this.followPath(u, dt);
      }
      return;
    }
    if (u.hold) { u.path = []; u.moving = false; return; }
    if (u.path.length) {
      const arrived = this.followPath(u, dt);
      if (arrived) u.path = [];
    } else {
      u.moving = false;
    }
  }

  updateEnemyUnit(u, target, dt) {
    if (u.assault) {
      if (!target) {
        const near = this.findTarget(u, AGGRO * 1.15, true, true);
        if (near) {
          u.target = near;
          u.targetId = near.id;
          target = near;
        }
      }
      if (target) {
        const d = this.edgeDistance(u, target);
        u.aimAngle = Math.atan2(target.y - u.y, target.x - u.x);
        if (d <= (u.def.range || 140)) {
          u.path = [];
          u.moving = false;
          if (u.cooldown <= 0) {
            u.cooldown = u.def.cooldown;
            this.fireAttack(u, target, u.def.id === 'marauder' ? 'tank' : u.def.id === 'stinger' ? 'drone' : 'rifle');
          }
        } else {
          u.repathTimer -= dt;
          if (!u.path.length || u.repathTimer <= 0) {
            u.repathTimer = 0.75;
            const objective = target;
            this.issuePath(u, objective.x, objective.y, false);
          }
          this.followPath(u, dt);
        }
        return;
      }
      const hq = this.structures.find((s) => s.team === PLAYER && !s.dead && s.def.id === 'hq')
        || this.structures.find((s) => s.team === PLAYER && !s.dead);
      if (hq) {
        const d = dist(u.x, u.y, hq.x, hq.y);
        if (d > 120) {
          u.repathTimer -= dt;
          if (!u.path.length || u.repathTimer <= 0) {
            u.repathTimer = 1.2;
            this.issuePath(u, hq.x, hq.y + 70, false);
          }
          this.followPath(u, dt);
        }
      }
      return;
    }

    if (!target) {
      const near = this.findTarget(u, AGGRO, true, true);
      if (near) {
        u.target = near;
        u.targetId = near.id;
        target = near;
      }
    }
    if (target) {
      const d = this.edgeDistance(u, target);
      u.aimAngle = Math.atan2(target.y - u.y, target.x - u.x);
      if (dist(u.x, u.y, u.guardX, u.guardY) > 310) {
        u.target = null;
        u.targetId = null;
        u.path = [];
        this.issuePath(u, u.guardX, u.guardY, false);
        this.followPath(u, dt);
        return;
      }
      if (d <= (u.def.range || 140)) {
        u.path = [];
        u.moving = false;
        if (u.cooldown <= 0) {
          u.cooldown = u.def.cooldown;
          this.fireAttack(u, target, u.def.id === 'marauder' ? 'tank' : u.def.id === 'stinger' ? 'drone' : 'rifle');
        }
      } else {
        u.repathTimer -= dt;
        if (!u.path.length || u.repathTimer <= 0) {
          u.repathTimer = 0.9;
          this.issuePath(u, target.x, target.y, false);
        }
        this.followPath(u, dt);
      }
      return;
    }
    if (dist(u.x, u.y, u.guardX, u.guardY) > 55) {
      u.repathTimer -= dt;
      if (!u.path.length || u.repathTimer <= 0) {
        u.repathTimer = 1.1;
        this.issuePath(u, u.guardX, u.guardY, false);
      }
      this.followPath(u, dt);
    } else {
      u.path = [];
      u.moving = false;
      u.walkPhase += dt * 2;
    }
  }

  updateHauler(u, dt) {
    if (u.hp <= 0 || u.dead) return;
    if (u.state === 'idle') {
      u.moving = false;
      return;
    }
    if (u.state === 'seek') {
      if (!u.mineNode || u.mineNode.amount <= 0) {
        u.mineNode = this.nearestCrystal(u.x, u.y);
      }
      if (!u.mineNode) {
        u.state = 'idle';
        return;
      }
      const d = dist(u.x, u.y, u.mineNode.x, u.mineNode.y);
      if (d < 30) {
        u.state = 'mining';
        u.path = [];
        u.moving = false;
        u.mineTimer = u.def.miningTime;
      } else {
        u.repathTimer -= dt;
        if (!u.path.length || u.repathTimer <= 0) {
          u.repathTimer = 1.2;
          this.issuePath(u, u.mineNode.x + 14, u.mineNode.y + 10, false);
        }
        this.followPath(u, dt);
      }
      return;
    }
    if (u.state === 'mining') {
      u.moving = false;
      if (!u.mineNode || u.mineNode.amount <= 0) {
        u.state = 'seek';
        u.mineNode = this.nearestCrystal(u.x, u.y);
        return;
      }
      u.mineTimer -= dt;
      u.angle = Math.atan2(u.mineNode.y - u.y, u.mineNode.x - u.x);
      if (u.mineTimer <= 0) {
        const amount = Math.min(u.def.cargo, u.mineNode.amount);
        u.mineNode.amount -= amount;
        u.carried = amount;
        u.returning = true;
        u.state = 'return';
        u.path = [];
        this.mapDirty = true;
        this.emit('sound', { sound: 'train' });
      }
      return;
    }
    if (u.state === 'return') {
      const hq = this.structures.find((s) => s.team === PLAYER && s.def.id === 'hq' && !s.dead);
      if (!hq) {
        u.state = 'idle';
        return;
      }
      const target = { x: hq.x, y: hq.y + hq.def.size * TILE * 0.5 + 30 };
      const d = dist(u.x, u.y, target.x, target.y);
      if (d < 42) {
        this.credits += u.carried;
        this.stats.mined += u.carried;
        this.addFloatText(u.x, u.y - 16, `+${u.carried}`, PLAYER_COLORS.primary, 0.85);
        u.carried = 0;
        u.returning = false;
        u.state = 'seek';
        u.mineNode = this.nearestCrystal(u.x, u.y);
        u.path = [];
        this.emit('sound', { sound: 'click' });
      } else {
        u.repathTimer -= dt;
        if (!u.path.length || u.repathTimer <= 0) {
          u.repathTimer = 1.4;
          this.issuePath(u, target.x, target.y, false);
        }
        this.followPath(u, dt);
      }
    }
  }

  nearestCrystal(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const c of this.crystals) {
      if (c.amount <= 0) continue;
      const d = dist(x, y, c.x, c.y);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  followPath(u, dt) {
    if (!u.path || !u.path.length) return true;
    let remaining = u.speed * dt;
    while (remaining > 0 && u.pathIndex < u.path.length) {
      const point = u.path[u.pathIndex];
      const d = dist(u.x, u.y, point.x, point.y);
      if (d < 4) {
        u.pathIndex++;
        continue;
      }
      const step = Math.min(remaining, d);
      const nx = u.x + ((point.x - u.x) / d) * step;
      const ny = u.y + ((point.y - u.y) / d) * step;
      if (!u.def.flying) {
        const { tx, ty } = this.worldToTile(nx, ny);
        if (!this.isTileWalkable(tx, ty, false)) {
          // A blocked corner or friendly push-off should trigger a re-path,
          // never silently complete the order and strand the unit.
          u.path = [];
          u.pathIndex = 0;
          u.moving = false;
          u.repathTimer = 0;
          return false;
        }
      }
      const desired = Math.atan2(ny - u.y, nx - u.x);
      let diff = ((desired - u.angle + Math.PI * 3) % TAU) - Math.PI;
      u.angle += diff * Math.min(1, dt * 12);
      u.x = nx;
      u.y = ny;
      remaining -= step;
      if (u.pathIndex >= u.path.length) break;
    }
    if (u.pathIndex >= u.path.length) {
      u.path = [];
      u.pathIndex = 0;
      u.moving = false;
      return true;
    }
    u.moving = true;
    return false;
  }

  applySeparation(dt) {
    const units = this.units;
    for (let i = 0; i < units.length; i++) {
      const a = units[i];
      if (a.dead) continue;
      for (let j = i + 1; j < units.length; j++) {
        const b = units[j];
        if (b.dead) continue;
        if (!!a.def.flying !== !!b.def.flying) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.radius + b.radius - 1;
        if (d > 0 && d < min) {
          const push = (min - d) * 0.5;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        } else if (d === 0) {
          a.x += (Math.random() - 0.5) * 2;
          a.y += (Math.random() - 0.5) * 2;
        }
      }
      const { tx, ty } = this.worldToTile(a.x, a.y);
      if (!a.def.flying && !this.isTileWalkable(tx, ty, false)) {
        // Units never settle inside solid rock or structures.
        const free = this.nearestWalkable(tx, ty, false);
        if (free) {
          a.x = (free.tx + 0.5) * TILE;
          a.y = (free.ty + 0.5) * TILE;
        }
      }
      a.x = clamp(a.x, 8, WORLD - 8);
      a.y = clamp(a.y, 8, WORLD - 8);
    }
  }

  // ── Combat ───────────────────────────────────────────────────────────────

  validTarget(target, team) {
    return !!target && !target.dead && target.team !== team && this.entityById.has(target.id);
  }

  targetRadius(target) {
    return target.type === 'unit' ? target.radius * 0.7 : target.def.size * TILE * 0.44;
  }

  edgeDistance(a, b) {
    const d = dist(a.x, a.y, b.x, b.y);
    return Math.max(0, d - this.targetRadius(b) - (a.type === 'unit' ? a.radius * 0.35 : 0));
  }

  findTarget(source, range, includeUnits = true, includeStructures = true) {
    let best = null;
    let bestD = Infinity;
    if (includeUnits) {
      for (const u of this.units) {
        if (u.dead || u.team === source.team) continue;
        const d = this.edgeDistance(source, u);
        if (d <= range && d < bestD) { best = u; bestD = d; }
      }
    }
    if (includeStructures) {
      for (const s of this.structures) {
        if (s.dead || s.team === source.team) continue;
        const d = this.edgeDistance(source, s);
        if (d <= range && d < bestD) { best = s; bestD = d; }
      }
    }
    return best;
  }

  fireAttack(attacker, target, kind) {
    const angle = Math.atan2(target.y - attacker.y, target.x - attacker.x);
    attacker.aimAngle = angle;
    let muzzleDist = 16;
    if (attacker.type === 'structure') {
      muzzleDist = attacker.def.id === 'hq' || attacker.def.id === 'nexus' ? 18 : 22;
    } else if (attacker.def.id === 'scorpion' || attacker.def.id === 'marauder') {
      muzzleDist = 23;
    } else if (attacker.def.id === 'viper' || attacker.def.id === 'stinger') {
      muzzleDist = 13;
    }
    const mx = attacker.x + Math.cos(angle) * muzzleDist;
    const my = attacker.y + Math.sin(angle) * muzzleDist;
    const teamColor = attacker.team === PLAYER ? PLAYER_COLORS.primary : ENEMY_COLORS.primary;
    this.stats.shots++;
    this.addMuzzle(mx, my, angle, kind === 'tank' ? '#ffce7a' : teamColor, kind);
    this.audio.shot(kind === 'tank' ? 'tank' : kind === 'turret' ? 'turret' : 'rifle');

    if (kind === 'tank') {
      this.projectiles.push({
        id: ++this._id,
        x: mx, y: my,
        targetId: target.id,
        tx: target.x, ty: target.y,
        speed: 290,
        damage: attacker.def.damage,
        splash: attacker.def.splash || 0,
        team: attacker.team,
        color: attacker.team === PLAYER ? '#ffd27e' : '#ff8e5e',
        life: 3,
        trail: []
      });
      return;
    }
    // Hitscan tracer.
    this.effects.push({
      type: 'tracer',
      x1: mx, y1: my, x2: target.x, y2: target.y,
      color: teamColor,
      life: kind === 'drone' ? 0.08 : 0.055,
      maxLife: kind === 'drone' ? 0.08 : 0.055
    });
    if (kind === 'drone') {
      this.addSpark(target.x, target.y, teamColor, 3);
    }
    this.dealDamage(target, attacker.def.damage, attacker);
  }

  dealDamage(target, amount, source) {
    if (!target || target.dead) return;
    target.hp -= amount;
    if (target.type === 'unit') {
      this.addSpark(target.x, target.y - 3, ENEMY_COLORS.accent, 2);
    } else {
      this.addSpark(target.x + (Math.random() - 0.5) * target.def.size * TILE * 0.5, target.y + (Math.random() - 0.5) * target.def.size * TILE * 0.5, ENEMY_COLORS.accent, 1);
    }
    if (target.hp <= 0) {
      this.killEntity(target, source);
    }
  }

  killEntity(entity, source) {
    if (entity.dead) return;
    entity.dead = true;
    const team = entity.team;
    const isStructure = entity.type === 'structure';
    this.selected.delete(entity.id);
    this.entityById.delete(entity.id);
    if (isStructure) {
      this.markOccupancy(entity, 0);
      this.addExplosion(entity.x, entity.y, entity.def.size * 1.2, team === PLAYER ? PLAYER_COLORS.primary : ENEMY_COLORS.primary);
      this.addScorch(entity.x, entity.y, entity.def.size * TILE * 0.45);
      this.shake = Math.min(16, this.shake + 5);
      this.audio.explosion(1.6);
      if (entity.def.id === 'hq') {
        this.emit('alert', { text: 'AEGIS COMMAND LOST // SIGNAL TERMINATED', tone: 'danger' });
        this.triggerEnd(false);
      } else if (entity.def.id === 'nexus') {
        this.emit('alert', { text: 'ASHEN NEXUS DESTROYED // SECTOR SECURED', tone: 'success' });
        this.triggerEnd(true);
      } else if (entity.def.id === 'spawner') {
        this.emit('toast', { text: 'LEGION FORGE DESTROYED // HOSTILE PRODUCTION HALTED', tone: 'success' });
      } else if (team === PLAYER) {
        this.emit('toast', { text: `${entity.def.name} DESTROYED`, tone: 'danger' });
      }
    } else {
      this.addExplosion(entity.x, entity.y, entity.def.radius / 8 + 0.4, team === PLAYER ? PLAYER_COLORS.primary : ENEMY_COLORS.primary);
      this.addScorch(entity.x, entity.y, 8 + entity.radius);
      this.audio.explosion(entity.def.id === 'scorpion' || entity.def.id === 'marauder' ? 1 : 0.5);
      if (team === ENEMY) {
        const bounty = entity.def.bounty || 0;
        this.credits += bounty;
        this.stats.kills++;
        if (bounty) this.addFloatText(entity.x, entity.y - 18, `+${bounty}`, ENEMY_COLORS.accent, 0.8);
      } else {
        this.stats.lost++;
      }
    }
    this.mapDirty = true;
  }

  triggerEnd(victory) {
    if (this.mode === 'ending' || this.mode === 'ended') return;
    this.mode = 'ending';
    this.pendingEnd = { victory, timer: 2.4 };
    this.endEventSent = false;
    this.selected.clear();
    if (victory) this.audio.victory();
    else this.audio.defeat();
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      const target = this.entityById.get(p.targetId);
      if (target && !target.dead) {
        p.tx = target.x;
        p.ty = target.y;
      }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      p.life -= dt;
      if (p.trail) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 5) p.trail.shift();
      }
      if (d <= step + 5 || p.life <= 0) {
        p.dead = true;
        this.projectileImpact(p);
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
        p.angle = Math.atan2(dy, dx);
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  projectileImpact(p) {
    const team = p.team;
    const struck = this.entityById.get(p.targetId);
    if (!p.splash) {
      if (struck && !struck.dead && struck.team !== team) this.dealDamage(struck, p.damage, null);
    } else {
      const victims = new Set();
      for (const e of [...this.units, ...this.structures]) {
        if (e.dead || e.team === team) continue;
        const d = dist(e.x, e.y, p.tx, p.ty) - this.targetRadius(e);
        if (d <= p.splash) {
          victims.add(e);
          const falloff = clamp(1 - Math.max(0, d) / p.splash, 0.35, 1);
          this.dealDamage(e, p.damage * falloff, null);
        }
      }
      if (!victims.size && struck && !struck.dead) this.dealDamage(struck, p.damage, null);
    }
    this.addExplosion(p.tx, p.ty, p.splash ? 1.5 : 0.8, p.color);
    this.addScorch(p.tx, p.ty, p.splash ? 20 : 10);
    this.shake = Math.min(12, this.shake + (p.splash ? 4 : 1.5));
    this.audio.explosion(p.splash ? 1.1 : 0.5);
  }

  addMuzzle(x, y, angle, color, kind) {
    this.effects.push({
      type: 'muzzle', x, y, angle, color, kind,
      life: 0.08, maxLife: 0.08
    });
    const count = kind === 'tank' ? 6 : kind === 'turret' ? 4 : 2;
    for (let i = 0; i < count; i++) {
      this.effects.push({
        type: 'particle',
        x, y,
        vx: Math.cos(angle) * (40 + Math.random() * 80) + (Math.random() - 0.5) * 30,
        vy: Math.sin(angle) * (40 + Math.random() * 80) + (Math.random() - 0.5) * 30,
        color: i % 2 ? color : '#ffe6a8',
        size: 1 + Math.random() * 2,
        life: 0.12 + Math.random() * 0.15,
        maxLife: 0.27,
        drag: 0.8
      });
    }
  }

  addSpark(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const sp = 25 + Math.random() * 65;
      this.effects.push({
        type: 'particle',
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color,
        size: 1,
        life: 0.14 + Math.random() * 0.18,
        maxLife: 0.32,
        drag: 0.9
      });
    }
  }

  addExplosion(x, y, scale, color) {
    const count = Math.floor(8 + scale * 13);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const sp = (20 + Math.random() * 95) * Math.min(2, scale);
      const colors = ['#ffd88a', '#ff9e55', '#ff643c', '#6b5342', '#2d2c29'];
      this.effects.push({
        type: 'particle',
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 1 + Math.random() * 2.5,
        life: 0.28 + Math.random() * 0.48,
        maxLife: 0.76,
        drag: 0.94,
        smoke: Math.random() > 0.6
      });
    }
    this.effects.push({ type: 'ring', x, y, radius: 5, maxRadius: 22 + scale * 24, color, life: 0.36, maxLife: 0.36 });
    this.effects.push({ type: 'flash', x, y, radius: 20 + scale * 18, color: '#ffd59a', life: 0.16, maxLife: 0.16 });
    if (this.effects.length > 620) this.effects.splice(0, this.effects.length - 620);
  }

  addRing(x, y, color, maxRadius) {
    this.effects.push({ type: 'ring', x, y, radius: 4, maxRadius, color, life: 0.5, maxLife: 0.5 });
  }

  addSpawnRing(x, y) {
    this.effects.push({ type: 'ring', x, y, radius: 2, maxRadius: 26, color: PLAYER_COLORS.primary, life: 0.55, maxLife: 0.55 });
  }

  addBuildEffect(x, y) {
    this.addRing(x, y, PLAYER_COLORS.accent, 70);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      this.effects.push({
        type: 'particle',
        x: x + Math.cos(a) * 40,
        y: y + Math.sin(a) * 40,
        vx: Math.cos(a) * 20,
        vy: Math.sin(a) * 20,
        color: PLAYER_COLORS.accent,
        size: 2,
        life: 0.35,
        maxLife: 0.35,
        drag: 0.9
      });
    }
  }

  addFloatText(x, y, text, color, life = 1) {
    this.effects.push({ type: 'text', x, y, text, color, life, maxLife: life });
  }

  addScorch(x, y, radius) {
    this.decals.push({ x, y, radius, alpha: 0.32 + Math.random() * 0.18 });
    if (this.decals.length > 80) this.decals.shift();
  }

  addMoveMarker(x, y, hostile = false) {
    this.moveMarkers.push({ x, y, time: 0, hostile });
    if (this.moveMarkers.length > 6) this.moveMarkers.shift();
  }

  updateEffects(dt) {
    for (const e of this.effects) {
      e.life -= dt;
      if (e.type === 'particle') {
        const drag = Math.pow(e.drag ?? 0.94, dt * 60);
        e.vx *= drag;
        e.vy *= drag;
        if (e.smoke) e.vy -= 8 * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      } else if (e.type === 'ring') {
        e.radius += (e.maxRadius - e.radius) * Math.min(1, dt * 10);
      }
    }
    this.effects = this.effects.filter((e) => e.life > 0);
    for (const m of this.moveMarkers) m.time += dt;
    this.moveMarkers = this.moveMarkers.filter((m) => m.time < 0.55);
  }

  updateSmoke(dt) {
    for (const s of this.structures) {
      if (s.dead || !s.completed) continue;
      const ratio = s.hp / s.maxHp;
      if (ratio < 0.62) {
        s.smokeTimer -= dt;
        if (s.smokeTimer <= 0) {
          s.smokeTimer = ratio < 0.3 ? 0.13 : 0.32;
          const spread = s.def.size * TILE * 0.3;
          this.effects.push({
            type: 'particle',
            x: s.x + (Math.random() - 0.5) * spread,
            y: s.y + (Math.random() - 0.5) * spread,
            vx: (Math.random() - 0.5) * 8,
            vy: -12 - Math.random() * 12,
            color: ratio < 0.3 ? '#ff784a' : '#444b47',
            size: 2 + Math.random() * (ratio < 0.3 ? 3 : 2),
            life: 0.8 + Math.random() * 0.7,
            maxLife: 1.5,
            smoke: true,
            drag: 0.98
          });
        }
      }
    }
    for (const u of this.units) {
      if (u.dead || u.hp > u.maxHp * 0.4) continue;
      u.smokeTimer -= dt;
      if (u.smokeTimer <= 0) {
        u.smokeTimer = 0.32;
        this.effects.push({
          type: 'particle', x: u.x, y: u.y, vx: (Math.random() - 0.5) * 6, vy: -10,
          color: '#3d4240', size: 1.5, life: 0.5, maxLife: 0.5, smoke: true, drag: 0.98
        });
      }
    }
  }

  updateVisibility(force = false) {
    if (!force && this.mode === 'menu') return;
    this.fogVisible.fill(0);
    for (const s of this.structures) {
      if (s.dead || s.team !== PLAYER) continue;
      this.revealCircle(s.x, s.y, s.def.vision * TILE);
    }
    for (const u of this.units) {
      if (u.dead || u.team !== PLAYER) continue;
      this.revealCircle(u.x, u.y, u.def.vision * TILE);
    }
    if (!this.nexusDiscovered) {
      const nexus = this.structures.find((s) => s.team === ENEMY && s.def.id === 'nexus' && !s.dead);
      if (nexus && this.isVisibleWorld(nexus.x, nexus.y)) {
        this.nexusDiscovered = true;
        this.emit('alert', { text: 'ASHEN NEXUS LOCATED // PRIMARY TARGET MARKED', tone: 'info' });
      }
    }
  }

  revealCircle(x, y, radius) {
    const r = Math.ceil(radius / TILE);
    const ctx = Math.floor(x / TILE);
    const cty = Math.floor(y / TILE);
    for (let ty = cty - r; ty <= cty + r; ty++) {
      for (let tx = ctx - r; tx <= ctx + r; tx++) {
        if (tx < 0 || ty < 0 || tx >= MAP_TILES || ty >= MAP_TILES) continue;
        const wx = (tx + 0.5) * TILE;
        const wy = (ty + 0.5) * TILE;
        if (Math.hypot(wx - x, wy - y) <= radius) {
          const i = this.tileIdx(tx, ty);
          this.fogVisible[i] = 1;
          this.fogExplored[i] = 1;
        }
      }
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  render() {
    const ctx = this.ctx;
    const w = this.viewW;
    const h = this.viewH;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#04090a';
    ctx.fillRect(0, 0, w, h);
    // Screen shake
    const shakeX = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const shakeY = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    ctx.save();
    ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);
    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(this.terrain.canvas, 0, 0);

    // Scorch decals
    for (const d of this.decals) {
      ctx.fillStyle = `rgba(10,10,9,${d.alpha})`;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.radius, d.radius * 0.56, 0.2, 0, TAU);
      ctx.fill();
    }

    // Under-object markers
    for (const e of this.getSelected()) {
      if (e.kind === 'structure' && e.rally) {
        const s = e.rally;
        ctx.strokeStyle = 'rgba(131,255,217,0.65)';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, 12, 7, 0, 0, TAU);
        ctx.stroke();
        px(ctx, s.x - 1, s.y - 24, 2, 19, PLAYER_COLORS.primary);
        polyFlag(ctx, s.x + 1, s.y - 24, PLAYER_COLORS.primary);
      }
      drawSelectionRing(ctx, e, this.time, e.team === ENEMY);
    }

    for (const m of this.moveMarkers) {
      ctx.save();
      ctx.globalAlpha = 1 - m.time / 0.55;
      drawMoveMarker(ctx, m.x, m.y, m.time);
      ctx.restore();
    }

    // Sort static and mobile entities for clean overlap.
    const drawList = [];
    for (const c of this.crystals) {
      if (c.amount <= 0 && !this.fogExplored[this.tileIdx(Math.floor(c.x / TILE), Math.floor(c.y / TILE))]) continue;
      drawList.push({ sortY: c.y + 6, kind: 'crystal', ref: c });
    }
    for (const s of this.structures) {
      if (s.dead) continue;
      if (s.team === ENEMY && !this.isVisibleWorld(s.x, s.y)) continue;
      drawList.push({ sortY: s.y + s.def.size * TILE * 0.28, kind: 'structure', ref: s });
    }
    for (const u of this.units) {
      if (u.dead) continue;
      if (u.team === ENEMY && !this.isVisibleWorld(u.x, u.y)) continue;
      drawList.push({ sortY: u.y + (u.def.flying ? 18 : 0), kind: 'unit', ref: u });
    }
    drawList.sort((a, b) => a.sortY - b.sortY);

    for (const item of drawList) {
      if (item.kind === 'crystal') {
        const c = item.ref;
        drawCrystalCluster(ctx, c.x, c.y, c.amount, this.time + c.id, 1);
      } else if (item.kind === 'structure') {
        this.drawStructure(ctx, item.ref);
      } else {
        this.drawUnit(ctx, item.ref);
      }
    }

    // Projectiles
    for (const p of this.projectiles) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      if (p.trail && p.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(p.trail[0].x, p.trail[0].y);
        for (const t of p.trail) ctx.lineTo(t.x, t.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 4, 4);
      ctx.fillStyle = '#fff6cf';
      ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
    }

    // Effects beneath fog for atmospheric blending
    this.drawEffects(ctx);

    // Fog
    if (this.mode !== 'menu') this.drawFog(ctx);

    // Build ghost sits above fog so it is always visible.
    if (this.buildMode && this.buildGhost) {
      const g = this.buildGhost;
      drawBuildGhost(ctx, this.art, g.type, g.x, g.y, g.valid, this.time, g.def);
    }

    // Health bars and selection UI above fog.
    for (const s of this.structures) {
      if (s.dead) continue;
      if (s.team === ENEMY && !this.isVisibleWorld(s.x, s.y)) continue;
      const selected = this.selected.has(s.id);
      if (s.completed) drawStructureHealthBar(ctx, s, selected);
    }
    for (const u of this.units) {
      if (u.dead) continue;
      if (u.team === ENEMY && !this.isVisibleWorld(u.x, u.y)) continue;
      drawUnitHealthBar(ctx, u, this.selected.has(u.id));
    }

    ctx.restore();

    // Screen-space atmosphere
    this.drawAtmosphere(ctx, w, h);
    if (this.mode === 'playing' || this.mode === 'ending') this.drawObjectiveMarker(ctx, w, h);
    if (this.mode === 'menu') this.drawMenuDust(ctx, w, h);
  }

  drawStructure(ctx, s) {
    if (!s.completed) {
      drawScaffold(ctx, s, this.art, this.time);
      return;
    }
    if (s.def.id === 'turret' || s.def.id === 'ashenTurret') {
      const hostile = s.def.id === 'ashenTurret';
      const art = {
        turretBase: hostile ? this.art.structures.ashenTurretBase : this.art.structures.turretBase,
        turretGun: hostile ? this.art.structures.ashenTurretGun : this.art.structures.turretGun
      };
      drawTurretBaseRotated(ctx, art, s.x, s.y, s.aimAngle, this.time);
      if (s.hp < s.maxHp * 0.55) {
        ctx.globalAlpha = 0.35 + Math.sin(this.time * 12) * 0.15;
        ctx.fillStyle = '#ff6b4f';
        ctx.fillRect(s.x + 12, s.y - 12, 2, 2);
        ctx.globalAlpha = 1;
      }
      return;
    }
    const sprite = this.art.structures[s.def.id];
    if (!sprite) return;
    ctx.drawImage(sprite, Math.round(s.x - sprite.width / 2), Math.round(s.y - sprite.height / 2));
    if (s.def.id === 'hq') {
      const pulse = 0.55 + Math.sin(this.time * 2.5) * 0.25;
      ctx.save();
      ctx.globalAlpha = pulse * 0.36;
      ctx.fillStyle = PLAYER_COLORS.primary;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 13, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    if (s.def.id === 'nexus') {
      const pulse = 0.55 + Math.sin(this.time * 3.1) * 0.3;
      ctx.save();
      ctx.globalAlpha = pulse * 0.45;
      ctx.fillStyle = ENEMY_COLORS.primary;
      ctx.beginPath();
      ctx.arc(s.x, s.y - 5, 27, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 0.65;
      for (let i = 0; i < 4; i++) {
        const a = this.time * 0.3 + i * (TAU / 4);
        px(ctx, s.x + Math.cos(a) * 47 - 1, s.y + Math.sin(a) * 39 - 1, 3, 3, ENEMY_COLORS.accent);
      }
      ctx.globalAlpha = 1;
    }
  }

  drawUnit(ctx, u) {
    const art = this.art.units[u.def.id];
    if (!art) return;
    const hostile = u.team === ENEMY;
    const isFlying = !!u.def.flying;
    const bob = isFlying ? Math.sin(this.time * 4 + u.id) * 2 : 0;
    const x = Math.round(u.x);
    const y = Math.round(u.y + bob);

    // Shadow
    ctx.fillStyle = isFlying ? 'rgba(2,7,7,0.24)' : 'rgba(2,7,7,0.4)';
    ctx.beginPath();
    ctx.ellipse(x + (isFlying ? 5 : 2), y + (isFlying ? 12 : 6), (u.def.radius + 3) * (isFlying ? 0.8 : 1), (u.def.radius + 2) * 0.42, 0.1, 0, TAU);
    ctx.fill();

    if (u.spawnFlash > 0) {
      ctx.save();
      ctx.globalAlpha = u.spawnFlash * 0.55;
      ctx.fillStyle = PLAYER_COLORS.primary;
      ctx.beginPath();
      ctx.arc(x, y, 22 * (1.2 - u.spawnFlash * 0.5), 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    if (u.walkPhase && u.moving && !isFlying) {
      // Tread/walk dust
      if (Math.random() > 0.8) {
        this.effects.push({
          type: 'particle',
          x: x - Math.cos(u.angle) * 8,
          y: y - Math.sin(u.angle) * 8 + 4,
          vx: (Math.random() - 0.5) * 10,
          vy: (Math.random() - 0.5) * 8 - 2,
          color: '#706a52',
          size: 1,
          life: 0.35,
          maxLife: 0.35,
          drag: 0.9
        });
      }
    }

    const frameIndex = art.frames.length > 1 ? (Math.floor(u.walkPhase) % 2) : 0;
    const sprite = art.frames[frameIndex];
    if (art.kind === 'tank') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(u.angle);
      ctx.drawImage(sprite, -art.pivot.x, -art.pivot.y);
      ctx.restore();
      const turret = art.turret;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(u.aimAngle);
      ctx.drawImage(turret, -art.turretPivot.x, -art.turretPivot.y);
      ctx.restore();
      // Muzzle glow
      this.drawMuzzleGlow(ctx, u);
    } else {
      const frameBob = art.kind === 'infantry' ? Math.round(Math.sin(u.walkPhase * 2) * 1) : 0;
      ctx.save();
      ctx.translate(x, y + frameBob);
      ctx.rotate(u.angle);
      ctx.drawImage(sprite, -art.pivot.x, -art.pivot.y);
      ctx.restore();
      if (art.kind === 'vehicle') {
        if (u.carried > 0) {
          ctx.save();
          ctx.globalAlpha = 0.7 + Math.sin(this.time * 4) * 0.16;
          ctx.fillStyle = PLAYER_COLORS.primary;
          ctx.beginPath();
          ctx.arc(x - Math.cos(u.angle) * 6, y - Math.sin(u.angle) * 6, 6, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
        this.drawMuzzleGlow(ctx, u);
      } else if (art.kind === 'air') {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = hostile ? ENEMY_COLORS.primary : PLAYER_COLORS.primary;
        ctx.fillRect(x - 1, y + 4, 3, 3);
        ctx.restore();
      }
    }
    if (u.hold) {
      ctx.strokeStyle = 'rgba(255,180,84,0.6)';
      ctx.beginPath();
      ctx.arc(x, y + 5, u.def.radius + 5, 0, TAU);
      ctx.stroke();
    }
    if (u.carried > 0) {
      ctx.fillStyle = PLAYER_COLORS.primary;
      ctx.fillRect(x - 2, y - u.def.radius - 9, 4, 2);
    }
  }

  drawMuzzleGlow(ctx, u) {
    if (u.cooldown > (u.def.cooldown || 1) - 0.06) {
      const angle = u.aimAngle;
      const mx = u.x + Math.cos(angle) * (u.def.id === 'scorpion' ? 25 : 16);
      const my = u.y + Math.sin(angle) * (u.def.id === 'scorpion' ? 25 : 16);
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#ffd78d';
      ctx.beginPath();
      ctx.arc(mx, my, 3, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  drawEffects(ctx) {
    for (const e of this.effects) {
      const alpha = clamp(e.life / e.maxLife, 0, 1);
      if (e.type === 'tracer') {
        ctx.save();
        ctx.globalAlpha = alpha * 0.9;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(e.x1, e.y1);
        ctx.lineTo(e.x2, e.y2);
        ctx.stroke();
        ctx.globalAlpha = alpha * 0.4;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      } else if (e.type === 'particle') {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = e.color;
        const s = Math.max(1, e.size * (e.smoke ? (1.5 - alpha * 0.5) : 1));
        ctx.fillRect(Math.round(e.x), Math.round(e.y), s, s);
        ctx.globalAlpha = 1;
      } else if (e.type === 'muzzle') {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.fillStyle = e.color;
        const len = e.kind === 'tank' ? 14 : 8;
        ctx.fillRect(0, -2, len, 4);
        ctx.fillStyle = '#fff4c7';
        ctx.fillRect(0, -1, len * 0.6, 2);
        ctx.restore();
      } else if (e.type === 'ring') {
        ctx.save();
        ctx.globalAlpha = alpha * 0.7;
        const ringR = Math.max(0.5, e.radius);
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, ringR, ringR * 0.6, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      } else if (e.type === 'flash') {
        const g = ctx.createRadialGradient(e.x, e.y, 1, e.x, e.y, e.radius);
        g.addColorStop(0, `rgba(255,239,190,${alpha * 0.8})`);
        g.addColorStop(0.4, `rgba(255,160,80,${alpha * 0.3})`);
        g.addColorStop(1, 'rgba(255,100,50,0)');
        ctx.fillStyle = g;
        ctx.fillRect(e.x - e.radius, e.y - e.radius, e.radius * 2, e.radius * 2);
      } else if (e.type === 'text') {
        ctx.save();
        ctx.globalAlpha = alpha;
        drawPixelText(ctx, e.text, e.x, e.y - (1 - alpha) * 18, e.color, 1, 'center', '#07100f');
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawFog(ctx) {
    const halfW = this.viewW / (this.zoom * 2) + TILE;
    const halfH = this.viewH / (this.zoom * 2) + TILE;
    const tx0 = clamp(Math.floor((this.camera.x - halfW) / TILE), 0, MAP_TILES - 1);
    const tx1 = clamp(Math.ceil((this.camera.x + halfW) / TILE), 0, MAP_TILES - 1);
    const ty0 = clamp(Math.floor((this.camera.y - halfH) / TILE), 0, MAP_TILES - 1);
    const ty1 = clamp(Math.ceil((this.camera.y + halfH) / TILE), 0, MAP_TILES - 1);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = ty * MAP_TILES + tx;
        if (this.fogVisible[i]) continue;
        ctx.fillStyle = this.fogExplored[i] ? 'rgba(2,7,8,0.63)' : 'rgba(2,6,7,0.91)';
        ctx.fillRect(tx * TILE, ty * TILE, TILE + 1, TILE + 1);
      }
    }
    // Soft vignette-like fog at the edge of vision.
    const v = ctx.createRadialGradient(this.camera.x, this.camera.y, Math.min(this.viewW, this.viewH) * 0.27 / this.zoom, this.camera.x, this.camera.y, Math.max(this.viewW, this.viewH) * 0.8 / this.zoom);
    v.addColorStop(0, 'rgba(2,7,8,0)');
    v.addColorStop(1, 'rgba(2,7,8,0.24)');
    ctx.fillStyle = v;
    ctx.fillRect(this.camera.x - this.viewW / this.zoom, this.camera.y - this.viewH / this.zoom, (this.viewW / this.zoom) * 2, (this.viewH / this.zoom) * 2);
  }

  drawAtmosphere(ctx, w, h) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(33,75,68,0.055)');
    grad.addColorStop(0.46, 'rgba(255,156,86,0.018)');
    grad.addColorStop(1, 'rgba(4,12,13,0.14)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    if (this.mode === 'playing' || this.mode === 'ending') {
      const dustCount = 18;
      for (let i = 0; i < dustCount; i++) {
        const x = ((i * 173 + this.time * (4 + (i % 4) * 2)) % (w + 100)) - 50;
        const y = ((i * 97 + Math.sin(this.time * 0.35 + i) * 30 + this.time * 2) % (h + 100)) - 50;
        ctx.fillStyle = i % 3 ? 'rgba(168,205,185,0.075)' : 'rgba(255,186,112,0.08)';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  drawMenuDust(ctx, w, h) {
    for (let i = 0; i < 36; i++) {
      const x = ((i * 191 + this.menuTime * (3 + (i % 5))) % (w + 120)) - 60;
      const y = ((i * 113 + Math.sin(this.menuTime * 0.18 + i * 0.9) * 40 + this.menuTime * 1.5) % (h + 120)) - 60;
      const alpha = 0.04 + (i % 4) * 0.015;
      ctx.fillStyle = `rgba(171,228,207,${alpha})`;
      ctx.fillRect(x, y, i % 7 === 0 ? 2 : 1, 1);
    }
  }

  drawObjectiveMarker(ctx, w, h) {
    const nexus = this.structures.find((s) => s.team === ENEMY && s.def.id === 'nexus' && !s.dead);
    if (!nexus) return;
    const screen = this.worldToScreen(nexus.x, nexus.y);
    const margin = 42;
    const topSafe = 88;
    const bottomSafe = h - 160;
    let x = screen.x;
    let y = screen.y;
    const onScreen = x > margin && x < w - margin && y > topSafe && y < bottomSafe;
    if (onScreen) {
      const bob = Math.sin(this.time * 2.6) * 3;
      const scale = 1;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = ENEMY_COLORS.primary;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 82 + bob);
      ctx.lineTo(x + 7, y - 75 + bob);
      ctx.lineTo(x, y - 68 + bob);
      ctx.lineTo(x - 7, y - 75 + bob);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = ENEMY_COLORS.primary;
      ctx.fillRect(x - 2, y - 77 + bob, 4, 4);
      ctx.restore();
      drawPixelText(ctx, 'NEXUS', x, y - 95 + bob, ENEMY_COLORS.primary, 1, 'center', '#080404');
      return;
    }
    if (this.mode !== 'playing') return;
    const cx = w / 2;
    const cy = h / 2;
    const ang = Math.atan2(screen.y - cy, screen.x - cx);
    const rx = w / 2 - margin;
    const ry = h / 2 - Math.max(margin, (h - bottomSafe) + 50);
    const clampX = clamp(screen.x, margin, w - margin);
    const clampY = clamp(screen.y, topSafe, bottomSafe);
    // Project onto edge box
    let ex = clampX;
    let ey = clampY;
    if (screen.x >= margin && screen.x <= w - margin) ex = clampX;
    if (screen.y >= topSafe && screen.y <= bottomSafe) ey = clampY;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(ang);
    ctx.fillStyle = ENEMY_COLORS.primary;
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const distance = Math.round(dist(this.camera.x, this.camera.y, nexus.x, nexus.y) / 12);
    drawPixelText(ctx, `NEXUS ${distance}M`, ex + Math.cos(ang) * 22, ey + Math.sin(ang) * 22 - 3, ENEMY_COLORS.primary, 1, 'center', '#080404');
  }

  // ── Minimap ──────────────────────────────────────────────────────────────

  updateMinimap(force = false) {
    if (!this.minimapCanvas) return;
    if (!force && !this.mapDirty) return;
    this.mapDirty = false;
    const ctx = this.minimapCanvas.getContext('2d');
    const size = this.minimapCanvas.width;
    const scale = size / WORLD;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.terrain.canvas, 0, 0, size, size);
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = '#071314';
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#041012';
    for (let ty = 0; ty < MAP_TILES; ty++) {
      for (let tx = 0; tx < MAP_TILES; tx++) {
        const i = ty * MAP_TILES + tx;
        if (!this.fogExplored[i]) {
          ctx.fillStyle = 'rgba(2,6,7,0.88)';
          const ts = size / MAP_TILES;
          ctx.fillRect(tx * ts, ty * ts, ts + 0.5, ts + 0.5);
        } else if (!this.fogVisible[i]) {
          ctx.fillStyle = 'rgba(2,7,8,0.38)';
          const ts = size / MAP_TILES;
          ctx.fillRect(tx * ts, ty * ts, ts + 0.5, ts + 0.5);
        }
      }
    }
    ctx.globalAlpha = 1;
    // Crystals
    for (const c of this.crystals) {
      const vis = this.isExploredWorld(c.x, c.y);
      if (!vis) continue;
      ctx.fillStyle = c.amount > 0 ? '#5affe0' : '#49605a';
      ctx.fillRect(c.x * scale - 1, c.y * scale - 1, 2, 2);
    }
    // Structures
    for (const s of this.structures) {
      if (s.dead) continue;
      if (s.team === ENEMY && !this.isVisibleWorld(s.x, s.y)) continue;
      if (s.team === PLAYER && !this.isExploredWorld(s.x, s.y)) continue;
      const sizePx = Math.max(2, s.def.size * (size / MAP_TILES) * 0.55);
      ctx.fillStyle = s.team === PLAYER ? PLAYER_COLORS.primary : ENEMY_COLORS.primary;
      ctx.fillRect(s.x * scale - sizePx / 2, s.y * scale - sizePx / 2, sizePx, sizePx);
      if (s.def.id === 'nexus') {
        ctx.strokeStyle = ENEMY_COLORS.accent;
        ctx.lineWidth = 1;
        ctx.strokeRect(s.x * scale - sizePx / 2 - 2, s.y * scale - sizePx / 2 - 2, sizePx + 4, sizePx + 4);
      }
    }
    // Units
    for (const u of this.units) {
      if (u.dead) continue;
      const player = u.team === PLAYER;
      if (!player && !this.isVisibleWorld(u.x, u.y)) continue;
      ctx.fillStyle = player ? (u.def.id === 'hauler' ? '#7fffe1' : PLAYER_COLORS.bright) : ENEMY_COLORS.primary;
      const s = player && u.def.id === 'scorpion' ? 2 : 2;
      ctx.fillRect(u.x * scale - s / 2, u.y * scale - s / 2, s, s);
    }
    // Viewport
    const vw = this.viewW / this.zoom * scale;
    const vh = this.viewH / this.zoom * scale;
    ctx.strokeStyle = 'rgba(182,232,217,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.camera.x * scale - vw / 2, this.camera.y * scale - vh / 2, vw, vh);
    // Corner grid
    ctx.strokeStyle = 'rgba(131,255,217,0.08)';
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (size / 4) * i);
      ctx.lineTo(size, (size / 4) * i);
      ctx.moveTo((size / 4) * i, 0);
      ctx.lineTo((size / 4) * i, size);
      ctx.stroke();
    }
  }

  renderBigMap() {
    if (!this.bigmapCanvas) return;
    const ctx = this.bigmapCanvas.getContext('2d');
    const size = this.bigmapCanvas.width;
    const scale = size / WORLD;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.terrain.canvas, 0, 0, size, size);
    ctx.fillStyle = 'rgba(4,12,13,0.22)';
    ctx.fillRect(0, 0, size, size);
    const ts = size / MAP_TILES;
    for (let ty = 0; ty < MAP_TILES; ty++) {
      for (let tx = 0; tx < MAP_TILES; tx++) {
        const i = ty * MAP_TILES + tx;
        if (!this.fogExplored[i]) {
          ctx.fillStyle = 'rgba(2,6,7,0.9)';
          ctx.fillRect(tx * ts, ty * ts, ts + 0.5, ts + 0.5);
        } else if (!this.fogVisible[i]) {
          ctx.fillStyle = 'rgba(2,7,8,0.42)';
          ctx.fillRect(tx * ts, ty * ts, ts + 0.5, ts + 0.5);
        }
      }
    }
    for (const c of this.crystals) {
      if (!this.isExploredWorld(c.x, c.y) || c.amount <= 0) continue;
      ctx.fillStyle = '#5affe0';
      ctx.beginPath();
      ctx.arc(c.x * scale, c.y * scale, 4, 0, TAU);
      ctx.fill();
    }
    for (const s of this.structures) {
      if (s.dead) continue;
      if (s.team === ENEMY && !this.isVisibleWorld(s.x, s.y)) continue;
      const sp = Math.max(4, s.def.size * (size / MAP_TILES) * 0.55);
      ctx.fillStyle = s.team === PLAYER ? PLAYER_COLORS.primary : ENEMY_COLORS.primary;
      ctx.fillRect(s.x * scale - sp / 2, s.y * scale - sp / 2, sp, sp);
      if (s.def.id === 'nexus') {
        ctx.strokeStyle = ENEMY_COLORS.accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(s.x * scale - sp / 2 - 4, s.y * scale - sp / 2 - 4, sp + 8, sp + 8);
      }
    }
    for (const u of this.units) {
      if (u.dead) continue;
      if (u.team === ENEMY && !this.isVisibleWorld(u.x, u.y)) continue;
      ctx.fillStyle = u.team === PLAYER ? PLAYER_COLORS.bright : ENEMY_COLORS.primary;
      ctx.fillRect(u.x * scale - 1.5, u.y * scale - 1.5, 3, 3);
    }
    const vw = this.viewW / this.zoom * scale;
    const vh = this.viewH / this.zoom * scale;
    ctx.strokeStyle = 'rgba(220,255,243,0.65)';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.camera.x * scale - vw / 2, this.camera.y * scale - vh / 2, vw, vh);
    // Grid and coordinates
    ctx.strokeStyle = 'rgba(131,255,217,0.1)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (size / 8) * i);
      ctx.lineTo(size, (size / 8) * i);
      ctx.moveTo((size / 8) * i, 0);
      ctx.lineTo((size / 8) * i, size);
      ctx.stroke();
    }
  }

  // ── UI data ──────────────────────────────────────────────────────────────

  getSnapshot() {
    const selected = this.getSelected();
    const units = selected.filter((e) => e.kind === 'unit');
    const buildings = selected.filter((e) => e.kind === 'structure');
    let info = {
      selCount: selected.length,
      selName: 'TACTICAL LINK',
      selMeta: 'STANDBY',
      selHpPct: 0,
      selKind: null,
      selType: null,
      selTeam: null,
      selRole: 'NO SELECTION'
    };
    if (units.length) {
      const first = units[0];
      const allSame = units.every((u) => u.def.id === first.def.id);
      const hp = units.reduce((n, u) => n + u.hp, 0);
      const maxHp = units.reduce((n, u) => n + u.maxHp, 0);
      info = {
        selCount: units.length,
        selName: allSame ? first.def.name + (units.length > 1 ? ` x${units.length}` : '') : `MIXED SQUAD x${units.length}`,
        selMeta: units.length === 1 ? first.def.role : `${units.length} ELEMENTS`,
        selHpPct: maxHp ? hp / maxHp : 0,
        selKind: 'unit',
        selType: allSame ? first.def.id : null,
        selTeam: PLAYER,
        selRole: units.length === 1 ? first.def.role : 'COMBAT GROUP'
      };
    } else if (buildings.length) {
      const b = buildings[0];
      info = {
        selCount: 1,
        selName: b.def.name,
        selMeta: b.completed ? b.def.role : `CONSTRUCTION ${Math.round(b.progress * 100)}%`,
        selHpPct: b.hp / b.maxHp,
        selKind: 'structure',
        selType: b.def.id,
        selTeam: PLAYER,
        selRole: b.def.role
      };
    }
    const nexus = this.structures.find((s) => s.team === ENEMY && s.def.id === 'nexus' && !s.dead);
    const hq = this.structures.find((s) => s.team === PLAYER && s.def.id === 'hq' && !s.dead);
    const army = this.units.filter((u) => u.team === PLAYER && !u.dead && u.def.id !== 'hauler').length;
    const haulers = this.units.filter((u) => u.team === PLAYER && !u.dead && u.def.id === 'hauler').length;
    return {
      mode: this.mode,
      credits: this.credits,
      wave: this.wave,
      threat: this.waveTimer,
      elapsed: this.elapsed,
      nexusHp: nexus ? nexus.hp : 0,
      nexusMax: nexus ? nexus.maxHp : 1,
      nexusAlive: !!nexus,
      hqHp: hq ? hq.hp : 0,
      hqMax: hq ? hq.maxHp : 1,
      army,
      haulers,
      stats: { ...this.stats },
      buildMode: this.buildMode,
      buildGhost: this.buildGhost,
      ...info
    };
  }
}

function distActually(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

function polyFlag(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 10, y + 4);
  ctx.lineTo(x, y + 8);
  ctx.closePath();
  ctx.fill();
}
