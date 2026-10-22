import {
  CatSkinId,
  EnemyArchetype,
  EnemyHazard,
  FishPickup,
  PipeColumn,
  PowerRuntimeState,
  RunPowerMap,
  SimulationEvents,
  WorldSimulation,
} from './types';
import {
  ACTIVE_POWER_IDS,
  CORE_POWER_IDS,
  CorePowerId,
  normalizePowerId,
  POWER_ABILITIES,
  PowerAbilityId,
} from './achievementDefinitions';

export const GRAVITY = 1080; // px/s^2
export const FLAP_IMPULSE = -395; // px/s
export const MAX_FALL_SPEED = 520;
export const BASE_SCROLL_SPEED = 225;
export const MAX_SCROLL_SPEED = 390;

// Six-Power Engineering Constants
export const DASH_DURATION_SEC = 0.5;
export const DASH_COOLDOWN_SEC = 8.0;
export const DASH_SPEED_MULTIPLIER = 1.65;

export const TIME_FREEZE_DURATION_SEC = 3.0;
export const TIME_FREEZE_COOLDOWN_SEC = 15.0;
export const TIME_FREEZE_SPEED_MULTIPLIER = 0.45; // 45% of baseline speed (within 40-50% spec)

export const MAGNET_ATTRACTION_RADIUS = 125; // 125 logical game units
export const MAGNET_ATTRACTION_RADIUS_SQ = MAGNET_ATTRACTION_RADIUS * MAGNET_ATTRACTION_RADIUS;
export const MAGNET_PULL_SPEED = 450;

export const SECOND_CHANCE_INVULN_SEC = 1.0;
export const SHIELD_CLEARANCE_INVULN_SEC = 0.85;
export const WAPRES_DURATION_SEC = 4.0;

// Balanced Score Economy (prevents runaway 100-score inflation)
export const SCORE_PER_PIPE = 1;
export const SCORE_PER_FISH = 1;
export const SCORE_PER_GOLDEN_FISH = 2;

export function createEmptyEvents(): SimulationEvents {
  return {
    flapped: false,
    dashed: false,
    timeFreezeActivated: false,
    wapresActivated: false,
    shieldBlocked: false,
    secondChanceRevived: false,
    firedLaser: false,
    triggeredShockwave: false,
    obstacleDestroyed: false,
    scoredPipe: false,
    collectedFish: false,
    collectedGoldenFish: false,
    enemyTelegraphStarted: false,
    enemyDefeated: false,
    playerHurt: false,
    gameOverTriggered: false,
  };
}

/**
 * Creates a clean runtime state map for all six powers based on which powers are unlocked.
 */
export function createRunPowerMap(unlockedPowers: PowerAbilityId[] = []): RunPowerMap {
  const unlockedSet = new Set<CorePowerId>();
  for (const raw of unlockedPowers) {
    const norm = normalizePowerId(raw);
    if (norm !== 'none') {
      unlockedSet.add(norm);
    }
  }

  const map = {} as RunPowerMap;
  for (const id of CORE_POWER_IDS) {
    const spec = POWER_ABILITIES[id];
    const isUnlocked = unlockedSet.has(id);
    const maxCharges = spec.maxChargesPerRun;
    map[id] = {
      id,
      category: spec.category,
      unlocked: isUnlocked,
      isActive: id === 'magnet' ? isUnlocked : false,
      remainingDuration: 0,
      remainingCooldown: 0,
      chargesRemaining: isUnlocked ? (maxCharges ?? 1) : 0,
      maxChargesPerRun: maxCharges,
      activationCount: 0,
    };
  }
  return map;
}

/**
 * Synchronizes newly unlocked powers into an active simulation without resetting already-spent per-run charges.
 */
export function syncUnlockedPowers(
  sim: WorldSimulation,
  unlockedPowers: PowerAbilityId[]
): void {
  const unlockedSet = new Set<CorePowerId>();
  for (const raw of unlockedPowers) {
    const norm = normalizePowerId(raw);
    if (norm !== 'none') {
      unlockedSet.add(norm);
    }
  }

  for (const id of CORE_POWER_IDS) {
    const runtime = sim.powers[id];
    const nowUnlocked = unlockedSet.has(id);
    if (nowUnlocked && !runtime.unlocked) {
      runtime.unlocked = true;
      runtime.chargesRemaining = runtime.maxChargesPerRun ?? 1;
      if (id === 'magnet') {
        runtime.isActive = true;
      }
    }
  }
}

