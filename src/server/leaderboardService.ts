import {
  LeaderboardEntry,
  PlayerRepository,
  PublicPlayerProfile,
} from './playerRepository.js';
import { ServiceError } from './playerService.js';
import { SecurityService } from './securityService.js';

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  totalPlayers: number;
  limit: number;
  offset: number;
  currentPlayer?: LeaderboardEntry;
}

export interface SubmitScoreResult {
  profile: PublicPlayerProfile;
  leaderboardEntry: LeaderboardEntry;
  idempotentReplay: boolean;
  newPersonalBest: boolean;
}

export class LeaderboardService {
  private repo: PlayerRepository;
  private security: SecurityService;

  constructor(repo: PlayerRepository, security: SecurityService) {
    this.repo = repo;
    this.security = security;
  }

  public async getLeaderboard(params: {
    limit?: number;
    offset?: number;
    currentPlayerId?: string;
  }): Promise<LeaderboardResponse> {
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
    const offset = Math.max(0, Number(params.offset) || 0);
    const entries = await this.repo.getLeaderboardEntries(limit, offset);
    const totalPlayers = await this.repo.getTotalPlayerCount();
    const currentPlayer = params.currentPlayerId
      ? await this.repo.getPlayerRank(params.currentPlayerId)
      : undefined;

    return { entries, totalPlayers, limit, offset, currentPlayer };
  }

  /**
   * Validates and atomically records one score for an authenticated player.
   * The write transaction serializes the idempotency check with the insert and
   * statistic update, so a repeated key cannot increment totals twice.
   */
  public async submitScore(params: {
    playerId: string;
    authToken: string;
    payload: unknown;
    ipAddress?: string;
  }): Promise<SubmitScoreResult> {
    const ipHash = params.ipAddress ? this.security.hashSecret(params.ipAddress) : null;
    if (typeof params.playerId !== 'string' || !params.playerId.trim()) {
      throw new ServiceError('Player ID tidak valid.', 400, 'INVALID_PLAYER_ID');
    }

    const playerId = params.playerId.trim();
    const rate = await this.repo.checkRateLimit(
      'score_submit',
      this.security.hashSecret(playerId),
      { windowMs: 60_000, maxRequests: 25, baseBackoffMs: 2_000 }
    );
    if (!rate.allowed) {
      await this.repo.logSecurityEvent({
        event_type: 'RATE_LIMIT_SCORE_SUBMIT',
        player_id: playerId,
        ip_hash: ipHash,
        reason: 'Score submission rate limit exceeded',
      });
      throw new ServiceError(
        'Terlalu banyak pengiriman skor dalam waktu singkat. Coba lagi sebentar lagi.',
        429,
        'RATE_LIMITED'
      );
    }

    const validation = this.security.validateRunSubmission(params.payload);
    if (!validation.valid || !validation.cleaned) {
      await this.repo.logSecurityEvent({
        event_type: 'REJECTED_SCORE_SUBMISSION',
        player_id: playerId,
        ip_hash: ipHash,
        reason: (validation.code ?? 'INVALID') + ': ' + (validation.reason ?? 'Invalid payload'),
      });
      throw new ServiceError(
        validation.reason ?? 'Data skor ditolak oleh sistem anti-cheat.',
        422,
        validation.code ?? 'ANTI_CHEAT_REJECTED'
      );
    }

    const cleaned = validation.cleaned;
    return this.repo.runInTransaction(async (scope) => {
      const tx = scope.sql;
      const player = await this.repo.findByPlayerId(playerId, tx);
      if (!player) {
        throw new ServiceError('Profil pemain tidak ditemukan.', 404, 'PLAYER_NOT_FOUND');
      }

      if (!this.security.verifyAuthToken(params.authToken, player.auth_token_hash)) {
        await this.repo.logSecurityEvent(
          {
            event_type: 'UNAUTHORIZED_SCORE_SUBMISSION',
            player_id: playerId,
            ip_hash: ipHash,
            reason: 'Invalid or missing auth token on score submission.',
          },
          scope
        );
        throw new ServiceError(
          'Token autentikasi tidak cocok dengan pemilik profil.',
          403,
          'UNAUTHORIZED'
        );
      }

      const existingSubmission = await this.repo.findSubmissionByKey(
        cleaned.idempotencyKey,
        tx
      );
      if (existingSubmission) {
        if (existingSubmission.player_id !== playerId) {
          await this.repo.logSecurityEvent(
            {
              event_type: 'CROSS_PLAYER_IDEMPOTENCY_COLLISION',
              player_id: playerId,
              ip_hash: ipHash,
              reason: 'Idempotency key already belongs to another player.',
            },
            scope
          );
          throw new ServiceError('Idempotency key sudah digunakan.', 409, 'IDEMPOTENCY_CONFLICT');
        }

        const currentProfile = await this.repo.toPublicProfile(player, tx);
        const currentRank = await this.repo.getPlayerRank(playerId, tx);
        if (!currentRank) throw new Error('Player rank missing during score replay.');
        return {
          profile: currentProfile,
          leaderboardEntry: currentRank,
          idempotentReplay: true,
          newPersonalBest: false,
        };
      }

      const previousBest = player.best_score;
      const updatedRecord = await this.repo.recordRunAndAccumulateStats(
        {
          idempotency_key: cleaned.idempotencyKey,
          player_id: playerId,
          run_score: cleaned.score,
          fish_collected: cleaned.fishCollected,
          pipes_cleared: cleaned.pipesCleared,
          duration_ms: cleaned.durationMs,
          nowIso: new Date().toISOString(),
        },
        tx
      );
      const updatedProfile = await this.repo.toPublicProfile(updatedRecord, tx);
      const rankEntry = await this.repo.getPlayerRank(playerId, tx);
      if (!rankEntry) throw new Error('Player rank missing after score submission.');

      return {
        profile: updatedProfile,
        leaderboardEntry: rankEntry,
        idempotentReplay: false,
        newPersonalBest: cleaned.score > previousBest,
      };
    });
  }
}
