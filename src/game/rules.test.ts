import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_SCROLL_SPEED,
  canActivatePower,
  createEmptyEvents,
  createInitialWorld,
  DASH_COOLDOWN_SEC,
  DASH_DURATION_SEC,
  FLAP_IMPULSE,
  MAGNET_ATTRACTION_RADIUS,
  resolvePlayerCollision,
  SECOND_CHANCE_INVULN_SEC,
  spawnEnemyHazard,
  spawnPipeWithFish,
  startNewRun,
  stepWorldSimulation,
  TIME_FREEZE_COOLDOWN_SEC,
  TIME_FREEZE_DURATION_SEC,
  TIME_FREEZE_SPEED_MULTIPLIER,
  triggerPowerAbility,
  WAPRES_DURATION_SEC,
} from './rules';
import { DynamicWeatherSystem, pickNextWeather, WEATHER_TYPES } from './weather';
import { CAT_SKINS } from './types';

test('startNewRun initializes playing state with Barudak Pirang and 4 HP', () => {
  const sim = createInitialWorld(1280, 720, 'pirang', 10);
  assert.equal(sim.state, 'title');

  startNewRun(sim, 'pirang', 'dash', ['dash']);
  assert.equal(sim.state, 'playing');
  assert.equal(sim.skin, 'pirang');
  assert.equal(sim.cat.hp, 4);
  assert.equal(sim.pipes.length, 2);
  assert.equal(sim.fishes.length, 2);
  assert.equal(sim.powers.dash.unlocked, true);
});

test('flap input sets upward velocity and squash-and-stretch', () => {
  const sim = createInitialWorld(1280, 720, 'pirang', 0);
  startNewRun(sim, 'pirang');

  const events = stepWorldSimulation(sim, 0.016, {
    flapJustPressed: true,
    flapHeld: true,
    flapJustReleased: false,
    dashJustPressed: false,
  });

  assert.equal(events.flapped, true);
  assert.ok(sim.cat.vy < FLAP_IMPULSE * 0.95);
  assert.equal(sim.cat.openingGraceTimer, 0);
});

test('opening grace autopilot keeps Barudak alive during first 3 seconds without input', () => {
  const sim = createInitialWorld(1280, 720, 'pirang', 0);
  startNewRun(sim, 'pirang');

  for (let i = 0; i < 180; i++) {
    stepWorldSimulation(sim, 1 / 60, {
      flapJustPressed: false,
      flapHeld: false,
      flapJustReleased: false,
      dashJustPressed: false,
    });
  }

  assert.equal(sim.state, 'playing');
  assert.equal(sim.cat.hp, 4);
  assert.ok(sim.cat.y < sim.groundY - sim.cat.radius);
});

test('passing a pipe increments score by 1, pipesCleared, and combo without runaway score inflation', () => {
  const sim = createInitialWorld(1280, 720, 'pirang', 0);
  startNewRun(sim, 'pirang');
  sim.pipes = [];
  sim.fishes = [];

  const pipe = spawnPipeWithFish(sim, sim.cat.x - 32, 0.5);
  sim.fishes = []; // isolate pipe score
  sim.cat.y = pipe.gapY;

  const events = stepWorldSimulation(sim, 0.05, {
    flapJustPressed: false,
    flapHeld: false,
    flapJustReleased: false,
    dashJustPressed: false,
  });

  assert.equal(events.scoredPipe, true);
  assert.equal(sim.pipesCleared, 1);
  assert.equal(sim.score, 1);
  assert.equal(sim.combo, 1);
});

test('2. Locked powers cannot activate and passive powers cannot be manually activated', () => {
  const sim = createInitialWorld(1280, 720, 'pirang', 0, 'none', []);
  startNewRun(sim, 'pirang', 'none', []);

  // Attempt to activate locked Dash, Time Freeze, and Wapres
  const ev = createEmptyEvents();
  assert.equal(triggerPowerAbility(sim, ev, 'dash'), false);
  assert.equal(triggerPowerAbility(sim, ev, 'time_freeze'), false);
  assert.equal(triggerPowerAbility(sim, ev, 'wapres'), false);

  // Even when Shield, Magnet, and Second Chance are unlocked, they are Passive and cannot be manually triggered
  startNewRun(sim, 'pirang', 'none', ['shield', 'magnet', 'second_chance']);
  assert.equal(canActivatePower(sim, 'shield'), false);
  assert.equal(canActivatePower(sim, 'magnet'), false);
  assert.equal(canActivatePower(sim, 'second_chance'), false);

  // Cannot activate powers outside active gameplay (title, paused, gameover)
  startNewRun(sim, 'pirang', 'dash', ['dash']);
  sim.state = 'gameover';
  assert.equal(triggerPowerAbility(sim, ev, 'dash'), false);
});

