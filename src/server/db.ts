import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient, type Client } from '@libsql/client';

export interface DatabaseOptions {
  /** Local SQLite path for development and isolated tests. */
  filename?: string;
  /** Optional explicit Turso settings, primarily for migration tooling. */
  url?: string;
  authToken?: string;
  runMigrations?: boolean;
  seedInitialRivals?: boolean;
  /** Refuse local storage even when NODE_ENV is not set (serverless production). */
  requireRemote?: boolean;
}

const DEFAULT_DB_PATH = path.resolve(process.cwd(), '.data', 'kucing_terbang.sqlite');

interface Migration {
  version: number;
  name: string;
  up: string | string[];
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: '001_initial_players_leaderboard_and_audit',
    up: [
      'CREATE TABLE IF NOT EXISTS players (',
      '  player_id TEXT PRIMARY KEY CHECK(length(player_id) >= 8 AND length(player_id) <= 64),',
      '  device_id TEXT NOT NULL UNIQUE CHECK(length(device_id) >= 8 AND length(device_id) <= 128),',
      '  auth_token_hash TEXT NOT NULL CHECK(length(auth_token_hash) = 64),',
      '  username TEXT NOT NULL CHECK(length(username) >= 3 AND length(username) <= 20),',
      '  normalized_username TEXT NOT NULL UNIQUE CHECK(length(normalized_username) >= 3 AND length(normalized_username) <= 20),',
      '  created_at TEXT NOT NULL,',
      '  updated_at TEXT NOT NULL,',
      '  best_score INTEGER NOT NULL DEFAULT 0 CHECK(best_score >= 0),',
      '  total_score INTEGER NOT NULL DEFAULT 0 CHECK(total_score >= 0),',
      '  total_fish_collected INTEGER NOT NULL DEFAULT 0 CHECK(total_fish_collected >= 0),',
      '  total_pipes_cleared INTEGER NOT NULL DEFAULT 0 CHECK(total_pipes_cleared >= 0),',
      '  runs_played INTEGER NOT NULL DEFAULT 0 CHECK(runs_played >= 0),',
      '  last_active_at TEXT NOT NULL',
      ');',
      'CREATE INDEX IF NOT EXISTS idx_players_leaderboard ON players(best_score DESC, total_pipes_cleared DESC, total_fish_collected DESC, created_at ASC, player_id ASC);',
      'CREATE INDEX IF NOT EXISTS idx_players_device_id ON players(device_id);',
      'CREATE TABLE IF NOT EXISTS score_submissions (',
      '  idempotency_key TEXT PRIMARY KEY CHECK(length(idempotency_key) >= 8 AND length(idempotency_key) <= 128),',
      '  player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,',
      '  run_score INTEGER NOT NULL CHECK(run_score >= 0),',
      '  fish_collected INTEGER NOT NULL CHECK(fish_collected >= 0),',
      '  pipes_cleared INTEGER NOT NULL CHECK(pipes_cleared >= 0),',
      '  duration_ms INTEGER NOT NULL CHECK(duration_ms >= 0),',
      '  created_at TEXT NOT NULL',
      ');',
      'CREATE INDEX IF NOT EXISTS idx_submissions_player_id ON score_submissions(player_id);',
      'CREATE TABLE IF NOT EXISTS security_events (',
      '  event_id INTEGER PRIMARY KEY AUTOINCREMENT,',
      '  event_type TEXT NOT NULL,',
      '  player_id TEXT,',
      '  device_id TEXT,',
      '  ip_hash TEXT,',
      '  reason TEXT NOT NULL,',
      '  created_at TEXT NOT NULL',
      ');',
    ].join('\n'),
  },
  {
    version: 2,
    name: '002_persistent_api_rate_limits',
    up: [
      'CREATE TABLE IF NOT EXISTS api_rate_limits (',
      '  action_key TEXT NOT NULL CHECK(length(action_key) BETWEEN 1 AND 64),',
      '  subject_hash TEXT NOT NULL CHECK(length(subject_hash) = 64),',
      '  window_start INTEGER NOT NULL,',
      '  request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count >= 0),',
      '  violations INTEGER NOT NULL DEFAULT 0 CHECK(violations >= 0),',
      '  blocked_until INTEGER NOT NULL DEFAULT 0 CHECK(blocked_until >= 0),',
      '  updated_at TEXT NOT NULL,',
      '  PRIMARY KEY (action_key, subject_hash)',
      ');',
    ].join('\n'),
  },
  {
    version: 3,
    name: '003_enforced_score_submission_references',
    up: [
      [
        'CREATE TRIGGER IF NOT EXISTS enforce_score_submission_player_insert',
        'BEFORE INSERT ON score_submissions',
        'FOR EACH ROW',
        'WHEN NOT EXISTS (SELECT 1 FROM players WHERE player_id = NEW.player_id)',
        'BEGIN',
        "  SELECT RAISE(ABORT, 'foreign key constraint failed');",
        'END',
      ].join('\n'),
      [
        'CREATE TRIGGER IF NOT EXISTS cascade_score_submissions_on_player_delete',
        'AFTER DELETE ON players',
        'FOR EACH ROW',
        'BEGIN',
        '  DELETE FROM score_submissions WHERE player_id = OLD.player_id;',
        'END',
      ].join('\n'),
    ],
  },
];

