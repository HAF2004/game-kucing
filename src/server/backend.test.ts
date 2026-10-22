import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSqliteDatabase } from './db';
import { PlayerRepository } from './playerRepository';
import { PlayerService, ServiceError } from './playerService';
import { LeaderboardService } from './leaderboardService';
import { SecurityService } from './securityService';

function createTestEnv(options: { filename?: string; seedInitialRivals?: boolean } = {}) {
  const db = createSqliteDatabase({
    filename: options.filename ?? ':memory:',
    seedInitialRivals: options.seedInitialRivals ?? false,
  });
  const repo = new PlayerRepository(db);
  const security = new SecurityService();
  const playerService = new PlayerService(repo, security);
  const leaderboardService = new LeaderboardService(repo, security);
  return { db, repo, security, playerService, leaderboardService };
}

test('Player registration creates immutable player_id and returning device retrieves same profile without duplication', () => {
  const { playerService, repo } = createTestEnv();

  const firstLaunch = playerService.registerOrRetrieveProfile({
    deviceId: 'dev_device_alpha_001',
    preferredUsername: 'CatMaster',
  });

  assert.equal(firstLaunch.isNewProfile, true);
  assert.equal(firstLaunch.profile.username, 'CatMaster');
  assert.ok(firstLaunch.profile.player_id.startsWith('plr_'));
  assert.ok(firstLaunch.authToken.startsWith('tok_'));

  // Returning launch with same device_id + authToken retrieves existing profile
  const secondLaunch = playerService.registerOrRetrieveProfile({
    deviceId: 'dev_device_alpha_001',
    authToken: firstLaunch.authToken,
  });

  assert.equal(secondLaunch.isNewProfile, false);
  assert.equal(secondLaunch.profile.player_id, firstLaunch.profile.player_id);
  assert.equal(repo.getTotalPlayerCount(), 1);
});

test('Unverified access to an existing device_id is rejected and never silently creates a replacement player', () => {
  const { playerService, repo } = createTestEnv();

  const created = playerService.registerOrRetrieveProfile({
    deviceId: 'dev_device_secure_002',
    preferredUsername: 'ShadowPaw',
  });

  // Attempting to register/retrieve the same device_id without the valid token must fail
  assert.throws(
    () => {
      playerService.registerOrRetrieveProfile({
        deviceId: 'dev_device_secure_002',
        authToken: 'tok_wrong_token_value_1234567890',
      });
    },
    (err: unknown) =>
      err instanceof ServiceError &&
      err.statusCode === 401 &&
      err.code === 'DEVICE_IDENTITY_UNVERIFIED'
  );

  // Ensure no replacement player was created
  assert.equal(repo.getTotalPlayerCount(), 1);

  // Recovery flow: if local device_id was regenerated after reinstall, presenting recoveryPlayerId + valid authToken restores profile
  const recovered = playerService.registerOrRetrieveProfile({
    deviceId: 'dev_device_reinstalled_999',
    recoveryPlayerId: created.profile.player_id,
    authToken: created.authToken,
  });

  assert.equal(recovered.recovered, true);
  assert.equal(recovered.profile.player_id, created.profile.player_id);
  assert.equal(recovered.profile.device_id, 'dev_device_reinstalled_999');
  assert.equal(repo.getTotalPlayerCount(), 1);
});