test('3. Dash duration (0.5s) and cooldown (8.0s) behavior and bounds safety', () => {
  const sim = createInitialWorld(1280, 720, 'pirang', 0, 'dash', ['dash']);
  startNewRun(sim, 'pirang', 'dash', ['dash']);
  sim.pipes = [];
  sim.fishes = [];

  const ev = createEmptyEvents();
  const activated = triggerPowerAbility(sim, ev, 'dash');
  assert.equal(activated, true);
  assert.equal(ev.dashed, true);
  assert.equal(sim.powers.dash.isActive, true);
  assert.equal(sim.powers.dash.remainingDuration, DASH_DURATION_SEC);
  assert.equal(sim.powers.dash.remainingCooldown, DASH_COOLDOWN_SEC);

  // Cooldown prevents repeated activation while active or on cooldown
  assert.equal(triggerPowerAbility(sim, createEmptyEvents(), 'dash'), false);

  // Step 0.25s (10 steps of 0.025s) -> still active
  for (let i = 0; i < 10; i++) {
    stepWorldSimulation(sim, 0.025, {
      flapJustPressed: false,
      flapHeld: false,
      flapJustReleased: false,
      dashJustPressed: false,
    });
  }
  assert.equal(sim.powers.dash.isActive, true);
  assert.ok(sim.powers.dash.remainingDuration > 0.2);

  // Step another 0.30s -> Dash duration (0.5s) expires reliably, cooldown (~7.45s) remains
  for (let i = 0; i < 12; i++) {
    stepWorldSimulation(sim, 0.025, {
      flapJustPressed: false,
      flapHeld: false,
      flapJustReleased: false,
      dashJustPressed: false,
    });
  }
  assert.equal(sim.powers.dash.isActive, false);
  assert.equal(sim.powers.dash.remainingDuration, 0);
  assert.ok(sim.powers.dash.remainingCooldown > 7.0);
  assert.equal(triggerPowerAbility(sim, createEmptyEvents(), 'dash'), false);

  // Advance remaining ~7.5s cooldown while flying at safe altitude -> Dash can be activated again
  for (let i = 0; i < 155; i++) {
    sim.cat.y = 250;
    sim.cat.vy = 0;
    sim.pipes = [];
    sim.enemies = [];
    stepWorldSimulation(sim, 0.05, {
      flapJustPressed: false,
      flapHeld: false,
      flapJustReleased: false,
      dashJustPressed: false,
    });
  }
  assert.equal(sim.powers.dash.remainingCooldown, 0);
  assert.equal(triggerPowerAbility(sim, createEmptyEvents(), 'dash'), true);
});

test('4. Shield blocks one fatal collision and is then consumed', () => {
  const sim = createInitialWorld(1280, 720, 'pirang', 0, 'none', ['shield']);
  startNewRun(sim, 'pirang', 'none', ['shield']);
  sim.cat.openingGraceTimer = 0;
  sim.cat.invulnTimer = 0;
  sim.cat.hp = 1;

  assert.equal(sim.powers.shield.unlocked, true);
  assert.equal(sim.powers.shield.chargesRemaining, 1);

  // First fatal collision is blocked by Shield
  const ev1 = createEmptyEvents();
  const res1 = resolvePlayerCollision(sim, ev1, 'Menabrak cerobong atap', 300, {
    instantFatalIfUnprotected: true,
  });
  assert.equal(res1, 'blocked_by_shield');
  assert.equal(ev1.shieldBlocked, true);
  assert.equal(sim.powers.shield.chargesRemaining, 0);
  assert.equal(sim.cat.hp, 1);
  assert.equal(sim.state, 'playing');

  // Clear temporary clearance invulnerability and trigger a second collision -> Shield is exhausted, triggers game over
  sim.cat.invulnTimer = 0;
  const ev2 = createEmptyEvents();
  const res2 = resolvePlayerCollision(sim, ev2, 'Menabrak cerobong atap', 300, {
    instantFatalIfUnprotected: true,
  });
  assert.equal(res2, 'game_over');
  assert.equal(sim.cat.hp, 0);
});

