import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface DatabaseOptions {
  /** Use ':memory:' for isolated tests or a file path outside public web directories */
  filename?: string;
  seedInitialRivals?: boolean;
}

const DEFAULT_DB_DIR = path.resolve(process.cwd(), '.data');
const DEFAULT_DB_PATH = path.join(DEFAULT_DB_DIR, 'kucing_terbang.sqlite');

/**
 * Opens and migrates the SQLite database with strict foreign-key enforcement,
 * WAL journaling, and schema integrity constraints.
 */
export function createSqliteDatabase(options: DatabaseOptions = {}): DatabaseSync {
  const filename = options.filename ?? process.env.SQLITE_DB_PATH ?? DEFAULT_DB_PATH;

  if (filename !== ':memory:') {
    const dir = path.dirname(filename);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  const db = new DatabaseSync(filename);

  // Configure SQLite pragmas for data integrity and concurrency safety
  db.exec('PRAGMA foreign_keys = ON;');
  if (filename !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA busy_timeout = 5000;');

  runMigrations(db);

  if (options.seedInitialRivals !== false) {
    seedNpcLeaderboardEntries(db);
  }

  return db;
}

interface Migration {
  version: number;
  name: string;
  up: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: '001_initial_players_leaderboard_and_audit',
    up: `
      CREATE TABLE IF NOT EXISTS players (
        player_id TEXT PRIMARY KEY CHECK(length(player_id) >= 8 AND length(player_id) <= 64),
        device_id TEXT NOT NULL UNIQUE CHECK(length(device_id) >= 8 AND length(device_id) <= 128),
        auth_token_hash TEXT NOT NULL CHECK(length(auth_token_hash) = 64),
        username TEXT NOT NULL CHECK(length(username) >= 3 AND length(username) <= 20),
        normalized_username TEXT NOT NULL UNIQUE CHECK(length(normalized_username) >= 3 AND length(normalized_username) <= 20),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        best_score INTEGER NOT NULL DEFAULT 0 CHECK(best_score >= 0),
        total_score INTEGER NOT NULL DEFAULT 0 CHECK(total_score >= 0),
        total_fish_collected INTEGER NOT NULL DEFAULT 0 CHECK(total_fish_collected >= 0),
        total_pipes_cleared INTEGER NOT NULL DEFAULT 0 CHECK(total_pipes_cleared >= 0),
        runs_played INTEGER NOT NULL DEFAULT 0 CHECK(runs_played >= 0),
        last_active_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_players_leaderboard
        ON players(
          best_score DESC,
          total_pipes_cleared DESC,
          total_fish_collected DESC,
          created_at ASC,
          player_id ASC
        );

      CREATE INDEX IF NOT EXISTS idx_players_device_id
        ON players(device_id);

      CREATE TABLE IF NOT EXISTS score_submissions (
        idempotency_key TEXT PRIMARY KEY CHECK(length(idempotency_key) >= 8 AND length(idempotency_key) <= 128),
        player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
        run_score INTEGER NOT NULL CHECK(run_score >= 0),
        fish_collected INTEGER NOT NULL CHECK(fish_collected >= 0),
        pipes_cleared INTEGER NOT NULL CHECK(pipes_cleared >= 0),
        duration_ms INTEGER NOT NULL CHECK(duration_ms >= 0),
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_submissions_player_id
        ON score_submissions(player_id);

      CREATE TABLE IF NOT EXISTS security_events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        player_id TEXT,
        device_id TEXT,
        ip_hash TEXT,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `,
  },
];

function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const getAppliedStmt = db.prepare('SELECT version FROM schema_migrations WHERE version = ?');
  const recordStmt = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
  );

  for (const migration of MIGRATIONS) {
    const existing = getAppliedStmt.get(migration.version);
    if (existing) continue;

    db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      db.exec(migration.up);
      recordStmt.run(migration.version, migration.name, new Date().toISOString());
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }
}

function seedNpcLeaderboardEntries(db: DatabaseSync): void {
  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM players').get() as { cnt: number };
  if (countRow && countRow.cnt > 0) return;

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

  // Deterministic locked token hash for non-interactive seed profiles
  const lockedHash = '0000000000000000000000000000000000000000000000000000000000000000';
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO players (
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    for (const r of rivals) {
      insertStmt.run(
        r.player_id,
        r.device_id,
        lockedHash,
        r.username,
        r.username.toLowerCase(),
        r.created_at,
        r.created_at,
        r.best_score,
        r.total_score,
        r.total_fish_collected,
        r.total_pipes_cleared,
        r.runs_played,
        r.created_at
      );
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}