export function createInitialWorld(
  width = 1280,
  height = 720,
  skin: CatSkinId = 'pirang',
  bestScore = 0,
  equippedPower: PowerAbilityId = 'none',
  unlockedPowers?: PowerAbilityId[]
): WorldSimulation {
  const groundY = Math.max(320, height - 88);
  const startY = Math.round(groundY * 0.44);
  const startingHp = skin === 'pirang' || skin === 'ninja' ? 4 : 3;
  const normEquipped = normalizePowerId(equippedPower);

  const effectiveUnlocked: PowerAbilityId[] = unlockedPowers
    ? [...unlockedPowers]
    : normEquipped !== 'none'
    ? [normEquipped]
    : [];

  if (normEquipped !== 'none' && !effectiveUnlocked.includes(normEquipped)) {
    effectiveUnlocked.push(normEquipped);
  }

  return {
    state: 'title',
    skin,
    worldWidth: width,
    worldHeight: height,
    groundY,
    baseScrollSpeed: BASE_SCROLL_SPEED,
    scrollSpeed: BASE_SCROLL_SPEED,
    distancePx: 0,
    score: 0,
    bestScore,
    combo: 0,
    maxCombo: 0,
    fishCollected: 0,
    pipesCleared: 0,
    hitstopTimer: 0,
    koSequenceTimer: 0,
    cameraTrauma: 0,
    spawnPipeTimer: 1.35,
    spawnEnemyTimer: 4.5,
    nextEntityId: 1,
    cat: {
      x: Math.round(Math.min(280, width * 0.24)),
      y: startY,
      vy: 0,
      radius: 22,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      hp: startingHp,
      maxHp: startingHp,
      invulnTimer: 0,
      hitFlashTimer: 0,
      dashTimer: 0,
      dashCooldown: 0,
      dashEnergy: 100,
      flapBufferTimer: 0,
      coyoteTimer: 0.12,
      tailPhase: 0,
      earFlapTimer: 0,
      openingGraceTimer: 3.4, // survives first 3.4 seconds without input
      activePower: normEquipped,
      powerTimer: 0,
      laserTimer: 0,
      shockwaveRadius: 0,
    },
    powers: createRunPowerMap(effectiveUnlocked),
    pipes: [],
    enemies: [],
    fishes: [],
    snapshot: {
      score: 0,
      bestScore,
      fishCollected: 0,
      distanceMeters: 0,
      pipesCleared: 0,
      maxCombo: 0,
      causeOfDefeat: '',
    },
  };
}

/**
 * Resets all temporary per-run states (scores, pipes, active timers, cooldowns, per-run charges)
 * while preserving unlocked powers across runs.
 */
export function startNewRun(
  sim: WorldSimulation,
  skin: CatSkinId = 'pirang',
  equippedPower?: PowerAbilityId,
  unlockedPowers?: PowerAbilityId[]
): void {
  const powerToUse = normalizePowerId(equippedPower ?? sim.cat.activePower ?? 'none');

  // Preserve previously unlocked powers in sim.powers unless explicitly overridden
  const preservedUnlocks: PowerAbilityId[] = unlockedPowers
    ? [...unlockedPowers]
    : sim.powers
    ? CORE_POWER_IDS.filter((id) => sim.powers[id]?.unlocked)
    : [];

  if (powerToUse !== 'none' && !preservedUnlocks.includes(powerToUse)) {
    preservedUnlocks.push(powerToUse);
  }

  const fresh = createInitialWorld(
    sim.worldWidth,
    sim.worldHeight,
    skin,
    sim.bestScore,
    powerToUse,
    preservedUnlocks
  );
  Object.assign(sim, fresh);
  sim.state = 'playing';

  // Spawn an initial friendly pipe and fish pickup ahead on an open path
  spawnPipeWithFish(sim, sim.worldWidth * 0.68, 0.5);
  spawnPipeWithFish(sim, sim.worldWidth * 0.68 + 380, 0.44);
}

export function resizeWorld(sim: WorldSimulation, width: number, height: number): void {
  sim.worldWidth = Math.max(320, width);
  sim.worldHeight = Math.max(420, height);
  sim.groundY = Math.max(300, sim.worldHeight - 88);
  sim.cat.x = Math.round(Math.min(280, sim.worldWidth * 0.24));
  if (sim.cat.y > sim.groundY - sim.cat.radius) {
    sim.cat.y = sim.groundY - sim.cat.radius - 10;
  }
}

export function spawnPipeWithFish(
  sim: WorldSimulation,
  spawnX: number,
  normalizedCenter = Math.random() * 0.5 + 0.25
): PipeColumn {
  const difficultyProgress = Math.min(1, sim.pipesCleared / 35);
  const gapHeight = Math.round(196 - difficultyProgress * 34);
  const minGapY = 74 + gapHeight * 0.5;
  const maxGapY = Math.max(minGapY + 20, sim.groundY - 74 - gapHeight * 0.5);
  const gapY = Math.round(minGapY + normalizedCenter * (maxGapY - minGapY));

  const oscillateAmp =
    sim.pipesCleared >= 12 && sim.nextEntityId % 3 === 0 ? 10 + difficultyProgress * 8 : 0;
  const pipe: PipeColumn = {
    id: sim.nextEntityId++,
    x: spawnX,
    width: 74,
    gapY,
    gapHeight,
    passed: false,
    oscillateAmp,
    oscillateSpeed: 1.4 + difficultyProgress * 0.5,
    phase: sim.nextEntityId * 1.1,
    style: sim.nextEntityId % 2 === 0 ? 'bamboo' : 'chimney',
    destroyed: false,
  };
  sim.pipes.push(pipe);

  const isGolden = sim.nextEntityId % 5 === 0;
  const fish: FishPickup = {
    id: sim.nextEntityId++,
    x: spawnX + pipe.width * 0.5,
    y: gapY,
    baseY: gapY,
    radius: isGolden ? 16 : 14,
    collected: false,
    isGolden,
    phase: 0,
  };
  sim.fishes.push(fish);

  return pipe;
}

