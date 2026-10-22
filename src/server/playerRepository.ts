import type { Client, Transaction } from '@libsql/client';
import type { RateLimitConfig } from './securityService.js';

export interface PlayerRecord {
  player_id: string;
  device_id: string;
  auth_token_hash: string;
  username: string;
  normalized_username: string;
  created_at: string;
  updated_at: string;
  best_score: number;
  total_score: number;
  total_fish_collected: number;
  total_pipes_cleared: number;
  runs_played: number;
  last_active_at: string;
}

export interface PublicPlayerProfile {
  player_id: string;
  device_id: string;
  username: string;
  created_at: string;
  updated_at: string;
  best_score: number;
  total_score: number;
  total_fish_collected: number;
  total_pipes_cleared: number;
  runs_played: number;
  last_active_at: string;
  rank?: number;
}

export interface LeaderboardEntry {
  rank: number;
  player_id: string;
  username: string;
  best_score: number;
  total_score: number;
  total_fish_collected: number;
  total_pipes_cleared: number;
  runs_played: number;
  updated_at: string;
}

export interface ScoreSubmissionRecord {
  idempotency_key: string;
  player_id: string;
  run_score: number;
  fish_collected: number;
  pipes_cleared: number;
  duration_ms: number;
  created_at: string;
}

export interface SecurityEventInput {
  event_type: string;
  player_id?: string | null;
  device_id?: string | null;
  ip_hash?: string | null;
  reason: string;
}

export interface RepositoryTransaction {
  sql: Transaction;
  pendingSecurityEvents: SecurityEventInput[];
}

type SqlExecutor = Pick<Client, 'execute'> | Pick<Transaction, 'execute'>;

const PLAYER_FIELDS = [
  'player_id, device_id, auth_token_hash, username, normalized_username,',
  'created_at, updated_at, best_score, total_score, total_fish_collected,',
  'total_pipes_cleared, runs_played, last_active_at',
].join('\n');

export class PlayerRepository {
  private db: Client;

  constructor(db: Client) {
    this.db = db;
  }

  /**
   * Runs a callback in a serialized write transaction. Audit events emitted by
   * a rejected operation are queued per transaction and written after rollback,
   * so parallel Vercel requests cannot share audit state.
   */
  public async runInTransaction<T>(
    fn: (scope: RepositoryTransaction) => Promise<T>
  ): Promise<T> {
    const sql = await this.db.transaction('write');
    const scope: RepositoryTransaction = { sql, pendingSecurityEvents: [] };
    try {
      const result = await fn(scope);
      for (const event of scope.pendingSecurityEvents) {
        await this.writeSecurityEvent(event, sql);
      }
      await sql.commit();
      return result;
    } catch (err) {
      if (!sql.closed) {
        try {
          await sql.rollback();
        } catch {
          // Preserve the original operation error.
        }
      }
      for (const event of scope.pendingSecurityEvents) {
        await this.writeSecurityEvent(event, this.db);
      }
      throw err;
    } finally {
      sql.close();
    }
  }

  public async findByPlayerId(
    playerId: string,
    executor: SqlExecutor = this.db
  ): Promise<PlayerRecord | undefined> {
    const result = await executor.execute({
      sql: 'SELECT ' + PLAYER_FIELDS + ' FROM players WHERE player_id = ?',
      args: [playerId],
    });
    return result.rows[0] as unknown as PlayerRecord | undefined;
  }

  public async findByDeviceId(
    deviceId: string,
    executor: SqlExecutor = this.db
  ): Promise<PlayerRecord | undefined> {
    const result = await executor.execute({
      sql: 'SELECT ' + PLAYER_FIELDS + ' FROM players WHERE device_id = ?',
      args: [deviceId],
    });
    return result.rows[0] as unknown as PlayerRecord | undefined;
  }

  public async findByNormalizedUsername(
    normalizedUsername: string,
    executor: SqlExecutor = this.db
  ): Promise<PlayerRecord | undefined> {
    const result = await executor.execute({
      sql: 'SELECT ' + PLAYER_FIELDS + ' FROM players WHERE normalized_username = ?',
      args: [normalizedUsername],
    });
    return result.rows[0] as unknown as PlayerRecord | undefined;
  }

