export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export type CatSkinId = 'oyen' | 'mochi' | 'kopi' | 'pirang';

export interface CatSkinSprites {
  idle: string;
  jump: string;
  gethit: string;
}

export interface CatSkinInfo {
  id: CatSkinId;
  name: string;
  role: string;
  primaryColor: string;
  secondaryColor: string;
  earInnerColor: string;
  stripeColor: string;
  capeColor: string;
  sprites?: CatSkinSprites;
}

export const CAT_SKINS: CatSkinInfo[] = [
  {
    id: 'oyen',
    name: 'Oyen Barbar',
    role: 'Kucing Oranye Gesit · Lompatan Stabil',
    primaryColor: '#F97316',
    secondaryColor: '#FFEDD5',
    earInnerColor: '#FDA4AF',
    stripeColor: '#C2410C',
    capeColor: '#EF4444',
  },
  {
    id: 'mochi',
    name: 'Mochi Calico',
    role: 'Kucing Belang Tiga · Magnet Ikan +15%',
    primaryColor: '#FFFBEB',
    secondaryColor: '#F59E0B',
    earInnerColor: '#F472B6',
    stripeColor: '#451A03',
    capeColor: '#10B981',
  },
  {
    id: 'kopi',
    name: 'Kopi Tuxedo',
    role: 'Kucing Hitam Elegan · Dash Lebih Cepat',
    primaryColor: '#27272A',
    secondaryColor: '#F8FAFC',
    earInnerColor: '#FB7185',
    stripeColor: '#09090B',
    capeColor: '#FACC15',
  },
  {
    id: 'pirang',
    name: 'Bang Pirang',
    role: 'Model Spesial · Ekspresi Dinamis & +1 Nyawa',
    primaryColor: '#FBBF24',
    secondaryColor: '#FEF3C7',
    earInnerColor: '#FB7185',
    stripeColor: '#B45309',
    capeColor: '#8B5CF6',
    sprites: {
      idle: '/assets/aistudio/idle_782d11ad.png',
      jump: '/assets/aistudio/jump_6e4ea823.png',
      gethit: '/assets/aistudio/gethit_ab92eb12.png',
    },
  },
];

export type EnemyArchetype = 'crow_charger' | 'balloon_weaver' | 'laser_drone';

export interface EnemyHazard {
  id: number;
  archetype: EnemyArchetype;
  x: number;
  y: number;
  baseY: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
  /** Windup timer: counts down before dash/beam activates */
  telegraphTimer: number;
  telegraphMax: number;
  hasTriggeredAttack: boolean;
  /** KO animation timer when defeated by Purr Dash */
  koTimer: number;
  active: boolean;
}

export interface PipeColumn {
  id: number;
  x: number;
  width: number;
  gapY: number;
  gapHeight: number;
  passed: boolean;
  /** Optional vertical oscillation for advanced stages */
  oscillateAmp: number;
  oscillateSpeed: number;
  phase: number;
  style: 'chimney' | 'bamboo';
}

export interface FishPickup {
  id: number;
  x: number;
  y: number;
  baseY: number;
  radius: number;
  collected: boolean;
  isGolden: boolean;
  phase: number;
}

export interface PlayerCat {
  x: number;
  y: number;
  vy: number;
  radius: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  hp: number;
  maxHp: number;
  invulnTimer: number;
  hitFlashTimer: number;
  dashTimer: number;
  dashCooldown: number;
  dashEnergy: number; // 0 to 100
  flapBufferTimer: number;
  coyoteTimer: number;
  tailPhase: number;
  earFlapTimer: number;
  /** Opening safe autopilot / glide assist so player survives first few seconds without input */
  openingGraceTimer: number;
}

export interface RunSnapshot {
  score: number;
  bestScore: number;
  fishCollected: number;
  distanceMeters: number;
  pipesCleared: number;
  maxCombo: number;
  causeOfDefeat: string;
}

export interface SimulationEvents {
  flapped: boolean;
  dashed: boolean;
  scoredPipe: boolean;
  collectedFish: boolean;
  collectedGoldenFish: boolean;
  enemyTelegraphStarted: boolean;
  enemyDefeated: boolean;
  playerHurt: boolean;
  gameOverTriggered: boolean;
}

export interface WorldSimulation {
  state: GameState;
  skin: CatSkinId;
  worldWidth: number;
  worldHeight: number;
  groundY: number;
  scrollSpeed: number;
  distancePx: number;
  score: number;
  bestScore: number;
  combo: number;
  maxCombo: number;
  fishCollected: number;
  pipesCleared: number;
  hitstopTimer: number;
  koSequenceTimer: number;
  cameraTrauma: number;
  spawnPipeTimer: number;
  spawnEnemyTimer: number;
  nextEntityId: number;
  cat: PlayerCat;
  pipes: PipeColumn[];
  enemies: EnemyHazard[];
  fishes: FishPickup[];
  snapshot: RunSnapshot;
}