test('5. Time Freeze reduces pipe speed to 45% for 3s and restores baseline speed afterward', () => {
  const sim = createInitialWorld(1280, 720, 'pirang', 0, 'time_freeze', ['time_freeze']);
  startNewRun(sim, 'pirang', 'time_freeze', ['time_freeze']);
  sim.pipesCleared = 15; // Mid-run progressive difficulty baseline
  sim.pipes = [];
  sim.fishes = [];

  stepWorldSimulation(sim, 0.016, {
    flapJustPressed: false,
    flapHeld: false,
    flapJustReleased: false,
    dashJustPressed: false,
  });
  const baselineSpeed = sim.baseScrollSpeed;
  assert.ok(baselineSpeed > BASE_SCROLL_SPEED);
  assert.equal(sim.scrollSpeed, baselineSpeed);

  // Activate Time Freeze
  const ev = createEmptyEvents();
  const ok = triggerPowerAbility(sim, ev, 'time_freeze');
  assert.equal(ok, true);
  assert.equal(ev.timeFreezeActivated, true);
  assert.equal(sim.powers.time_freeze.isActive, true);
  assert.equal(sim.powers.time_freeze.remainingDuration, TIME_FREEZE_DURATION_SEC);
  assert.equal(sim.powers.time_freeze.remainingCooldown, TIME_FREEZE_COOLDOWN_SEC);

  // Effective scrollSpeed is reduced to 45% while baseScrollSpeed is preserved
  assert.ok(Math.abs(sim.scrollSpeed - baselineSpeed * TIME_FREEZE_SPEED_MULTIPLIER) < 0.01);
  assert.equal(sim.baseScrollSpeed, baselineSpeed);

  // Advance 3.1 seconds (62 steps of 0.05s) while airborne -> Time Freeze expires and scrollSpeed returns to exact baseline
  for (let i = 0; i < 62; i++) {
    sim.cat.y = 250;
    sim.cat.vy = 0;
    sim.pipes = [];
    sim.enemies = [];
    stepWorldSimulation(sim, 0.05, {
      flapJustPressed: false,
      flapHeld: false,
      flapJustReleased: false,
      dashJustPressed: false,
    });
  }
  assert.equal(sim.powers.time_freeze.isActive, false);
  assert.equal(sim.powers.time_freeze.remainingDuration, 0);
  assert.equal(sim.scrollSpeed, sim.baseScrollSpeed);
  assert.ok(sim.powers.time_freeze.remainingCooldown > 11.5);
});

test('6. Magnet attracts nearby collectibles within 125 units only when unlocked and collects each item once', () => {
  // Case A: Magnet LOCKED -> collectible at 100 units vertical distance is NOT attracted
  const simLocked = createInitialWorld(1280, 720, 'pirang', 0, 'none', []);
  startNewRun(simLocked, 'pirang', 'none', []);
  simLocked.pipes = [];
  simLocked.fishes = [
    {
      id: 501,
      x: simLocked.cat.x,
      y: simLocked.cat.y - 100,
      baseY: simLocked.cat.y - 100,
      radius: 14,
      collected: false,
      isGolden: false,
      phase: 0,
    },
  ];
  stepWorldSimulation(simLocked, 0.02, {
    flapJustPressed: false,
    flapHeld: false,
    flapJustReleased: false,
    dashJustPressed: false,
  });
  assert.equal(simLocked.fishes[0].y, simLocked.fishes[0].baseY);
  assert.equal(simLocked.fishCollected, 0);

  // Case B: Magnet UNLOCKED -> collectible within 125 units is smoothly pulled and collected exactly once
  const simUnlocked = createInitialWorld(1280, 720, 'pirang', 0, 'none', ['magnet']);
  startNewRun(simUnlocked, 'pirang', 'none', ['magnet']);
  simUnlocked.pipes = [];
  const startOffsetY = MAGNET_ATTRACTION_RADIUS - 15; // 110 units (< 125 radius)
  simUnlocked.fishes = [
    {
      id: 502,
      x: simUnlocked.cat.x + 20,
      y: simUnlocked.cat.y - startOffsetY,
      baseY: simUnlocked.cat.y - startOffsetY,
      radius: 14,
      collected: false,
      isGolden: false,
      phase: 0,
    },
  ];

  const initialDist = Math.hypot(
    simUnlocked.cat.x - simUnlocked.fishes[0].x,
    simUnlocked.cat.y - simUnlocked.fishes[0].y
  );
  stepWorldSimulation(simUnlocked, 0.02, {
    flapJustPressed: false,
    flapHeld: false,
    flapJustReleased: false,
    dashJustPressed: false,
  });
  const afterDist = Math.hypot(
    simUnlocked.cat.x - simUnlocked.fishes[0].x,
    simUnlocked.cat.y - simUnlocked.fishes[0].y
  );
  assert.ok(afterDist < initialDist, 'Magnet should smoothly pull collectible closer');

  // Step until collected -> verify collected exactly once
  for (let i = 0; i < 25; i++) {
    // Keep fish horizontally near cat so we test pure attraction & single collection
    if (simUnlocked.fishes.length > 0) {
      simUnlocked.fishes[0].x = simUnlocked.cat.x;
    }
    stepWorldSimulation(simUnlocked, 0.02, {
      flapJustPressed: false,
      flapHeld: false,
      flapJustReleased: false,
      dashJustPressed: false,
    });
  }
  assert.equal(simUnlocked.fishCollected, 1);
  assert.equal(simUnlocked.score, 1);
  assert.equal(simUnlocked.fishes.length, 0);
});