export function spawnEnemyHazard(
  sim: WorldSimulation,
  forcedArchetype?: EnemyArchetype,
  spawnX = sim.worldWidth + 80,
  spawnY?: number
): EnemyHazard {
  const archetypes: EnemyArchetype[] = ['crow_charger', 'balloon_weaver', 'laser_drone'];
  const chosen =
    forcedArchetype ??
    archetypes[(sim.pipesCleared + sim.nextEntityId) % archetypes.length];

  const safeY =
    spawnY ??
    Math.round(110 + ((sim.nextEntityId * 97) % Math.max(120, sim.groundY - 220)));

  const enemy: EnemyHazard = {
    id: sim.nextEntityId++,
    archetype: chosen,
    x: spawnX,
    y: safeY,
    baseY: safeY,
    vx: chosen === 'crow_charger' ? -95 : chosen === 'balloon_weaver' ? -65 : -40,
    vy: 0,
    radius: chosen === 'balloon_weaver' ? 22 : 19,
    phase: 0,
    telegraphTimer: 0,
    telegraphMax: chosen === 'laser_drone' ? 0.65 : 0.48,
    hasTriggeredAttack: false,
    koTimer: 0,
    active: true,
  };
  sim.enemies.push(enemy);
  return enemy;
}

export function triggerFlap(sim: WorldSimulation, events: SimulationEvents): void {
  const cat = sim.cat;
  cat.openingGraceTimer = 0; // manual input takes over immediately
  cat.vy = FLAP_IMPULSE;
  cat.scaleX = 0.82;
  cat.scaleY = 1.22;
  cat.earFlapTimer = 0.34;
  cat.flapBufferTimer = 0;
  cat.coyoteTimer = 0;
  events.flapped = true;
}

/**
 * Computes effective world/pipe scroll speed without overwriting the baseline progressive difficulty speed.
 */
export function computeEffectiveScrollSpeed(sim: WorldSimulation): number {
  const ramp = Math.min(1, sim.pipesCleared / 30);
  const baseSpeed = BASE_SCROLL_SPEED + ramp * (MAX_SCROLL_SPEED - BASE_SCROLL_SPEED);
  sim.baseScrollSpeed = baseSpeed;

  let multiplier = 1.0;
  if (sim.powers.time_freeze.isActive && sim.powers.time_freeze.remainingDuration > 0) {
    multiplier *= TIME_FREEZE_SPEED_MULTIPLIER;
  }
  if (sim.powers.dash.isActive && sim.powers.dash.remainingDuration > 0) {
    multiplier *= DASH_SPEED_MULTIPLIER;
  }

  const effective = baseSpeed * multiplier;
  sim.scrollSpeed = effective;
  return effective;
}

/**
 * Checks whether a specific power can be manually activated right now.
 */
export function canActivatePower(sim: WorldSimulation, powerId: PowerAbilityId): boolean {
  if (sim.state !== 'playing' || sim.koSequenceTimer > 0) {
    return false;
  }
  const norm = normalizePowerId(powerId);
  if (norm === 'none') return false;

  const runtime: PowerRuntimeState | undefined = sim.powers[norm];
  if (!runtime) return false;

  // Passive powers (shield, magnet, second_chance) cannot be manually activated
  if (runtime.category !== 'active') {
    return false;
  }

  if (!runtime.unlocked) {
    return false;
  }

  if (runtime.isActive || runtime.remainingDuration > 0) {
    return false;
  }

  if (runtime.remainingCooldown > 0) {
    return false;
  }

  if (runtime.maxChargesPerRun !== null && runtime.chargesRemaining <= 0) {
    return false;
  }

  return true;
}

/**
 * Activates an unlocked Active Power (`dash`, `time_freeze`, or `wapres`).
 * Enforces unlock checks, active gameplay state, cooldowns, and per-run charge limits.
 */
