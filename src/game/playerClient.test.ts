import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiResponseError, parseApiResponse, requestApiData } from './playerClient';

test('shared API parser reads and validates a successful JSON envelope once', async () => {
  const response = new Response(JSON.stringify({ ok: true, data: { value: 7 } }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
  assert.deepEqual(await parseApiResponse<{ value: number }>(response, '/api/test'), { value: 7 });
  assert.equal(response.bodyUsed, true);
});

test('empty, malformed, and HTML responses become clear diagnostics', async () => {
  await assert.rejects(
    parseApiResponse(new Response(null, { status: 502 }), '/api/empty'),
    (error: unknown) => error instanceof ApiResponseError && error.status === 502 && error.message.includes('kosong')
  );
  await assert.rejects(
    parseApiResponse(new Response('{', { status: 200, headers: { 'content-type': 'application/json' } }), '/api/bad-json'),
    (error: unknown) => error instanceof ApiResponseError && error.message.includes('tidak valid')
  );
  await assert.rejects(
    parseApiResponse(new Response('<html>secret stack</html>', { status: 404, headers: { 'content-type': 'text/html' } }), '/api/html'),
    (error: unknown) => error instanceof ApiResponseError && error.message.includes('bukan JSON') && !error.message.includes('secret stack')
  );
});

test('structured HTTP errors keep Indonesian validation messages without exposing response details', async () => {
  await assert.rejects(
    parseApiResponse(new Response(JSON.stringify({ ok: false, error: { code: 'INVALID_USERNAME', message: 'Username tidak valid.' } }), {
      status: 422,
      headers: { 'content-type': 'application/json' },
    }), '/api/username'),
    (error: unknown) => error instanceof ApiResponseError && error.status === 422 && error.message.includes('Username tidak valid.')
  );
});

test('network and aborted requests are distinct from invalid JSON responses', async () => {
  await assert.rejects(
    requestApiData('/api/offline', {}, async () => { throw new TypeError('network down'); }),
    (error: unknown) => error instanceof ApiResponseError && error.status === 0 && error.message.includes('terhubung')
  );
  await assert.rejects(
    requestApiData('/api/abort', {}, async () => { throw new DOMException('aborted', 'AbortError'); }),
    (error: unknown) => error instanceof ApiResponseError && error.status === 0 && error.message.includes('dibatalkan')
  );
});
