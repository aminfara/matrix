import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const DEFAULT_DB_PATH = '.matrix/matrix.db';

/**
 * Resolve the database file path from the environment or default.
 *
 * The path is resolved relative to process.cwd(), which must be the project
 * root. MCP clients that spawn this server must set the `cwd` field in their
 * server config to the project directory. Alternatively, set MATRIX_DB_PATH
 * to an absolute path to override the location entirely.
 *
 * @returns {string} Absolute path to the database file.
 */
function resolveDbPath() {
  // const raw = process.env['MATRIX_DB_PATH'] ?? DEFAULT_DB_PATH;
  const { MATRIX_DB_PATH: raw = DEFAULT_DB_PATH } = process.env;
  // SECURITY: LOW [path-traversal] If MATRIX_DB_PATH is set to an absolute path (e.g.
  // "/etc/sensitive"), resolve() will honour it and ignore process.cwd(), allowing the
  // DB file to be created outside the project directory. Risk is low because this env
  // var is set by the user in their MCP client config and they already have equivalent
  // filesystem access. For defence-in-depth, consider rejecting absolute paths or paths
  // that resolve outside process.cwd() when an absolute path is undesired.
  // Fix needed: validate that resolve(cwd, raw) starts with process.cwd() when a relative
  // path is intended, or document clearly that absolute paths are supported by design.
  // Owner: Toby | First seen: 2026-04-30 | Tracking: n/a
  return resolve(process.cwd(), raw);
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

/**
 * Each entry is applied exactly once, in order, keyed by its version number.
 * Add new entries at the end — never modify existing ones.
 *
 * @type {Array<{ version: number, sql: string }>}
 */
const MIGRATIONS = [
  {
    version: 1,
    sql: `
      -- Tracks applied migrations so the schema evolves safely.
      CREATE TABLE IF NOT EXISTS migrations (
        version    INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      -- Sequential ID counters — one row per entity prefix.
      -- Using a dedicated table avoids races that MAX(id)+1 would introduce.
      CREATE TABLE IF NOT EXISTS id_counters (
        prefix   TEXT PRIMARY KEY,  -- 'req' | 'tsk'
        next_seq INTEGER NOT NULL DEFAULT 1
      );

      INSERT OR IGNORE INTO id_counters (prefix, next_seq) VALUES ('req', 1);
      INSERT OR IGNORE INTO id_counters (prefix, next_seq) VALUES ('tsk', 1);

      -- Requirements
      -- acceptance_criteria is stored as a JSON array of strings.
      -- status_locked: 1 = manually overridden (auto-compute suppressed),
      --                0 = auto-computed from task states.
      CREATE TABLE IF NOT EXISTS requirements (
        id                  TEXT PRIMARY KEY,
        title               TEXT NOT NULL,
        description         TEXT NOT NULL DEFAULT '',
        status              TEXT NOT NULL DEFAULT 'ToDo'
                              CHECK (status IN ('ToDo', 'InProgress', 'Done')),
        status_locked       INTEGER NOT NULL DEFAULT 0
                              CHECK (status_locked IN (0, 1)),
        priority            INTEGER NOT NULL DEFAULT 3
                              CHECK (priority BETWEEN 1 AND 5),
        acceptance_criteria TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );

      -- Tasks
      -- acceptance_criteria is stored as a JSON array of strings.
      -- assigned_to: NULL when unassigned.
      CREATE TABLE IF NOT EXISTS tasks (
        id                  TEXT PRIMARY KEY,
        parent_req_id       TEXT NOT NULL
                              REFERENCES requirements(id) ON DELETE CASCADE,
        title               TEXT NOT NULL,
        description         TEXT NOT NULL DEFAULT '',
        status              TEXT NOT NULL DEFAULT 'ToDo'
                              CHECK (status IN ('ToDo', 'InProgress', 'Done')),
        acceptance_criteria TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
        assigned_to         TEXT,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );

      -- Requirement → Requirement dependencies (many-to-many).
      -- "from_req_id depends on to_req_id" (from is blocked until to is Done).
      -- ON DELETE CASCADE on from: deleting A removes "A depends on B" rows.
      -- ON DELETE RESTRICT on to: cannot delete B while A still depends on it
      --   (enforces HAS_DEPENDENTS at the DB level for requirements).
      CREATE TABLE IF NOT EXISTS requirement_dependencies (
        from_req_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
        to_req_id   TEXT NOT NULL REFERENCES requirements(id) ON DELETE RESTRICT,
        PRIMARY KEY (from_req_id, to_req_id)
      );

      -- Task → Task dependencies (many-to-many, within the same requirement).
      -- "from_task_id depends on to_task_id".
      -- ON DELETE CASCADE on from: deleting A removes "A depends on B" rows.
      -- ON DELETE RESTRICT on to: cannot delete B while A still depends on it
      --   (enforces HAS_DEPENDENTS at the DB level for tasks).
      CREATE TABLE IF NOT EXISTS task_dependencies (
        from_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        to_task_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
        PRIMARY KEY (from_task_id, to_task_id)
      );

      -- Indexes for the most common query patterns
      CREATE INDEX IF NOT EXISTS idx_tasks_parent
        ON tasks(parent_req_id);

      CREATE INDEX IF NOT EXISTS idx_requirements_priority_status
        ON requirements(priority, status);

      CREATE INDEX IF NOT EXISTS idx_tasks_status
        ON tasks(status);

      -- Reverse-lookup indexes: "who depends on X?" — used for HAS_DEPENDENTS
      -- checks, cycle detection, and next_task unblocking queries.
      CREATE INDEX IF NOT EXISTS idx_req_deps_to
        ON requirement_dependencies(to_req_id);

      CREATE INDEX IF NOT EXISTS idx_task_deps_to
        ON task_dependencies(to_task_id);
    `,
  },
];

/**
 * Run any migrations that have not yet been applied.
 * @param {DatabaseSync} db
 */
function runMigrations(db) {
  // Ensure the migrations table itself exists before querying it.
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedVersions = new Set(
    db
      .prepare('SELECT version FROM migrations')
      .all()
      .map((row) => /** @type {{ version: number }} */ (row).version)
  );

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) continue;

    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO migrations (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        new Date().toISOString()
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    console.error(`[matrix] Applied migration v${migration.version}`);
  }
}