export function triggerPowerAbility(
  sim: WorldSimulation,
  events: SimulationEvents,
  overridePower?: PowerAbilityId
): boolean {
  if (sim.state !== 'playing' || sim.koSequenceTimer > 0) {
    return false;
  }

  const cat = sim.cat;
  const requestedId = normalizePowerId(overridePower ?? cat.activePower);

  // Active skills must be unlocked and of category 'active' (chosen at run start)
  if (
    requestedId === 'none' ||
    sim.powers[requestedId]?.category !== 'active' ||
    !canActivatePower(sim, requestedId)
  ) {
    return false;
  }

  const runtime = sim.powers[requestedId];
  const spec = POWER_ABILITIES[requestedId];

  cat.openingGraceTimer = 0;
  if (cat.activePower === 'none') {
    cat.activePower = requestedId;
  }
  runtime.isActive = true;
  runtime.remainingDuration = spec.durationSec;
  runtime.remainingCooldown = spec.cooldownSec;
  runtime.activationCount += 1;
  if (runtime.maxChargesPerRun !== null) {
    runtime.chargesRemaining = Math.max(0, runtime.chargesRemaining - 1);
  }

  cat.scaleX = 1.26;
  cat.scaleY = 0.78;
  sim.cameraTrauma = Math.min(1, sim.cameraTrauma + 0.25);

  if (requestedId === 'dash') {
    cat.dashTimer = DASH_DURATION_SEC;
    cat.dashCooldown = DASH_COOLDOWN_SEC;
    cat.dashEnergy = 0;
    cat.vy = 0; // Controlled vertical stabilization impulse
    events.dashed = true;

    // Knock away immediate close-range aerial enemies directly in front of the dash
    for (let i = 0; i < sim.enemies.length; i++) {
      const enemy = sim.enemies[i];
      if (!enemy.active) continue;
      if (
        enemy.x >= cat.x - 20 &&
        enemy.x <= cat.x + 180 &&
        Math.abs(enemy.y - cat.y) <= cat.radius + enemy.radius + 32
      ) {
        enemy.active = false;
        enemy.koTimer = 0.36;
        enemy.vx = 280;
        enemy.vy = -240;
        events.enemyDefeated = true;
        events.obstacleDestroyed = true;
      }
    }
  } else if (requestedId === 'time_freeze') {
    cat.powerTimer = Math.max(cat.powerTimer, TIME_FREEZE_DURATION_SEC);
    events.timeFreezeActivated = true;
    events.dashed = true;
  } else if (requestedId === 'wapres') {
    cat.powerTimer = Math.max(cat.powerTimer, WAPRES_DURATION_SEC);
    events.wapresActivated = true;
    events.dashed = true;
  }

  computeEffectiveScrollSpeed(sim);
  return true;
}

/**
 * Backward-compatible alias for triggering the primary active power from HUD or tests.
 */
export function triggerPurrDash(sim: WorldSimulation, events: SimulationEvents): boolean {
  const candidate =
    sim.cat.activePower && sim.cat.activePower !== 'none'
      ? sim.cat.activePower
      : 'dash';
  return triggerPowerAbility(sim, events, candidate);
}

export type CollisionResolutionResult =
  | 'ignored_run_ending'
  | 'ignored_invulnerable'
  | 'blocked_by_wapres'
  | 'blocked_by_shield'
  | 'revived_by_second_chance'
  | 'player_damaged'
  | 'game_over';

/**
 * Single deterministic collision-resolution pipeline (Section 4):
 * 1. Ignore additional fatal collisions if the run is already ending.
 * 2. Ignore fatal collision consequences while temporary invulnerability is active.
 * 3. Check Wapres ultimate immunity (4s).
 * 4. Check Shield availability (1 charge/run passive).
 * 5. Check Second Chance availability (1 revival/run passive + safe reposition + 1s invulnerability).
 * 6. Trigger normal damage / game-over behavior if no protection applies.
 */
export function resolvePlayerCollision(
  sim: WorldSimulation,
  events: SimulationEvents,
  cause: string,
  safeRecoveryY = sim.groundY * 0.45,
  options: { instantFatalIfUnprotected?: boolean } = {}
): CollisionResolutionResult {
  const cat = sim.cat;

  // 1. Ignore additional collisions if the run is already ending
  if (sim.state !== 'playing' || sim.koSequenceTimer > 0) {
    return 'ignored_run_ending';
  }

  // 2. Ignore collision consequences while temporary invulnerability or opening grace is active
  if (cat.invulnTimer > 0 || cat.openingGraceTimer > 0) {
    return 'ignored_invulnerable';
  }

  // 3. Check Wapres ultimate immunity (4 seconds)
  const wapresState = sim.powers.wapres;
  if (wapresState.unlocked && wapresState.isActive && wapresState.remainingDuration > 0) {
    return 'blocked_by_wapres';
  }

  // 4. Check Shield availability (1 charge per run, passive)
  const shieldState = sim.powers.shield;
  if (shieldState.unlocked && shieldState.chargesRemaining > 0) {
    shieldState.chargesRemaining -= 1;
    cat.invulnTimer = Math.max(cat.invulnTimer, SHIELD_CLEARANCE_INVULN_SEC);
    cat.scaleX = 1.18;
    cat.scaleY = 0.84;
    sim.cameraTrauma = Math.min(1, sim.cameraTrauma + 0.28);
    events.shieldBlocked = true;
    return 'blocked_by_shield';
  }

  // 5. Check Second Chance availability (1 revival per run, passive)
  const secondChanceState = sim.powers.second_chance;
  if (secondChanceState.unlocked && secondChanceState.chargesRemaining > 0) {
    secondChanceState.chargesRemaining -= 1;
    const minSafeY = cat.radius + 24;
    const maxSafeY = Math.max(minSafeY + 10, sim.groundY - cat.radius - 24);
    cat.y = Math.max(minSafeY, Math.min(maxSafeY, Math.round(safeRecoveryY)));
    cat.vy = 0;
    cat.rotation = 0;
    cat.invulnTimer = SECOND_CHANCE_INVULN_SEC; // 1.0 second temporary invulnerability
    cat.hp = Math.max(1, cat.hp);
    cat.scaleX = 0.86;
    cat.scaleY = 1.18;
    sim.cameraTrauma = Math.min(1, sim.cameraTrauma + 0.35);
    events.secondChanceRevived = true;
    return 'revived_by_second_chance';
  }

  // 6. Trigger normal damage / game-over behavior if no protection applies
  if (options.instantFatalIfUnprotected) {
    cat.hp = 1;
  }
  applyPlayerDamage(sim, events, cause);
  return cat.hp <= 0 ? 'game_over' : 'player_damaged';
}