test('Username update modifies existing player_id in-place, preserves scores and rank, and prevents duplicate leaderboard rows', () => {
  const { playerService, leaderboardService, repo } = createTestEnv();

  const reg = playerService.registerOrRetrieveProfile({
    deviceId: 'dev_catmaster_001',
    preferredUsername: 'CatMaster',
  });

  // Submit a valid score
  leaderboardService.submitScore({
    playerId: reg.profile.player_id,
    authToken: reg.authToken,
    payload: {
      idempotencyKey: 'run_key_catmaster_1',
      score: 48,
      fishCollected: 6,
      pipesCleared: 8,
      durationMs: 18000,
    },
  });

  // Change username from CatMaster -> NightCat
  const updated = playerService.updateUsername({
    playerId: reg.profile.player_id,
    authToken: reg.authToken,
    newUsername: 'NightCat',
  });

  assert.equal(updated.player_id, reg.profile.player_id);
  assert.equal(updated.username, 'NightCat');
  assert.equal(updated.best_score, 48);
  assert.equal(updated.total_fish_collected, 6);
  assert.equal(updated.total_pipes_cleared, 8);

  // Verify leaderboard has exactly 1 entry with updated username and unchanged player_id & score
  const board = leaderboardService.getLeaderboard({
    limit: 10,
    offset: 0,
    currentPlayerId: reg.profile.player_id,
  });
  assert.equal(board.totalPlayers, 1);
  assert.equal(board.entries.length, 1);
  assert.equal(board.entries[0].player_id, reg.profile.player_id);
  assert.equal(board.entries[0].username, 'NightCat');
  assert.equal(board.entries[0].best_score, 48);
  assert.equal(repo.getTotalPlayerCount(), 1);
});

test('Leaderboard sorts by best_score DESC with deterministic tie-breaking and idempotent score submissions', () => {
  const { playerService, leaderboardService } = createTestEnv();

  const p1 = playerService.registerOrRetrieveProfile({
    deviceId: 'dev_tie_player_1',
    preferredUsername: 'AlphaCat',
  });
  const p2 = playerService.registerOrRetrieveProfile({
    deviceId: 'dev_tie_player_2',
    preferredUsername: 'BetaCat',
  });

  // Both score 30, but BetaCat clears more pipes (10 vs 6) -> BetaCat ranks #1, AlphaCat ranks #2
  leaderboardService.submitScore({
    playerId: p1.profile.player_id,
    authToken: p1.authToken,
    payload: {
      idempotencyKey: 'run_alpha_001',
      score: 30,
      fishCollected: 4,
      pipesCleared: 6,
      durationMs: 15000,
    },
  });

  const sub2 = leaderboardService.submitScore({
    playerId: p2.profile.player_id,
    authToken: p2.authToken,
    payload: {
      idempotencyKey: 'run_beta_001',
      score: 30,
      fishCollected: 4,
      pipesCleared: 10,
      durationMs: 18000,
    },
  });
  assert.equal(sub2.idempotentReplay, false);

  // Replay the exact same submission for BetaCat -> must be idempotent and NOT double-count total_score or pipes
  const replaySub2 = leaderboardService.submitScore({
    playerId: p2.profile.player_id,
    authToken: p2.authToken,
    payload: {
      idempotencyKey: 'run_beta_001',
      score: 30,
      fishCollected: 4,
      pipesCleared: 10,
      durationMs: 18000,
    },
  });
  assert.equal(replaySub2.idempotentReplay, true);
  assert.equal(replaySub2.profile.total_score, 30);
  assert.equal(replaySub2.profile.total_pipes_cleared, 10);

  const board = leaderboardService.getLeaderboard({ limit: 10, offset: 0 });
  assert.equal(board.entries[0].username, 'BetaCat');
  assert.equal(board.entries[0].rank, 1);
  assert.equal(board.entries[1].username, 'AlphaCat');
  assert.equal(board.entries[1].rank, 2);
});