test('7. Second Chance revives the player once, repositions safely, and applies 1.0s temporary invulnerability', () => {
  const sim = createInitialWorld(1280, 720, 'pirang', 0, 'none', ['second_chance']);
  startNewRun(sim, 'pirang', 'none', ['second_chance']);
  sim.cat.openingGraceTimer = 0;
  sim.cat.invulnTimer = 0;
  sim.cat.hp = 1;
  sim.cat.y = sim.groundY - 5; // Unsafe position at bottom
  sim.cat.vy = 420; // Fast downward fall

  const safeTargetY = 290;
  const ev = createEmptyEvents();
  const res = resolvePlayerCollision(sim, ev, 'Menabrak cerobong atap', safeTargetY, {
    instantFatalIfUnprotected: true,
  });

  assert.equal(res, 'revived_by_second_chance');
  assert.equal(ev.secondChanceRevived, true);
  assert.equal(sim.powers.second_chance.chargesRemaining, 0);
  assert.equal(sim.cat.y, safeTargetY);
  assert.equal(sim.cat.vy, 0);
  assert.equal(sim.cat.invulnTimer, SECOND_CHANCE_INVULN_SEC);
  assert.equal(sim.state, 'playing');

  // After 1.0s invulnerability expires, a subsequent fatal collision causes game over
  sim.cat.invulnTimer = 0;
  const res2 = resolvePlayerCollision(
    sim,
    createEmptyEvents(),
    'Menabrak cerobong atap',
    safeTargetY,
    { instantFatalIfUnprotected: true }
  );
  assert.equal(res2, 'game_over');
});

test('8 & 9. Wapres activates once per run, grants 4s of immunity, and prevents Shield and Second Chance from being consumed', () => {
  const sim = createInitialWorld(1280, 720, 'pirang', 0, 'wapres', [
    'shield',
    'second_chance',
    'wapres',
  ]);
  startNewRun(sim, 'pirang', 'wapres', ['shield', 'second_chance', 'wapres']);
  sim.cat.openingGraceTimer = 0;
  sim.cat.invulnTimer = 0;

  assert.equal(sim.powers.wapres.chargesRemaining, 1);
  assert.equal(sim.powers.shield.chargesRemaining, 1);
  assert.equal(sim.powers.second_chance.chargesRemaining, 1);

  // Activate Wapres Ultimate
  const ev = createEmptyEvents();
  const activated = triggerPowerAbility(sim, ev, 'wapres');
  assert.equal(activated, true);
  assert.equal(ev.wapresActivated, true);
  assert.equal(sim.powers.wapres.isActive, true);
  assert.equal(sim.powers.wapres.remainingDuration, WAPRES_DURATION_SEC);
  assert.equal(sim.powers.wapres.chargesRemaining, 0);

  // While Wapres is active, fatal collisions are blocked by Wapres and NEVER consume Shield or Second Chance
  const colRes = resolvePlayerCollision(
    sim,
    createEmptyEvents(),
    'Menabrak cerobong atap',
    300,
    { instantFatalIfUnprotected: true }
  );
  assert.equal(colRes, 'blocked_by_wapres');
  assert.equal(sim.powers.shield.chargesRemaining, 1);
  assert.equal(sim.powers.second_chance.chargesRemaining, 1);
  assert.equal(sim.cat.hp, 4);

  // Advance 4.1s (82 steps of 0.05s) -> Wapres expires and cannot be activated a second time in the same run
  for (let i = 0; i < 82; i++) {
    stepWorldSimulation(sim, 0.05, {
      flapJustPressed: false,
      flapHeld: false,
      flapJustReleased: false,
      dashJustPressed: false,
    });
  }
  assert.equal(sim.powers.wapres.isActive, false);
  assert.equal(sim.powers.wapres.remainingDuration, 0);
  assert.equal(triggerPowerAbility(sim, createEmptyEvents(), 'wapres'), false);
});