  public async createPlayer(
    params: {
      player_id: string;
      device_id: string;
      auth_token_hash: string;
      username: string;
      normalized_username: string;
      nowIso: string;
    },
    executor: SqlExecutor = this.db
  ): Promise<PlayerRecord> {
    await executor.execute({
      sql: [
        'INSERT INTO players (',
        'player_id, device_id, auth_token_hash, username, normalized_username,',
        'created_at, updated_at, best_score, total_score, total_fish_collected,',
        'total_pipes_cleared, runs_played, last_active_at',
        ') VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?)',
      ].join('\n'),
      args: [
        params.player_id,
        params.device_id,
        params.auth_token_hash,
        params.username,
        params.normalized_username,
        params.nowIso,
        params.nowIso,
        params.nowIso,
      ],
    });

    const created = await this.findByPlayerId(params.player_id, executor);
    if (!created) throw new Error('Failed to retrieve newly created player record.');
    return created;
  }

  public async touchLastActive(
    playerId: string,
    nowIso: string,
    executor: SqlExecutor = this.db
  ): Promise<void> {
    await executor.execute({
      sql: 'UPDATE players SET last_active_at = ? WHERE player_id = ?',
      args: [nowIso, playerId],
    });
  }

  public async updatePlayerDeviceBinding(
    playerId: string,
    newDeviceId: string,
    nowIso: string,
    executor: SqlExecutor = this.db
  ): Promise<void> {
    await executor.execute({
      sql: 'UPDATE players SET device_id = ?, updated_at = ?, last_active_at = ? WHERE player_id = ?',
      args: [newDeviceId, nowIso, nowIso, playerId],
    });
  }

  public async updateUsername(
    params: {
      player_id: string;
      username: string;
      normalized_username: string;
      nowIso: string;
    },
    executor: SqlExecutor = this.db
  ): Promise<PlayerRecord> {
    await executor.execute({
      sql: [
        'UPDATE players SET username = ?, normalized_username = ?,',
        'updated_at = ?, last_active_at = ? WHERE player_id = ?',
      ].join('\n'),
      args: [
        params.username,
        params.normalized_username,
        params.nowIso,
        params.nowIso,
        params.player_id,
      ],
    });

    const updated = await this.findByPlayerId(params.player_id, executor);
    if (!updated) throw new Error('Player record not found after username update.');
    return updated;
  }

  public async findSubmissionByKey(
    idempotencyKey: string,
    executor: SqlExecutor = this.db
  ): Promise<ScoreSubmissionRecord | undefined> {
    const result = await executor.execute({
      sql: [
        'SELECT idempotency_key, player_id, run_score, fish_collected,',
        'pipes_cleared, duration_ms, created_at',
        'FROM score_submissions WHERE idempotency_key = ?',
      ].join('\n'),
      args: [idempotencyKey],
    });
    return result.rows[0] as unknown as ScoreSubmissionRecord | undefined;
  }

  public async recordRunAndAccumulateStats(
    params: {
      idempotency_key: string;
      player_id: string;
      run_score: number;
      fish_collected: number;
      pipes_cleared: number;
      duration_ms: number;
      nowIso: string;
    },
    executor: SqlExecutor
  ): Promise<PlayerRecord> {
    await executor.execute({
      sql: [
        'INSERT INTO score_submissions (',
        'idempotency_key, player_id, run_score, fish_collected, pipes_cleared, duration_ms, created_at',
        ') VALUES (?, ?, ?, ?, ?, ?, ?)',
      ].join('\n'),
      args: [
        params.idempotency_key,
        params.player_id,
        params.run_score,
        params.fish_collected,
        params.pipes_cleared,
        params.duration_ms,
        params.nowIso,
      ],
    });

    await executor.execute({
      sql: [
        'UPDATE players SET',
        'best_score = CASE WHEN ? > best_score THEN ? ELSE best_score END,',
        'total_score = total_score + ?,',
        'total_fish_collected = total_fish_collected + ?,',
        'total_pipes_cleared = total_pipes_cleared + ?,',
        'runs_played = runs_played + 1, updated_at = ?, last_active_at = ?',
        'WHERE player_id = ?',
      ].join('\n'),
      args: [
        params.run_score,
        params.run_score,
        params.run_score,
        params.fish_collected,
        params.pipes_cleared,
        params.nowIso,
        params.nowIso,
        params.player_id,
      ],
    });

    const updated = await this.findByPlayerId(params.player_id, executor);
    if (!updated) throw new Error('Player record missing after score update.');
    return updated;
  }

