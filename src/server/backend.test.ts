import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createDatabase, runMigrations, seedNpcLeaderboardEntries } from './db.js';
import { PlayerRepository } from './playerRepository.js';
import { PlayerService, ServiceError } from './playerService.js';
import { LeaderboardService } from './leaderboardService.js';
import { SecurityService } from './securityService.js';

async function createTestEnv(options: { filename?: string; seedInitialRivals?: boolean } = {}) {
  const db = await createDatabase({
    filename: options.filename ?? ':memory:',
    runMigrations: true,
    seedInitialRivals: options.seedInitialRivals ?? false,
  });
  const repo = new PlayerRepository(db);
  const security = new SecurityService();
  return {
    db,
    repo,
    security,
    playerService: new PlayerService(repo, security),
    leaderboardService: new LeaderboardService(repo, security),
  };
}

test('registration and recovery retain one authenticated player identity', async (t) => {
  const env = await createTestEnv();
  t.after(() => env.db.close());
  const first = await env.playerService.registerOrRetrieveProfile({
    deviceId: 'dev_device_alpha_001',
    preferredUsername: 'CatMaster',
  });
  assert.equal(first.isNewProfile, true);
  assert.equal(first.profile.username, 'CatMaster');
  assert.ok(first.profile.player_id.startsWith('plr_'));
  assert.ok(first.authToken.startsWith('tok_'));

  const returning = await env.playerService.registerOrRetrieveProfile({
    deviceId: 'dev_device_alpha_001',
    authToken: first.authToken,
  });
  assert.equal(returning.isNewProfile, false);
  assert.equal(returning.profile.player_id, first.profile.player_id);
  assert.equal(await env.repo.getTotalPlayerCount(), 1);

  await assert.rejects(
    env.playerService.registerOrRetrieveProfile({
      deviceId: 'dev_device_alpha_001',
      authToken: 'tok_wrong_token_value_1234567890',
    }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 401
  );
  const recovered = await env.playerService.registerOrRetrieveProfile({
    deviceId: 'dev_device_reinstalled_999',
    recoveryPlayerId: first.profile.player_id,
    authToken: first.authToken,
  });
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.profile.player_id, first.profile.player_id);
  assert.equal(recovered.profile.device_id, 'dev_device_reinstalled_999');
  assert.equal(await env.repo.getTotalPlayerCount(), 1);
});