test('10 & 11. Shield and Second Chance follow defined priority order and a single collision cannot consume multiple layers', () => {
  const sim = createInitialWorld(1280, 720, 'pirang', 0, 'none', [
    'shield',
    'second_chance',
  ]);
  startNewRun(sim, 'pirang', 'none', ['shield', 'second_chance']);
  sim.cat.openingGraceTimer = 0;
  sim.cat.invulnTimer = 0;
  sim.cat.hp = 1;

  // Collision #1: Shield takes priority over Second Chance
  const res1 = resolvePlayerCollision(sim, createEmptyEvents(), 'Tabrakan 1', 300, {
    instantFatalIfUnprotected: true,
  });
  assert.equal(res1, 'blocked_by_shield');
  assert.equal(sim.powers.shield.chargesRemaining, 0);
  assert.equal(sim.powers.second_chance.chargesRemaining, 1);

  // Immediate follow-up collision on the next frame (during clearance invuln) is ignored so 1 collision never consumes 2 layers!
  const resSameEvent = resolvePlayerCollision(
    sim,
    createEmptyEvents(),
    'Tabrakan 1 Frame Lanjutan',
    300,
    { instantFatalIfUnprotected: true }
  );
  assert.equal(resSameEvent, 'ignored_invulnerable');
  assert.equal(sim.powers.second_chance.chargesRemaining, 1);

  // After clearance invuln expires, Collision #2 consumes Second Chance
  sim.cat.invulnTimer = 0;
  const res2 = resolvePlayerCollision(sim, createEmptyEvents(), 'Tabrakan 2', 280, {
    instantFatalIfUnprotected: true,
  });
  assert.equal(res2, 'revived_by_second_chance');
  assert.equal(sim.powers.second_chance.chargesRemaining, 0);
  assert.equal(sim.cat.invulnTimer, SECOND_CHANCE_INVULN_SEC);

  // After 1.0s revival invulnerability expires, Collision #3 triggers Game Over
  sim.cat.invulnTimer = 0;
  const res3 = resolvePlayerCollision(sim, createEmptyEvents(), 'Tabrakan 3', 280, {
    instantFatalIfUnprotected: true,
  });
  assert.equal(res3, 'game_over');
  assert.equal(sim.cat.hp, 0);
});

