import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialWorld,
  startNewRun,
  stepWorldSimulation,
  triggerPurrDash,
  spawnPipeWithFish,
  spawnEnemyHazard,
  FLAP_IMPULSE,
} from './rules';

test('startNewRun initializes playing state and spawns initial pipes and fishes', () => {
  const sim = createInitialWorld(1280, 720, 'oyen', 10);
  assert.equal(sim.state, 'title');

  startNewRun(sim, 'mochi');
  assert.equal(sim.state, 'playing');
  assert.equal(sim.skin, 'mochi');
  assert.equal(sim.cat.hp, 3);
  assert.equal(sim.pipes.length, 2);
  assert.equal(sim.fishes.length, 2);
});

test('flap input sets upward velocity and squash-and-stretch', () => {
  const sim = createInitialWorld(1280, 720, 'oyen', 0);
  startNewRun(sim, 'oyen');

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

test('opening grace autopilot keeps cat alive during first 3 seconds without input', () => {
  const sim = createInitialWorld(1280, 720, 'oyen', 0);
  startNewRun(sim, 'oyen');

  // Simulate 3 seconds (180 frames at 60fps) with zero user input
  for (let i = 0; i < 180; i++) {
    stepWorldSimulation(sim, 1 / 60, {
      flapJustPressed: false,
      flapHeld: false,
      flapJustReleased: false,
      dashJustPressed: false,
    });
  }

  assert.equal(sim.state, 'playing');
  assert.equal(sim.cat.hp, 3);
  assert.ok(sim.cat.y < sim.groundY - sim.cat.radius);
});

test('passing a pipe increments score, pipesCleared, and combo', () => {
  const sim = createInitialWorld(1280, 720, 'oyen', 0);
  startNewRun(sim, 'oyen');
  sim.pipes = [];
  sim.fishes = [];

  // Pipe width is 74 (half-width 37), so spawning at cat.x - 32 puts pipe center at cat.x + 5
  const pipe = spawnPipeWithFish(sim, sim.cat.x - 32, 0.5);
  sim.cat.y = pipe.gapY;

  const events = stepWorldSimulation(sim, 0.05, {
    flapJustPressed: false,
    flapHeld: false,
    flapJustReleased: false,
    dashJustPressed: false,
  });

  assert.equal(events.scoredPipe, true);
  assert.equal(sim.pipesCleared, 1);
  assert.ok(sim.score >= 1);
  assert.ok(sim.combo >= 1);
});

test('Purr Dash activates when energy is sufficient and knocks out enemies', () => {
  const sim = createInitialWorld(1280, 720, 'kopi', 0);
  startNewRun(sim, 'kopi');
  sim.pipes = [];
  const enemy = spawnEnemyHazard(sim, 'crow_charger', sim.cat.x + 15, sim.cat.y);

  const events = stepWorldSimulation(sim, 0.02, {
    flapJustPressed: false,
    flapHeld: false,
    flapJustReleased: false,
    dashJustPressed: true,
  });

  assert.equal(events.dashed, true);
  assert.ok(sim.cat.dashTimer > 0);
  assert.equal(events.enemyDefeated, true);
  assert.equal(enemy.active, false);
});

test('losing all 3 HP freezes RunSnapshot and transitions to gameover after KO beat', () => {
  const sim = createInitialWorld(1280, 720, 'oyen', 5);
  startNewRun(sim, 'oyen');
  sim.cat.openingGraceTimer = 0;
  sim.cat.hp = 1;
  sim.cat.invulnTimer = 0;
  sim.score = 14;

  // Put cat at ground level to trigger final damage
  sim.cat.y = sim.groundY;
  const hurtEvents = stepWorldSimulation(sim, 0.016, {
    flapJustPressed: false,
    flapHeld: false,
    flapJustReleased: false,
    dashJustPressed: false,
  });

  assert.equal(hurtEvents.playerHurt, true);
  assert.equal(sim.cat.hp, 0);
  assert.equal(sim.snapshot.score, 14);
  assert.equal(sim.snapshot.bestScore, 14);
  assert.ok(sim.koSequenceTimer > 0);

  // Advance past hitstop and KO sequence
  for (let i = 0; i < 40; i++) {
    stepWorldSimulation(sim, 0.025, {
      flapJustPressed: false,
      flapHeld: false,
      flapJustReleased: false,
      dashJustPressed: false,
    });
  }

  assert.equal(sim.state, 'gameover');
});

import { DynamicWeatherSystem, pickNextWeather, WEATHER_TYPES } from './weather';

test('DynamicWeatherSystem picks distinct random weather and cycles over time', () => {
  const next = pickNextWeather('cherry_blossoms', () => 0.1);
  assert.notEqual(next, 'cherry_blossoms');
  assert.ok(WEATHER_TYPES.includes(next));

  const weather = new DynamicWeatherSystem('cherry_blossoms', () => 0.5);
  assert.equal(weather.currentWeather, 'cherry_blossoms');
  const initialPetalY = weather.petals[0].y;

  // Step 1 second to verify cherry blossom petal movement
  weather.update(1.0, 1280, 632, 225);
  assert.notEqual(weather.petals[0].y, initialPetalY);

  // Advance past weather cycle timer (16s) to verify automatic weather transition
  for (let i = 0; i < 16; i++) {
    weather.update(1.0, 1280, 632, 225);
  }
  assert.notEqual(weather.currentWeather, 'cherry_blossoms');
  assert.equal(weather.previousWeather, 'cherry_blossoms');
  assert.ok(weather.transitionAlpha < 1);
});

import { CAT_SKINS } from './types';

test('fourth model (pirang) has idle, jump, and gethit sprites and starts with 4 HP', () => {
  assert.equal(CAT_SKINS.length, 4);
  const fourth = CAT_SKINS[3];
  assert.equal(fourth.id, 'pirang');
  assert.ok(fourth.sprites);
  assert.equal(fourth.sprites.idle, '/assets/aistudio/idle_782d11ad.png');
  assert.equal(fourth.sprites.jump, '/assets/aistudio/jump_6e4ea823.png');
  assert.equal(fourth.sprites.gethit, '/assets/aistudio/gethit_ab92eb12.png');

  const sim = createInitialWorld(1280, 720, 'pirang', 0);
  startNewRun(sim, 'pirang');
  assert.equal(sim.cat.hp, 4);
  assert.equal(sim.cat.maxHp, 4);
});