/**
 * Creates a Turso client when its server-side credentials are present. Local
 * development and tests may explicitly use a file-backed or in-memory SQLite
 * database. Production never falls back to local or in-memory storage.
 */
export async function createDatabase(options: DatabaseOptions = {}): Promise<Client> {
  const explicitLocal = options.filename !== undefined;
  const databaseUrl = options.url ?? (explicitLocal ? undefined : process.env.TURSO_DATABASE_URL);
  const authToken = options.authToken ?? (explicitLocal ? undefined : process.env.TURSO_AUTH_TOKEN);
  const remoteOnly = options.requireRemote || (process.env.NODE_ENV === 'production' && !explicitLocal);

  if (remoteOnly && databaseUrl && !/^(?:libsql|https|wss):\/\//i.test(databaseUrl)) {
    throw new Error('Production database URL must use a remote libSQL scheme.');
  }

  let db: Client;
  if (databaseUrl || authToken) {
    if (!databaseUrl || !authToken) {
      throw new Error('Turso configuration is incomplete. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.');
    }
    db = createClient({ url: databaseUrl, authToken, intMode: 'number' });
  } else {
    if (remoteOnly) {
      throw new Error('Production database is not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.');
    }

    const filename = options.filename ?? process.env.SQLITE_DB_PATH ?? DEFAULT_DB_PATH;
    if (filename !== ':memory:') {
      fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true, mode: 0o700 });
    }
    const url =
      filename === ':memory:' ? 'file::memory:' : pathToFileURL(path.resolve(filename)).href;
    db = createClient({ url, intMode: 'number' });
  }

  try {
    if (!databaseUrl && !authToken) {
      await db.execute('PRAGMA foreign_keys = ON');
      if ((options.filename ?? process.env.SQLITE_DB_PATH ?? DEFAULT_DB_PATH) !== ':memory:') {
        await db.execute('PRAGMA journal_mode = WAL');
      }
      await db.execute('PRAGMA synchronous = NORMAL');
      await db.execute('PRAGMA busy_timeout = 5000');
    }
    if (options.runMigrations) await runMigrations(db);
    if (options.seedInitialRivals) await seedNpcLeaderboardEntries(db);
    return db;
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Applies versioned schema changes under a write transaction. The version row
 * and DDL commit together, so concurrent cold starts cannot record a partial
 * migration or apply the same version twice.
 */
export async function runMigrations(db: Client): Promise<void> {
  const tx = await db.transaction('write');
  try {
    await tx.execute(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)'
    );

    for (const migration of MIGRATIONS) {
      const existing = await tx.execute({
        sql: 'SELECT version FROM schema_migrations WHERE version = ?',
        args: [migration.version],
      });
      if (existing.rows.length > 0) continue;

      if (Array.isArray(migration.up)) {
        for (const statement of migration.up) await tx.execute(statement);
      } else {
        await tx.executeMultiple(migration.up);
      }
      await tx.execute({
        sql: 'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        args: [migration.version, migration.name, new Date().toISOString()],
      });
    }

    await tx.commit();
  } catch (err) {
    if (!tx.closed) {
      try {
        await tx.rollback();
      } catch {
        // Preserve the original migration error.
      }
    }
    throw err;
  } finally {
    tx.close();
  }
}