export interface StepInput {
  flapJustPressed: boolean;
  flapHeld: boolean;
  flapJustReleased: boolean;
  dashJustPressed: boolean;
  activateSkillId?: PowerAbilityId | null;
}

export function stepWorldSimulation(
  sim: WorldSimulation,
  rawDt: number,
  input: StepInput
): SimulationEvents {
  const events = createEmptyEvents();
  const dt = Math.min(Math.max(rawDt, 0), 0.05);

  // Decay camera trauma & hit flashes in real frame time
  sim.cameraTrauma = Math.max(0, sim.cameraTrauma - dt * 1.85);
  if (sim.cat.hitFlashTimer > 0) {
    sim.cat.hitFlashTimer = Math.max(0, sim.cat.hitFlashTimer - dt);
  }

  // Spring squash-and-stretch back toward (1, 1)
  const springFactor = Math.min(1, dt * 14);
  sim.cat.scaleX += (1 - sim.cat.scaleX) * springFactor;
  sim.cat.scaleY += (1 - sim.cat.scaleY) * springFactor;
  sim.cat.tailPhase += dt * (sim.powers.dash.isActive ? 22 : 9);

  if (sim.state === 'title') {
    sim.distancePx += BASE_SCROLL_SPEED * 0.55 * dt;
    sim.cat.y = sim.groundY * 0.44 + Math.sin(sim.distancePx * 0.018) * 16;
    sim.cat.rotation = Math.sin(sim.distancePx * 0.018) * 0.08;
    return events;
  }

  if (sim.state !== 'playing') {
    return events;
  }

  // Handle KO beat before showing gameover modal
  if (sim.koSequenceTimer > 0) {
    sim.koSequenceTimer -= dt;
    sim.cat.vy += GRAVITY * dt;
    sim.cat.y = Math.min(sim.groundY - sim.cat.radius, sim.cat.y + sim.cat.vy * dt);
    sim.cat.rotation += dt * 6;
    if (sim.koSequenceTimer <= 0) {
      sim.state = 'gameover';
      events.gameOverTriggered = true;
    }
    return events;
  }

  // Hitstop freeze pauses simulation physics while keeping camera shake active
  if (sim.hitstopTimer > 0) {
    sim.hitstopTimer = Math.max(0, sim.hitstopTimer - dt);
    return events;
  }

  const cat = sim.cat;

  // Input buffering for flap
  if (input.flapJustPressed) {
    cat.flapBufferTimer = 0.12;
  } else if (cat.flapBufferTimer > 0) {
    cat.flapBufferTimer = Math.max(0, cat.flapBufferTimer - dt);
  }

  if (cat.flapBufferTimer > 0) {
    triggerFlap(sim, events);
  }

  // Variable jump height cut when releasing space/click early while ascending
  if (input.flapJustReleased && cat.vy < -120) {
    cat.vy *= 0.52;
  }

  // Update Active Power durations & cooldowns BEFORE processing new activations
  // so an ability whose cooldown finishes on this frame can be triggered immediately
  for (const id of ACTIVE_POWER_IDS) {
    const pState = sim.powers[id];
    if (pState.remainingDuration > 0) {
      pState.remainingDuration = Math.max(0, pState.remainingDuration - dt);
      pState.isActive = pState.remainingDuration > 0;
    } else {
      pState.isActive = false;
    }

    if (pState.remainingCooldown > 0) {
      pState.remainingCooldown = Math.max(0, pState.remainingCooldown - dt);
    }
  }
  sim.powers.magnet.isActive = sim.powers.magnet.unlocked;

  // Sync legacy cat timer fields with centralized power state
  cat.dashTimer = sim.powers.dash.remainingDuration;
  cat.dashCooldown = sim.powers.dash.remainingCooldown;
  cat.powerTimer = Math.max(
    sim.powers.wapres.remainingDuration,
    sim.powers.time_freeze.remainingDuration
  );

  // Update visual readiness percentage for primary HUD bar
  const activeSpec = POWER_ABILITIES[cat.activePower] ?? POWER_ABILITIES.none;
  const activeRuntime =
    cat.activePower !== 'none' ? sim.powers[cat.activePower as CorePowerId] : undefined;
  if (activeRuntime && activeRuntime.unlocked) {
    if (activeRuntime.maxChargesPerRun !== null) {
      cat.dashEnergy = activeRuntime.chargesRemaining > 0 ? 100 : 0;
    } else if (activeSpec.cooldownSec > 0) {
      cat.dashEnergy = Math.max(
        0,
        Math.min(
          100,
          ((activeSpec.cooldownSec - activeRuntime.remainingCooldown) /
            activeSpec.cooldownSec) *
            100
        )
      );
    } else {
      cat.dashEnergy = 100;
    }
    cat.dashCooldown = activeRuntime.remainingCooldown;
  } else {
    cat.dashEnergy = 0;
    cat.dashCooldown = 0;
  }

  // Process explicit skill activation input — strictly locked to the skill selected at the start of the run
  if (input.activateSkillId) {
    if (input.activateSkillId === cat.activePower) {
      triggerPowerAbility(sim, events, cat.activePower);
    }
  } else if (input.dashJustPressed) {
    triggerPowerAbility(sim, events, cat.activePower);
  }

  // Opening Grace Autopilot
  if (cat.openingGraceTimer > 0) {
    cat.openingGraceTimer = Math.max(0, cat.openingGraceTimer - dt);
    const targetY = sim.pipes.length > 0 ? sim.pipes[0].gapY : sim.groundY * 0.45;
    if (cat.y > targetY + 18 && cat.vy >= -40) {
      cat.vy = FLAP_IMPULSE * 0.82;
      cat.scaleX = 0.88;
      cat.scaleY = 1.14;
      cat.earFlapTimer = 0.16;
    }
  }

  // Timers
  if (cat.invulnTimer > 0) cat.invulnTimer = Math.max(0, cat.invulnTimer - dt);
  if (cat.earFlapTimer > 0) cat.earFlapTimer = Math.max(0, cat.earFlapTimer - dt);
  if (cat.laserTimer > 0) cat.laserTimer = Math.max(0, cat.laserTimer - dt);

  // Calculate effective world speed (respecting Time Freeze 0.45x & Dash 1.65x without overwriting baseScrollSpeed)
  const activeSpeed = computeEffectiveScrollSpeed(sim);

  // Vertical movement physics:
  // During Dash (0.5s), vertical velocity is stabilized; otherwise standard gravity applies
  if (sim.powers.dash.isActive && sim.powers.dash.remainingDuration > 0) {
    cat.vy = 0;
    cat.rotation = 0;
  } else {
    cat.vy = Math.min(MAX_FALL_SPEED, cat.vy + GRAVITY * dt);
    cat.y += cat.vy * dt;
    const targetRot = Math.max(-0.48, Math.min(1.05, cat.vy / 460));
    cat.rotation += (targetRot - cat.rotation) * Math.min(1, dt * 12);
  }

  // Ceiling clamp (never allow movement outside playable area)
  if (cat.y < cat.radius + 12) {
    cat.y = cat.radius + 12;
    if (cat.vy < 0) cat.vy = 0;
  }

  // Ground collision resolved through the centralized collision pipeline
  if (cat.y >= sim.groundY - cat.radius) {
    cat.y = sim.groundY - cat.radius;
    cat.scaleX = 1.24;
    cat.scaleY = 0.76;
    const res = resolvePlayerCollision(
      sim,
      events,
      'Terjatuh ke genteng bawah',
      sim.groundY * 0.45
    );
    if (res !== 'revived_by_second_chance' && cat.hp > 0) {
      cat.vy = FLAP_IMPULSE * 0.96;
    }
  }

  sim.distancePx += activeSpeed * dt;

  // Spawn pipes scaled by effective world speed ratio so pipe spacing remains consistent during Time Freeze / Dash
  const speedRatio = activeSpeed / Math.max(1, sim.baseScrollSpeed);
  const ramp = Math.min(1, sim.pipesCleared / 30);
  sim.spawnPipeTimer -= dt * speedRatio;
  if (sim.spawnPipeTimer <= 0) {
    const interval = Math.max(1.22, 1.82 - ramp * 0.48);
    sim.spawnPipeTimer = interval;
    const randNorm = 0.2 + ((sim.nextEntityId * 37) % 60) / 100;
    spawnPipeWithFish(sim, sim.worldWidth + 90, randNorm);
  }

  // Spawn enemies
  sim.spawnEnemyTimer -= dt * speedRatio;
  if (sim.spawnEnemyTimer <= 0) {
    sim.spawnEnemyTimer = Math.max(2.6, 4.8 - ramp * 1.9);
    spawnEnemyHazard(sim);
  }

  // Update pipes & check collisions
  for (let i = sim.pipes.length - 1; i >= 0; i--) {
    const pipe = sim.pipes[i];
    pipe.x -= activeSpeed * dt;

    if (pipe.destroyed) {
      if (pipe.x + pipe.width < -120) {
        sim.pipes.splice(i, 1);
      }
      continue;
    }

    if (pipe.oscillateAmp > 0) {
      pipe.phase += pipe.oscillateSpeed * dt * speedRatio;
      pipe.gapY += Math.sin(pipe.phase) * pipe.oscillateAmp * dt * speedRatio;
    }

    // Score when passing center of pipe (1 pipe = 1 score for balanced progression)
    if (!pipe.passed && pipe.x + pipe.width * 0.5 < cat.x) {
      pipe.passed = true;
      sim.pipesCleared += 1;
      sim.combo += 1;
      sim.maxCombo = Math.max(sim.maxCombo, sim.combo);
      sim.score += SCORE_PER_PIPE;
      sim.bestScore = Math.max(sim.bestScore, sim.score);
      events.scoredPipe = true;
    }

    // Pipe collision (always evaluated, including during Dash, through the centralized pipeline)
    const hitRadius = cat.radius * 0.78;
    const withinPipeX =
      cat.x + hitRadius > pipe.x + 4 && cat.x - hitRadius < pipe.x + pipe.width - 4;
    if (withinPipeX) {
      const topBottom = pipe.gapY - pipe.gapHeight * 0.5;
      const bottomTop = pipe.gapY + pipe.gapHeight * 0.5;
      const hitsTop = cat.y - hitRadius < topBottom;
      const hitsBottom = cat.y + hitRadius > bottomTop;

      if (hitsTop || hitsBottom) {
        const outcome = resolvePlayerCollision(
          sim,
          events,
          'Menabrak cerobong atap',
          pipe.gapY
        );
        if (outcome === 'blocked_by_wapres') {
          // Wapres ultimate effortlessly clears overlapping pipe edges without consuming Shield or Second Chance
          pipe.gapHeight = Math.max(pipe.gapHeight, 240);
        } else if (outcome === 'blocked_by_shield') {
          cat.vy = cat.y < pipe.gapY ? 150 : FLAP_IMPULSE * 0.8;
        } else if (outcome === 'player_damaged') {
          cat.vy = cat.y < pipe.gapY ? 180 : FLAP_IMPULSE * 0.85;
        }
      }
    }

    if (pipe.x + pipe.width < -120) {
      sim.pipes.splice(i, 1);
    }
  }

  // Update fish collectibles:
  // Magnet Passive (unlocked at 300 score) attracts collectibles within 125 logical units using squared-distance check.
  // When Magnet is locked, collectibles are NOT pulled from a distance and only collect on direct hitbox contact.
  const isMagnetActive = sim.powers.magnet.unlocked && sim.powers.magnet.isActive;

  for (let i = sim.fishes.length - 1; i >= 0; i--) {
    const fish = sim.fishes[i];
    if (fish.collected) {
      sim.fishes.splice(i, 1);
      continue;
    }

    fish.x -= activeSpeed * dt;
    fish.phase += dt * 3.0;

    const dx = cat.x - fish.x;
    const dy = cat.y - fish.y;
    const distSq = dx * dx + dy * dy;

    if (isMagnetActive && distSq <= MAGNET_ATTRACTION_RADIUS_SQ && distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      const stepPull = Math.min(dist, MAGNET_PULL_SPEED * dt);
      fish.x += (dx / dist) * stepPull;
      fish.y += (dy / dist) * stepPull;
      fish.baseY = fish.y;
    } else {
      fish.y = fish.baseY;
    }

    const postDx = cat.x - fish.x;
    const postDy = cat.y - fish.y;
    const postDistSq = postDx * postDx + postDy * postDy;
    const collectRadius = cat.radius + fish.radius + 6;

    if (!fish.collected && postDistSq <= collectRadius * collectRadius) {
      fish.collected = true;
      sim.fishCollected += 1;
      sim.combo += 1;
      sim.maxCombo = Math.max(sim.maxCombo, sim.combo);
      const pts = fish.isGolden ? SCORE_PER_GOLDEN_FISH : SCORE_PER_FISH;
      sim.score += pts;
      sim.bestScore = Math.max(sim.bestScore, sim.score);

      if (fish.isGolden && cat.hp < cat.maxHp) {
        cat.hp += 1;
      }
      if (fish.isGolden) {
        events.collectedGoldenFish = true;
      } else {
        events.collectedFish = true;
      }
    }

    if (fish.collected || fish.x < -80) {
      sim.fishes.splice(i, 1);
    }
  }

  // Update enemies
  let activeTelegraphs = sim.enemies.filter((e) => e.telegraphTimer > 0).length;

  for (let i = sim.enemies.length - 1; i >= 0; i--) {
    const enemy = sim.enemies[i];

    if (!enemy.active) {
      enemy.koTimer -= dt;
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.vy += 900 * dt;
      enemy.phase += dt * 14;
      if (enemy.koTimer <= 0) {
        sim.enemies.splice(i, 1);
      }
      continue;
    }

    enemy.phase += dt * 3.8 * speedRatio;
    const distToCatX = enemy.x - cat.x;

    if (enemy.archetype === 'crow_charger') {
      if (
        !enemy.hasTriggeredAttack &&
        enemy.telegraphTimer <= 0 &&
        distToCatX > 120 &&
        distToCatX < 460 &&
        activeTelegraphs < 2
      ) {
        enemy.telegraphTimer = enemy.telegraphMax;
        enemy.hasTriggeredAttack = true;
        activeTelegraphs += 1;
        events.enemyTelegraphStarted = true;
      }

      if (enemy.telegraphTimer > 0) {
        enemy.telegraphTimer = Math.max(0, enemy.telegraphTimer - dt * speedRatio);
        enemy.x -= activeSpeed * 0.45 * dt;
        enemy.y += Math.sign(cat.y - enemy.y) * 45 * dt * speedRatio;
        if (enemy.telegraphTimer === 0) {
          enemy.vx = -310;
        }
      } else {
        enemy.x += (enemy.vx * speedRatio - activeSpeed) * dt;
      }
    } else if (enemy.archetype === 'balloon_weaver') {
      enemy.x += (enemy.vx * speedRatio - activeSpeed * 0.85) * dt;
      enemy.y = enemy.baseY + Math.sin(enemy.phase) * 58;
      if (
        !enemy.hasTriggeredAttack &&
        enemy.telegraphTimer <= 0 &&
        distToCatX > 90 &&
        distToCatX < 360 &&
        activeTelegraphs < 2
      ) {
        enemy.telegraphTimer = enemy.telegraphMax;
        enemy.hasTriggeredAttack = true;
        activeTelegraphs += 1;
        events.enemyTelegraphStarted = true;
      }
      if (enemy.telegraphTimer > 0) {
        enemy.telegraphTimer = Math.max(0, enemy.telegraphTimer - dt * speedRatio);
      }
    } else if (enemy.archetype === 'laser_drone') {
      if (distToCatX > 220 && distToCatX < 520 && !enemy.hasTriggeredAttack) {
        enemy.x -= activeSpeed * 0.35 * dt;
        enemy.y += (cat.y - enemy.y) * Math.min(1, dt * 2.5 * speedRatio);
        if (enemy.telegraphTimer <= 0 && distToCatX < 420 && activeTelegraphs < 2) {
          enemy.telegraphTimer = enemy.telegraphMax;
          enemy.hasTriggeredAttack = true;
          activeTelegraphs += 1;
          events.enemyTelegraphStarted = true;
        }
      } else if (enemy.telegraphTimer > 0) {
        enemy.telegraphTimer = Math.max(0, enemy.telegraphTimer - dt * speedRatio);
        enemy.x -= activeSpeed * 0.25 * dt;
        if (enemy.telegraphTimer === 0) {
          enemy.vx = -340;
        }
      } else {
        enemy.x += (enemy.vx * speedRatio - activeSpeed) * dt;
      }
    }

    // Check collision with player
    const dist = Math.hypot(cat.x - enemy.x, cat.y - enemy.y);
    if (dist < cat.radius + enemy.radius - 2) {
      if (sim.powers.dash.isActive || sim.powers.wapres.isActive) {
        enemy.active = false;
        enemy.koTimer = 0.38;
        enemy.vx = 280;
        enemy.vy = -260;
        sim.hitstopTimer = 0.045;
        sim.cameraTrauma = Math.min(1, sim.cameraTrauma + 0.42);
        events.enemyDefeated = true;
      } else {
        enemy.active = false;
        enemy.koTimer = 0.32;
        enemy.vx = 160;
        enemy.vy = -180;
        const causeLabel =
          enemy.archetype === 'crow_charger'
            ? 'Diseruduk Gagak Atap'
            : enemy.archetype === 'balloon_weaver'
            ? 'Menabrak Balon Buntal'
            : 'Tersengat Drone Laser';
        resolvePlayerCollision(sim, events, causeLabel, sim.groundY * 0.45);
      }
    }

    if (enemy.x < -120) {
      sim.enemies.splice(i, 1);
    }
  }

  return events;
}

export function applyPlayerDamage(
  sim: WorldSimulation,
  events: SimulationEvents,
  cause: string
): void {
  const cat = sim.cat;
  cat.hp = Math.max(0, cat.hp - 1);
  cat.hitFlashTimer = 0.14;
  cat.invulnTimer = 1.35;
  cat.scaleX = 1.28;
  cat.scaleY = 0.72;
  sim.combo = 0;
  sim.hitstopTimer = 0.065;
  sim.cameraTrauma = Math.min(1, sim.cameraTrauma + 0.65);
  events.playerHurt = true;

  if (cat.hp <= 0) {
    sim.snapshot = {
      score: Math.round(sim.score),
      bestScore: Math.round(Math.max(sim.bestScore, sim.score)),
      fishCollected: sim.fishCollected,
      distanceMeters: Math.max(1, Math.round(sim.distancePx / 45)),
      pipesCleared: sim.pipesCleared,
      maxCombo: sim.maxCombo,
      causeOfDefeat: cause,
    };
    sim.bestScore = sim.snapshot.bestScore;
    sim.koSequenceTimer = 0.45;
    cat.vy = -260;
  }
}
