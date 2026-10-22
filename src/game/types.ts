import { CorePowerId, PowerAbilityId, PowerCategory } from './achievementDefinitions';

export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export type CatSkinId = 'pirang' | 'ninja' | 'oyen' | 'mochi' | 'kopi';

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

export const BARUDAK_SKIN: CatSkinInfo = {
  id: 'pirang',
  name: 'Barudak Pirang',
  role: 'Jagoan Atap Senja · 4 Nyawa & Penguasa Power',
  primaryColor: '#FBBF24',
  secondaryColor: '#FEF3C7',
  earInnerColor: '#FB7185',
  stripeColor: '#B45309',
  capeColor: '#8B5CF6',
  sprites: {
    idle: '/assets/aistudio/pirang_idle.webp',
    jump: '/assets/aistudio/pirang_jump.webp',
    gethit: '/assets/aistudio/pirang_gethit.webp',
  },
};

export const BARUDAK_NINJA_SKIN: CatSkinInfo = {
  id: 'ninja',
  name: 'Barudak Ninja',
  role: 'Bayangan Langit Malam · 4 Nyawa & Refleks Kilat',
  primaryColor: '#38BDF8',
  secondaryColor: '#E0F2FE',
  earInnerColor: '#818CF8',
  stripeColor: '#0284C7',
  capeColor: '#6366F1',
  sprites: {
    idle: '/assets/aistudio/ninja_idle.webp',
    jump: '/assets/aistudio/ninja_jump.webp',
    gethit: '/assets/aistudio/ninja_gethit.webp',
  },
};

export const CAT_SKINS: CatSkinInfo[] = [BARUDAK_SKIN, BARUDAK_NINJA_SKIN];

export function getCharacterSkin(skinId: CatSkinId): CatSkinInfo {
  return CAT_SKINS.find((s) => s.id === skinId) ?? BARUDAK_SKIN;
}

export interface PowerRuntimeState {
  id: CorePowerId;
  category: PowerCategory;
  unlocked: boolean;
  isActive: boolean;
  remainingDuration: number;
  remainingCooldown: number;
  chargesRemaining: number;
  maxChargesPerRun: number | null;
  activationCount: number;
}

export type RunPowerMap = Record<CorePowerId, PowerRuntimeState>;

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
  /** KO animation timer when defeated by Power Ability */
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
  /** True when vaporized/cleared */
  destroyed?: boolean;
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
  /** Currently selected active Power Ability */
  activePower: PowerAbilityId;
  /** Remaining duration of active power effect */
  powerTimer: number;
  /** Remaining duration of laser beam visual & hitbox */
  laserTimer: number;
  /** Expanding radius for shockwave visual (> 0 when active) */
  shockwaveRadius: number;
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
  timeFreezeActivated: boolean;
  wapresActivated: boolean;
  shieldBlocked: boolean;
  secondChanceRevived: boolean;
  firedLaser: boolean;
  triggeredShockwave: boolean;
  obstacleDestroyed: boolean;
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
  baseScrollSpeed: number;
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
  powers: RunPowerMap;
  pipes: PipeColumn[];
  enemies: EnemyHazard[];
  fishes: FishPickup[];
  snapshot: RunSnapshot;
}
