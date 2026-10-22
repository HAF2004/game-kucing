import type { Client } from '@libsql/client';
import { LeaderboardService } from './leaderboardService.js';
import { PlayerRepository } from './playerRepository.js';
import { PlayerService, ServiceError } from './playerService.js';
import { SecurityService } from './securityService.js';

export interface ApiContext {
  db: Client;
  repo: PlayerRepository;
  security: SecurityService;
  playerService: PlayerService;
  leaderboardService: LeaderboardService;
}

export function createApiContext(db: Client): ApiContext {
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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
    },
  });
}

function errorResponse(err: unknown): Response {
  if (err instanceof ServiceError) {
    return jsonResponse(err.statusCode, {
      ok: false,
      error: { code: err.code, message: err.message },
    });
  }

  if (err instanceof RequestBodyError) {
    return jsonResponse(err.statusCode, {
      ok: false,
      error: { code: err.code, message: err.message },
    });
  }

  return jsonResponse(500, {
    ok: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Terjadi kesalahan internal pada server. Silakan coba kembali.',
    },
  });
}

class RequestBodyError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) return {};
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new RequestBodyError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Permintaan harus menggunakan JSON.');
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > 16 * 1024) {
        await reader.cancel();
        throw new RequestBodyError(413, 'PAYLOAD_TOO_LARGE', 'Data permintaan terlalu besar.');
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  if (length === 0) return {};
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
  } catch {
    throw new RequestBodyError(400, 'INVALID_JSON', 'Format data permintaan tidak valid.');
  }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new RequestBodyError(400, 'INVALID_JSON', 'Data permintaan harus berupa objek JSON.');
  }
  return decoded as Record<string, unknown>;
}

function requestIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  const addresses = forwarded?.split(',').map((address) => address.trim()).filter(Boolean);
  return addresses?.at(-1) || undefined;
}

function extractAuthToken(request: Request, body: Record<string, unknown>): string {
  const headerToken = request.headers.get('x-player-token');
  if (headerToken?.trim()) return headerToken.trim();
  const authorization = request.headers.get('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) return authorization.slice(7).trim();
  return typeof body.authToken === 'string' ? body.authToken.trim() : '';
}

/**
 * Framework-independent API handler shared by local Express and Vercel's
 * serverless Web Request/Response runtime.
 */
export async function handleApiRequest(
  ctx: ApiContext,
  request: Request,
  pathOverride?: string
): Promise<Response> {
  const url = new URL(request.url);
  const path = pathOverride ?? url.pathname;
  if (!path.startsWith('/api/')) {
    return jsonResponse(404, { ok: false, error: { code: 'NOT_FOUND', message: 'Rute API tidak ditemukan.' } });
  }

  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) {
    return jsonResponse(403, { ok: false, error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Asal permintaan tidak diizinkan.' } });
  }

  const parts = path.split('/').filter(Boolean);
  const method = request.method.toUpperCase();
  try {
    if (parts[0] !== 'api' || parts[1] !== 'v1') {
      return jsonResponse(404, { ok: false, error: { code: 'NOT_FOUND', message: 'Rute API tidak ditemukan.' } });
    }

    if (parts.length === 4 && parts[2] === 'players' && parts[3] === 'session') {
      if (method !== 'POST') return methodNotAllowed();
      const body = await readJsonBody(request);
      const result = await ctx.playerService.registerOrRetrieveProfile({
        deviceId: typeof body.deviceId === 'string' ? body.deviceId : '',
        authToken: extractAuthToken(request, body) || undefined,
        preferredUsername: typeof body.preferredUsername === 'string' ? body.preferredUsername : undefined,
        recoveryPlayerId: typeof body.recoveryPlayerId === 'string' ? body.recoveryPlayerId : undefined,
        ipAddress: requestIp(request),
      });
      return jsonResponse(result.isNewProfile ? 201 : 200, { ok: true, data: result });
    }

    if (parts.length === 4 && parts[2] === 'players') {
      if (method !== 'GET') return methodNotAllowed();
      const profile = await ctx.playerService.getProfileByPlayerId(decodeURIComponent(parts[3]));
      return jsonResponse(200, { ok: true, data: { profile } });
    }

    if (parts.length === 5 && parts[2] === 'players' && parts[4] === 'username') {
      if (method !== 'PATCH') return methodNotAllowed();
      const body = await readJsonBody(request);
      const profile = await ctx.playerService.updateUsername({
        playerId: decodeURIComponent(parts[3]),
        authToken: extractAuthToken(request, body),
        newUsername: body.username,
        ipAddress: requestIp(request),
      });
      return jsonResponse(200, { ok: true, data: { profile } });
    }

    if (parts.length === 3 && parts[2] === 'leaderboard') {
      if (method !== 'GET') return methodNotAllowed();
      const limitValue = url.searchParams.get('limit');
      const offsetValue = url.searchParams.get('offset');
      if ((limitValue && !/^\d+$/.test(limitValue)) || (offsetValue && !/^\d+$/.test(offsetValue))) {
        throw new ServiceError('Parameter halaman tidak valid.', 400, 'INVALID_PAGINATION');
      }
      const limit = limitValue ? Number(limitValue) : 20;
      const offset = offsetValue ? Number(offsetValue) : 0;
      if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset)) {
        throw new ServiceError('Parameter halaman tidak valid.', 400, 'INVALID_PAGINATION');
      }
      const board = await ctx.leaderboardService.getLeaderboard({
        limit,
        offset,
        currentPlayerId: url.searchParams.get('playerId') ?? undefined,
      });
      return jsonResponse(200, { ok: true, data: board });
    }

    if (parts.length === 4 && parts[2] === 'leaderboard' && parts[3] === 'submit') {
      if (method !== 'POST') return methodNotAllowed();
      const body = await readJsonBody(request);
      const result = await ctx.leaderboardService.submitScore({
        playerId: typeof body.playerId === 'string' ? body.playerId : '',
        authToken: extractAuthToken(request, body),
        payload: {
          idempotencyKey: body.idempotencyKey,
          score: body.score,
          fishCollected: body.fishCollected,
          pipesCleared: body.pipesCleared,
          durationMs: body.durationMs,
        },
        ipAddress: requestIp(request),
      });
      return jsonResponse(200, { ok: true, data: result });
    }

    return jsonResponse(404, { ok: false, error: { code: 'NOT_FOUND', message: 'Rute API tidak ditemukan.' } });
  } catch (err) {
    if (err instanceof URIError) {
      return jsonResponse(400, { ok: false, error: { code: 'INVALID_PATH', message: 'Alamat permintaan tidak valid.' } });
    }
    return errorResponse(err);
  }
}

function methodNotAllowed(): Response {
  return jsonResponse(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode permintaan tidak didukung.' } });
}