/**
 * Inserts demo rivals only into a truly empty player table. INSERT OR IGNORE
 * plus a write transaction makes this safe to retry without overwriting
 * existing players.
 */
export async function seedNpcLeaderboardEntries(db: Client): Promise<void> {
  const rivals = [
    {
      player_id: 'plr_seed_garong01',
      device_id: 'dev_seed_garong01',
      username: 'Oyen_Senja',
      best_score: 84,
      total_score: 420,
      total_fish_collected: 62,
      total_pipes_cleared: 48,
      runs_played: 14,
      created_at: '2026-10-01T10:00:00.000Z',
    },
    {
      player_id: 'plr_seed_mochi02',
      device_id: 'dev_seed_mochi02',
      username: 'MochiAtap',
      best_score: 62,
      total_score: 310,
      total_fish_collected: 45,
      total_pipes_cleared: 34,
      runs_played: 11,
      created_at: '2026-10-02T11:00:00.000Z',
    },
    {
      player_id: 'plr_seed_pirang03',
      device_id: 'dev_seed_pirang03',
      username: 'BangPirangGG',
      best_score: 47,
      total_score: 195,
      total_fish_collected: 29,
      total_pipes_cleared: 26,
      runs_played: 8,
      created_at: '2026-10-03T12:00:00.000Z',
    },
    {
      player_id: 'plr_seed_kopi04',
      device_id: 'dev_seed_kopi04',
      username: 'KopiTuxedo',
      best_score: 31,
      total_score: 120,
      total_fish_collected: 18,
      total_pipes_cleared: 19,
      runs_played: 6,
      created_at: '2026-10-04T13:00:00.000Z',
    },
    {
      player_id: 'plr_seed_paw05',
      device_id: 'dev_seed_paw05',
      username: 'KucingGenteng',
      best_score: 16,
      total_score: 54,
      total_fish_collected: 9,
      total_pipes_cleared: 11,
      runs_played: 4,
      created_at: '2026-10-05T14:00:00.000Z',
    },
  ];

  const tx = await db.transaction('write');
  try {
    const count = await tx.execute('SELECT COUNT(*) AS cnt FROM players');
    if (Number((count.rows[0] as unknown as { cnt: number }).cnt) > 0) {
      await tx.commit();
      return;
    }

    const lockedHash = '0000000000000000000000000000000000000000000000000000000000000000';
    for (const rival of rivals) {
      await tx.execute({
        sql: [
          'INSERT OR IGNORE INTO players (',
          '  player_id, device_id, auth_token_hash, username, normalized_username,',
          '  created_at, updated_at, best_score, total_score, total_fish_collected,',
          '  total_pipes_cleared, runs_played, last_active_at',
          ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ].join('\n'),
        args: [
          rival.player_id,
          rival.device_id,
          lockedHash,
          rival.username,
          rival.username.toLowerCase(),
          rival.created_at,
          rival.created_at,
          rival.best_score,
          rival.total_score,
          rival.total_fish_collected,
          rival.total_pipes_cleared,
          rival.runs_played,
          rival.created_at,
        ],
      });
    }

    await tx.commit();
  } catch (err) {
    if (!tx.closed) {
      try {
        await tx.rollback();
      } catch {
        // Preserve the original seed error.
      }
    }
    throw err;
  } finally {
    tx.close();
  }
}
