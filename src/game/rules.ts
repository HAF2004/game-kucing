import {
  CatSkinId,
  EnemyArchetype,
  EnemyHazard,
  FishPickup,
  PipeColumn,
  SimulationEvents,
  WorldSimulation,
} from './types';

export const GRAVITY = 1080; // px/s^2
export const FLAP_IMPULSE = -395; // px/s
export const MAX_FALL_SPEED = 520;
export const BASE_SCROLL_SPEED = 225;
export const MAX_SCROLL_SPEED = 390;

export function createEmptyEvents(): SimulationEvents {
  return {
    flapped: false,
    dashed: false,
    scoredPipe: false,
    collectedFish: false,
    collectedGoldenFish: false,
    enemyTelegraphStarted: false,
    enemyDefeated: false,
    playerHurt: false,
    gameOverTriggered: false,
  };
}

export function createInitialWorld(
  width = 1280,
  height = 720,
  skin: CatSkinId = 'oyen',
  bestScore = 0
): WorldSimulation {
  const groundY = Math.max(320, height - 88);
  const startY = Math.round(groundY * 0.44);
  const startingHp = skin === 'pirang' ? 4 : 3;

  return {
    state: 'title',
    skin,
    worldWidth: width,
    worldHeight: height,
    groundY,
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
    },
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

export function startNewRun(sim: WorldSimulation, skin?: CatSkinId): void {
  const chosenSkin = skin ?? sim.skin;
  const fresh = createInitialWorld(sim.worldWidth, sim.worldHeight, chosenSkin, sim.bestScore);
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
  // Difficulty knob 1: Gap shrinks gently as score increases, but stays fair
  const difficultyProgress = Math.min(1, sim.pipesCleared / 35);
  const gapHeight = Math.round(196 - difficultyProgress * 38);
  const minGapY = 74 + gapHeight * 0.5;
  const maxGapY = Math.max(minGapY + 20, sim.groundY - 74 - gapHeight * 0.5);
  const gapY = Math.round(minGapY + normalizedCenter * (maxGapY - minGapY));

  const oscillateAmp = sim.pipesCleared >= 5 && sim.nextEntityId % 2 === 0 ? 22 + difficultyProgress * 18 : 0;
  const pipe: PipeColumn = {
    id: sim.nextEntityId++,
    x: spawnX,
    width: 74,
    gapY,
    gapHeight,
    passed: false,
    oscillateAmp,
    oscillateSpeed: 1.8 + difficultyProgress * 0.8,
    phase: sim.nextEntityId * 1.1,
    style: sim.nextEntityId % 2 === 0 ? 'bamboo' : 'chimney',
  };
  sim.pipes.push(pipe);

  // Spawn a fish inside the pipe gap or slightly behind it
  const isGolden = sim.nextEntityId % 5 === 0;
  const fish: FishPickup = {
    id: sim.nextEntityId++,
    x: spawnX + pipe.width * 0.5,
    y: gapY + (isGolden ? -14 : 0),
    baseY: gapY + (isGolden ? -14 : 0),
    radius: isGolden ? 16 : 13,
    collected: false,
    isGolden,
    phase: sim.nextEntityId * 0.7,
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
  cat.vy = sim.skin === 'oyen' ? FLAP_IMPULSE * 1.03 : FLAP_IMPULSE;
  cat.scaleX = 0.82;
  cat.scaleY = 1.22;
  cat.earFlapTimer = 0.34;
  cat.flapBufferTimer = 0;
  cat.coyoteTimer = 0;
  events.flapped = true;
}

export function triggerPurrDash(sim: WorldSimulation, events: SimulationEvents): boolean {
  const cat = sim.cat;
  if (cat.dashCooldown > 0 || cat.dashEnergy < 35 || cat.dashTimer > 0) {
    return false;
  }
  cat.openingGraceTimer = 0;
  cat.dashTimer = sim.skin === 'kopi' ? 0.38 : 0.32;
  cat.dashCooldown = 0.85;
  cat.dashEnergy = Math.max(0, cat.dashEnergy - 45);
  cat.invulnTimer = Math.max(cat.invulnTimer, cat.dashTimer + 0.12);
  cat.vy = 0;
  cat.scaleX = 1.32;
  cat.scaleY = 0.74;
  sim.cameraTrauma = Math.min(1, sim.cameraTrauma + 0.28);
  events.dashed = true;
  return true;
}

export interface StepInput {
  flapJustPressed: boolean;
  flapHeld: boolean;
  flapJustReleased: boolean;
  dashJustPressed: boolean;
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
  sim.cat.tailPhase += dt * (sim.cat.dashTimer > 0 ? 22 : 9);

  if (sim.state === 'title') {
    // Gentle hover in title screen
    sim.distancePx += BASE_SCROLL_SPEED * 0.55 * dt;
    sim.cat.y =
      sim.groundY * 0.44 + Math.sin(sim.distancePx * 0.018) * 16;
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

  if (input.dashJustPressed) {
    triggerPurrDash(sim, events);
  }

  // Opening Grace Autopilot: keeps the cat safely bobbing and auto-flapping through the first pipe if the user hasn't pressed a key yet
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
  if (cat.dashCooldown > 0) cat.dashCooldown = Math.max(0, cat.dashCooldown - dt);
  if (cat.earFlapTimer > 0) cat.earFlapTimer = Math.max(0, cat.earFlapTimer - dt);

  // Passive dash energy regeneration
  cat.dashEnergy = Math.min(100, cat.dashEnergy + dt * 9);

  // Difficulty scaling (Multi-knob ramp: scroll speed, spawn cadence, enemy density)
  const ramp = Math.min(1, sim.pipesCleared / 30);
  const baseSpeed = BASE_SCROLL_SPEED + ramp * (MAX_SCROLL_SPEED - BASE_SCROLL_SPEED);
  const activeSpeed = cat.dashTimer > 0 ? baseSpeed * 2.15 : baseSpeed;
  sim.scrollSpeed = activeSpeed;

  if (cat.dashTimer > 0) {
    cat.dashTimer = Math.max(0, cat.dashTimer - dt);
    cat.vy = 0;
    cat.rotation = 0;
  } else {
    cat.vy = Math.min(MAX_FALL_SPEED, cat.vy + GRAVITY * dt);
    cat.y += cat.vy * dt;
    // Smooth pitch rotation tied to vertical velocity
    const targetRot = Math.max(-0.48, Math.min(1.05, cat.vy / 460));
    cat.rotation += (targetRot - cat.rotation) * Math.min(1, dt * 12);
  }

  // Ceiling clamp
  if (cat.y < cat.radius + 12) {
    cat.y = cat.radius + 12;
    if (cat.vy < 0) cat.vy = 0;
  }

  // Ground collision
  if (cat.y >= sim.groundY - cat.radius) {
    cat.y = sim.groundY - cat.radius;
    cat.scaleX = 1.24;
    cat.scaleY = 0.76;
    if (cat.invulnTimer <= 0 && cat.openingGraceTimer <= 0) {
      applyPlayerDamage(sim, events, 'Terjatuh ke genteng bawah');
      if (cat.hp > 0) {
        // Bounce up from the roof tiles with emergency flap
        cat.vy = FLAP_IMPULSE * 1.08;
      }
    } else {
      cat.vy = FLAP_IMPULSE * 0.92;
    }
  }

  sim.distancePx += activeSpeed * dt;

  // Spawn pipes
  sim.spawnPipeTimer -= dt * (cat.dashTimer > 0 ? 1.8 : 1);
  if (sim.spawnPipeTimer <= 0) {
    const interval = Math.max(1.22, 1.82 - ramp * 0.48);
    sim.spawnPipeTimer = interval;
    const randNorm = 0.2 + ((sim.nextEntityId * 37) % 60) / 100;
    spawnPipeWithFish(sim, sim.worldWidth + 90, randNorm);
  }

  // Spawn enemies (3 distinct policies)
  sim.spawnEnemyTimer -= dt;
  if (sim.spawnEnemyTimer <= 0) {
    sim.spawnEnemyTimer = Math.max(2.6, 4.8 - ramp * 1.9);
    spawnEnemyHazard(sim);
  }

  // Update pipes & check collisions
  for (let i = sim.pipes.length - 1; i >= 0; i--) {
    const pipe = sim.pipes[i];
    pipe.x -= activeSpeed * dt;
    if (pipe.oscillateAmp > 0) {
      pipe.phase += pipe.oscillateSpeed * dt;
      pipe.gapY += Math.sin(pipe.phase) * pipe.oscillateAmp * dt;
    }

    // Score when passing center of pipe
    if (!pipe.passed && pipe.x + pipe.width * 0.5 < cat.x) {
      pipe.passed = true;
      sim.pipesCleared += 1;
      sim.combo += 1;
      sim.maxCombo = Math.max(sim.maxCombo, sim.combo);
      const comboBonus = Math.min(5, Math.floor((sim.combo - 1) / 3));
      sim.score += 1 + comboBonus;
      sim.bestScore = Math.max(sim.bestScore, sim.score);
      events.scoredPipe = true;
    }

    // Pipe collision (AABB vs Circle with generous forgiving hitbox)
    const hitRadius = cat.radius * 0.78;
    const withinPipeX =
      cat.x + hitRadius > pipe.x + 4 && cat.x - hitRadius < pipe.x + pipe.width - 4;
    if (withinPipeX) {
      const topBottom = pipe.gapY - pipe.gapHeight * 0.5;
      const bottomTop = pipe.gapY + pipe.gapHeight * 0.5;
      const hitsTop = cat.y - hitRadius < topBottom;
      const hitsBottom = cat.y + hitRadius > bottomTop;

      if (hitsTop || hitsBottom) {
        if (cat.dashTimer > 0) {
          // Purr Dash smashes through pipe edge harmlessly
          pipe.gapHeight += 40;
        } else if (cat.invulnTimer <= 0 && cat.openingGraceTimer <= 0) {
          applyPlayerDamage(sim, events, 'Menabrak cerobong atap');
          // Nudge cat toward the gap center so they can recover
          cat.vy = cat.y < pipe.gapY ? 180 : FLAP_IMPULSE * 0.85;
        }
      }
    }

    if (pipe.x + pipe.width < -120) {
      sim.pipes.splice(i, 1);
    }
  }

  // Update fish pickups (Mochi has wider magnet radius)
  const magnetRadius = sim.skin === 'mochi' ? 88 : 48;
  for (let i = sim.fishes.length - 1; i >= 0; i--) {
    const fish = sim.fishes[i];
    fish.x -= activeSpeed * dt;
    fish.phase += dt * 4.5;
    fish.y = fish.baseY + Math.sin(fish.phase) * 7;

    const dx = cat.x - fish.x;
    const dy = cat.y - fish.y;
    const dist = Math.hypot(dx, dy);

    if (!fish.collected && dist < magnetRadius) {
      // Pull toward cat
      fish.x += (dx / Math.max(1, dist)) * 320 * dt;
      fish.y += (dy / Math.max(1, dist)) * 320 * dt;
    }

    if (!fish.collected && dist < cat.radius + fish.radius + 6) {
      fish.collected = true;
      sim.fishCollected += 1;
      sim.combo += 1;
      sim.maxCombo = Math.max(sim.maxCombo, sim.combo);
      const pts = fish.isGolden ? 5 : 2;
      sim.score += pts;
      sim.bestScore = Math.max(sim.bestScore, sim.score);
      cat.dashEnergy = Math.min(100, cat.dashEnergy + (fish.isGolden ? 55 : 25));
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

  // Update enemies (3 distinct movement & telegraph policies, limited to 2 concurrent telegraphs)
  let activeTelegraphs = sim.enemies.filter((e) => e.telegraphTimer > 0).length;

  for (let i = sim.enemies.length - 1; i >= 0; i--) {
    const enemy = sim.enemies[i];

    // KO topple arc transition (0.38s) before splicing out
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

    enemy.phase += dt * 3.8;
    const distToCatX = enemy.x - cat.x;

    if (enemy.archetype === 'crow_charger') {
      // Policy 1: Line-of-Sight Charger with 0.48s crouch telegraph before horizontal burst
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
        enemy.telegraphTimer = Math.max(0, enemy.telegraphTimer - dt);
        enemy.x -= activeSpeed * 0.45 * dt;
        // Track slightly toward cat Y during windup
        enemy.y += Math.sign(cat.y - enemy.y) * 45 * dt;
        if (enemy.telegraphTimer === 0) {
          enemy.vx = -310; // fast charge burst
        }
      } else {
        enemy.x += (enemy.vx - activeSpeed) * dt;
      }
    } else if (enemy.archetype === 'balloon_weaver') {
      // Policy 2: Sinusoidal Vertical Weaver that drops an area gust after telegraphing
      enemy.x += (enemy.vx - activeSpeed * 0.85) * dt;
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
        enemy.telegraphTimer = Math.max(0, enemy.telegraphTimer - dt);
      }
    } else if (enemy.archetype === 'laser_drone') {
      // Policy 3: Hovering Kiter / Sightline Drone that locks altitude and telegraphs a laser sight
      if (distToCatX > 220 && distToCatX < 520 && !enemy.hasTriggeredAttack) {
        enemy.x -= activeSpeed * 0.35 * dt;
        enemy.y += (cat.y - enemy.y) * Math.min(1, dt * 2.5);
        if (enemy.telegraphTimer <= 0 && distToCatX < 420 && activeTelegraphs < 2) {
          enemy.telegraphTimer = enemy.telegraphMax;
          enemy.hasTriggeredAttack = true;
          activeTelegraphs += 1;
          events.enemyTelegraphStarted = true;
        }
      } else if (enemy.telegraphTimer > 0) {
        enemy.telegraphTimer = Math.max(0, enemy.telegraphTimer - dt);
        enemy.x -= activeSpeed * 0.25 * dt;
        if (enemy.telegraphTimer === 0) {
          enemy.vx = -340;
        }
      } else {
        enemy.x += (enemy.vx - activeSpeed) * dt;
      }
    }

    // Check collision with cat
    const dist = Math.hypot(cat.x - enemy.x, cat.y - enemy.y);
    if (dist < cat.radius + enemy.radius - 2) {
      if (cat.dashTimer > 0) {
        // Purr Dash knocks out enemy with hitstop + score bonus
        enemy.active = false;
        enemy.koTimer = 0.38;
        enemy.vx = 280;
        enemy.vy = -260;
        sim.score += 4;
        sim.bestScore = Math.max(sim.bestScore, sim.score);
        sim.hitstopTimer = 0.045;
        sim.cameraTrauma = Math.min(1, sim.cameraTrauma + 0.42);
        events.enemyDefeated = true;
      } else if (cat.invulnTimer <= 0 && cat.openingGraceTimer <= 0) {
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
        applyPlayerDamage(sim, events, causeLabel);
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
    // Freeze immutable end-of-run snapshot and start 0.45s KO beat
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