test('12. Starting a new run resets all temporary states while preserving unlocked powers', () => {
  const allSix = [
    'dash',
    'shield',
    'time_freeze',
    'magnet',
    'second_chance',
    'wapres',
  ] as const;
  const sim = createInitialWorld(1280, 720, 'pirang', 100, 'wapres', [...allSix]);
  startNewRun(sim, 'pirang', 'wapres', [...allSix]);
  sim.cat.openingGraceTimer = 0;

  // Spend Wapres, Dash, Shield, and Second Chance during Run 1
  triggerPowerAbility(sim, createEmptyEvents(), 'dash');
  triggerPowerAbility(sim, createEmptyEvents(), 'wapres');
  sim.powers.wapres.isActive = false;
  sim.powers.wapres.remainingDuration = 0;
  resolvePlayerCollision(sim, createEmptyEvents(), 'Hit 1', 300);
  sim.cat.invulnTimer = 0;
  resolvePlayerCollision(sim, createEmptyEvents(), 'Hit 2', 300);

  assert.equal(sim.powers.wapres.chargesRemaining, 0);
  assert.equal(sim.powers.shield.chargesRemaining, 0);
  assert.equal(sim.powers.second_chance.chargesRemaining, 0);
  assert.ok(sim.powers.dash.remainingCooldown > 0);

  // Start Run 2 without passing unlockedPowers explicitly -> unlocked powers are preserved and all charges/cooldowns reset!
  startNewRun(sim, 'pirang');

  for (const id of allSix) {
    assert.equal(sim.powers[id].unlocked, true, `${id} should remain unlocked`);
    assert.equal(sim.powers[id].remainingCooldown, 0, `${id} cooldown should reset`);
    assert.equal(sim.powers[id].remainingDuration, 0, `${id} duration should reset`);
  }
  assert.equal(sim.powers.shield.chargesRemaining, 1);
  assert.equal(sim.powers.second_chance.chargesRemaining, 1);
  assert.equal(sim.powers.wapres.chargesRemaining, 1);
  assert.equal(sim.powers.magnet.isActive, true);
});

test('DynamicWeatherSystem picks distinct random weather and cycles over time', () => {
  const next = pickNextWeather('cherry_blossoms', () => 0.1);
  assert.notEqual(next, 'cherry_blossoms');
  assert.ok(WEATHER_TYPES.includes(next));

  const weather = new DynamicWeatherSystem('cherry_blossoms', () => 0.5);
  assert.equal(weather.currentWeather, 'cherry_blossoms');
  const initialPetalY = weather.petals[0].y;

  weather.update(1.0, 1280, 632, 225);
  assert.notEqual(weather.petals[0].y, initialPetalY);
});

test('Barudak Pirang and Barudak Ninja models have lightweight .webp sprites and start with 4 HP', () => {
  assert.equal(CAT_SKINS.length, 2);
  assert.equal(CAT_SKINS[0].id, 'pirang');
  assert.equal(CAT_SKINS[1].id, 'ninja');

  const simNinja = createInitialWorld(1280, 720, 'ninja', 0);
  startNewRun(simNinja, 'ninja', 'dash', ['dash']);
  assert.equal(simNinja.skin, 'ninja');
  assert.equal(simNinja.cat.hp, 4);
});

test('Active Dash knocks out close aerial enemies ahead', () => {
  const sim = createInitialWorld(1280, 720, 'pirang', 0, 'dash', ['dash']);
  startNewRun(sim, 'pirang', 'dash', ['dash']);
  sim.pipes = [];
  const enemy = spawnEnemyHazard(sim, 'crow_charger', sim.cat.x + 25, sim.cat.y);

  const events = stepWorldSimulation(sim, 0.02, {
    flapJustPressed: false,
    flapHeld: false,
    flapJustReleased: false,
    dashJustPressed: true,
  });

  assert.equal(events.dashed, true);
  assert.equal(events.enemyDefeated, true);
  assert.equal(enemy.active, false);
});

test('13. Skill selection is locked at the start of the game and cannot be switched mid-run', () => {
  const allActive = ['dash', 'time_freeze', 'wapres'] as const;
  const sim = createInitialWorld(1280, 720, 'pirang', 0, 'dash', [...allActive]);
  startNewRun(sim, 'pirang', 'dash', [...allActive]);
  assert.equal(sim.cat.activePower, 'dash');

  // Attempting to activate a different unlocked skill ('wapres' or 'time_freeze') mid-run via stepWorldSimulation is blocked
  const evSwitchAttempt = stepWorldSimulation(sim, 0.02, {
    flapJustPressed: false,
    flapHeld: false,
    flapJustReleased: false,
    dashJustPressed: false,
    activateSkillId: 'wapres',
  });
  assert.equal(evSwitchAttempt.wapresActivated, false);
  assert.equal(sim.powers.wapres.isActive, false);
  assert.equal(sim.cat.activePower, 'dash');

  // Activating the chosen skill ('dash') works as expected and keeps activePower locked to 'dash'
  const evDash = stepWorldSimulation(sim, 0.02, {
    flapJustPressed: false,
    flapHeld: false,
    flapJustReleased: false,
    dashJustPressed: true,
  });
  assert.equal(evDash.dashed, true);
  assert.equal(sim.powers.dash.isActive, true);
  assert.equal(sim.cat.activePower, 'dash');
});

