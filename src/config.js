export const TILE = 40;
export const MAP_TILES = 42;
export const WORLD = TILE * MAP_TILES;
export const PLAYER = 1;
export const ENEMY = 2;

export const PLAYER_COLORS = {
  primary: '#74f5cf',
  bright: '#c7fff0',
  mid: '#2a9e84',
  dark: '#0c3c34',
  metal: '#30463f',
  metalLight: '#557069',
  accent: '#ffb454',
  hostile: '#ff6b4f'
};

export const ENEMY_COLORS = {
  primary: '#ff6b4f',
  bright: '#ffb19e',
  mid: '#a53f2e',
  dark: '#421913',
  metal: '#362c2b',
  metalLight: '#5a4240',
  accent: '#ffc04a'
};

export const TERRAIN = {
  sandA: '#4b4b3d',
  sandB: '#555242',
  sandC: '#60604b',
  sandD: '#41463b',
  rock: '#2d3635',
  rockLight: '#485654',
  rockDark: '#1c2525',
  road: '#333c3a',
  roadLight: '#454e48',
  dust: '#7b7258',
  crystal: '#5affe0',
  crystalDeep: '#0d6c65',
  enemySoil: '#433333',
  enemyVein: '#8d3028'
};

export const UNIT_BLUEPRINTS = {
  hauler: {
    id: 'hauler',
    name: 'HAULER',
    role: 'TITANITE EXTRACTOR',
    cost: 90,
    buildTime: 4.5,
    hp: 130,
    speed: 63,
    radius: 12,
    vision: 5.5,
    from: 'hq',
    cargo: 32,
    miningTime: 1.8,
    desc: 'AUTOMATED MINER',
    key: 'H'
  },
  rifle: {
    id: 'rifle',
    name: 'RIFLEMAN',
    role: 'LINE INFANTRY',
    cost: 70,
    buildTime: 3.6,
    hp: 100,
    speed: 58,
    radius: 8,
    vision: 6.5,
    range: 148,
    damage: 9,
    cooldown: 0.72,
    from: 'barracks',
    desc: 'ANTI-INFANTRY',
    key: 'R'
  },
  viper: {
    id: 'viper',
    name: 'VIPER',
    role: 'RECON DRONE',
    cost: 120,
    buildTime: 5,
    hp: 78,
    speed: 96,
    radius: 8,
    vision: 8,
    range: 162,
    damage: 7,
    cooldown: 0.38,
    from: 'barracks',
    flying: true,
    desc: 'FAST AIR RECON',
    key: 'V'
  },
  scorpion: {
    id: 'scorpion',
    name: 'SCORPION',
    role: 'SIEGE TANK',
    cost: 240,
    buildTime: 9,
    hp: 360,
    speed: 38,
    radius: 15,
    vision: 7.5,
    range: 196,
    damage: 31,
    cooldown: 1.65,
    splash: 34,
    from: 'factory',
    desc: 'ARMORED SIEGE',
    key: 'S'
  }
};

export const ENEMY_BLUEPRINTS = {
  raider: {
    id: 'raider',
    name: 'RAIDER',
    hp: 82,
    speed: 61,
    radius: 8,
    vision: 7,
    range: 128,
    damage: 8,
    cooldown: 0.68,
    bounty: 7
  },
  marauder: {
    id: 'marauder',
    name: 'MARAUDER',
    hp: 290,
    speed: 35,
    radius: 14,
    vision: 7.5,
    range: 158,
    damage: 21,
    cooldown: 1.5,
    splash: 26,
    bounty: 18
  },
  stinger: {
    id: 'stinger',
    name: 'STINGER',
    hp: 68,
    speed: 97,
    radius: 7,
    vision: 8,
    range: 142,
    damage: 6,
    cooldown: 0.42,
    flying: true,
    bounty: 8
  }
};

export const STRUCTURE_BLUEPRINTS = {
  hq: {
    id: 'hq',
    name: 'AEGIS COMMAND',
    role: 'MOBILE HEADQUARTERS',
    cost: 0,
    buildTime: 0,
    hp: 1750,
    size: 3,
    vision: 9.5,
    from: null,
    desc: 'COMMAND NODE',
    range: 176,
    damage: 6,
    cooldown: 2.2
  },
  barracks: {
    id: 'barracks',
    name: 'BARRACKS',
    role: 'INFANTRY BAY',
    cost: 200,
    buildTime: 8,
    hp: 720,
    size: 2,
    vision: 7,
    from: null,
    desc: 'FIELDS INFANTRY',
    key: 'B'
  },
  factory: {
    id: 'factory',
    name: 'FACTORY',
    role: 'ARMOR WORKS',
    cost: 380,
    buildTime: 13,
    hp: 1150,
    size: 3,
    vision: 8,
    from: null,
    desc: 'BUILDS SCORPIONS',
    key: 'F'
  },
  turret: {
    id: 'turret',
    name: 'SENTRY',
    role: 'DEFENSE TURRET',
    cost: 150,
    buildTime: 6,
    hp: 520,
    size: 1,
    vision: 8,
    from: null,
    desc: 'AUTO DEFENSE',
    range: 255,
    damage: 18,
    cooldown: 0.9,
    key: 'T'
  },
  nexus: {
    id: 'nexus',
    name: 'ASHEN NEXUS',
    role: 'HOSTILE COMMAND',
    cost: 0,
    buildTime: 0,
    hp: 1900,
    size: 3,
    vision: 9,
    from: null,
    desc: 'PRIMARY TARGET',
    range: 190,
    damage: 10,
    cooldown: 2
  },
  spawner: {
    id: 'spawner',
    name: 'LEGION FORGE',
    role: 'HOSTILE BARRACKS',
    cost: 0,
    buildTime: 0,
    hp: 620,
    size: 2,
    vision: 7,
    from: null,
    desc: 'HOSTILE PRODUCTION'
  },
  ashenTurret: {
    id: 'ashenTurret',
    name: 'ASHEN SENTRY',
    role: 'HOSTILE DEFENSE',
    cost: 0,
    buildTime: 0,
    hp: 440,
    size: 1,
    vision: 8,
    from: null,
    desc: 'HOSTILE TURRET',
    range: 240,
    damage: 15,
    cooldown: 1
  }
};

export const BUILD_ORDER = ['barracks', 'factory', 'turret'];
export const TRAIN_ORDER = ['hauler', 'rifle', 'viper', 'scorpion'];

export const WAVE_FIRST = 55;
export const WAVE_INTERVAL = 48;

export const TUTORIAL_STEPS = [
  { text: 'RIFLEMEN ONLINE // TAP A UNIT TO SELECT', tag: 'FIELD NOTE', delay: 1400 },
  { text: 'DEPLOY A BARRACKS TO REINFORCE YOUR LINE', tag: 'FIELD NOTE', delay: 6200 },
  { text: 'HAULERS MINE TITANITE AUTOMATICALLY', tag: 'FIELD NOTE', delay: 11500 }
];
