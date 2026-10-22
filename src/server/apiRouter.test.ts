import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from './db';
import { createApiContext, handleApiRequest } from './apiRouter';

function makeRequest(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}): Request {
  const requestHeaders = new Headers(headers);
  if (body !== undefined && !requestHeaders.has('content-type')) {
    requestHeaders.set('content-type', 'application/json');
  }
  return new Request('https://game.test' + path, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('all required player and leaderboard routes return JSON and preserve the API envelope', async (t) => {
  const db = await createDatabase({ filename: ':memory:', runMigrations: true, seedInitialRivals: false });
  t.after(() => db.close());
  const api = createApiContext(db);

  const sessionResponse = await handleApiRequest(api, makeRequest('/api/v1/players/session', 'POST', {
    deviceId: 'dev_api_test_player_01', preferredUsername: 'ApiCat',
  }));
  assert.equal(sessionResponse.status, 201);
  const session = await sessionResponse.json() as { ok: boolean; data: { profile: { player_id: string }; authToken: string } };
  assert.equal(session.ok, true);
  const playerId = session.data.profile.player_id;
  const authToken = session.data.authToken;

  const profileResponse = await handleApiRequest(api, makeRequest('/api/v1/players/' + playerId));
  assert.equal(profileResponse.status, 200);
  const profile = await profileResponse.json() as { ok: boolean; data: { profile: Record<string, unknown> } };
  assert.equal(profile.ok, true);
  assert.equal(profile.data.profile.username, 'ApiCat');
  assert.equal('auth_token_hash' in profile.data.profile, false);

  const usernameResponse = await handleApiRequest(api, makeRequest(
    '/api/v1/players/' + playerId + '/username', 'PATCH', { username: 'ApiCatRenamed' }, { 'x-player-token': authToken }
  ));
  assert.equal(usernameResponse.status, 200);
  const usernameData = await usernameResponse.json() as { data: { profile: { username: string; player_id: string } } };
  assert.equal(usernameData.data.profile.username, 'ApiCatRenamed');
  assert.equal(usernameData.data.profile.player_id, playerId);

  const submitPayload = {
    playerId, idempotencyKey: 'run_api_test_001', score: 20,
    fishCollected: 2, pipesCleared: 3, durationMs: 7000,
  };
  const submitRequest = () => makeRequest('/api/v1/leaderboard/submit', 'POST', submitPayload, { 'x-player-token': authToken });
  const submittedResponse = await handleApiRequest(api, submitRequest());
  assert.equal(submittedResponse.status, 200);
  const submitted = await submittedResponse.json() as { data: { idempotentReplay: boolean; profile: { total_score: number } } };
  assert.equal(submitted.data.idempotentReplay, false);
  assert.equal(submitted.data.profile.total_score, 20);

  const replay = await (await handleApiRequest(api, submitRequest())).json() as { data: { idempotentReplay: boolean; profile: { total_score: number } } };
  assert.equal(replay.data.idempotentReplay, true);
  assert.equal(replay.data.profile.total_score, 20);

  const leaderboardResponse = await handleApiRequest(api, makeRequest('/api/v1/leaderboard?limit=10&offset=0&playerId=' + playerId));
  assert.equal(leaderboardResponse.status, 200);
  const leaderboard = await leaderboardResponse.json() as { ok: boolean; data: { entries: Array<{ player_id: string; username: string }>; currentPlayer?: { player_id: string } } };
  assert.equal(leaderboard.ok, true);
  assert.equal(leaderboard.data.entries[0].player_id, playerId);
  assert.equal(leaderboard.data.entries[0].username, 'ApiCatRenamed');
  assert.equal(leaderboard.data.currentPlayer?.player_id, playerId);
});

test('unknown routes and malformed requests return structured JSON, never HTML', async (t) => {
  const db = await createDatabase({ filename: ':memory:', runMigrations: true, seedInitialRivals: false });
  t.after(() => db.close());
  const api = createApiContext(db);

  const missing = await handleApiRequest(api, makeRequest('/api/v1/not-a-route'));
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type') || '', /application\/json/);
  assert.equal((await missing.json() as { ok: boolean }).ok, false);

  const badJson = await handleApiRequest(api, makeRequest('/api/v1/players/session', 'POST', '{', { 'content-type': 'application/json' }));
  assert.equal(badJson.status, 400);
  assert.equal((await badJson.json() as { error: { code: string } }).error.code, 'INVALID_JSON');

  const wrongMediaType = await handleApiRequest(api, makeRequest('/api/v1/players/session', 'POST', '{}', { 'content-type': 'text/plain' }));
  assert.equal(wrongMediaType.status, 415);

  const invalidPage = await handleApiRequest(api, makeRequest('/api/v1/leaderboard?offset=999999999999999999999999'));
  assert.equal(invalidPage.status, 400);

  const oversizedBody = await handleApiRequest(api, makeRequest(
    '/api/v1/players/session', 'POST', ' '.repeat(16 * 1024 + 1), { 'content-type': 'application/json' }
  ));
  assert.equal(oversizedBody.status, 413);

  const wrongOrigin = await handleApiRequest(api, new Request('https://game.test/api/v1/leaderboard', {
    headers: { origin: 'https://attacker.test' },
  }));
  assert.equal(wrongOrigin.status, 403);
});