test('Security & Anti-Cheat: rejects SQL injection, cross-player tampering, impossible scores, and enforces rate limits', () => {
  const { playerService, leaderboardService, repo, security } = createTestEnv();

  const alice = playerService.registerOrRetrieveProfile({
    deviceId: 'dev_alice_secure_01',
    preferredUsername: 'AliceCat',
  });
  const mallory = playerService.registerOrRetrieveProfile({
    deviceId: 'dev_mallory_secure_02',
    preferredUsername: 'MalloryCat',
  });

  // 1. SQL injection attempt in username update is rejected
  assert.throws(
    () => {
      playerService.updateUsername({
        playerId: mallory.profile.player_id,
        authToken: mallory.authToken,
        newUsername: "admin'; DROP TABLE players;--",
      });
    },
    (err: unknown) => err instanceof ServiceError && err.statusCode === 400
  );

  // 2. Unauthorized cross-player username modification (Mallory tries to rename Alice)
  assert.throws(
    () => {
      playerService.updateUsername({
        playerId: alice.profile.player_id,
        authToken: mallory.authToken,
        newUsername: 'HackedAlice',
      });
    },
    (err: unknown) =>
      err instanceof ServiceError && err.statusCode === 403 && err.code === 'UNAUTHORIZED'
  );

  // 3. Unauthorized cross-player score submission (Mallory tries to submit score for Alice)
  assert.throws(
    () => {
      leaderboardService.submitScore({
        playerId: alice.profile.player_id,
        authToken: mallory.authToken,
        payload: {
          idempotencyKey: 'run_spoof_alice_01',
          score: 10,
          fishCollected: 2,
          pipesCleared: 2,
          durationMs: 5000,
        },
      });
    },
    (err: unknown) =>
      err instanceof ServiceError && err.statusCode === 403 && err.code === 'UNAUTHORIZED'
  );

  // 4. Impossible score injection (e.g. score 99999 in 2 seconds with 1 pipe)
  assert.throws(
    () => {
      leaderboardService.submitScore({
        playerId: mallory.profile.player_id,
        authToken: mallory.authToken,
        payload: {
          idempotencyKey: 'run_impossible_99999',
          score: 99999,
          fishCollected: 1,
          pipesCleared: 1,
          durationMs: 2000,
        },
      });
    },
    (err: unknown) =>
      err instanceof ServiceError && err.statusCode === 422 && err.code === 'IMPLAUSIBLE_SCORE'
  );

  // 5. Negative score rejection
  assert.throws(
    () => {
      leaderboardService.submitScore({
        playerId: mallory.profile.player_id,
        authToken: mallory.authToken,
        payload: {
          idempotencyKey: 'run_negative_score',
          score: -50,
          fishCollected: 1,
          pipesCleared: 1,
          durationMs: 4000,
        },
      });
    },
    (err: unknown) =>
      err instanceof ServiceError && err.statusCode === 422 && err.code === 'NEGATIVE_STATS'
  );

  // 6. Rate limiting & progressive backoff enforcement
  for (let i = 0; i < 3; i++) {
    const res = security.checkRateLimit('test_endpoint', 'subj_1', {
      windowMs: 60_000,
      maxRequests: 3,
      baseBackoffMs: 1_000,
    });
    assert.equal(res.allowed, true);
  }
  const blocked = security.checkRateLimit('test_endpoint', 'subj_1', {
    windowMs: 60_000,
    maxRequests: 3,
    baseBackoffMs: 1_000,
  });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs >= 1000);

  // Security events were logged in SQLite
  const events = repo.getSecurityEvents(20);
  assert.ok(events.length >= 4);
});

test('SQLite transaction rollback on failure and persistence across database restarts on disk', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kucing-sqlite-test-'));
  const dbPath = path.join(tmpDir, 'test.sqlite');

  try {
    // 1. Open DB, register player, test transaction rollback
    const env1 = createTestEnv({ filename: dbPath, seedInitialRivals: false });
    const reg = env1.playerService.registerOrRetrieveProfile({
      deviceId: 'dev_persist_disk_01',
      preferredUsername: 'DiskCat',
    });

    // Attempt a transaction that throws mid-way -> must roll back completely
    assert.throws(() => {
      env1.repo.runInTransaction(() => {
        env1.repo.updateUsername({
          player_id: reg.profile.player_id,
          username: 'TempName',
          normalized_username: 'tempname',
          nowIso: new Date().toISOString(),
        });
        throw new Error('Simulated mid-transaction failure');
      });
    });

    // Verify rollback preserved 'DiskCat'
    assert.equal(env1.repo.findByPlayerId(reg.profile.player_id)?.username, 'DiskCat');
    env1.db.close();

    // 2. Reopen SQLite file from disk -> verify player record persisted across restart
    const env2 = createTestEnv({ filename: dbPath, seedInitialRivals: false });
    const retrieved = env2.playerService.registerOrRetrieveProfile({
      deviceId: 'dev_persist_disk_01',
      authToken: reg.authToken,
    });
    assert.equal(retrieved.isNewProfile, false);
    assert.equal(retrieved.profile.player_id, reg.profile.player_id);
    assert.equal(retrieved.profile.username, 'DiskCat');
    env2.db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
