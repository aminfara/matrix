import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDb } from '../src/db.js';
import { getRequirementsService, recomputeRequirementStatus } from '../src/requirements.js';
import { getTasksService } from '../src/tasks.js';

/** @returns {import('node:sqlite').DatabaseSync} */
function makeDb() {
  const db = new DatabaseSync(':memory:');
  initDb(db);
  return db;
}

describe('requirements service', () => {
  /** @type {import('node:sqlite').DatabaseSync} */
  let db;
  /** @type {ReturnType<typeof getRequirementsService>} */
  let svc;

  beforeEach(() => {
    db = makeDb();
    svc = getRequirementsService(db);
  });

  it('creates a requirement with default ToDo status', () => {
    const req = svc.createRequirement({
      title: 'Test',
      description: 'desc',
      priority: 1,
      acceptanceCriteria: ['AC1'],
      dependencies: [],
    });
    expect(req.id).toMatch(/^req-\d{5}$/);
    expect(req.status).toBe('ToDo');
    expect(req.dependencies).toEqual([]);
    expect(req.acceptanceCriteria).toEqual(['AC1']);
  });

  it('sequential IDs increment correctly', () => {
    const r1 = svc.createRequirement({
      title: 'R1',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const r2 = svc.createRequirement({
      title: 'R2',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    expect(r1.id).toBe('req-00001');
    expect(r2.id).toBe('req-00002');
  });

  it('does not reuse IDs after deletion', () => {
    const r1 = svc.createRequirement({
      title: 'R1',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    svc.deleteRequirement({ id: r1.id });
    const r2 = svc.createRequirement({
      title: 'R2',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    expect(r2.id).toBe('req-00002'); // NOT req-00001 again
  });

  it('throws NOT_FOUND when getting non-existent requirement', () => {
    expect(() => svc.getRequirement({ id: 'req-99999' })).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' })
    );
  });

  it('throws INVALID_STATUS when manually setting InProgress', () => {
    const req = svc.createRequirement({
      title: 'R',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    expect(() => svc.updateRequirement({ id: req.id, status: 'InProgress' })).toThrow(
      expect.objectContaining({ code: 'INVALID_STATUS' })
    );
  });

  it('allows manually setting status to Done (status_locked)', () => {
    const req = svc.createRequirement({
      title: 'R',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const updated = svc.updateRequirement({ id: req.id, status: 'Done' });
    expect(updated.status).toBe('Done');
  });

  it('allows manually setting status to ToDo (unlocks)', () => {
    const req = svc.createRequirement({
      title: 'R',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    svc.updateRequirement({ id: req.id, status: 'Done' });
    const unlocked = svc.updateRequirement({ id: req.id, status: 'ToDo' });
    expect(unlocked.status).toBe('ToDo');
  });

  it('throws DUPLICATE_DEPENDENCY for duplicate dep IDs', () => {
    const r1 = svc.createRequirement({
      title: 'R1',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const r2 = svc.createRequirement({
      title: 'R2',
      description: '',
      priority: 2,
      acceptanceCriteria: [],
      dependencies: [],
    });
    expect(() => svc.updateRequirement({ id: r1.id, dependencies: [r2.id, r2.id] })).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_DEPENDENCY' })
    );
  });

  it('throws INVALID_DEPENDENCY for self-dependency', () => {
    const r1 = svc.createRequirement({
      title: 'R1',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    expect(() => svc.updateRequirement({ id: r1.id, dependencies: [r1.id] })).toThrow(
      expect.objectContaining({ code: 'INVALID_DEPENDENCY' })
    );
  });

  it('throws INVALID_DEPENDENCY for non-existent dep', () => {
    const r1 = svc.createRequirement({
      title: 'R1',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    expect(() => svc.updateRequirement({ id: r1.id, dependencies: ['req-99999'] })).toThrow(
      expect.objectContaining({ code: 'INVALID_DEPENDENCY' })
    );
  });

  it('throws CIRCULAR_DEPENDENCY for direct cycle', () => {
    const r1 = svc.createRequirement({
      title: 'R1',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const r2 = svc.createRequirement({
      title: 'R2',
      description: '',
      priority: 2,
      acceptanceCriteria: [],
      dependencies: [],
    });
    // r1 depends on r2
    svc.updateRequirement({ id: r1.id, dependencies: [r2.id] });
    // Now r2 trying to depend on r1 should cycle
    expect(() => svc.updateRequirement({ id: r2.id, dependencies: [r1.id] })).toThrow(
      expect.objectContaining({ code: 'CIRCULAR_DEPENDENCY' })
    );
  });

  it('throws CIRCULAR_DEPENDENCY for indirect cycle', () => {
    const r1 = svc.createRequirement({
      title: 'R1',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const r2 = svc.createRequirement({
      title: 'R2',
      description: '',
      priority: 2,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const r3 = svc.createRequirement({
      title: 'R3',
      description: '',
      priority: 3,
      acceptanceCriteria: [],
      dependencies: [],
    });
    svc.updateRequirement({ id: r1.id, dependencies: [r2.id] });
    svc.updateRequirement({ id: r2.id, dependencies: [r3.id] });
    // r3 → r1 would create r1→r2→r3→r1
    expect(() => svc.updateRequirement({ id: r3.id, dependencies: [r1.id] })).toThrow(
      expect.objectContaining({ code: 'CIRCULAR_DEPENDENCY' })
    );
  });

  it('throws HAS_DEPENDENTS when other requirements depend on the one being deleted', () => {
    const r1 = svc.createRequirement({
      title: 'R1',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const r2 = svc.createRequirement({
      title: 'R2',
      description: '',
      priority: 2,
      acceptanceCriteria: [],
      dependencies: [],
    });
    svc.updateRequirement({ id: r2.id, dependencies: [r1.id] });
    expect(() => svc.deleteRequirement({ id: r1.id })).toThrow(
      expect.objectContaining({ code: 'HAS_DEPENDENTS' })
    );
  });

  it('cascade-deletes child tasks when deleting a requirement', () => {
    const taskSvc = getTasksService(db);
    const req = svc.createRequirement({
      title: 'R1',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    taskSvc.createTask({
      parentReqId: req.id,
      title: 'T1',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    svc.deleteRequirement({ id: req.id });
    expect(() => svc.getRequirement({ id: req.id })).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' })
    );
    const tasks = taskSvc.listTasks({ parentReqId: req.id });
    expect(tasks.length).toBe(0);
  });

  it('cascade-deletes tasks WITH inter-task dependencies when deleting a requirement', () => {
    // This is the critical case: if ON DELETE RESTRICT on task_dependencies.to_task_id
    // were not pre-cleaned, deleting a requirement whose tasks have deps between them would fail.
    const taskSvc = getTasksService(db);
    const req = svc.createRequirement({
      title: 'R1',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const t1 = taskSvc.createTask({
      parentReqId: req.id,
      title: 'T1',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    // T2 depends on T1 — creates a task_dependency row with RESTRICT on to_task_id=t1
    taskSvc.createTask({
      parentReqId: req.id,
      title: 'T2',
      description: '',
      acceptanceCriteria: [],
      dependencies: [t1.id],
    });
    // Must not throw despite the RESTRICT on task_dependencies.to_task_id
    expect(() => svc.deleteRequirement({ id: req.id })).not.toThrow();
    const tasks = taskSvc.listTasks({ parentReqId: req.id });
    expect(tasks.length).toBe(0);
  });

  it('lists requirements with optional status filter', () => {
    svc.createRequirement({
      title: 'R1',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const r2 = svc.createRequirement({
      title: 'R2',
      description: '',
      priority: 2,
      acceptanceCriteria: [],
      dependencies: [],
    });
    svc.updateRequirement({ id: r2.id, status: 'Done' });

    const todo = svc.listRequirements({ status: 'ToDo' });
    expect(todo.length).toBe(1);
    expect(/**@type {import('../src/models.js').Requirement}*/ (todo[0]).title).toBe('R1');

    const done = svc.listRequirements({ status: 'Done' });
    expect(done.length).toBe(1);
    expect(/**@type {import('../src/models.js').Requirement}*/ (done[0]).title).toBe('R2');
  });
});

describe('recomputeRequirementStatus', () => {
  /** @type {import('node:sqlite').DatabaseSync} */
  let db;
  /** @type {ReturnType<typeof getRequirementsService>} */
  let svc;

  beforeEach(() => {
    db = makeDb();
    svc = getRequirementsService(db);
  });

  it('stays ToDo with no tasks', () => {
    const req = svc.createRequirement({
      title: 'R',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    recomputeRequirementStatus(db, req.id);
    expect(svc.getRequirement({ id: req.id }).status).toBe('ToDo');
  });

  it('transitions to InProgress when any task is InProgress', () => {
    const taskSvc = getTasksService(db);
    const req = svc.createRequirement({
      title: 'R',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    taskSvc.createTask({
      parentReqId: req.id,
      title: 'T1',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    // Directly set InProgress to test recompute in isolation
    db.prepare(`UPDATE tasks SET status = 'InProgress' WHERE parent_req_id = ?`).run(req.id);
    recomputeRequirementStatus(db, req.id);
    expect(svc.getRequirement({ id: req.id }).status).toBe('InProgress');
  });

  it('transitions to Done when all tasks are Done', () => {
    const taskSvc = getTasksService(db);
    const req = svc.createRequirement({
      title: 'R',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    taskSvc.createTask({
      parentReqId: req.id,
      title: 'T1',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    taskSvc.createTask({
      parentReqId: req.id,
      title: 'T2',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    db.prepare(`UPDATE tasks SET status = 'Done' WHERE parent_req_id = ?`).run(req.id);
    recomputeRequirementStatus(db, req.id);
    expect(svc.getRequirement({ id: req.id }).status).toBe('Done');
  });

  it('does not override when status_locked', () => {
    const req = svc.createRequirement({
      title: 'R',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    svc.updateRequirement({ id: req.id, status: 'Done' }); // sets status_locked = 1
    // artificially add a task to ensure recompute would change it
    db.prepare(
      `INSERT INTO tasks (id, parent_req_id, title, description, status, acceptance_criteria, assigned_to, created_at, updated_at)
      VALUES ('tsk-00001', ?, 'T', '', 'ToDo', '[]', NULL, datetime('now'), datetime('now'))`
    ).run(req.id);
    recomputeRequirementStatus(db, req.id);
    // should remain Done because status_locked = 1
    expect(svc.getRequirement({ id: req.id }).status).toBe('Done');
  });
});

// ---------------------------------------------------------------------------
// Defensive branch coverage using SQLite triggers
// ---------------------------------------------------------------------------
// These tests exercise lines that are unreachable in normal application flow.
// SQLite BEFORE DELETE triggers let us simulate the race conditions that would
// cause a DELETE to report 0 changes after the pre-checks already passed.
// ---------------------------------------------------------------------------

describe('requirements — defensive branch coverage (trigger-based)', () => {
  /** @type {import('node:sqlite').DatabaseSync} */
  let db;
  /** @type {ReturnType<typeof getRequirementsService>} */
  let svc;

  beforeEach(() => {
    db = makeDb();
    svc = getRequirementsService(db);
  });

  // -------------------------------------------------------------------------
  // createRequirement optional-field defaults (lines 68-71)
  // -------------------------------------------------------------------------

  it('createRequirement: ?? defaults fire when optional fields are omitted', () => {
    // @ts-expect-error — intentionally omitting optional fields to hit ?? branches
    const req = svc.createRequirement({ title: 'Minimal' });
    expect(req.description).toBe('');
    expect(req.priority).toBe(3);
    expect(req.acceptanceCriteria).toEqual([]);
    expect(req.dependencies).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // createRequirement: !row guard after INSERT (line 89)
  // -------------------------------------------------------------------------

  it('createRequirement: INTERNAL_ERROR when row is missing after commit', () => {
    // AFTER INSERT trigger deletes the row inside the same transaction.
    // After COMMIT the row is gone → getRequirementRowById returns null → INTERNAL_ERROR.
    db.exec(`
      CREATE TRIGGER del_after_req_insert
      AFTER INSERT ON requirements
      BEGIN DELETE FROM requirements WHERE id = NEW.id; END
    `);

    expect(() =>
      svc.createRequirement({
        title: 'T',
        description: '',
        priority: 1,
        acceptanceCriteria: [],
        dependencies: [],
      })
    ).toThrow(/Requirement not found after create/);
    db.exec('DROP TRIGGER del_after_req_insert');
  });

  // -------------------------------------------------------------------------
  // updateRequirement: description ?? fallback (line 108)
  // -------------------------------------------------------------------------

  it('updateRequirement: description ?? fallback fires when description is omitted', () => {
    const req = svc.createRequirement({
      title: 'R',
      description: 'original',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });

    // Omitting description → input.description is undefined → ?? String(existing['description'] ?? '')
    const updated = svc.updateRequirement({ id: req.id, title: 'Updated' });
    expect(updated.description).toBe('original');
  });

  // -------------------------------------------------------------------------
  // updateRequirement: !row guard after UPDATE (line 143)
  // -------------------------------------------------------------------------

  it('updateRequirement: INTERNAL_ERROR when row is missing after commit', () => {
    const req = svc.createRequirement({
      title: 'R',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });

    // AFTER UPDATE trigger deletes the row; after COMMIT, getRequirementRowById returns null.
    db.exec(`
      CREATE TRIGGER del_after_req_update
      AFTER UPDATE ON requirements
      BEGIN DELETE FROM requirements WHERE id = OLD.id; END
    `);

    expect(() => svc.updateRequirement({ id: req.id, title: 'Updated' })).toThrow(
      /Requirement not found after update/
    );
    db.exec('DROP TRIGGER del_after_req_update');
  });

  // -------------------------------------------------------------------------
  // deleteRequirement: changes === 0 guard + ROLLBACK (lines 183, 188-189)
  // -------------------------------------------------------------------------

  it('deleteRequirement: INTERNAL_ERROR + ROLLBACK when DELETE returns 0 changes', () => {
    const req = svc.createRequirement({
      title: 'To Delete',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });

    // BEFORE DELETE trigger pre-deletes the row (recursive triggers are OFF by
    // default, so the inner DELETE does not re-fire the trigger).
    // The outer DELETE therefore finds 0 rows → changes = 0 → INTERNAL_ERROR.
    db.exec(`
      CREATE TRIGGER pre_del_req
      BEFORE DELETE ON requirements
      BEGIN
        DELETE FROM requirements WHERE id = OLD.id;
      END
    `);

    expect(() => svc.deleteRequirement({ id: req.id })).toThrow(/Requirement not deleted/);
    db.exec('DROP TRIGGER pre_del_req');
  });

  // -------------------------------------------------------------------------
  // mapRequirementRow: non-string date fallback (lines 268-269)
  // -------------------------------------------------------------------------

  it('mapRequirementRow: String(createdAt/updatedAt) fallback fires when dates are not strings', () => {
    const req = svc.createRequirement({
      title: 'R',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });

    // Store BLOB values; node:sqlite returns them as Uint8Array (type 'object'), not string.
    // TEXT affinity converts integers to strings, but stores BLOBs as-is, so we must use Uint8Array.
    db.prepare('UPDATE requirements SET created_at = ?, updated_at = ? WHERE id = ?').run(
      new Uint8Array([1]),
      new Uint8Array([2]),
      req.id
    );
    const fetched = svc.getRequirement({ id: req.id });
    expect(fetched.createdAt).toBeInstanceOf(Date);
    expect(fetched.updatedAt).toBeInstanceOf(Date);
  });

  // -------------------------------------------------------------------------
  // canReachRequirement: visited.has() continue branch (line 362)
  // -------------------------------------------------------------------------

  it('canReachRequirement: visited.has() continue fires in diamond dependency graph', () => {
    // Build diamond: A→B, A→C, B→D, C→D, D→E
    // Then try E→A (would create a cycle): BFS from A to E visits D twice.
    // Second time D is dequeued, visited.has(D) === true → continue (line 362).
    const a = svc.createRequirement({
      title: 'A',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const b = svc.createRequirement({
      title: 'B',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const c = svc.createRequirement({
      title: 'C',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const d = svc.createRequirement({
      title: 'D',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const e = svc.createRequirement({
      title: 'E',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });

    // Set up diamond: A depends on B and C; B depends on D; C depends on D; D depends on E.
    svc.updateRequirement({ id: a.id, dependencies: [b.id, c.id] });
    svc.updateRequirement({ id: b.id, dependencies: [d.id] });
    svc.updateRequirement({ id: c.id, dependencies: [d.id] });
    svc.updateRequirement({ id: d.id, dependencies: [e.id] });

    // Adding E→A would create a cycle (BFS from A can reach E → CIRCULAR_DEPENDENCY).
    expect(() => svc.updateRequirement({ id: e.id, dependencies: [a.id] })).toThrow(
      expect.objectContaining({ code: 'CIRCULAR_DEPENDENCY' })
    );
  });

  // -------------------------------------------------------------------------
  // canReachRequirement: typeof next !== 'string' branch (line 367)
  // -------------------------------------------------------------------------

  it('canReachRequirement: non-string to_req_id is skipped during BFS', () => {
    const a = svc.createRequirement({
      title: 'A',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const b = svc.createRequirement({
      title: 'B',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });

    // Disable FK enforcement to inject a BLOB dependency value.
    // TEXT affinity converts integers to strings, but stores BLOBs as Uint8Array (type 'object').
    // When canReachRequirement BFS processes A's deps, it finds a Uint8Array;
    // typeof Uint8Array === 'string' → false → skip push (line 367 false branch).
    db.exec('PRAGMA foreign_keys = OFF');
    db.prepare('INSERT INTO requirement_dependencies (from_req_id, to_req_id) VALUES (?, ?)').run(
      a.id,
      new Uint8Array([9, 9])
    );
    db.exec('PRAGMA foreign_keys = ON');

    // updateRequirement(b, {dependencies: [a]}) triggers canReachRequirement(db, a, b).
    // BFS from a: A's deps include BLOB → skipped → no cycle found → OK.
    const updated = svc.updateRequirement({ id: b.id, dependencies: [a.id] });
    expect(updated.dependencies).toContain(a.id);
  });

  // -------------------------------------------------------------------------
  // mapRequirementRow: description ?? '' (line 263) and
  // updateRequirement: existing description ?? '' (line 108)
  //
  // These branches require the description column to allow NULL. We rebuild
  // the requirements table without the NOT NULL constraint to simulate this
  // defensive guard. This is the only way to reach these branches without
  // modifying the source code.
  // -------------------------------------------------------------------------

  it('mapRequirementRow: description ?? empty-string when description is NULL (line 263)', () => {
    const req = svc.createRequirement({
      title: 'R',
      description: 'original',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });

    // Rebuild requirements table without NOT NULL on description.
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`CREATE TABLE requirements_nullable (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ToDo' CHECK (status IN ('ToDo', 'InProgress', 'Done')),
      status_locked INTEGER NOT NULL DEFAULT 0 CHECK (status_locked IN (0, 1)),
      priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
      acceptance_criteria TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
    db.exec('INSERT INTO requirements_nullable SELECT * FROM requirements');
    db.exec('DROP TABLE requirements');
    db.exec('ALTER TABLE requirements_nullable RENAME TO requirements');
    db.exec('PRAGMA foreign_keys = ON');

    db.prepare('UPDATE requirements SET description = NULL WHERE id = ?').run(req.id);
    const fetched = svc.getRequirement({ id: req.id });
    expect(fetched.description).toBe(''); // null ?? '' → ''
  });

  it('updateRequirement: existing description ?? empty-string when description is NULL (line 108)', () => {
    const req = svc.createRequirement({
      title: 'R',
      description: 'original',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });

    // Rebuild requirements table without NOT NULL on description.
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`CREATE TABLE requirements_nullable (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ToDo' CHECK (status IN ('ToDo', 'InProgress', 'Done')),
      status_locked INTEGER NOT NULL DEFAULT 0 CHECK (status_locked IN (0, 1)),
      priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
      acceptance_criteria TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
    db.exec('INSERT INTO requirements_nullable SELECT * FROM requirements');
    db.exec('DROP TABLE requirements');
    db.exec('ALTER TABLE requirements_nullable RENAME TO requirements');
    db.exec('PRAGMA foreign_keys = ON');

    db.prepare('UPDATE requirements SET description = NULL WHERE id = ?').run(req.id);
    // Omit description → uses existing (null) → null ?? '' → '' (line 108 inner ?? branch)
    const updated = svc.updateRequirement({ id: req.id, title: 'Updated' });
    expect(updated.description).toBe('');
  });
});