// ---------------------------------------------------------------------------
// Database initialisation
// ---------------------------------------------------------------------------

/**
 * Apply pragmas and run any pending migrations on an already-open database.
 * Useful for tests that create an in-memory DatabaseSync before calling this.
 *
 * @param {DatabaseSync} db
 */
export function initDb(db) {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  runMigrations(db);
}

/**
 * Open (or create) the SQLite database, apply pending migrations, and
 * configure pragmas for concurrent multi-process access.
 *
 * @returns {DatabaseSync} The open database instance.
 */
export function openDatabase() {
  const dbPath = resolveDbPath();

  // Create the directory if it doesn't exist.
  mkdirSync(dirname(dbPath), { recursive: true });

  const isNew = !existsSync(dbPath);

  const db = new DatabaseSync(dbPath);

  // Restrict permissions to owner-only on first creation.
  if (isNew) {
    try {
      chmodSync(dbPath, 0o600);
    } catch {
      // Non-fatal — best effort on platforms that don't support chmod.
    }
  }

  // WAL mode allows multiple readers + one writer concurrently without
  // blocking, which is exactly what multi-process stdio agents need.
  db.exec('PRAGMA journal_mode = WAL;');

  initDb(db);

  console.error(`[matrix] Database ready: ${dbPath}`);

  return db;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Allocate the next sequential ID for the given prefix and atomically
 * increment the counter.  The returned ID is zero-padded to 5 digits,
 * e.g. "req-00001", "tsk-00042".
 *
 * @param {DatabaseSync} db
 * @param {'req' | 'tsk'} prefix
 * @returns {string}
 */
export function nextId(db, prefix) {
  const row = db
    .prepare(
      'UPDATE id_counters SET next_seq = next_seq + 1 WHERE prefix = ? RETURNING next_seq - 1 AS seq'
    )
    .get(prefix);

  if (!row) throw new Error(`Unknown ID prefix: ${prefix}`);

  return `${prefix}-${String(/** @type {{ seq: number }} */ (row).seq).padStart(5, '0')}`;
}
