import express, { Request, Response, Router } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { PlayerRepository } from './playerRepository';
import { PlayerService, ServiceError } from './playerService';
import { LeaderboardService } from './leaderboardService';
import { SecurityService } from './securityService';

export interface ApiContext {
  db: DatabaseSync;
  repo: PlayerRepository;
  security: SecurityService;
  playerService: PlayerService;
  leaderboardService: LeaderboardService;
}

export function createApiContext(db: DatabaseSync): ApiContext {
  const repo = new PlayerRepository(db);
  const security = new SecurityService();
  const playerService = new PlayerService(repo, security);
  const leaderboardService = new LeaderboardService(repo, security);
  return { db, repo, security, playerService, leaderboardService };
}

function extractAuthToken(req: Request): string {
  const headerToken = req.header('x-player-token');
  if (headerToken && headerToken.trim()) {
    return headerToken.trim();
  }
  const authHeader = req.header('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (req.body && typeof req.body.authToken === 'string') {
    return req.body.authToken.trim();
  }
  return '';
}

function sendSafeError(res: Response, err: unknown): void {
  if (err instanceof ServiceError) {
    res.status(err.statusCode).json({
      ok: false,
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  // Never expose raw SQLite errors, SQL queries, stack traces, or filesystem paths
  res.status(500).json({
    ok: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Terjadi kesalahan internal pada server. Silakan coba kembali.',
    },
  });
}

export function createApiRouter(ctx: ApiContext): Router {
  const router = express.Router();

  // Bound JSON body payload size to prevent memory exhaustion
  router.use(express.json({ limit: '16kb' }));

  // Defensive security headers for API responses
  router.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // 1. Register or retrieve device player profile
  router.post('/players/session', (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const authToken = extractAuthToken(req);
      const result = ctx.playerService.registerOrRetrieveProfile({
        deviceId: typeof body.deviceId === 'string' ? body.deviceId : '',
        authToken: authToken || undefined,
        preferredUsername:
          typeof body.preferredUsername === 'string' ? body.preferredUsername : undefined,
        recoveryPlayerId:
          typeof body.recoveryPlayerId === 'string' ? body.recoveryPlayerId : undefined,
        ipAddress: req.ip || '127.0.0.1',
      });

      res.status(result.isNewProfile ? 201 : 200).json({
        ok: true,
        data: result,
      });
    } catch (err) {
      sendSafeError(res, err);
    }
  });

  // 2. Get player profile by immutable player_id
  router.get('/players/:playerId', (req: Request, res: Response) => {
    try {
      const profile = ctx.playerService.getProfileByPlayerId(String(req.params.playerId || ''));
      res.status(200).json({
        ok: true,
        data: { profile },
      });
    } catch (err) {
      sendSafeError(res, err);
    }
  });

  // 3. Update username on existing player_id without creating a duplicate record
  router.patch('/players/:playerId/username', (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const authToken = extractAuthToken(req);
      const profile = ctx.playerService.updateUsername({
        playerId: String(req.params.playerId || ''),
        authToken,
        newUsername: body.username,
        ipAddress: req.ip || '127.0.0.1',
      });

      res.status(200).json({
        ok: true,
        data: { profile },
      });
    } catch (err) {
      sendSafeError(res, err);
    }
  });

  // 4. Query global leaderboard
  router.get('/leaderboard', (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const offset = req.query.offset ? Number(req.query.offset) : 0;
      const currentPlayerId =
        typeof req.query.playerId === 'string' ? req.query.playerId : undefined;

      const board = ctx.leaderboardService.getLeaderboard({
        limit,
        offset,
        currentPlayerId,
      });

      res.status(200).json({
        ok: true,
        data: board,
      });
    } catch (err) {
      sendSafeError(res, err);
    }
  });

  // 5. Submit validated gameplay score
  router.post('/leaderboard/submit', (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const authToken = extractAuthToken(req);
      const playerId = typeof body.playerId === 'string' ? body.playerId : '';

      const result = ctx.leaderboardService.submitScore({
        playerId,
        authToken,
        payload: {
          idempotencyKey: body.idempotencyKey,
          score: body.score,
          fishCollected: body.fishCollected,
          pipesCleared: body.pipesCleared,
          durationMs: body.durationMs,
        },
        ipAddress: req.ip || '127.0.0.1',
      });

      res.status(200).json({
        ok: true,
        data: result,
      });
    } catch (err) {
      sendSafeError(res, err);
    }
  });

  return router;
}