test('username updates preserve player, score, and rank while enforcing uniqueness', async (t) => {
  const env = await createTestEnv();
  t.after(() => env.db.close());
  const first = await env.playerService.registerOrRetrieveProfile({
    deviceId: 'dev_catmaster_001', preferredUsername: 'CatMaster',
  });
  const second = await env.playerService.registerOrRetrieveProfile({
    deviceId: 'dev_second_cat_02', preferredUsername: 'SecondCat',
  });
  await env.leaderboardService.submitScore({
    playerId: first.profile.player_id,
    authToken: first.authToken,
    payload: { idempotencyKey: 'run_key_catmaster_1', score: 48, fishCollected: 6, pipesCleared: 8, durationMs: 18000 },
  });
  const updated = await env.playerService.updateUsername({
    playerId: first.profile.player_id, authToken: first.authToken, newUsername: 'NightCat',
  });
  assert.equal(updated.player_id, first.profile.player_id);
  assert.equal(updated.username, 'NightCat');
  assert.equal(updated.best_score, 48);
  await assert.rejects(
    env.playerService.updateUsername({
      playerId: first.profile.player_id, authToken: first.authToken, newUsername: second.profile.username,
    }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 409
  );
  const board = await env.leaderboardService.getLeaderboard({ limit: 10, offset: 0, currentPlayerId: first.profile.player_id });
  assert.equal(board.totalPlayers, 2);
  assert.equal(board.entries.filter((entry) => entry.player_id === first.profile.player_id).length, 1);
  assert.equal(board.entries.find((entry) => entry.player_id === first.profile.player_id)?.username, 'NightCat');
});

test('leaderboard ranking and repeated score submission are deterministic and idempotent', async (t) => {
  const env = await createTestEnv();
  t.after(() => env.db.close());
  const alpha = await env.playerService.registerOrRetrieveProfile({ deviceId: 'dev_tie_player_1', preferredUsername: 'AlphaCat' });
  const beta = await env.playerService.registerOrRetrieveProfile({ deviceId: 'dev_tie_player_2', preferredUsername: 'BetaCat' });
  const alphaRun = { idempotencyKey: 'run_alpha_001', score: 30, fishCollected: 4, pipesCleared: 6, durationMs: 15000 };
  const betaRun = { idempotencyKey: 'run_beta_001', score: 30, fishCollected: 4, pipesCleared: 10, durationMs: 18000 };
  await env.leaderboardService.submitScore({ playerId: alpha.profile.player_id, authToken: alpha.authToken, payload: alphaRun });
  const submitted = await env.leaderboardService.submitScore({ playerId: beta.profile.player_id, authToken: beta.authToken, payload: betaRun });
  const replay = await env.leaderboardService.submitScore({ playerId: beta.profile.player_id, authToken: beta.authToken, payload: betaRun });
  assert.equal(submitted.idempotentReplay, false);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.profile.total_score, 30);
  assert.equal(replay.profile.total_pipes_cleared, 10);
  const board = await env.leaderboardService.getLeaderboard({ limit: 1, offset: 0 });
  assert.equal(board.entries[0].username, 'BetaCat');
  assert.equal(board.entries[0].rank, 1);
  assert.equal(board.totalPlayers, 2);
  const secondPage = await env.leaderboardService.getLeaderboard({ limit: 1, offset: 1 });
  assert.equal(secondPage.entries[0].username, 'AlphaCat');
  assert.equal(secondPage.entries[0].rank, 2);
});

