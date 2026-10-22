import {
  LeaderboardEntry,
  PlayerRepository,
  PublicPlayerProfile,
} from './playerRepository';
import { ServiceError } from './playerService';
import { SecurityService } from './securityService';

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

  /**
   * Returns a paginated global leaderboard sorted deterministically, plus the
   * requesting player's exact rank entry if `currentPlayerId` is provided.
   */
  public getLeaderboard(params: {
    limit?: number;
    offset?: number;
    currentPlayerId?: string;
  }): LeaderboardResponse {
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
    const offset = Math.max(0, Number(params.offset) || 0);

    const entries = this.repo.getLeaderboardEntries(limit, offset);
    const totalPlayers = this.repo.getTotalPlayerCount();
    const currentPlayer = params.currentPlayerId
      ? this.repo.getPlayerRank(params.currentPlayerId)
      : undefined;

    return {
      entries,
      totalPlayers,
      limit,
      offset,
      currentPlayer,
    };
  }

  /**
   * Validates and records a run score submission for an authenticated player.
   * Enforces:
   * - Token authentication matching `playerId`
   * - Rate limiting per player
   * - Idempotency key deduplication
   * - Server-side plausibility checks against game physics & scoring rules
   */
  public submitScore(params: {
    playerId: string;
    authToken: string;
    payload: unknown;
    ipAddress?: string;
  }): SubmitScoreResult {
    const ipHash = params.ipAddress ? this.security.hashSecret(params.ipAddress) : null;

    if (typeof params.playerId !== 'string' || !params.playerId.trim()) {
      throw new ServiceError('Player ID tidak valid.', 400, 'INVALID_PLAYER_ID');
    }

    const playerId = params.playerId.trim();

    const rate = this.security.checkRateLimit('score_submit', playerId, {
      windowMs: 60_000,
      maxRequests: 25,
      baseBackoffMs: 2_000,
    });
    if (!rate.allowed) {
      this.repo.logSecurityEvent({
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
      this.repo.logSecurityEvent({
        event_type: 'REJECTED_SCORE_SUBMISSION',
        player_id: playerId,
        ip_hash: ipHash,
        reason: `${validation.code}: ${validation.reason}`,
      });
      throw new ServiceError(
        validation.reason ?? 'Data skor ditolak oleh sistem anti-cheat.',
        422,
        validation.code ?? 'ANTI_CHEAT_REJECTED'
      );
    }

    const cleaned = validation.cleaned;

    return this.repo.runInTransaction(() => {
      const player = this.repo.findByPlayerId(playerId);
      if (!player) {
        throw new ServiceError('Profil pemain tidak ditemukan.', 404, 'PLAYER_NOT_FOUND');
      }

      if (!this.security.verifyAuthToken(params.authToken, player.auth_token_hash)) {
        this.repo.logSecurityEvent({
          event_type: 'UNAUTHORIZED_SCORE_SUBMISSION',
          player_id: playerId,
          ip_hash: ipHash,
          reason: 'Invalid or missing auth token on score submission.',
        });
        throw new ServiceError(
          'Token autentikasi tidak cocok dengan pemilik profil.',
          403,
          'UNAUTHORIZED'
        );
      }

      // Idempotency check
      const existingSubmission = this.repo.findSubmissionByKey(cleaned.idempotencyKey);
      if (existingSubmission) {
        if (existingSubmission.player_id !== playerId) {
          this.repo.logSecurityEvent({
            event_type: 'CROSS_PLAYER_IDEMPOTENCY_COLLISION',
            player_id: playerId,
            ip_hash: ipHash,
            reason: `Idempotency key ${cleaned.idempotencyKey} already belongs to another player.`,
          });
          throw new ServiceError(
            'Idempotency key sudah digunakan.',
            409,
            'IDEMPOTENCY_CONFLICT'
          );
        }

        const currentProfile = this.repo.toPublicProfile(player);
        const currentRank = this.repo.getPlayerRank(playerId)!;
        return {
          profile: currentProfile,
          leaderboardEntry: currentRank,
          idempotentReplay: true,
          newPersonalBest: false,
        };
      }

      const previousBest = player.best_score;
      const updatedRecord = this.repo.recordRunAndAccumulateStats({
        idempotency_key: cleaned.idempotencyKey,
        player_id: playerId,
        run_score: cleaned.score,
        fish_collected: cleaned.fishCollected,
        pipes_cleared: cleaned.pipesCleared,
        duration_ms: cleaned.durationMs,
        nowIso: new Date().toISOString(),
      });

      const updatedProfile = this.repo.toPublicProfile(updatedRecord);
      const rankEntry = this.repo.getPlayerRank(playerId)!;

      return {
        profile: updatedProfile,
        leaderboardEntry: rankEntry,
        idempotentReplay: false,
        newPersonalBest: cleaned.score > previousBest,
      };
    });
  }
}