  /**
   * Deterministic ordering: best score, pipes, fish, creation time, then ID.
   */
  public async getLeaderboardEntries(
    limit: number,
    offset: number,
    executor: SqlExecutor = this.db
  ): Promise<LeaderboardEntry[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const safeOffset = Math.max(0, Math.floor(offset));
    const result = await executor.execute({
      sql: [
        'SELECT player_id, username, best_score, total_score, total_fish_collected,',
        'total_pipes_cleared, runs_played, updated_at FROM players',
        'ORDER BY best_score DESC, total_pipes_cleared DESC, total_fish_collected DESC,',
        'created_at ASC, player_id ASC LIMIT ? OFFSET ?',
      ].join('\n'),
      args: [safeLimit, safeOffset],
    });
    const rows = result.rows as unknown as Array<Omit<LeaderboardEntry, 'rank'>>;
    return rows.map((row, idx) => ({ rank: safeOffset + idx + 1, ...row }));
  }

  public async getPlayerRank(
    playerId: string,
    executor: SqlExecutor = this.db
  ): Promise<LeaderboardEntry | undefined> {
    const player = await this.findByPlayerId(playerId, executor);
    if (!player) return undefined;

    const result = await executor.execute({
      sql: [
        'SELECT COUNT(*) + 1 AS rank FROM players WHERE',
        'best_score > ?',
        'OR (best_score = ? AND total_pipes_cleared > ?)',
        'OR (best_score = ? AND total_pipes_cleared = ? AND total_fish_collected > ?)',
        'OR (best_score = ? AND total_pipes_cleared = ? AND total_fish_collected = ? AND created_at < ?)',
        'OR (best_score = ? AND total_pipes_cleared = ? AND total_fish_collected = ? AND created_at = ? AND player_id < ?)',
      ].join('\n'),
      args: [
        player.best_score,
        player.best_score,
        player.total_pipes_cleared,
        player.best_score,
        player.total_pipes_cleared,
        player.total_fish_collected,
        player.best_score,
        player.total_pipes_cleared,
        player.total_fish_collected,
        player.created_at,
        player.best_score,
        player.total_pipes_cleared,
        player.total_fish_collected,
        player.created_at,
        player.player_id,
      ],
    });
    const rankRow = result.rows[0] as unknown as { rank: number };

    return {
      rank: Number(rankRow.rank),
      player_id: player.player_id,
      username: player.username,
      best_score: player.best_score,
      total_score: player.total_score,
      total_fish_collected: player.total_fish_collected,
      total_pipes_cleared: player.total_pipes_cleared,
      runs_played: player.runs_played,
      updated_at: player.updated_at,
    };
  }

  public async getTotalPlayerCount(executor: SqlExecutor = this.db): Promise<number> {
    const result = await executor.execute('SELECT COUNT(*) AS cnt FROM players');
    const row = result.rows[0] as unknown as { cnt?: number } | undefined;
    return Number(row?.cnt ?? 0);
  }

