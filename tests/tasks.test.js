import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDb } from '../src/db.js';
import { getRequirementsService } from '../src/requirements.js';
import { getTasksService } from '../src/tasks.js';
import { getTaskWorkflowService } from '../src/task-workflow.js';

/** @returns {import('node:sqlite').DatabaseSync} */
function makeDb() {
  const db = new DatabaseSync(':memory:');
  initDb(db);
  return db;
}

describe('tasks service', () => {
  /** @type {import('node:sqlite').DatabaseSync} */
  let db;
  /** @type {ReturnType<typeof getRequirementsService>} */
  let reqSvc;
  /** @type {ReturnType<typeof getTasksService>} */
  let taskSvc;
  /** @type {ReturnType<typeof getTaskWorkflowService>} */
  let wfSvc;
  /** @type {string} */
  let parentReqId;

  beforeEach(() => {
    db = makeDb();
    reqSvc = getRequirementsService(db);
    taskSvc = getTasksService(db);
    wfSvc = getTaskWorkflowService(db);
    const req = reqSvc.createRequirement({
      title: 'Parent',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    parentReqId = req.id;
  });

  it('creates a task with ToDo status', () => {
    const task = taskSvc.createTask({
      parentReqId,
      title: 'T1',
      description: 'desc',
      acceptanceCriteria: ['AC1'],
      dependencies: [],
    });
    expect(task.id).toMatch(/^tsk-\d{5}$/);
    expect(task.status).toBe('ToDo');
    expect(task.parentReqId).toBe(parentReqId);
    expect(task.dependencies).toEqual([]);
  });

  it('task creation recomputes parent req status to ToDo', () => {
    taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const req = reqSvc.getRequirement({ id: parentReqId });
    expect(req.status).toBe('ToDo');
  });

  it('resets status_locked when creating a task under a Done-locked requirement', () => {
    reqSvc.updateRequirement({ id: parentReqId, status: 'Done' });
    taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const req = reqSvc.getRequirement({ id: parentReqId });
    // Should be unlocked and ToDo
    expect(req.status).toBe('ToDo');
  });

  it('throws NOT_FOUND for non-existent parent req', () => {
    expect(() =>
      taskSvc.createTask({
        parentReqId: 'req-99999',
        title: 'T',
        description: '',
        acceptanceCriteria: [],
        dependencies: [],
      })
    ).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('throws NOT_FOUND when getting non-existent task', () => {
    expect(() => taskSvc.getTask({ id: 'tsk-99999' })).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' })
    );
  });

  it('throws DUPLICATE_DEPENDENCY for duplicate task dep IDs', () => {
    const t1 = taskSvc.createTask({
      parentReqId,
      title: 'T1',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const t2 = taskSvc.createTask({
      parentReqId,
      title: 'T2',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    expect(() => taskSvc.updateTask({ id: t1.id, dependencies: [t2.id, t2.id] })).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_DEPENDENCY' })
    );
  });

  it('throws INVALID_DEPENDENCY for self-dependency', () => {
    const t1 = taskSvc.createTask({
      parentReqId,
      title: 'T1',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    expect(() => taskSvc.updateTask({ id: t1.id, dependencies: [t1.id] })).toThrow(
      expect.objectContaining({ code: 'INVALID_DEPENDENCY' })
    );
  });

  it('throws INVALID_DEPENDENCY for cross-requirement dependency', () => {
    const req2 = reqSvc.createRequirement({
      title: 'R2',
      description: '',
      priority: 2,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const t1 = taskSvc.createTask({
      parentReqId,
      title: 'T1',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const t2 = taskSvc.createTask({
      parentReqId: req2.id,
      title: 'T2',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    expect(() => taskSvc.updateTask({ id: t1.id, dependencies: [t2.id] })).toThrow(
      expect.objectContaining({ code: 'INVALID_DEPENDENCY' })
    );
  });

  it('throws CIRCULAR_DEPENDENCY for task cycle', () => {
    const t1 = taskSvc.createTask({
      parentReqId,
      title: 'T1',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const t2 = taskSvc.createTask({
      parentReqId,
      title: 'T2',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    taskSvc.updateTask({ id: t1.id, dependencies: [t2.id] });
    expect(() => taskSvc.updateTask({ id: t2.id, dependencies: [t1.id] })).toThrow(
      expect.objectContaining({ code: 'CIRCULAR_DEPENDENCY' })
    );
  });

  it('throws CIRCULAR_DEPENDENCY for indirect (transitive) task cycle', () => {
    const t1 = taskSvc.createTask({
      parentReqId,
      title: 'T1',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const t2 = taskSvc.createTask({
      parentReqId,
      title: 'T2',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const t3 = taskSvc.createTask({
      parentReqId,
      title: 'T3',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    // t1 → t2 → t3; then t3 → t1 would create cycle
    taskSvc.updateTask({ id: t1.id, dependencies: [t2.id] });
    taskSvc.updateTask({ id: t2.id, dependencies: [t3.id] });
    expect(() => taskSvc.updateTask({ id: t3.id, dependencies: [t1.id] })).toThrow(
      expect.objectContaining({ code: 'CIRCULAR_DEPENDENCY' })
    );
  });

  it('throws HAS_DEPENDENTS when deleting a task another task depends on', () => {
    const t1 = taskSvc.createTask({
      parentReqId,
      title: 'T1',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const t2 = taskSvc.createTask({
      parentReqId,
      title: 'T2',
      description: '',
      acceptanceCriteria: [],
      dependencies: [t1.id],
    });
    void t2; // t2 depends on t1
    expect(() => taskSvc.deleteTask({ id: t1.id })).toThrow(
      expect.objectContaining({ code: 'HAS_DEPENDENTS' })
    );
  });

  it('recomputes requirement status to ToDo when last task is deleted', () => {
    const t1 = taskSvc.createTask({
      parentReqId,
      title: 'T1',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });

    wfSvc.pickTask({ taskId: t1.id, agentId: 'agent-1' });
    const inProgressReq = reqSvc.getRequirement({ id: parentReqId });
    expect(inProgressReq.status).toBe('InProgress');

    wfSvc.completeTask({ taskId: t1.id, agentId: 'agent-1' });
    const doneReq = reqSvc.getRequirement({ id: parentReqId });
    expect(doneReq.status).toBe('Done');

    taskSvc.deleteTask({ id: t1.id });
    const req = reqSvc.getRequirement({ id: parentReqId });
    // No tasks → ToDo
    expect(req.status).toBe('ToDo');
  });

  it('nextTask returns null when no tasks', () => {
    const result = taskSvc.nextTask({ agentId: 'agent-1' });
    expect(result).toBeNull();
  });

  it('nextTask returns the first unblocked ToDo task sorted by req priority', () => {
    const req2 = reqSvc.createRequirement({
      title: 'R2',
      description: '',
      priority: 2,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const req1 = reqSvc.createRequirement({
      title: 'R1',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    taskSvc.createTask({
      parentReqId: req2.id,
      title: 'T-low',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const high = taskSvc.createTask({
      parentReqId: req1.id,
      title: 'T-high',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const next = taskSvc.nextTask({ agentId: 'agent-1' });
    expect(next?.id).toBe(high.id);
  });

  it('nextTask skips requirements blocked by unmet requirement dependency', () => {
    const blockerReq = reqSvc.createRequirement({
      title: 'Blocker',
      description: '',
      priority: 2,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const blockedReq = reqSvc.createRequirement({
      title: 'Blocked',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [blockerReq.id],
    });

    taskSvc.createTask({
      parentReqId: blockedReq.id,
      title: 'Blocked task',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const unblockedTask = taskSvc.createTask({
      parentReqId: blockerReq.id,
      title: 'Unblocked task',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });

    const next = taskSvc.nextTask({ agentId: 'agent-1' });
    expect(next?.id).toBe(unblockedTask.id);
  });

  it('nextTask returns null when all available tasks are InProgress', () => {
    const req2 = reqSvc.createRequirement({
      title: 'R2',
      description: '',
      priority: 2,
      acceptanceCriteria: [],
      dependencies: [],
    });

    const t1 = taskSvc.createTask({
      parentReqId,
      title: 'T1',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const t2 = taskSvc.createTask({
      parentReqId: req2.id,
      title: 'T2',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });

    wfSvc.pickTask({ taskId: t1.id, agentId: 'agent-1' });
    wfSvc.pickTask({ taskId: t2.id, agentId: 'agent-2' });

    const next = taskSvc.nextTask({ agentId: 'agent-3' });
    expect(next).toBeNull();
  });

  it('listTasks filters by status', () => {
    const doneTask = taskSvc.createTask({
      parentReqId,
      title: 'Done task',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    taskSvc.createTask({
      parentReqId,
      title: 'Todo task',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });

    wfSvc.pickTask({ taskId: doneTask.id, agentId: 'agent-1' });
    wfSvc.completeTask({ taskId: doneTask.id, agentId: 'agent-1' });

    const done = taskSvc.listTasks({ parentReqId, status: 'Done' });
    expect(done.map((task) => task.id)).toEqual([doneTask.id]);
  });

  it('listRequirements filters by priority', () => {
    reqSvc.createRequirement({
      title: 'Priority 1',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const priority2 = reqSvc.createRequirement({
      title: 'Priority 2',
      description: '',
      priority: 2,
      acceptanceCriteria: [],
      dependencies: [],
    });
    reqSvc.createRequirement({
      title: 'Priority 3',
      description: '',
      priority: 3,
      acceptanceCriteria: [],
      dependencies: [],
    });

    const requirements = reqSvc.listRequirements({ priority: 2 });
    expect(requirements.map((req) => req.id)).toEqual([priority2.id]);
  });
});

// ---------------------------------------------------------------------------
// Defensive branch coverage using SQLite triggers
// ---------------------------------------------------------------------------
// These tests exercise lines unreachable in normal application flow.
// ---------------------------------------------------------------------------

describe('tasks — defensive branch coverage (trigger-based)', () => {
  /** @type {import('node:sqlite').DatabaseSync} */
  let db;
  /** @type {ReturnType<typeof getRequirementsService>} */
  let reqSvc;
  /** @type {ReturnType<typeof getTasksService>} */
  let taskSvc;
  /** @type {string} */
  let parentReqId;

  beforeEach(() => {
    db = makeDb();
    reqSvc = getRequirementsService(db);
    taskSvc = getTasksService(db);
    const req = reqSvc.createRequirement({
      title: 'Parent',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    parentReqId = req.id;
  });

  // -------------------------------------------------------------------------
  // createTask: ROLLBACK branch (lines 76-77)
  // -------------------------------------------------------------------------

  it('createTask: ROLLBACK branch fires when INSERT throws inside transaction', () => {
    // BEFORE INSERT trigger raises an error → INSERT fails → catch → ROLLBACK (lines 76-77).
    db.exec(`
      CREATE TRIGGER err_on_create_task
      BEFORE INSERT ON tasks
      BEGIN SELECT RAISE(ABORT, 'simulated insert failure'); END
    `);

    expect(() =>
      taskSvc.createTask({
        parentReqId,
        title: 'T',
        description: '',
        acceptanceCriteria: [],
        dependencies: [],
      })
    ).toThrow(/simulated insert failure/);
    db.exec('DROP TRIGGER err_on_create_task');
  });

  // -------------------------------------------------------------------------
  // createTask: !row guard after INSERT (line 84)
  // -------------------------------------------------------------------------

  it('createTask: INTERNAL_ERROR when row is missing after commit', () => {
    // AFTER INSERT trigger deletes the row inside the same transaction.
    // After COMMIT the row is gone → getTaskRowById returns null → INTERNAL_ERROR.
    db.exec(`
      CREATE TRIGGER del_after_task_insert
      AFTER INSERT ON tasks
      BEGIN DELETE FROM tasks WHERE id = NEW.id; END
    `);

    expect(() =>
      taskSvc.createTask({
        parentReqId,
        title: 'T',
        description: '',
        acceptanceCriteria: [],
        dependencies: [],
      })
    ).toThrow(/Task not found after create/);
    db.exec('DROP TRIGGER del_after_task_insert');
  });

  // -------------------------------------------------------------------------
  // updateTask: description ?? fallback (line 96)
  // -------------------------------------------------------------------------

  it('updateTask: description ?? fallback fires when description is omitted', () => {
    const task = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: 'original',
      acceptanceCriteria: [],
      dependencies: [],
    });

    // Omitting description → input.description is undefined → ?? String(existing['description'] ?? '')
    const updated = taskSvc.updateTask({ id: task.id, title: 'Updated' });
    expect(updated.description).toBe('original');
  });

  // -------------------------------------------------------------------------
  // updateTask: !row guard after UPDATE (line 116)
  // -------------------------------------------------------------------------

  it('updateTask: INTERNAL_ERROR when row is missing after commit', () => {
    const task = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });

    // AFTER UPDATE trigger deletes the row; after COMMIT, getTaskRowById returns null.
    db.exec(`
      CREATE TRIGGER del_after_task_update
      AFTER UPDATE ON tasks
      BEGIN DELETE FROM tasks WHERE id = OLD.id; END
    `);

    expect(() => taskSvc.updateTask({ id: task.id, title: 'Updated' })).toThrow(
      /Task not found after update/
    );
    db.exec('DROP TRIGGER del_after_task_update');
  });

  // -------------------------------------------------------------------------
  // deleteTask: changes === 0 guard + ROLLBACK (lines 153, 160-161)
  // -------------------------------------------------------------------------

  it('deleteTask: INTERNAL_ERROR + ROLLBACK when DELETE returns 0 changes (lines 153, 160-161)', () => {
    const task = taskSvc.createTask({
      parentReqId,
      title: 'To Delete',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });

    // BEFORE DELETE trigger pre-deletes the row (recursive triggers OFF by default).
    // Outer DELETE finds 0 rows → changes = 0 → INTERNAL_ERROR (line 153) → ROLLBACK (lines 160-161).
    db.exec(`
      CREATE TRIGGER pre_del_task
      BEFORE DELETE ON tasks
      BEGIN
        DELETE FROM tasks WHERE id = OLD.id;
      END
    `);

    expect(() => taskSvc.deleteTask({ id: task.id })).toThrow(/Task not deleted/);
    db.exec('DROP TRIGGER pre_del_task');
  });

  // -------------------------------------------------------------------------
  // canReachTask: visited.has() continue branch (line 339)
  // -------------------------------------------------------------------------

  it('canReachTask: visited.has() continue fires in diamond dependency graph', () => {
    // Build diamond: T1→T2, T1→T3, T2→T4, T3→T4, T4→T5
    // Then try T5→T1 (would create a cycle): BFS from T1 to T5 visits T4 twice.
    // Second time T4 is dequeued, visited.has(T4) === true → continue (line 339).
    const t1 = taskSvc.createTask({
      parentReqId,
      title: 'T1',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const t2 = taskSvc.createTask({
      parentReqId,
      title: 'T2',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const t3 = taskSvc.createTask({
      parentReqId,
      title: 'T3',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const t4 = taskSvc.createTask({
      parentReqId,
      title: 'T4',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const t5 = taskSvc.createTask({
      parentReqId,
      title: 'T5',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });

    // Set up diamond: T1 depends on T2 and T3; T2 depends on T4; T3 depends on T4; T4 depends on T5.
    taskSvc.updateTask({ id: t1.id, dependencies: [t2.id, t3.id] });
    taskSvc.updateTask({ id: t2.id, dependencies: [t4.id] });
    taskSvc.updateTask({ id: t3.id, dependencies: [t4.id] });
    taskSvc.updateTask({ id: t4.id, dependencies: [t5.id] });

    // Adding T5→T1 would create a cycle (BFS from T1 can reach T5 → CIRCULAR_DEPENDENCY).
    expect(() => taskSvc.updateTask({ id: t5.id, dependencies: [t1.id] })).toThrow(
      expect.objectContaining({ code: 'CIRCULAR_DEPENDENCY' })
    );
  });

  // -------------------------------------------------------------------------
  // canReachTask: typeof next !== 'string' branch (line 344)
  // -------------------------------------------------------------------------

  it('canReachTask: non-string to_task_id is skipped during BFS', () => {
    const t1 = taskSvc.createTask({
      parentReqId,
      title: 'T1',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const t2 = taskSvc.createTask({
      parentReqId,
      title: 'T2',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });

    // Disable FK enforcement to inject a BLOB dependency value.
    // TEXT affinity converts integers to strings, but stores BLOBs as Uint8Array (type 'object').
    // When canReachTask BFS processes T1's deps, it finds a Uint8Array;
    // typeof Uint8Array === 'string' → false → skip push (line 344 false branch).
    db.exec('PRAGMA foreign_keys = OFF');
    db.prepare('INSERT INTO task_dependencies (from_task_id, to_task_id) VALUES (?, ?)').run(
      t1.id,
      new Uint8Array([9, 9])
    );
    db.exec('PRAGMA foreign_keys = ON');

    // updateTask(t2, {dependencies: [t1]}) triggers canReachTask(db, t1, t2).
    // BFS from t1: T1's deps include BLOB → skipped → no cycle found → OK.
    const updated = taskSvc.updateTask({ id: t2.id, dependencies: [t1.id] });
    expect(updated.dependencies).toContain(t1.id);
  });

  // -------------------------------------------------------------------------
  // updateTask: existing description ?? '' (line 96)
  //
  // This branch requires the description column to allow NULL. We rebuild
  // the tasks table without the NOT NULL constraint to simulate this
  // defensive guard.
  // -------------------------------------------------------------------------

  it('updateTask: existing description ?? empty-string when description is NULL (line 96)', () => {
    const task = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: 'original',
      acceptanceCriteria: [],
      dependencies: [],
    });

    // Rebuild tasks table without NOT NULL on description.
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`CREATE TABLE tasks_nullable (
      id TEXT PRIMARY KEY,
      parent_req_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
      title TEXT NOT NULL, description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ToDo' CHECK (status IN ('ToDo', 'InProgress', 'Done')),
      acceptance_criteria TEXT NOT NULL DEFAULT '[]',
      assigned_to TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
    db.exec('INSERT INTO tasks_nullable SELECT * FROM tasks');
    db.exec('DROP TABLE tasks');
    db.exec('ALTER TABLE tasks_nullable RENAME TO tasks');
    db.exec('PRAGMA foreign_keys = ON');

    db.prepare('UPDATE tasks SET description = NULL WHERE id = ?').run(task.id);
    // Omit description → uses existing (null) → null ?? '' → '' (line 96 inner ?? branch)
    const updated = taskSvc.updateTask({ id: task.id, title: 'Updated' });
    expect(updated.description).toBe('');
  });
});
