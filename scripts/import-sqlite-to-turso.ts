import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase, runMigrations } from '../src/server/db';

interface PlayerRow {
  player_id: string; device_id: string; auth_token_hash: string; username: string;
  normalized_username: string; created_at: string; updated_at: string; best_score: number;
  total_score: number; total_fish_collected: number; total_pipes_cleared: number;
  runs_played: number; last_active_at: string;
}
interface SubmissionRow {
  idempotency_key: string; player_id: string; run_score: number; fish_collected: number;
  pipes_cleared: number; duration_ms: number; created_at: string;
}
interface SecurityEventRow {
  event_id: number; event_type: string; player_id: string | null; device_id: string | null;
  ip_hash: string | null; reason: string; created_at: string;
}

async function main(): Promise<void> {
  const sourceArgument = process.argv[2];
  if (!sourceArgument) {
    console.error('Provide the existing SQLite file path as the first argument.');
    process.exitCode = 2;
    return;
  }
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before importing.');
    process.exitCode = 2;
    return;
  }

  const sourcePath = path.resolve(sourceArgument);
  if (!fs.existsSync(sourcePath)) {
    console.error('The specified SQLite file does not exist.');
    process.exitCode = 2;
    return;
  }

  let source: DatabaseSync | undefined;
  let target;
  let tx;
  try {
    source = new DatabaseSync(sourcePath, { readOnly: true });
    const tableNames = new Set(
      (source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name)
    );
    for (const table of ['players', 'score_submissions', 'security_events']) {
      if (!tableNames.has(table)) throw new Error('SOURCE_SCHEMA_INVALID');
    }

    const players = source.prepare('SELECT * FROM players').all() as unknown as PlayerRow[];
    const submissions = source.prepare('SELECT * FROM score_submissions').all() as unknown as SubmissionRow[];
    const securityEvents = source.prepare('SELECT * FROM security_events').all() as unknown as SecurityEventRow[];
    target = await createDatabase({ runMigrations: false, seedInitialRivals: false });
    const targetTablesResult = await target.execute("SELECT name FROM sqlite_master WHERE type = 'table'");
    const targetTables = new Set(targetTablesResult.rows.map((row) => String(row.name)));
    for (const table of ['players', 'score_submissions', 'security_events']) {
      if (!targetTables.has(table)) continue;
      const result = await target.execute('SELECT COUNT(*) AS cnt FROM ' + table);
      const count = result.rows[0] as unknown as { cnt: number };
      if (Number(count.cnt) > 0) throw new Error('TARGET_NOT_EMPTY');
    }

    await runMigrations(target);
    tx = await target.transaction('write');

    const existing = await tx.execute(
      'SELECT (SELECT COUNT(*) FROM players) AS players, (SELECT COUNT(*) FROM score_submissions) AS submissions, (SELECT COUNT(*) FROM security_events) AS events'
    );
    const counts = existing.rows[0] as unknown as { players: number; submissions: number; events: number };
    if (Number(counts.players) || Number(counts.submissions) || Number(counts.events)) {
      throw new Error('TARGET_NOT_EMPTY');
    }

    for (const player of players) {
      await tx.execute({
        sql: 'INSERT INTO players (player_id, device_id, auth_token_hash, username, normalized_username, created_at, updated_at, best_score, total_score, total_fish_collected, total_pipes_cleared, runs_played, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [player.player_id, player.device_id, player.auth_token_hash, player.username,
          player.normalized_username, player.created_at, player.updated_at, player.best_score,
          player.total_score, player.total_fish_collected, player.total_pipes_cleared,
          player.runs_played, player.last_active_at],
      });
    }
    for (const submission of submissions) {
      await tx.execute({
        sql: 'INSERT INTO score_submissions (idempotency_key, player_id, run_score, fish_collected, pipes_cleared, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [submission.idempotency_key, submission.player_id, submission.run_score,
          submission.fish_collected, submission.pipes_cleared, submission.duration_ms, submission.created_at],
      });
    }
    for (const event of securityEvents) {
      await tx.execute({
        sql: 'INSERT INTO security_events (event_id, event_type, player_id, device_id, ip_hash, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [event.event_id, event.event_type, event.player_id, event.device_id, event.ip_hash,
          event.reason, event.created_at],
      });
    }

    const copied = await tx.execute(
      'SELECT (SELECT COUNT(*) FROM players) AS players, (SELECT COUNT(*) FROM score_submissions) AS submissions, (SELECT COUNT(*) FROM security_events) AS events'
    );
    const copiedCounts = copied.rows[0] as unknown as { players: number; submissions: number; events: number };
    if (
      Number(copiedCounts.players) !== players.length ||
      Number(copiedCounts.submissions) !== submissions.length ||
      Number(copiedCounts.events) !== securityEvents.length
    ) throw new Error('IMPORT_COUNT_MISMATCH');

    await tx.commit();
    console.log('Imported ' + players.length + ' players, ' + submissions.length + ' scores, and ' + securityEvents.length + ' audit events.');
  } catch (error) {
    if (tx && !tx.closed) {
      try { await tx.rollback(); } catch { /* keep the original failure */ }
    }
    const message = error instanceof Error ? error.message : '';
    if (message === 'TARGET_NOT_EMPTY') {
      console.error('Import stopped: the Turso database already contains player or score data. Nothing was changed.');
    } else if (message === 'SOURCE_SCHEMA_INVALID') {
      console.error('Import stopped: the source SQLite file does not contain the expected game tables.');
    } else if (message === 'IMPORT_COUNT_MISMATCH') {
      console.error('Import stopped because copied record counts did not match. The transaction was rolled back.');
    } else {
      console.error('SQLite import failed:', error instanceof Error ? error.name : 'UnknownError');
    }
    process.exitCode = 1;
  } finally {
    tx?.close();
    target?.close();
    source?.close();
  }
}

void main();