  /**
   * Uses a database write transaction so limits remain effective across
   * serverless instances and cold starts. Callers pass a hashed subject key.
   */
  public async checkRateLimit(
    actionKey: string,
    subjectHash: string,
    config: RateLimitConfig,
    nowMs = Date.now()
  ): Promise<{ allowed: boolean; retryAfterMs: number }> {
    return this.runInTransaction(async ({ sql }) => {
      const selected = await sql.execute({
        sql: [
          'SELECT window_start, request_count, violations, blocked_until',
          'FROM api_rate_limits WHERE action_key = ? AND subject_hash = ?',
        ].join('\n'),
        args: [actionKey, subjectHash],
      });
      const prior = selected.rows[0] as unknown as
        | {
            window_start: number;
            request_count: number;
            violations: number;
            blocked_until: number;
          }
        | undefined;

      let windowStart = Number(prior?.window_start ?? nowMs);
      let requestCount = Number(prior?.request_count ?? 0);
      let violations = Number(prior?.violations ?? 0);
      let blockedUntil = Number(prior?.blocked_until ?? 0);

      if (blockedUntil > nowMs) {
        return { allowed: false, retryAfterMs: blockedUntil - nowMs };
      }
      if (nowMs - windowStart >= config.windowMs) {
        windowStart = nowMs;
        requestCount = 0;
      }

      requestCount += 1;
      let result = { allowed: true, retryAfterMs: 0 };
      if (requestCount > config.maxRequests) {
        violations += 1;
        const backoff = Math.min(
          60_000,
          config.baseBackoffMs * Math.pow(2, violations - 1)
        );
        blockedUntil = nowMs + backoff;
        result = { allowed: false, retryAfterMs: backoff };
      }

      await sql.execute({
        sql: [
          'INSERT INTO api_rate_limits (action_key, subject_hash, window_start, request_count, violations, blocked_until, updated_at)',
          'VALUES (?, ?, ?, ?, ?, ?, ?)',
          'ON CONFLICT(action_key, subject_hash) DO UPDATE SET',
          'window_start = excluded.window_start, request_count = excluded.request_count,',
          'violations = excluded.violations, blocked_until = excluded.blocked_until,',
          'updated_at = excluded.updated_at',
        ].join('\n'),
        args: [
          actionKey,
          subjectHash,
          windowStart,
          requestCount,
          violations,
          blockedUntil,
          new Date(nowMs).toISOString(),
        ],
      });
      return result;
    });
  }

  public async logSecurityEvent(
    params: SecurityEventInput,
    scope?: RepositoryTransaction
  ): Promise<void> {
    if (scope) {
      scope.pendingSecurityEvents.push(params);
      return;
    }
    await this.writeSecurityEvent(params, this.db);
  }

  private async writeSecurityEvent(
    params: SecurityEventInput,
    executor: SqlExecutor
  ): Promise<void> {
    try {
      await executor.execute({
        sql: [
          'INSERT INTO security_events (event_type, player_id, device_id, ip_hash, reason, created_at)',
          'VALUES (?, ?, ?, ?, ?, ?)',
        ].join('\n'),
        args: [
          params.event_type,
          params.player_id ?? null,
          params.device_id ?? null,
          params.ip_hash ?? null,
          params.reason.slice(0, 500),
          new Date().toISOString(),
        ],
      });
    } catch {
      // Audit logging failure must not expose database details or crash requests.
    }
  }

  public async getSecurityEvents(
    limit = 50,
    executor: SqlExecutor = this.db
  ): Promise<
    Array<{
      event_id: number;
      event_type: string;
      player_id: string | null;
      device_id: string | null;
      reason: string;
      created_at: string;
    }>
  > {
    const result = await executor.execute({
      sql: [
        'SELECT event_id, event_type, player_id, device_id, reason, created_at',
        'FROM security_events ORDER BY event_id DESC LIMIT ?',
      ].join('\n'),
      args: [Math.max(1, Math.min(100, Math.floor(limit)))],
    });
    return result.rows as unknown as Array<{
      event_id: number;
      event_type: string;
      player_id: string | null;
      device_id: string | null;
      reason: string;
      created_at: string;
    }>;
  }

  public async toPublicProfile(
    record: PlayerRecord,
    executor: SqlExecutor = this.db
  ): Promise<PublicPlayerProfile> {
    const rankEntry = await this.getPlayerRank(record.player_id, executor);
    return {
      player_id: record.player_id,
      device_id: record.device_id,
      username: record.username,
      created_at: record.created_at,
      updated_at: record.updated_at,
      best_score: record.best_score,
      total_score: record.total_score,
      total_fish_collected: record.total_fish_collected,
      total_pipes_cleared: record.total_pipes_cleared,
      runs_played: record.runs_played,
      last_active_at: record.last_active_at,
      rank: rankEntry?.rank,
    };
  }
}
