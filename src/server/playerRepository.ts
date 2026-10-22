import { DatabaseSync } from 'node:sqlite';

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

export class PlayerRepository {
  private db: DatabaseSync;
  private inTransaction = false;
  private pendingSecurityEvents: Array<{
    event_type: string;
    player_id?: string | null;
    device_id?: string | null;
    ip_hash?: string | null;
    reason: string;
  }> = [];

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /**
   * Executes a callback inside an immediate SQLite transaction.
   * Automatically rolls back if any error is thrown, while flushing any queued
   * security audit events outside the transaction so violations are never lost.
   */
  public runInTransaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE TRANSACTION;');
    this.inTransaction = true;
    try {
      const result = fn();
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {
        // Ignore rollback errors if transaction already aborted
      }
      throw err;
    } finally {
      this.inTransaction = false;
      if (this.pendingSecurityEvents.length > 0) {
        const queued = this.pendingSecurityEvents.splice(0, this.pendingSecurityEvents.length);
        for (const ev of queued) {
          this.writeSecurityEventImmediate(ev);
        }
      }
    }
  }

  public findByPlayerId(playerId: string): PlayerRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT
        player_id,
        device_id,
        auth_token_hash,
        username,
        normalized_username,
        created_at,
        updated_at,
        best_score,
        total_score,
        total_fish_collected,
        total_pipes_cleared,
        runs_played,
        last_active_at
      FROM players
      WHERE player_id = ?
    `);
    return stmt.get(playerId) as unknown as PlayerRecord | undefined;
  }

  public findByDeviceId(deviceId: string): PlayerRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT
        player_id,
        device_id,
        auth_token_hash,
        username,
        normalized_username,
        created_at,
        updated_at,
        best_score,
        total_score,
        total_fish_collected,
        total_pipes_cleared,
        runs_played,
        last_active_at
      FROM players
      WHERE device_id = ?
    `);
    return stmt.get(deviceId) as unknown as PlayerRecord | undefined;
  }

  public findByNormalizedUsername(normalizedUsername: string): PlayerRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT
        player_id,
        device_id,
        auth_token_hash,
        username,
        normalized_username,
        created_at,
        updated_at,
        best_score,
        total_score,
        total_fish_collected,
        total_pipes_cleared,
        runs_played,
        last_active_at
      FROM players
      WHERE normalized_username = ?
    `);
    return stmt.get(normalizedUsername) as unknown as PlayerRecord | undefined;
  }

  public createPlayer(params: {
    player_id: string;
    device_id: string;
    auth_token_hash: string;
    username: string;
    normalized_username: string;
    nowIso: string;
  }): PlayerRecord {
    const stmt = this.db.prepare(`
      INSERT INTO players (
        player_id,
        device_id,
        auth_token_hash,
        username,
        normalized_username,
        created_at,
        updated_at,
        best_score,
        total_score,
        total_fish_collected,
        total_pipes_cleared,
        runs_played,
        last_active_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?)
    `);

    stmt.run(
      params.player_id,
      params.device_id,
      params.auth_token_hash,
      params.username,
      params.normalized_username,
      params.nowIso,
      params.nowIso,
      params.nowIso
    );

    const created = this.findByPlayerId(params.player_id);
    if (!created) {
      throw new Error('Failed to retrieve newly created player record.');
    }
    return created;
  }

  public touchLastActive(playerId: string, nowIso: string): void {
    const stmt = this.db.prepare(`
      UPDATE players
      SET last_active_at = ?
      WHERE player_id = ?
    `);
    stmt.run(nowIso, playerId);
  }

  public updatePlayerDeviceBinding(playerId: string, newDeviceId: string, nowIso: string): void {
    const stmt = this.db.prepare(`
      UPDATE players
      SET device_id = ?, updated_at = ?, last_active_at = ?
      WHERE player_id = ?
    `);
    stmt.run(newDeviceId, nowIso, nowIso, playerId);
  }

  public updateUsername(params: {
    player_id: string;
    username: string;
    normalized_username: string;
    nowIso: string;
  }): PlayerRecord {
    const stmt = this.db.prepare(`
      UPDATE players
      SET
        username = ?,
        normalized_username = ?,
        updated_at = ?,
        last_active_at = ?
      WHERE player_id = ?
    `);
    stmt.run(
      params.username,
      params.normalized_username,
      params.nowIso,
      params.nowIso,
      params.player_id
    );

    const updated = this.findByPlayerId(params.player_id);
    if (!updated) {
      throw new Error('Player record not found after username update.');
    }
    return updated;
  }

  public findSubmissionByKey(idempotencyKey: string): ScoreSubmissionRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT
        idempotency_key,
        player_id,
        run_score,
        fish_collected,
        pipes_cleared,
        duration_ms,
        created_at
      FROM score_submissions
      WHERE idempotency_key = ?
    `);
    return stmt.get(idempotencyKey) as unknown as ScoreSubmissionRecord | undefined;
  }

  public recordRunAndAccumulateStats(params: {
    idempotency_key: string;
    player_id: string;
    run_score: number;
    fish_collected: number;
    pipes_cleared: number;
    duration_ms: number;
    nowIso: string;
  }): PlayerRecord {
    const insertSubStmt = this.db.prepare(`
      INSERT INTO score_submissions (
        idempotency_key,
        player_id,
        run_score,
        fish_collected,
        pipes_cleared,
        duration_ms,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const updatePlayerStmt = this.db.prepare(`
      UPDATE players
      SET
        best_score = CASE WHEN ? > best_score THEN ? ELSE best_score END,
        total_score = total_score + ?,
        total_fish_collected = total_fish_collected + ?,
        total_pipes_cleared = total_pipes_cleared + ?,
        runs_played = runs_played + 1,
        updated_at = ?,
        last_active_at = ?
      WHERE player_id = ?
    `);

    insertSubStmt.run(
      params.idempotency_key,
      params.player_id,
      params.run_score,
      params.fish_collected,
      params.pipes_cleared,
      params.duration_ms,
      params.nowIso
    );

    updatePlayerStmt.run(
      params.run_score,
      params.run_score,
      params.run_score,
      params.fish_collected,
      params.pipes_cleared,
      params.nowIso,
      params.nowIso,
      params.player_id
    );

    const updated = this.findByPlayerId(params.player_id);
    if (!updated) {
      throw new Error('Player record missing after score update.');
    }
    return updated;
  }

  /**
   * Queries the global leaderboard with deterministic tie-breaking:
   * 1. Higher `best_score`
   * 2. Higher `total_pipes_cleared`
   * 3. Higher `total_fish_collected`
   * 4. Earlier `created_at`
   * 5. Lexicographical `player_id`
   */
  public getLeaderboardEntries(limit: number, offset: number): LeaderboardEntry[] {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const safeOffset = Math.max(0, Math.floor(offset));

    const stmt = this.db.prepare(`
      SELECT
        player_id,
        username,
        best_score,
        total_score,
        total_fish_collected,
        total_pipes_cleared,
        runs_played,
        updated_at
      FROM players
      ORDER BY
        best_score DESC,
        total_pipes_cleared DESC,
        total_fish_collected DESC,
        created_at ASC,
        player_id ASC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(safeLimit, safeOffset) as unknown as Array<
      Omit<LeaderboardEntry, 'rank'>
    >;

    return rows.map((row, idx) => ({
      rank: safeOffset + idx + 1,
      ...row,
    }));
  }

  /**
   * Computes a specific player's exact 1-based global rank using the same deterministic tie-breaking rules.
   */
  public getPlayerRank(playerId: string): LeaderboardEntry | undefined {
    const player = this.findByPlayerId(playerId);
    if (!player) return undefined;

    const rankStmt = this.db.prepare(`
      SELECT COUNT(*) + 1 AS rank
      FROM players
      WHERE
        best_score > ?
        OR (best_score = ? AND total_pipes_cleared > ?)
        OR (best_score = ? AND total_pipes_cleared = ? AND total_fish_collected > ?)
        OR (best_score = ? AND total_pipes_cleared = ? AND total_fish_collected = ? AND created_at < ?)
        OR (best_score = ? AND total_pipes_cleared = ? AND total_fish_collected = ? AND created_at = ? AND player_id < ?)
    `);

    const res = rankStmt.get(
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
      player.player_id
    ) as { rank: number };

    return {
      rank: Number(res.rank),
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

  public getTotalPlayerCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS cnt FROM players').get() as { cnt: number };
    return Number(row?.cnt ?? 0);
  }

  public logSecurityEvent(params: {
    event_type: string;
    player_id?: string | null;
    device_id?: string | null;
    ip_hash?: string | null;
    reason: string;
  }): void {
    if (this.inTransaction) {
      this.pendingSecurityEvents.push(params);
      return;
    }
    this.writeSecurityEventImmediate(params);
  }

  private writeSecurityEventImmediate(params: {
    event_type: string;
    player_id?: string | null;
    device_id?: string | null;
    ip_hash?: string | null;
    reason: string;
  }): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO security_events (
          event_type,
          player_id,
          device_id,
          ip_hash,
          reason,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        params.event_type,
        params.player_id ?? null,
        params.device_id ?? null,
        params.ip_hash ?? null,
        params.reason.slice(0, 500),
        new Date().toISOString()
      );
    } catch {
      // Never allow audit logging failure to crash request handling
    }
  }

  public getSecurityEvents(limit = 50): Array<{
    event_id: number;
    event_type: string;
    player_id: string | null;
    device_id: string | null;
    reason: string;
    created_at: string;
  }> {
    const stmt = this.db.prepare(`
      SELECT event_id, event_type, player_id, device_id, reason, created_at
      FROM security_events
      ORDER BY event_id DESC
      LIMIT ?
    `);
    return stmt.all(limit) as unknown as Array<{
      event_id: number;
      event_type: string;
      player_id: string | null;
      device_id: string | null;
      reason: string;
      created_at: string;
    }>;
  }

  public toPublicProfile(record: PlayerRecord): PublicPlayerProfile {
    const rankEntry = this.getPlayerRank(record.player_id);
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
