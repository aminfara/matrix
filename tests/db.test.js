import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, openDatabase, nextId } from '../src/db.js';

// ---------------------------------------------------------------------------
// initDb
// ---------------------------------------------------------------------------

describe('initDb', () => {
  it('applies migrations on a fresh in-memory database', () => {
    const db = new DatabaseSync(':memory:');
    initDb(db);

    // migrations table should exist and have version 1
    const row = db.prepare('SELECT version FROM migrations').get();
    expect(row).toBeTruthy();
    expect(/** @type {any} */ (row).version).toBe(1);
    db.close();
  });

  it('is idempotent: calling initDb twice does not fail', () => {
    const db = new DatabaseSync(':memory:');
    initDb(db);
    // Second call should skip already-applied migration (the `continue` branch)
    expect(() => initDb(db)).not.toThrow();
    db.close();
  });

  it('enables foreign key enforcement', () => {
    const db = new DatabaseSync(':memory:');
    initDb(db);
    const row = db.prepare('PRAGMA foreign_keys').get();
    expect(/** @type {any} */ (row).foreign_keys).toBe(1);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// openDatabase
// ---------------------------------------------------------------------------

describe('openDatabase', () => {
  /** @type {string} */
  let tmpDir;
  /** @type {import('node:sqlite').DatabaseSync | null} */
  let db;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `matrix-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    db = null;
  });

  afterEach(() => {
    try {
      db?.close();
    } catch {
      // already closed
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the database file and applies migrations', () => {
    const dbPath = join(tmpDir, 'sub', 'matrix.db');
    process.env['MATRIX_DB_PATH'] = dbPath;
    try {
      db = openDatabase();
      expect(existsSync(dbPath)).toBe(true);

      // Schema should be set up
      const row = db.prepare('SELECT version FROM migrations').get();
      expect(/** @type {any} */ (row).version).toBe(1);
    } finally {
      delete process.env['MATRIX_DB_PATH'];
    }
  });

  it('opens an existing database without re-applying migrations', () => {
    const dbPath = join(tmpDir, 'matrix.db');
    process.env['MATRIX_DB_PATH'] = dbPath;
    try {
      // First open
      db = openDatabase();
      db.close();

      // Second open — isNew is false, migrations already applied
      db = openDatabase();
      const rows = db.prepare('SELECT version FROM migrations').all();
      // Still exactly one migration record
      expect(rows.length).toBe(1);
    } finally {
      delete process.env['MATRIX_DB_PATH'];
    }
  });
});

// ---------------------------------------------------------------------------
// nextId
// ---------------------------------------------------------------------------

describe('nextId', () => {
  /** @type {import('node:sqlite').DatabaseSync} */
  let db;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    initDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns zero-padded sequential IDs for req prefix', () => {
    expect(nextId(db, 'req')).toBe('req-00001');
    expect(nextId(db, 'req')).toBe('req-00002');
    expect(nextId(db, 'req')).toBe('req-00003');
  });

  it('returns zero-padded sequential IDs for tsk prefix', () => {
    expect(nextId(db, 'tsk')).toBe('tsk-00001');
    expect(nextId(db, 'tsk')).toBe('tsk-00002');
  });

  it('req and tsk counters are independent', () => {
    nextId(db, 'req');
    nextId(db, 'req');
    expect(nextId(db, 'tsk')).toBe('tsk-00001');
    expect(nextId(db, 'req')).toBe('req-00003');
  });

  it('throws for unknown prefix', () => {
    // @ts-expect-error intentionally passing unknown prefix
    expect(() => nextId(db, 'unknown')).toThrow('Unknown ID prefix: unknown');
  });
});
