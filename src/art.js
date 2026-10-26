import {
  TILE, MAP_TILES, WORLD, PLAYER_COLORS, ENEMY_COLORS, TERRAIN
} from './config.js';

const TAU = Math.PI * 2;

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas: c, ctx };
}

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
}

function line(ctx, x1, y1, x2, y2, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function poly(ctx, points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fill();
}

function polyOutlined(ctx, points, fill, outline) {
  poly(ctx, points, outline);
  const cx = points.reduce((a, p) => a + p[0], 0) / points.length;
  const cy = points.reduce((a, p) => a + p[1], 0) / points.length;
  poly(ctx, points.map(([x, y]) => [cx + (x - cx) * 0.88, cy + (y - cy) * 0.88]), fill);
}

function createSprite(w, h, draw) {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  return canvas;
}

// A compact 5x7 bitmap face used for in-world signage.
const GLYPHS = {
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  B: ['11110','10001','10001','11110','10001','10001','11110'],
  C: ['01111','10000','10000','10000','10000','10000','01111'],
  D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'],
  F: ['11111','10000','10000','11110','10000','10000','10000'],
  G: ['01111','10000','10000','10111','10001','10001','01111'],
  H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['11111','00100','00100','00100','00100','00100','11111'],
  J: ['00111','00010','00010','00010','00010','10010','01100'],
  K: ['10001','10010','10100','11000','10100','10010','10001'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10101','10001','10001','10001'],
  N: ['10001','11001','10101','10011','10001','10001','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'],
  P: ['11110','10001','10001','11110','10000','10000','10000'],
  Q: ['01110','10001','10001','10001','10101','10010','01101'],
  R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'],
  V: ['10001','10001','10001','10001','10001','01010','00100'],
  W: ['10001','10001','10001','10101','10101','11011','10001'],
  X: ['10001','10001','01010','00100','01010','10001','10001'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'],
  Z: ['11111','00001','00010','00100','01000','10000','11111'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','11110','00001','00001','10001','01110'],
  '6': ['01110','10000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00001','01110'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '.': ['00000','00000','00000','00000','00000','00110','00110'],
  ':': ['00000','00110','00110','00000','00110','00110','00000'],
  '/': ['00001','00010','00010','00100','01000','01000','10000'],
  '+': ['00000','00100','00100','11111','00100','00100','00000'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000']
};

export function drawPixelText(ctx, text, x, y, color, scale = 1, align = 'left', shadow = null) {
  const chars = String(text).toUpperCase().split('');
  const width = chars.length * 6 * scale - scale;
  let startX = x;
  if (align === 'center') startX -= width / 2;
  if (align === 'right') startX -= width;
  if (shadow) {
    drawPixelText(ctx, text, startX + scale, y + scale, shadow, scale, 'left', null);
  }
  ctx.fillStyle = color;
  chars.forEach((ch, i) => {
    const glyph = GLYPHS[ch] || GLYPHS[' '];
    const gx = startX + i * 6 * scale;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === '1') {
          ctx.fillRect(Math.round(gx + col * scale), Math.round(y + row * scale), scale, scale);
        }
      }
    }
  });
  return width;
}

// ── Terrain ────────────────────────────────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, y, period, seed) {
  const gx = x / period;
  const gy = y / period;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = smoothstep(gx - x0);
  const fy = smoothstep(gy - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

function fbm(x, y, seed) {
  return valueNoise(x, y, 148, seed) * 0.5
    + valueNoise(x, y, 61, seed + 7) * 0.28
    + valueNoise(x, y, 23, seed + 19) * 0.15
    + valueNoise(x, y, 8, seed + 31) * 0.07;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRgb(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

const ROCK_CLUSTERS = [
  { x: 7, y: 10, r: 2.2 }, { x: 33, y: 13, r: 2.4 }, { x: 10, y: 19, r: 2.0 },
  { x: 31, y: 22, r: 2.2 }, { x: 6, y: 29, r: 2.2 }, { x: 35, y: 31, r: 2.5 },
  { x: 12, y: 38, r: 1.8 }, { x: 30, y: 39, r: 2.0 }, { x: 16, y: 15, r: 1.3 },
  { x: 26, y: 37, r: 1.2 }, { x: 4, y: 22, r: 1.2 }, { x: 38, y: 20, r: 1.4 },
  { x: 15, y: 23, r: 1.2 }, { x: 28, y: 30, r: 1.1 }, { x: 5, y: 36, r: 1.6 },
  { x: 37, y: 7, r: 1.5 }, { x: 18, y: 6, r: 1.3 }, { x: 25, y: 13, r: 1.1 }
];

export const CRYSTAL_SITES = [
  { x: 14.5, y: 28.5, amount: 1100 },
  { x: 26.5, y: 34.3, amount: 950 },
  { x: 26.4, y: 25.5, amount: 900 },
  { x: 14.4, y: 34.5, amount: 760 },
  { x: 9.0, y: 15.0, amount: 1000 },
  { x: 32.0, y: 16.5, amount: 1000 },
  { x: 23.2, y: 20.2, amount: 620 },
  { x: 32.3, y: 36.5, amount: 700 }
];

export function generateTerrain(seed = 90210) {
  const rand = mulberry32(seed);
  const { canvas, ctx } = makeCanvas(WORLD, WORLD);
  const blocked = new Uint8Array(MAP_TILES * MAP_TILES);
  const roadTiles = new Uint8Array(MAP_TILES * MAP_TILES);
  ctx.imageSmoothingEnabled = false;

  const roadCenter = (ty) => 20 + Math.sin(ty * 0.26 + 0.7) * 2.1 + Math.sin(ty * 0.09) * 1.1;

  // Two-pixel dither field over low-frequency noise keeps the ground organic
  // while staying crisp when the camera zooms in.
  const palette = ['#41443a', '#4c4b3e', '#575243', '#625c49'].map(hexToRgb);
  const enemyTint = hexToRgb(TERRAIN.enemySoil);
  const playerTint = [62, 73, 62];
  const roadRgb = hexToRgb(TERRAIN.road);
  const tw = WORLD / 2;
  const img = ctx.createImageData(tw, tw);
  const data = img.data;
  for (let py = 0; py < tw; py++) {
    const wy = py * 2;
    const ty = wy / TILE;
    for (let pxi = 0; pxi < tw; pxi++) {
      const wx = pxi * 2;
      const tx = wx / TILE;
      const eDist = Math.hypot(tx - 20, ty - 8);
      const pDist = Math.hypot(tx - 20, ty - 31);
      const base = fbm(wx, wy, seed);
      const broad = valueNoise(wx, wy, 310, seed + 5);
      const n = base * 0.74 + broad * 0.26;
      let t = clamp((n - 0.2) / 0.62, 0, 0.999) * (palette.length - 1);
      const i0 = Math.floor(t);
      const frac = t - i0;
      const pick = hash2(pxi, py, seed + 41) < frac ? i0 + 1 : i0;
      let rgb = palette[Math.min(palette.length - 1, pick)];
      const enemyMix = clamp((8.4 - eDist) / 5.6, 0, 1) * 0.66;
      if (enemyMix > 0) rgb = mixRgb(rgb, enemyTint, enemyMix);
      const playerMix = clamp((5.4 - pDist) / 4.4, 0, 1) * 0.32;
      if (playerMix > 0) rgb = mixRgb(rgb, playerTint, playerMix);
      const route = roadCenter(ty) * TILE;
      const roadDist = Math.abs(wx - route) / TILE;
      if (roadDist < 1.6) {
        const wear = 0.24 + valueNoise(wx, wy, 34, seed + 61) * 0.26;
        const edge = smoothstep(clamp((1.6 - roadDist) / 0.7, 0, 1));
        rgb = mixRgb(rgb, roadRgb, wear * edge);
      }
      const grain = (hash2(pxi, py, seed + 83) - 0.5) * 9;
      const idx = (py * tw + pxi) * 4;
      data[idx] = clamp(rgb[0] + grain, 0, 255);
      data[idx + 1] = clamp(rgb[1] + grain, 0, 255);
      data[idx + 2] = clamp(rgb[2] + grain, 0, 255);
      data[idx + 3] = 255;
    }
  }
  const ground = makeCanvas(tw, tw);
  ground.ctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(ground.canvas, 0, 0, WORLD, WORLD);

  // Fine grit, hairline cracks and loose scrub.
  for (let ty = 0; ty < MAP_TILES; ty++) {
    for (let tx = 0; tx < MAP_TILES; tx++) {
      const x = tx * TILE;
      const y = ty * TILE;
      const enemyDist = Math.hypot(tx - 20, ty - 8);
      const specks = 9 + Math.floor(rand() * 11);
      for (let s = 0; s < specks; s++) {
        const sx = x + Math.floor(rand() * TILE);
        const sy = y + Math.floor(rand() * TILE);
        const sw = rand() > 0.9 ? 2 : 1;
        const tone = rand();
        let speck = TERRAIN.dust;
        if (tone < 0.34) speck = '#383d34';
        else if (tone < 0.64) speck = '#6b6650';
        else if (tone < 0.82) speck = '#55533f';
        if (enemyDist < 7.4 && rand() > 0.62) speck = '#6b332c';
        ctx.globalAlpha = 0.72;
        px(ctx, sx, sy, sw, sw, speck);
        ctx.globalAlpha = 1;
      }

      if (rand() > 0.86) {
        const cx = x + 5 + rand() * 25;
        const cy = y + 5 + rand() * 25;
        line(ctx, cx, cy, cx + 4 + rand() * 8, cy + 2 + rand() * 4, 'rgba(27,35,31,0.4)');
      }

      if (rand() > 0.94) {
        poly(ctx, [[x + 8, y + 30], [x + 12, y + 25], [x + 17, y + 28], [x + 14, y + 33]], '#2d3530');
        px(ctx, x + 11, y + 27, 3, 1, '#5c6350');
      }
    }
  }

  // A broken supply route winds from the landing zone into the badlands.
  for (let ty = 0; ty < MAP_TILES; ty++) {
    const c = roadCenter(ty);
    for (let tx = 0; tx < MAP_TILES; tx++) {
      const d = Math.abs(tx - c);
      if (d <= 1.55) {
        const i = ty * MAP_TILES + tx;
        roadTiles[i] = 1;
        const x = tx * TILE;
        const y = ty * TILE;
        for (let s = 0; s < 12; s++) {
          const sx = x + rand() * TILE;
          const sy = y + rand() * TILE;
          ctx.globalAlpha = 0.42;
          px(ctx, sx, sy, 1, 1, rand() > 0.5 ? '#525a50' : '#252e2c');
          ctx.globalAlpha = 1;
        }
      }
      if (Math.abs(d - 1.8) < 0.2) {
        px(ctx, tx * TILE + 17, ty * TILE + 9, 3, 1, 'rgba(148,140,108,0.3)');
      }
      if (Math.abs(d - 0.1) < 0.2 && ty % 3 === 0) {
        px(ctx, tx * TILE + 8, ty * TILE + 18, 22, 2, 'rgba(174,158,116,0.2)');
      }
    }
  }

  // Player landing pad.
  drawLandingPad(ctx, 20 * TILE, 31 * TILE, 7, PLAYER_COLORS, rand);
  // Enemy occupation zone.
  drawLandingPad(ctx, 20 * TILE, 8 * TILE, 8, ENEMY_COLORS, rand, true);

  // Blocked rock fields.
  for (const cluster of ROCK_CLUSTERS) {
    const cr = Math.ceil(cluster.r * 1.8);
    for (let ty = Math.floor(cluster.y - cr); ty <= cluster.y + cr; ty++) {
      for (let tx = Math.floor(cluster.x - cr); tx <= cluster.x + cr; tx++) {
        if (tx < 1 || ty < 1 || tx >= MAP_TILES - 1 || ty >= MAP_TILES - 1) continue;
        const dist = Math.hypot(tx - cluster.x, ty - cluster.y);
        if (dist > cluster.r + rand() * 0.9) continue;
        const idx = ty * MAP_TILES + tx;
        if (roadTiles[idx]) continue;
        if (Math.hypot(tx - 20, ty - 31) < 5.2 || Math.hypot(tx - 20, ty - 8) < 5.8) continue;
        if (CRYSTAL_SITES.some((n) => Math.hypot(n.x - tx, n.y - ty) < 2.1)) continue;
        blocked[idx] = 1;
        drawBoulderTile(ctx, tx * TILE, ty * TILE, rand, 1 + (rand() > 0.75 ? 1 : 0));
      }
    }
  }

  // Loose stones, craters and dead scrub outside the road.
  for (let n = 0; n < 520; n++) {
    const tx = 1 + Math.floor(rand() * (MAP_TILES - 2));
    const ty = 1 + Math.floor(rand() * (MAP_TILES - 2));
    if (roadTiles[ty * MAP_TILES + tx]) continue;
    const x = tx * TILE + rand() * TILE;
    const y = ty * TILE + rand() * TILE;
    if (rand() > 0.72) {
      px(ctx, x, y, 2, 1, '#30382f');
      px(ctx, x + 1, y + 1, 2, 1, '#1c241f');
    } else {
      line(ctx, x, y, x + 2, y - 3, 'rgba(94,91,66,0.5)');
    }
  }

  for (let n = 0; n < 22; n++) {
    const x = 80 + rand() * (WORLD - 160);
    const y = 80 + rand() * (WORLD - 160);
    if (Math.abs(x - 20 * TILE) < 120 || Math.abs(y - 20 * TILE) < 120) continue;
    drawCrater(ctx, x, y, 5 + rand() * 10, rand);
  }

  // Old wreckage near the middle of the sector.
  drawWreck(ctx, 13.3 * TILE, 21.4 * TILE, rand);
  drawWreck(ctx, 29.2 * TILE, 27.1 * TILE, rand);
  drawRuin(ctx, 17.1 * TILE, 12.3 * TILE, rand);
  drawRuin(ctx, 31.6 * TILE, 10.2 * TILE, rand);

  // Keep a safe evacuation edge.
  for (let i = 0; i < MAP_TILES; i++) {
    blocked[i] = 1;
    blocked[(MAP_TILES - 1) * MAP_TILES + i] = 1;
    blocked[i * MAP_TILES] = 1;
    blocked[i * MAP_TILES + MAP_TILES - 1] = 1;
  }

  return { canvas, blocked, roadTiles };
}

function drawLandingPad(ctx, cx, cy, tiles, colors, rand, hostile = false) {
  const r = tiles * TILE * 0.5;
  const step = TILE;
  for (let y = -r; y < r; y += step) {
    for (let x = -r; x < r; x += step) {
      const dx = Math.abs(x + step / 2);
      const dy = Math.abs(y + step / 2);
      if (dx + dy * 0.76 > r) continue;
      const tone = rand();
      let c = hostile ? (tone > 0.5 ? '#332a28' : '#302725') : (tone > 0.5 ? '#343e3a' : '#303935');
      if (tone > 0.94) c = hostile ? '#382d2a' : '#37423d';
      px(ctx, cx + x, cy + y, step, step, c);
      if (rand() > 0.72) px(ctx, cx + x + rand() * step, cy + y + rand() * step, 2, 1, hostile ? '#5b302a' : '#4c5d55');
      if (rand() > 0.62) {
        ctx.globalAlpha = 0.26;
        line(ctx, cx + x, cy + y + step - 1, cx + x + step, cy + y + step - 1, hostile ? '#7c3b30' : '#648a7c');
        ctx.globalAlpha = 1;
      }
    }
  }
  const edge = hostile ? '#5d2f27' : '#547467';
  const accent = hostile ? '#a83d2f' : '#3e977f';
  ctx.globalAlpha = 0.8;
  for (let i = 0; i < 8; i++) {
    const a1 = (i / 8) * TAU;
    const a2 = ((i + 1) / 8) * TAU;
    line(ctx, cx + Math.cos(a1) * r * 0.62, cy + Math.sin(a1) * r * 0.62, cx + Math.cos(a2) * r * 0.62, cy + Math.sin(a2) * r * 0.62, edge);
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([TILE * 0.5, TILE * 0.35]);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - TILE * 1.65, cy - TILE * 1.65, TILE * 3.3, TILE * 3.3);
  ctx.setLineDash([]);
  drawPixelText(ctx, hostile ? 'ASH-01' : 'FOB-07', cx, cy - r - 14, accent, 2, 'center', '#08100f');
  if (!hostile) {
    for (let y = -r + 16; y < r - 16; y += 32) {
      px(ctx, cx - r + 13, cy + y, 5, 10, '#a98b4a');
      px(ctx, cx - r + 13, cy + y + 5, 5, 5, '#2b2c25');
    }
  }
}

function drawBoulderTile(ctx, x, y, rand, count) {
  for (let i = 0; i < count; i++) {
    const cx = x + 8 + rand() * 22;
    const cy = y + 10 + rand() * 22;
    const w = 12 + rand() * 20;
    const h = 9 + rand() * 14;
    ctx.fillStyle = 'rgba(6,10,10,0.38)';
    ctx.beginPath();
    ctx.ellipse(cx + 5, cy + 6, w * 0.6, h * 0.4, 0.2, 0, TAU);
    ctx.fill();
    poly(ctx, [
      [cx - w / 2, cy + h * 0.2],
      [cx - w * 0.32, cy - h * 0.55],
      [cx + w * 0.16, cy - h * 0.7],
      [cx + w / 2, cy - h * 0.12],
      [cx + w * 0.3, cy + h * 0.52],
      [cx - w * 0.26, cy + h * 0.48]
    ], TERRAIN.rockDark);
    poly(ctx, [
      [cx - w * 0.35, cy + h * 0.02],
      [cx - w * 0.22, cy - h * 0.42],
      [cx + w * 0.18, cy - h * 0.55],
      [cx + w * 0.38, cy - h * 0.1],
      [cx + w * 0.18, cy + h * 0.2],
      [cx - w * 0.18, cy + h * 0.26]
    ], TERRAIN.rock);
    px(ctx, cx - w * 0.12, cy - h * 0.38, Math.max(2, w * 0.24), 2, TERRAIN.rockLight);
    px(ctx, cx + w * 0.14, cy - h * 0.12, 2, 3, '#67736a');
  }
}

function drawCrater(ctx, x, y, r, rand) {
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#1a211f';
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.62, rand() * 0.4, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = '#74705a';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawWreck(ctx, x, y, rand) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.35 + rand() * 0.5);
  ctx.fillStyle = 'rgba(5,9,9,0.4)';
  ctx.fillRect(-18, -8, 44, 24);
  px(ctx, -19, -7, 35, 15, '#272e2a');
  px(ctx, -15, -10, 20, 7, '#37423b');
  px(ctx, 4, -8, 12, 12, '#212825');
  px(ctx, -16, 5, 25, 3, '#171d1a');
  px(ctx, -7, -5, 4, 4, '#7b3d2d');
  px(ctx, 9, -4, 3, 2, '#55806f');
  line(ctx, -22, 10, 16, -13, '#1a211e', 2);
  ctx.restore();
}

function drawRuin(ctx, x, y, rand) {
  px(ctx, x - 22, y + 6, 45, 9, 'rgba(4,8,8,0.32)');
  px(ctx, x - 20, y - 12, 41, 20, '#2e3632');
  px(ctx, x - 17, y - 16, 8, 14, '#38413b');
  px(ctx, x + 3, y - 9, 13, 18, '#252c29');
  px(ctx, x - 12, y - 7, 4, 4, '#643427');
  px(ctx, x + 7, y + 3, 5, 2, '#4f6d61');
  for (let i = 0; i < 5; i++) {
    px(ctx, x - 16 + rand() * 32, y - 15 + rand() * 22, 1, 1, '#687058');
  }
}

// ── Unit art ───────────────────────────────────────────────────────────────

function drawInfantry(ctx, ox, oy, colors, frame = 0, hostile = false) {
  const out = '#07100f';
  const step = frame === 0 ? 1 : -1;
  // Legs
  px(ctx, ox + 8, oy + 4 + step, 4, 6, out);
  px(ctx, ox + 8, oy + 4 + step, 3, 5, hostile ? '#5f3830' : '#27443d');
  px(ctx, ox + 8, oy + 13 - step, 4, 6, out);
  px(ctx, ox + 8, oy + 13 - step, 3, 5, hostile ? '#4b2e28' : '#203933');
  // Pack
  px(ctx, ox + 3, oy + 6, 6, 8, out);
  px(ctx, ox + 4, oy + 7, 4, 6, hostile ? '#3b2925' : '#1d3731');
  px(ctx, ox + 5, oy + 8, 2, 2, colors.mid);
  // Torso
  poly(ctx, [[ox + 7, oy + 6], [ox + 15, oy + 5], [ox + 18, oy + 10], [ox + 15, oy + 15], [ox + 8, oy + 14]], out);
  poly(ctx, [[ox + 8, oy + 7], [ox + 15, oy + 6], [ox + 17, oy + 10], [ox + 14, oy + 14], [ox + 9, oy + 13]], colors.dark);
  px(ctx, ox + 10, oy + 7, 4, 2, colors.metalLight);
  px(ctx, ox + 12, oy + 11, 4, 3, colors.metal);
  // Shoulders
  px(ctx, ox + 11, oy + 3, 4, 3, out);
  px(ctx, ox + 11, oy + 4, 3, 2, colors.mid);
  px(ctx, ox + 11, oy + 14, 4, 3, out);
  px(ctx, ox + 11, oy + 14, 3, 2, colors.mid);
  // Helmet and face
  px(ctx, ox + 14, oy + 6, 7, 9, out);
  px(ctx, ox + 14, oy + 6, 6, 8, colors.metal);
  px(ctx, ox + 14, oy + 6, 5, 2, colors.metalLight);
  px(ctx, ox + 17, oy + 8, 4, 3, colors.primary);
  px(ctx, ox + 18, oy + 9, 2, 1, colors.bright);
  px(ctx, ox + 15, oy + 12, 4, 2, colors.dark);
  if (hostile) {
    px(ctx, ox + 13, oy + 4, 2, 2, colors.accent);
    px(ctx, ox + 13, oy + 14, 2, 2, colors.accent);
  }
  // Weapon
  px(ctx, ox + 16, oy + 10, 9, 2, out);
  px(ctx, ox + 17, oy + 10, 8, 1, hostile ? '#b07557' : '#7d9188');
  px(ctx, ox + 19, oy + 12, 3, 2, '#121918');
  px(ctx, ox + 24, oy + 9, 3, 1, colors.bright);
  if (hostile) {
    px(ctx, ox + 23, oy + 11, 3, 1, '#4b2d26');
  }
}

function drawVehicleBody(ctx, w, h, colors, hostile, kind) {
  const cx = w / 2;
  const cy = h / 2;
  const out = '#070d0d';
  // Tracks
  px(ctx, 4, 3, w - 8, 7, out);
  px(ctx, 5, 4, w - 10, 5, '#1b2422');
  px(ctx, 4, h - 10, w - 8, 7, out);
  px(ctx, 5, h - 9, w - 10, 5, '#1b2422');
  for (let x = 8; x < w - 7; x += 6) {
    px(ctx, x, 4, 1, 5, '#35443f');
    px(ctx, x, h - 9, 1, 5, '#35443f');
  }
  // Chassis
  poly(ctx, [[7, 7], [w - 11, 6], [w - 3, cy], [w - 11, h - 6], [7, h - 7], [2, cy]], out);
  poly(ctx, [[8, 8], [w - 11, 7], [w - 6, cy], [w - 11, h - 7], [8, h - 8], [4, cy]], colors.metal);
  // Armor panels
  px(ctx, 9, 9, w * 0.42, 3, colors.metalLight);
  px(ctx, 10, 13, w * 0.28, 2, colors.dark);
  px(ctx, 9, h - 12, w * 0.4, 3, colors.dark);
  if (kind === 'tank') {
    px(ctx, w - 16, 10, 5, 4, colors.dark);
    px(ctx, w - 16, h - 14, 5, 4, colors.dark);
    px(ctx, 8, cy - 4, 7, 8, colors.dark);
    px(ctx, 10, cy - 2, 4, 4, colors.primary);
    for (let i = 0; i < 3; i++) px(ctx, 13 + i * 5, 7, 2, 1, hostile ? '#934633' : '#4f7f71');
  } else {
    px(ctx, 8, cy - 4, w * 0.45, 8, colors.dark);
    px(ctx, 10, cy - 2, w * 0.3, 3, colors.metalLight);
  }
  // Team light
  px(ctx, w - 8, cy - 2, 3, 4, colors.primary);
  px(ctx, w - 7, cy - 1, 2, 2, colors.bright);
  if (hostile) {
    px(ctx, 7, 4, 3, 2, colors.accent);
    px(ctx, 7, h - 6, 3, 2, colors.accent);
  }
}

function drawHauler(ctx, w, h, colors) {
  drawVehicleBody(ctx, w, h, colors, false, 'hauler');
  const cy = h / 2;
  px(ctx, w - 17, 8, 9, h - 16, '#182220');
  px(ctx, w - 14, 10, 5, h - 20, '#44625a');
  px(ctx, w - 9, 8, 3, h - 16, colors.primary);
  // Cargo clamp
  px(ctx, 6, 7, 13, h - 14, '#0c1514');
  px(ctx, 8, 9, 9, h - 18, '#2a3733');
  px(ctx, 10, cy - 5, 6, 10, '#06302c');
  px(ctx, 11, cy - 4, 4, 8, colors.primary);
  px(ctx, 12, cy - 2, 2, 4, '#ffffff');
  px(ctx, 22, cy - 3, 6, 6, '#111a18');
  px(ctx, 23, cy - 1, 4, 2, colors.metalLight);
}

function drawTurretSprite(ctx, w, h, colors, hostile = false, heavy = false) {
  const out = '#070d0c';
  const cx = w / 2;
  const cy = h / 2;
  px(ctx, 7, 8, w - 14, h - 16, out);
  px(ctx, 8, 9, w - 16, h - 18, colors.metal);
  px(ctx, 10, 11, w - 20, 4, colors.metalLight);
  px(ctx, 11, h - 15, w - 22, 3, colors.dark);
  px(ctx, 4, cy - 5, 5, 10, out);
  px(ctx, 5, cy - 4, 3, 8, colors.metalLight);
  px(ctx, w - 8, cy - 4, 4, 8, colors.dark);
  px(ctx, cx - 4, cy - 4, 8, 8, '#0a1312');
  px(ctx, cx - 3, cy - 3, 6, 6, colors.primary);
  px(ctx, cx - 2, cy - 2, 3, 3, colors.bright);
  // Barrels
  px(ctx, cx + 4, cy - 5, 12, 2, out);
  px(ctx, cx + 4, cy + 3, 12, 2, out);
  px(ctx, cx + 5, cy - 5, 11, 1, colors.metalLight);
  px(ctx, cx + 5, cy + 3, 11, 1, colors.metalLight);
  px(ctx, cx + 14, cy - 5, 3, 2, colors.primary);
  px(ctx, cx + 14, cy + 3, 3, 2, hostile ? colors.accent : colors.primary);
  if (heavy) {
    px(ctx, cx - 7, cy - 7, 3, 14, out);
    px(ctx, cx + 6, cy - 7, 3, 14, out);
    px(ctx, cx - 6, cy - 5, 1, 10, colors.mid);
    px(ctx, cx + 7, cy - 5, 1, 10, colors.mid);
  }
}

function buildUnitArt() {
  const p = PLAYER_COLORS;
  const e = ENEMY_COLORS;
  const art = {};

  art.rifle = {
    kind: 'infantry',
    pivot: { x: 14, y: 10 },
    frames: [0, 1].map((f) => createSprite(30, 22, (ctx) => drawInfantry(ctx, 0, 1, p, f, false)))
  };
  art.raider = {
    kind: 'infantry',
    pivot: { x: 14, y: 10 },
    frames: [0, 1].map((f) => createSprite(30, 22, (ctx) => drawInfantry(ctx, 0, 1, e, f, true)))
  };

  art.viper = {
    kind: 'air',
    pivot: { x: 15, y: 12 },
    frames: [0, 1].map((f) => createSprite(32, 26, (ctx) => {
      const out = '#07100f';
      ctx.save();
      ctx.translate(16, 13);
      ctx.rotate(f * 0.8);
      for (const rx of [-8, 8]) {
        px(ctx, rx - 4, -7, 8, 14, out);
        px(ctx, rx - 3, -6, 6, 12, p.metal);
        px(ctx, rx - 4, -1, 8, 2, p.metalLight);
        px(ctx, rx - 4, -5, 8, 1, p.primary);
      }
      ctx.restore();
      // Fuselage
      poly(ctx, [[6, 10], [18, 5], [27, 12], [18, 21], [7, 17]], out);
      poly(ctx, [[8, 11], [18, 7], [24, 12], [18, 19], [9, 16]], p.metal);
      px(ctx, 10, 11, 8, 4, p.metalLight);
      px(ctx, 19, 10, 5, 5, '#0a1514');
      px(ctx, 21, 11, 3, 3, p.primary);
      px(ctx, 23, 12, 2, 2, p.bright);
      px(ctx, 8, 13, 3, 3, p.dark);
      px(ctx, 15, 16, 4, 2, p.mid);
    }))
  };

  art.stinger = {
    kind: 'air',
    pivot: { x: 15, y: 12 },
    frames: [0, 1].map((f) => createSprite(32, 26, (ctx) => {
      const out = '#0c0808';
      ctx.save();
      ctx.translate(16, 13);
      ctx.rotate(f * 0.8);
      for (const rx of [-8, 8]) {
        px(ctx, rx - 4, -7, 8, 14, out);
        px(ctx, rx - 3, -6, 6, 12, e.metal);
        px(ctx, rx - 4, -1, 8, 2, e.metalLight);
        px(ctx, rx - 4, -5, 8, 1, e.primary);
      }
      ctx.restore();
      poly(ctx, [[6, 10], [18, 5], [28, 12], [17, 21], [7, 17]], out);
      poly(ctx, [[8, 11], [18, 7], [25, 12], [17, 19], [9, 16]], e.metal);
      px(ctx, 10, 11, 8, 4, e.metalLight);
      px(ctx, 19, 10, 5, 5, '#160c0b');
      px(ctx, 21, 11, 3, 3, e.primary);
      px(ctx, 22, 12, 2, 2, '#ffd0be');
      px(ctx, 8, 13, 3, 3, e.dark);
      px(ctx, 13, 18, 5, 1, e.accent);
    }))
  };

  art.hauler = {
    kind: 'vehicle',
    pivot: { x: 18, y: 13 },
    frames: [createSprite(38, 28, (ctx) => drawHauler(ctx, 38, 28, p))]
  };

  art.scorpion = {
    kind: 'tank',
    pivot: { x: 22, y: 17 },
    turretPivot: { x: 17, y: 14 },
    frames: [createSprite(44, 34, (ctx) => drawVehicleBody(ctx, 44, 34, p, false, 'tank'))],
    turret: createSprite(36, 30, (ctx) => {
      const out = '#07100f';
      px(ctx, 7, 9, 22, 12, out);
      poly(ctx, [[8, 10], [23, 7], [29, 15], [23, 22], [8, 20]], p.metal);
      px(ctx, 10, 10, 11, 3, p.metalLight);
      px(ctx, 9, 18, 12, 2, p.dark);
      px(ctx, 14, 12, 6, 6, p.dark);
      px(ctx, 15, 13, 4, 4, p.primary);
      px(ctx, 22, 13, 13, 4, out);
      px(ctx, 23, 14, 12, 1, p.metalLight);
      px(ctx, 30, 12, 4, 6, p.primary);
      px(ctx, 31, 13, 2, 4, p.bright);
    })
  };

  art.marauder = {
    kind: 'tank',
    pivot: { x: 22, y: 17 },
    turretPivot: { x: 17, y: 14 },
    frames: [createSprite(44, 34, (ctx) => drawVehicleBody(ctx, 44, 34, e, true, 'tank'))],
    turret: createSprite(36, 30, (ctx) => {
      const out = '#0b0707';
      px(ctx, 7, 9, 22, 12, out);
      poly(ctx, [[8, 10], [23, 7], [29, 15], [23, 22], [8, 20]], e.metal);
      px(ctx, 10, 10, 11, 3, e.metalLight);
      px(ctx, 9, 18, 12, 2, e.dark);
      px(ctx, 14, 12, 6, 6, '#130b0a');
      px(ctx, 15, 13, 4, 4, e.primary);
      px(ctx, 22, 13, 13, 4, out);
      px(ctx, 23, 14, 12, 1, e.metalLight);
      px(ctx, 30, 12, 4, 6, e.primary);
      px(ctx, 31, 13, 2, 4, e.bright);
      px(ctx, 11, 8, 3, 2, e.accent);
      px(ctx, 11, 20, 3, 2, e.accent);
    })
  };

  return art;
}

// ── Structure art ──────────────────────────────────────────────────────────

function drawStructureShadow(ctx, w, h, scale = 0.76) {
  ctx.fillStyle = 'rgba(3,7,7,0.43)';
  ctx.beginPath();
  ctx.ellipse(w / 2 + 3, h * 0.58 + 8, w * 0.47 * scale, h * 0.34 * scale, 0, 0, TAU);
  ctx.fill();
}

function drawHQ(ctx, w, h, colors) {
  drawStructureShadow(ctx, w, h);
  const out = '#07100f';
  const p = colors;
  // Platform
  poly(ctx, [[14, 34], [w - 14, 30], [w - 4, 54], [w - 12, h - 14], [22, h - 8], [4, h - 30], [4, 45]], out);
  poly(ctx, [[17, 37], [w - 17, 33], [w - 9, 55], [w - 16, h - 18], [24, h - 13], [9, h - 32], [9, 47]], p.metal);
  // Deck panels
  px(ctx, 20, 40, 36, 4, p.metalLight);
  px(ctx, w - 53, 38, 26, 3, '#3f554d');
  px(ctx, 16, h - 33, 19, 18, p.dark);
  px(ctx, w - 39, h - 39, 20, 25, p.dark);
  // Corner modules
  for (const [x, y] of [[18, 42], [w - 36, 40], [18, h - 47], [w - 35, h - 45]]) {
    px(ctx, x, y, 19, 17, out);
    px(ctx, x + 2, y + 2, 15, 13, p.metalLight);
    px(ctx, x + 4, y + 4, 7, 3, p.metal);
    px(ctx, x + 12, y + 10, 3, 3, p.primary);
    px(ctx, x + 4, y + 10, 5, 2, p.dark);
  }
  // Central octagon command core
  poly(ctx, [[41, 44], [w - 41, 42], [w - 30, 58], [w - 32, h - 41], [43, h - 36], [28, h - 50], [29, 59]], out);
  poly(ctx, [[43, 47], [w - 43, 45], [w - 33, 59], [w - 35, h - 44], [45, h - 40], [32, h - 51], [33, 61]], p.dark);
  px(ctx, 35, 50, 24, 3, p.mid);
  px(ctx, w - 58, 48, 18, 3, '#3b5f54');
  // Inner command module
  poly(ctx, [[47, 53], [w - 47, 52], [w - 40, 63], [w - 42, h - 51], [48, h - 48], [38, h - 58], [38, 63]], p.metal);
  poly(ctx, [[50, 57], [w - 50, 56], [w - 44, 65], [w - 45, h - 54], [51, h - 51], [43, h - 59], [43, 65]], '#3a524a');
  px(ctx, 46, 61, 31, 2, p.metalLight);
  px(ctx, 47, h - 55, 33, 2, p.dark);
  // Reactor core
  px(ctx, w / 2 - 12, h / 2 - 12, 24, 24, out);
  px(ctx, w / 2 - 10, h / 2 - 10, 20, 20, p.dark);
  px(ctx, w / 2 - 7, h / 2 - 7, 14, 14, p.mid);
  px(ctx, w / 2 - 4, h / 2 - 4, 8, 8, p.primary);
  px(ctx, w / 2 - 2, h / 2 - 2, 4, 4, p.bright);
  px(ctx, w / 2 - 15, h / 2 - 1, 3, 2, p.primary);
  px(ctx, w / 2 + 12, h / 2 - 1, 3, 2, p.primary);
  px(ctx, w / 2 - 1, h / 2 - 15, 2, 3, p.primary);
  px(ctx, w / 2 - 1, h / 2 + 12, 2, 3, p.primary);
  // Antenna / sensor mast
  px(ctx, w - 30, 16, 3, 26, out);
  px(ctx, w - 29, 18, 1, 23, p.metalLight);
  px(ctx, w - 34, 12, 11, 6, out);
  px(ctx, w - 33, 13, 9, 4, p.dark);
  px(ctx, w - 32, 14, 5, 1, p.primary);
  ctx.strokeStyle = p.mid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(w - 28, 17, 8, Math.PI * 0.15, Math.PI * 1.1);
  ctx.stroke();
  // Rear dish
  px(ctx, 20, h - 30, 2, 19, out);
  px(ctx, 15, h - 35, 13, 8, out);
  px(ctx, 16, h - 34, 11, 6, p.metalLight);
  px(ctx, 19, h - 33, 5, 3, p.dark);
  // Markings
  drawPixelText(ctx, '07', w / 2, h - 22, p.primary, 1, 'center', '#06100e');
  for (let i = 0; i < 4; i++) {
    px(ctx, 30 + i * 8, h - 34, 5, 2, p.accent);
    px(ctx, 30 + i * 8, h - 31, 2, 2, p.accent);
  }
}

function drawBarracks(ctx, w, h, colors) {
  drawStructureShadow(ctx, w, h, 0.9);
  const p = colors;
  const out = '#07100f';
  poly(ctx, [[12, 24], [w - 13, 21], [w - 5, 31], [w - 7, h - 14], [15, h - 9], [4, h - 22], [5, 33]], out);
  poly(ctx, [[14, 26], [w - 15, 24], [w - 9, 32], [w - 11, h - 17], [17, h - 13], [7, h - 24], [8, 34]], p.metal);
  // Roof panel
  poly(ctx, [[16, 27], [w - 19, 25], [w - 15, 39], [w - 20, 54], [14, 50], [10, 36]], p.metalLight);
  poly(ctx, [[20, 29], [w - 26, 27], [w - 24, 34], [w - 29, 41], [18, 39], [14, 33]], '#425d54');
  px(ctx, 14, 30, 8, 17, p.dark);
  px(ctx, w - 35, 28, 7, 17, p.dark);
  px(ctx, w - 27, 25, 3, 28, p.primary);
  // Door
  px(ctx, 28, h - 30, w - 54, 19, out);
  px(ctx, 31, h - 27, w - 60, 14, '#182522');
  px(ctx, 34, h - 25, w - 66, 10, '#23352f');
  px(ctx, w / 2 - 2, h - 19, 4, 3, p.primary);
  px(ctx, 25, h - 31, 8, 3, p.accent);
  px(ctx, w - 35, h - 31, 7, 3, p.accent);
  // Vents and equipment
  for (let i = 0; i < 4; i++) px(ctx, 17 + i * 5, 44, 3, 7, '#1c2b27');
  px(ctx, w - 24, 45, 9, 9, '#1c2b27');
  px(ctx, w - 22, 47, 5, 5, p.mid);
  // Sign
  drawPixelText(ctx, 'B-02', w - 28, 52, p.primary, 1, 'right', '#07110f');
  // Antenna
  px(ctx, w - 16, 10, 2, 18, out);
  px(ctx, w - 16, 10, 1, 17, p.metalLight);
  px(ctx, w - 20, 8, 8, 3, p.dark);
  px(ctx, w - 19, 9, 4, 1, p.accent);
}

function drawFactory(ctx, w, h, colors) {
  drawStructureShadow(ctx, w, h, 1);
  const p = colors;
  const out = '#07100f';
  poly(ctx, [[8, 22], [w - 10, 18], [w - 3, 32], [w - 4, h - 15], [19, h - 10], [5, h - 30], [3, 40]], out);
  poly(ctx, [[10, 24], [w - 13, 21], [w - 6, 33], [w - 7, h - 18], [21, h - 13], [8, h - 31], [6, 42]], p.metal);
  // Main hall roof
  poly(ctx, [[15, 25], [w - 25, 22], [w - 18, 34], [w - 23, 63], [13, 59], [9, 37]], p.metalLight);
  poly(ctx, [[20, 27], [w - 31, 24], [w - 26, 32], [w - 29, 52], [16, 49], [13, 35]], '#3d5750');
  for (let i = 0; i < 5; i++) px(ctx, 21 + i * 14, 27, 3, 4, p.dark);
  px(ctx, 18, 57, 28, 3, p.dark);
  px(ctx, w - 32, 50, 15, 7, '#1f312c');
  px(ctx, w - 30, 52, 4, 3, p.primary);
  px(ctx, w - 24, 52, 4, 3, p.primary);
  // Roll-up door
  px(ctx, 36, h - 35, w - 72, 24, out);
  px(ctx, 39, h - 32, w - 78, 18, '#18241f');
  for (let i = 0; i < 5; i++) px(ctx, 42, h - 31 + i * 4, w - 84, 2, i % 2 ? '#293a34' : '#22302c');
  px(ctx, 42, h - 32, w - 84, 2, p.accent);
  drawPixelText(ctx, 'ARMOR', w / 2, h - 27, '#6f8e82', 1, 'center');
  // Side reactor
  px(ctx, w - 24, 62, 18, 27, out);
  px(ctx, w - 21, 65, 12, 21, p.dark);
  px(ctx, w - 18, 68, 6, 9, p.mid);
  px(ctx, w - 17, 69, 4, 5, p.primary);
  px(ctx, 10, h - 42, 14, 20, out);
  px(ctx, 13, h - 39, 8, 13, '#22332e');
  // Crane
  px(ctx, 22, 15, 3, 31, out);
  px(ctx, 23, 16, 1, 28, p.metalLight);
  px(ctx, 23, 16, 31, 2, p.metalLight);
  px(ctx, 52, 17, 1, 15, p.accent);
  px(ctx, 49, 32, 7, 5, p.dark);
  px(ctx, 51, 34, 3, 2, p.primary);
  // Vents
  for (let i = 0; i < 3; i++) {
    px(ctx, w - 50 + i * 8, 69, 5, 5, out);
    px(ctx, w - 49 + i * 8, 70, 3, 3, '#30453f');
  }
}

function drawTurretBase(ctx, w, h, colors, hostile = false) {
  const out = hostile ? '#0c0707' : '#07100f';
  drawStructureShadow(ctx, w, h, 1);
  poly(ctx, [[w / 2, 2], [w - 6, 8], [w - 4, h - 10], [w / 2, h - 2], [4, h - 10], [6, 8]], out);
  poly(ctx, [[w / 2, 5], [w - 9, 10], [w - 7, h - 13], [w / 2, h - 5], [7, h - 13], [9, 10]], colors.metal);
  px(ctx, 12, 11, w - 24, 3, colors.metalLight);
  px(ctx, 11, h - 16, w - 22, 2, colors.dark);
  px(ctx, w / 2 - 6, h / 2 - 6, 12, 12, out);
  px(ctx, w / 2 - 4, h / 2 - 4, 8, 8, colors.dark);
  px(ctx, w / 2 - 2, h / 2 - 2, 4, 4, colors.primary);
  // Hazard stripes
  px(ctx, 10, h - 11, 6, 2, colors.accent);
  px(ctx, 19, h - 11, 3, 2, colors.accent);
  px(ctx, w - 25, 7, 6, 2, colors.accent);
}

function drawNexus(ctx, w, h) {
  drawStructureShadow(ctx, w, h, 1.08);
  const e = ENEMY_COLORS;
  const out = '#0b0707';
  // Obsidian platform with 6 points
  poly(ctx, [[w / 2, 7], [w - 18, 19], [w - 5, 53], [w - 13, h - 13], [w / 2, h - 5], [23, h - 10], [6, h - 40], [17, 17]], out);
  poly(ctx, [[w / 2, 12], [w - 22, 23], [w - 10, 53], [w - 17, h - 17], [w / 2, h - 10], [27, h - 14], [11, h - 41], [21, 21]], e.metal);
  // Red veins
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.3;
    const x1 = w / 2 + Math.cos(a) * 24;
    const y1 = h / 2 + Math.sin(a) * 24;
    const x2 = w / 2 + Math.cos(a + 0.3) * 49;
    const y2 = h / 2 + Math.sin(a + 0.3) * 43;
    line(ctx, x1, y1, x2, y2, 'rgba(255,80,54,0.25)', 1);
  }
  // Pylons
  for (const [x, y, rot] of [[28, 26, -0.3], [w - 27, 35, 0.5], [w / 2, h - 29, 0]]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    px(ctx, -6, -16, 12, 32, out);
    px(ctx, -4, -14, 8, 28, e.dark);
    px(ctx, -2, -15, 3, 20, e.mid);
    px(ctx, -1, -11, 2, 13, e.primary);
    ctx.restore();
  }
  // Central core ring
  poly(ctx, [[w / 2 - 31, h / 2 - 25], [w / 2 + 29, h / 2 - 29], [w / 2 + 37, h / 2 + 9], [w / 2 + 16, h / 2 + 33], [w / 2 - 27, h / 2 + 29], [w / 2 - 39, h / 2 + 2]], out);
  poly(ctx, [[w / 2 - 28, h / 2 - 21], [w / 2 + 26, h / 2 - 25], [w / 2 + 32, h / 2 + 7], [w / 2 + 12, h / 2 + 28], [w / 2 - 23, h / 2 + 24], [w / 2 - 34, h / 2 + 2]], e.dark);
  // Core
  px(ctx, w / 2 - 16, h / 2 - 16, 32, 32, '#180a08');
  px(ctx, w / 2 - 12, h / 2 - 12, 24, 24, e.mid);
  px(ctx, w / 2 - 8, h / 2 - 8, 16, 16, e.primary);
  px(ctx, w / 2 - 4, h / 2 - 4, 8, 8, e.bright);
  px(ctx, w / 2 - 1, h / 2 - 1, 2, 2, '#ffffff');
  // Spikes
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const r1 = 37;
    const r2 = 49;
    line(ctx, w / 2 + Math.cos(a) * r1, h / 2 + Math.sin(a) * r1, w / 2 + Math.cos(a) * r2, h / 2 + Math.sin(a) * r2, e.primary, 2);
    px(ctx, w / 2 + Math.cos(a) * r2 - 2, h / 2 + Math.sin(a) * r2 - 2, 4, 4, e.accent);
  }
  // Skull-ish central tower
  poly(ctx, [[w / 2 - 13, h / 2 - 36], [w / 2 + 13, h / 2 - 38], [w / 2 + 18, h / 2 - 15], [w / 2 + 8, h / 2 - 7], [w / 2 - 11, h / 2 - 9], [w / 2 - 18, h / 2 - 23]], out);
  poly(ctx, [[w / 2 - 10, h / 2 - 33], [w / 2 + 10, h / 2 - 34], [w / 2 + 13, h / 2 - 16], [w / 2 + 5, h / 2 - 11], [w / 2 - 8, h / 2 - 13], [w / 2 - 13, h / 2 - 24]], e.metalLight);
  px(ctx, w / 2 - 6, h / 2 - 26, 12, 3, e.primary);
  px(ctx, w / 2 - 3, h / 2 - 25, 6, 1, e.bright);
  drawPixelText(ctx, 'ASHEN', w / 2, h - 16, e.primary, 2, 'center', '#0a0505');
}

function drawSpawner(ctx, w, h) {
  drawStructureShadow(ctx, w, h, 0.94);
  const e = ENEMY_COLORS;
  const out = '#0b0707';
  poly(ctx, [[9, 23], [w - 12, 19], [w - 6, 34], [w - 11, h - 12], [17, h - 8], [5, h - 24], [4, 35]], out);
  poly(ctx, [[12, 25], [w - 15, 22], [w - 9, 35], [w - 14, h - 15], [19, h - 11], [8, h - 25], [7, 37]], e.metal);
  // Furnace dome
  poly(ctx, [[22, 25], [w - 25, 23], [w - 19, 38], [w - 25, 58], [19, 55], [13, 39]], e.metalLight);
  px(ctx, 24, 28, 27, 4, '#6a443d');
  px(ctx, 28, 42, 18, 3, e.dark);
  // Glowing vents
  for (let i = 0; i < 3; i++) {
    px(ctx, 22 + i * 12, 46, 6, 8, out);
    px(ctx, 24 + i * 12, 47, 2, 5, i === 1 ? e.primary : e.mid);
  }
  // Door
  px(ctx, w / 2 - 16, h - 26, 32, 19, out);
  px(ctx, w / 2 - 13, h - 23, 26, 13, '#180b09');
  px(ctx, w / 2 - 10, h - 22, 20, 2, e.primary);
  for (let i = 0; i < 5; i++) px(ctx, w / 2 - 15 + i * 7, h - 18, 3, 8, e.mid);
  // Spikes
  for (let i = 0; i < 4; i++) {
    poly(ctx, [[11 + i * 15, h - 12], [15 + i * 15, h - 25], [19 + i * 15, h - 12]], e.dark);
    px(ctx, 14 + i * 15, h - 18, 2, 5, e.primary);
  }
  px(ctx, 12, 18, 3, 13, e.dark);
  px(ctx, 12, 18, 1, 11, e.mid);
  drawPixelText(ctx, 'LEGION', w / 2, 20, e.primary, 1, 'center', '#0d0706');
}

function buildStructureArt() {
  const p = PLAYER_COLORS;
  const e = ENEMY_COLORS;
  return {
    hq: createSprite(124, 124, (ctx) => drawHQ(ctx, 124, 124, p)),
    barracks: createSprite(88, 88, (ctx) => drawBarracks(ctx, 88, 88, p)),
    factory: createSprite(124, 124, (ctx) => drawFactory(ctx, 124, 124, p)),
    turretBase: createSprite(46, 46, (ctx) => drawTurretBase(ctx, 46, 46, p, false)),
    turretGun: createSprite(44, 26, (ctx) => drawTurretSprite(ctx, 44, 26, p, false, false)),
    nexus: createSprite(124, 124, (ctx) => drawNexus(ctx, 124, 124)),
    spawner: createSprite(88, 88, (ctx) => drawSpawner(ctx, 88, 88)),
    ashenTurretBase: createSprite(46, 46, (ctx) => drawTurretBase(ctx, 46, 46, e, true)),
    ashenTurretGun: createSprite(44, 26, (ctx) => drawTurretSprite(ctx, 44, 26, e, true, true))
  };
}

export function createArt() {
  return {
    units: buildUnitArt(),
    structures: buildStructureArt()
  };
}

export function drawCrystalCluster(ctx, x, y, amount, time, scale = 1) {
  const frac = Math.max(0.16, Math.min(1, amount / 1000));
  const pulse = 0.72 + Math.sin(time * 2.2 + x * 0.01) * 0.16;
  ctx.save();
  ctx.translate(x, y);
  const glow = ctx.createRadialGradient(0, -4, 4, 0, 0, 52);
  glow.addColorStop(0, `rgba(80,255,226,${0.14 * pulse * frac})`);
  glow.addColorStop(0.6, `rgba(53,214,188,${0.055 * pulse * frac})`);
  glow.addColorStop(1, 'rgba(53,214,188,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-58, -58, 116, 116);

  ctx.fillStyle = 'rgba(3,8,8,0.34)';
  ctx.beginPath();
  ctx.ellipse(2, 13, 22 * frac, 8, 0.15, 0, TAU);
  ctx.fill();

  const shards = Math.max(3, Math.round(7 * frac));
  for (let i = 0; i < shards; i++) {
    const a = i * 2.2 + 0.4;
    const r = 4 + (i % 3) * 7;
    const sx = Math.cos(a) * r;
    const sy = Math.sin(a) * r * 0.5 + 2;
    const h = 12 + ((i * 7) % 17) * frac;
    const wid = 4 + (i % 3) * 2;
    const lean = Math.cos(a * 1.7) * 4;
    poly(ctx, [[sx - wid / 2, sy], [sx + lean, sy - h], [sx + wid / 2, sy]], TERRAIN.crystalDeep);
    poly(ctx, [[sx - wid / 4, sy], [sx + lean, sy - h + 2], [sx + lean + 1, sy - h * 0.55], [sx + wid / 6, sy]], TERRAIN.crystal);
    px(ctx, sx + lean - 1, sy - h + 3, 2, Math.max(2, h * 0.38), '#d4fff5');
    px(ctx, sx - wid / 2, sy - 2, wid, 1, '#0a4e49');
  }
  // Ground crystals
  for (let i = 0; i < 4; i++) {
    const a = i * 1.8 + 0.8;
    px(ctx, Math.cos(a) * 15, Math.sin(a) * 8 + 6, 3, 2, TERRAIN.crystal);
  }
  ctx.restore();
}

export function drawTurretBaseRotated(ctx, art, x, y, angle, time) {
  ctx.drawImage(art.turretBase, x - 23, y - 23);
  ctx.save();
  ctx.translate(x, y - 3);
  ctx.rotate(angle);
  ctx.drawImage(art.turretGun, -22, -13);
  ctx.restore();
}

export function drawStructureHealthBar(ctx, entity, selected = false) {
  const w = Math.max(34, entity.def.size * TILE * 0.52);
  const ratio = Math.max(0, entity.hp / entity.maxHp);
  if (ratio >= 0.999 && !selected) return;
  const x = entity.x - w / 2;
  const y = entity.y - entity.def.size * TILE * 0.5 - 12;
  px(ctx, x - 1, y - 1, w + 2, 5, 'rgba(2,7,7,0.86)');
  px(ctx, x, y, w, 3, '#271c1a');
  px(ctx, x, y, Math.ceil(w * ratio), 3, entity.team === 1 ? PLAYER_COLORS.primary : ENEMY_COLORS.primary);
  if (selected) {
    px(ctx, x, y + 4, w, 1, 'rgba(131,255,217,0.35)');
  }
}

export function drawUnitHealthBar(ctx, entity, selected) {
  if (entity.hp >= entity.maxHp && !selected) return;
  const ratio = Math.max(0, entity.hp / entity.maxHp);
  const w = entity.def.id === 'scorpion' || entity.def.id === 'marauder' ? 25 : 17;
  const y = entity.y - entity.def.radius - 11;
  px(ctx, entity.x - w / 2 - 1, y - 1, w + 2, 5, 'rgba(2,7,7,0.88)');
  px(ctx, entity.x - w / 2, y, w, 3, '#2b1d1a');
  px(ctx, entity.x - w / 2, y, Math.ceil(w * ratio), 3, entity.team === 1 ? PLAYER_COLORS.primary : ENEMY_COLORS.primary);
  if (selected) px(ctx, entity.x - w / 2, y + 4, w, 1, 'rgba(131,255,217,0.4)');
}

export function drawSelectionRing(ctx, entity, time, hostile = false) {
  const color = hostile ? ENEMY_COLORS.primary : PLAYER_COLORS.primary;
  const r = entity.type === 'structure' ? entity.def.size * TILE * 0.5 + 6 : entity.def.radius + 8;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.72 + Math.sin(time * 4) * 0.14;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(entity.x, entity.y + 3, r, r * 0.62, 0, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.32;
  ctx.beginPath();
  ctx.ellipse(entity.x, entity.y + 3, r - 4, r * 0.55, 0, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * TAU + time * 0.4;
    const px1 = entity.x + Math.cos(ang) * r;
    const py1 = entity.y + 3 + Math.sin(ang) * r * 0.62;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(px1) - 1, Math.round(py1) - 1, 3, 3);
  }
  ctx.restore();
}

export function drawMoveMarker(ctx, x, y, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = PLAYER_COLORS.primary;
  ctx.globalAlpha = 0.75;
  const r = 8 + (1 - (time * 2) % 1) * 10;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.55, 0, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-4, 0); ctx.lineTo(0, -4); ctx.lineTo(4, 0); ctx.lineTo(0, 4); ctx.closePath();
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.restore();
}

export function drawBuildGhost(ctx, art, type, x, y, valid, time, def) {
  const sprite = art.structures[type];
  const alpha = 0.4 + Math.sin(time * 5) * 0.1;
  const size = def.size * TILE;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = valid ? PLAYER_COLORS.primary : ENEMY_COLORS.primary;
  ctx.lineWidth = 1;
  const half = size / 2;
  ctx.strokeRect(x - half, y - half, size, size);
  // Corner brackets
  ctx.lineWidth = 2;
  const cl = 10;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.beginPath();
    ctx.moveTo(x + sx * half - sx * cl, y + sy * half);
    ctx.lineTo(x + sx * half, y + sy * half);
    ctx.lineTo(x + sx * half, y + sy * half - sy * cl);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = valid ? PLAYER_COLORS.primary : ENEMY_COLORS.primary;
  ctx.fillRect(x - half, y - half, size, size);
  ctx.restore();
}

export function drawScaffold(ctx, entity, art, time) {
  const sprite = art.structures[entity.type] || art.structures[entity.def.id];
  if (!sprite) return;
  const half = entity.def.size * TILE * 0.5;
  ctx.save();
  ctx.globalAlpha = 0.45 + entity.progress * 0.3;
  ctx.drawImage(sprite, entity.x - sprite.width / 2, entity.y - sprite.height / 2);
  ctx.globalAlpha = 1;
  // Scaffolding
  ctx.strokeStyle = 'rgba(255,180,84,0.82)';
  ctx.lineWidth = 1;
  const h = entity.def.size * TILE;
  const top = entity.y - half;
  ctx.strokeRect(entity.x - half, top, entity.def.size * TILE, h);
  for (let i = 0; i <= 3; i++) {
    const t = i / 3;
    line(ctx, entity.x - half + t * h, top, entity.x - half, top + t * h, 'rgba(255,180,84,0.45)');
    line(ctx, entity.x - half + t * h, top + h, entity.x + half, top + t * h, 'rgba(255,180,84,0.28)');
  }
  // Progress bar
  const w = entity.def.size * TILE * 0.8;
  px(ctx, entity.x - w / 2 - 1, top - 12, w + 2, 6, 'rgba(2,7,7,0.85)');
  px(ctx, entity.x - w / 2, top - 11, w, 4, '#2d2a20');
  px(ctx, entity.x - w / 2, top - 11, Math.ceil(w * entity.progress), 4, PLAYER_COLORS.accent);
  ctx.restore();
}

export function drawIconFor(type, kind, ctx, width, height, team = 1, art) {
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  const sprite = kind === 'structure'
    ? art.structures[type]
    : (art.units[type] ? art.units[type].frames[0] : null);
  if (!sprite) return;
  const maxW = width * 0.92;
  const maxH = height * 0.92;
  const scale = Math.min(maxW / sprite.width, maxH / sprite.height);
  const dw = sprite.width * scale;
  const dh = sprite.height * scale;
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = team === 1 ? PLAYER_COLORS.primary : ENEMY_COLORS.primary;
  ctx.beginPath();
  ctx.ellipse(width / 2, height / 2 + 1, width * 0.33, height * 0.2, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.drawImage(sprite, width / 2 - dw / 2, height / 2 - dh / 2, dw, dh);
}

export { px, line, poly };