test('server validation protects usernames, player ownership, score bounds, and persistent rate limits', async (t) => {
  const env = await createTestEnv();
  t.after(() => env.db.close());
  const alice = await env.playerService.registerOrRetrieveProfile({ deviceId: 'dev_alice_secure_01', preferredUsername: 'AliceCat' });
  const mallory = await env.playerService.registerOrRetrieveProfile({ deviceId: 'dev_mallory_secure_02', preferredUsername: 'MalloryCat' });
  await assert.rejects(
    env.playerService.updateUsername({ playerId: mallory.profile.player_id, authToken: mallory.authToken, newUsername: "admin'; DROP TABLE players;--" }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 400
  );
  await assert.rejects(
    env.playerService.updateUsername({ playerId: alice.profile.player_id, authToken: mallory.authToken, newUsername: 'HackedAlice' }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 403
  );
  await assert.rejects(
    env.leaderboardService.submitScore({
      playerId: alice.profile.player_id, authToken: mallory.authToken,
      payload: { idempotencyKey: 'run_spoof_alice_01', score: 10, fishCollected: 2, pipesCleared: 2, durationMs: 5000 },
    }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 403
  );
  await assert.rejects(
    env.leaderboardService.submitScore({
      playerId: mallory.profile.player_id, authToken: mallory.authToken,
      payload: { idempotencyKey: 'run_impossible_99999', score: 99999, fishCollected: 1, pipesCleared: 1, durationMs: 2000 },
    }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 422
  );
  const subject = env.security.hashSecret('rate-limit-test-subject');
  const config = { windowMs: 60_000, maxRequests: 3, baseBackoffMs: 1_000 };
  for (let i = 0; i < 3; i++) assert.equal((await env.repo.checkRateLimit('test_endpoint', subject, config)).allowed, true);
  const blocked = await env.repo.checkRateLimit('test_endpoint', subject, config);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs >= 1_000);
  assert.ok((await env.repo.getSecurityEvents(20)).length >= 3);
});

test('transactions roll back and local file-backed records survive reopening', async () => {
  const dbPath = path.join(process.cwd(), '.data', 'backend-test-' + process.pid + '-' + Date.now() + '.sqlite');

  const env1 = await createTestEnv({ filename: dbPath });
  const created = await env1.playerService.registerOrRetrieveProfile({ deviceId: 'dev_persist_disk_01', preferredUsername: 'DiskCat' });
  await assert.rejects(env1.repo.runInTransaction(async ({ sql }) => {
    await env1.repo.updateUsername({
      player_id: created.profile.player_id, username: 'TempName', normalized_username: 'tempname', nowIso: new Date().toISOString(),
    }, sql);
    throw new Error('simulated rollback');
  }));
  assert.equal((await env1.repo.findByPlayerId(created.profile.player_id))?.username, 'DiskCat');
  env1.db.close();

  const env2 = await createTestEnv({ filename: dbPath });
  const retrieved = await env2.playerService.registerOrRetrieveProfile({
    deviceId: 'dev_persist_disk_01', authToken: created.authToken,
  });
  assert.equal(retrieved.isNewProfile, false);
  assert.equal(retrieved.profile.player_id, created.profile.player_id);
  assert.equal(retrieved.profile.username, 'DiskCat');
  env2.db.close();
});

test('schema migrations and initial rival seeds are repeatable without overwriting existing records', async (t) => {
  const env = await createTestEnv({ seedInitialRivals: true });
  t.after(() => env.db.close());
  await runMigrations(env.db);
  await seedNpcLeaderboardEntries(env.db);
  assert.equal(await env.repo.getTotalPlayerCount(), 5);
  const first = await env.repo.findByPlayerId('plr_seed_garong01');
  assert.equal(first?.best_score, 84);
  await assert.rejects(env.db.execute({
    sql: 'INSERT INTO score_submissions (idempotency_key, player_id, run_score, fish_collected, pipes_cleared, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: ['run_orphan_ref_001', 'plr_missing_player', 1, 0, 0, 1000, new Date().toISOString()],
  }));
  const player = await env.playerService.registerOrRetrieveProfile({
    deviceId: 'dev_cascade_test_001', preferredUsername: 'CascadeCat',
  });
  await env.leaderboardService.submitScore({
    playerId: player.profile.player_id,
    authToken: player.authToken,
    payload: { idempotencyKey: 'run_cascade_001', score: 10, fishCollected: 1, pipesCleared: 1, durationMs: 5000 },
  });
  await env.db.execute({ sql: 'DELETE FROM players WHERE player_id = ?', args: [player.profile.player_id] });
  const orphanScores = await env.db.execute({
    sql: 'SELECT COUNT(*) AS cnt FROM score_submissions WHERE player_id = ?',
    args: [player.profile.player_id],
  });
  assert.equal(Number((orphanScores.rows[0] as unknown as { cnt: number }).cnt), 0);
});

test('production database configuration never falls back to local or in-memory storage', async () => {
  const priorNodeEnv = process.env.NODE_ENV;
  const priorUrl = process.env.TURSO_DATABASE_URL;
  const priorToken = process.env.TURSO_AUTH_TOKEN;
  process.env.NODE_ENV = 'production';
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  try {
    await assert.rejects(createDatabase(), /Production database is not configured/);
    process.env.NODE_ENV = 'development';
    await assert.rejects(createDatabase({ requireRemote: true }), /Production database is not configured/);
    await assert.rejects(createDatabase({
      requireRemote: true,
      url: 'file::memory:',
      authToken: 'test-only-token',
    }), /remote libSQL scheme/);
  } finally {
    if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorNodeEnv;
    if (priorUrl === undefined) delete process.env.TURSO_DATABASE_URL;
    else process.env.TURSO_DATABASE_URL = priorUrl;
    if (priorToken === undefined) delete process.env.TURSO_AUTH_TOKEN;
    else process.env.TURSO_AUTH_TOKEN = priorToken;
  }
});
