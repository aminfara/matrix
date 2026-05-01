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

describe('task workflow service', () => {
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

  it('pick_task transitions ToDo → InProgress', () => {
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const picked = wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    expect(picked.status).toBe('InProgress');
    expect(picked.assignedTo).toBe('agent-1');
  });

  it('pick_task triggers recompute: req becomes InProgress', () => {
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    const req = reqSvc.getRequirement({ id: parentReqId });
    expect(req.status).toBe('InProgress');
  });

  it('pick_task fails with NOT_FOUND for unknown task', () => {
    expect(() => wfSvc.pickTask({ taskId: 'tsk-99999', agentId: 'agent-1' })).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' })
    );
  });

  it('pick_task fails with TASK_NOT_OPEN if already InProgress', () => {
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    expect(() => wfSvc.pickTask({ taskId: t.id, agentId: 'agent-2' })).toThrow(
      expect.objectContaining({ code: 'TASK_NOT_OPEN' })
    );
  });

  it('pick_task fails DEPENDENCIES_NOT_SATISFIED if task dep not Done', () => {
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
    expect(() => wfSvc.pickTask({ taskId: t2.id, agentId: 'agent-1' })).toThrow(
      expect.objectContaining({ code: 'DEPENDENCIES_NOT_SATISFIED' })
    );
  });

  it('pick_task fails DEPENDENCIES_NOT_SATISFIED if parent req dep not Done', () => {
    const req2 = reqSvc.createRequirement({
      title: 'Blocker',
      description: '',
      priority: 2,
      acceptanceCriteria: [],
      dependencies: [],
    });
    reqSvc.updateRequirement({ id: parentReqId, dependencies: [req2.id] });
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    expect(() => wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' })).toThrow(
      expect.objectContaining({ code: 'DEPENDENCIES_NOT_SATISFIED' })
    );
  });

  it('complete_task transitions InProgress → Done', () => {
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    const done = wfSvc.completeTask({ taskId: t.id, agentId: 'agent-1' });
    expect(done.status).toBe('Done');
    expect(done.assignedTo).toBeUndefined();
  });

  it('complete_task triggers recompute: single task done → req Done', () => {
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    wfSvc.completeTask({ taskId: t.id, agentId: 'agent-1' });
    const req = reqSvc.getRequirement({ id: parentReqId });
    expect(req.status).toBe('Done');
  });

  it('complete_task fails with TASK_NOT_IN_PROGRESS if not InProgress', () => {
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    expect(() => wfSvc.completeTask({ taskId: t.id, agentId: 'agent-1' })).toThrow(
      expect.objectContaining({ code: 'TASK_NOT_IN_PROGRESS' })
    );
  });

  it('complete_task fails with NOT_OWNER if wrong agent', () => {
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    expect(() => wfSvc.completeTask({ taskId: t.id, agentId: 'agent-2' })).toThrow(
      expect.objectContaining({ code: 'NOT_OWNER' })
    );
  });

  it('release_task transitions InProgress → ToDo', () => {
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    const released = wfSvc.releaseTask({ taskId: t.id, agentId: 'agent-1' });
    expect(released.status).toBe('ToDo');
    expect(released.assignedTo).toBeUndefined();
  });

  it('release_task triggers recompute: req back to ToDo', () => {
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    wfSvc.releaseTask({ taskId: t.id, agentId: 'agent-1' });
    const req = reqSvc.getRequirement({ id: parentReqId });
    expect(req.status).toBe('ToDo');
  });

  it('release_task fails with NOT_OWNER if wrong agent', () => {
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    expect(() => wfSvc.releaseTask({ taskId: t.id, agentId: 'agent-2' })).toThrow(
      expect.objectContaining({ code: 'NOT_OWNER' })
    );
  });

  it('force_release_task works regardless of owner', () => {
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    const released = wfSvc.forceReleaseTask({ taskId: t.id });
    expect(released.status).toBe('ToDo');
    expect(released.assignedTo).toBeUndefined();
  });

  it('force_release_task triggers recompute: req returns to ToDo', () => {
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });

    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    const inProgressReq = reqSvc.getRequirement({ id: parentReqId });
    expect(inProgressReq.status).toBe('InProgress');

    wfSvc.forceReleaseTask({ taskId: t.id });

    const req = reqSvc.getRequirement({ id: parentReqId });
    expect(req.status).toBe('ToDo');
  });

  it('force_release_task fails TASK_NOT_IN_PROGRESS if task is ToDo', () => {
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    expect(() => wfSvc.forceReleaseTask({ taskId: t.id })).toThrow(
      expect.objectContaining({ code: 'TASK_NOT_IN_PROGRESS' })
    );
  });

  it('deleteTask fails with TASK_NOT_IN_PROGRESS if task is InProgress', () => {
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    expect(() => taskSvc.deleteTask({ id: t.id })).toThrow(
      expect.objectContaining({ code: 'TASK_NOT_IN_PROGRESS' })
    );
  });

  // ---------------------------------------------------------------------------
  // pickTask — additional TASK_NOT_OPEN variant
  // ---------------------------------------------------------------------------

  it('pick_task fails with TASK_NOT_OPEN if task is already Done', () => {
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    wfSvc.completeTask({ taskId: t.id, agentId: 'agent-1' });
    // Task is now Done — picking it again should fail with TASK_NOT_OPEN
    expect(() => wfSvc.pickTask({ taskId: t.id, agentId: 'agent-2' })).toThrow(
      expect.objectContaining({ code: 'TASK_NOT_OPEN' })
    );
  });

  // ---------------------------------------------------------------------------
  // completeTask — NOT_FOUND and already-Done variant
  // ---------------------------------------------------------------------------

  it('complete_task fails with NOT_FOUND for unknown task', () => {
    expect(() => wfSvc.completeTask({ taskId: 'tsk-99999', agentId: 'agent-1' })).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' })
    );
  });

  it('complete_task fails with TASK_NOT_IN_PROGRESS if task is already Done', () => {
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    wfSvc.completeTask({ taskId: t.id, agentId: 'agent-1' });
    // Trying to complete a Done task should fail
    expect(() => wfSvc.completeTask({ taskId: t.id, agentId: 'agent-1' })).toThrow(
      expect.objectContaining({ code: 'TASK_NOT_IN_PROGRESS' })
    );
  });

  // ---------------------------------------------------------------------------
  // releaseTask — NOT_FOUND and non-InProgress variants
  // ---------------------------------------------------------------------------

  it('release_task fails with NOT_FOUND for unknown task', () => {
    expect(() => wfSvc.releaseTask({ taskId: 'tsk-99999', agentId: 'agent-1' })).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' })
    );
  });

  it('release_task fails with TASK_NOT_IN_PROGRESS if task is ToDo', () => {
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    // Task has never been picked — it is ToDo
    expect(() => wfSvc.releaseTask({ taskId: t.id, agentId: 'agent-1' })).toThrow(
      expect.objectContaining({ code: 'TASK_NOT_IN_PROGRESS' })
    );
  });

  it('release_task fails with TASK_NOT_IN_PROGRESS if task is Done', () => {
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    wfSvc.completeTask({ taskId: t.id, agentId: 'agent-1' });
    // Releasing a Done task should fail
    expect(() => wfSvc.releaseTask({ taskId: t.id, agentId: 'agent-1' })).toThrow(
      expect.objectContaining({ code: 'TASK_NOT_IN_PROGRESS' })
    );
  });

  // ---------------------------------------------------------------------------
  // forceReleaseTask — NOT_FOUND and Done variant
  // ---------------------------------------------------------------------------

  it('force_release_task fails with NOT_FOUND for unknown task', () => {
    expect(() => wfSvc.forceReleaseTask({ taskId: 'tsk-99999' })).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' })
    );
  });

  it('force_release_task fails with TASK_NOT_IN_PROGRESS if task is Done', () => {
    const t = taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    wfSvc.completeTask({ taskId: t.id, agentId: 'agent-1' });
    // Force-releasing a Done task should fail
    expect(() => wfSvc.forceReleaseTask({ taskId: t.id })).toThrow(
      expect.objectContaining({ code: 'TASK_NOT_IN_PROGRESS' })
    );
  });
});

// ---------------------------------------------------------------------------
// Trigger-based tests for defensive branches (ROLLBACK catch + !updated guards)
//
// These branches are only reachable when the DB state changes between a
// pre-condition check and a post-update read — a race condition that cannot
// happen in normal synchronous code.  SQLite triggers let us simulate it:
//
//   RAISE(ABORT) in a BEFORE UPDATE trigger → exercises the ROLLBACK catch
//   DELETE in a BEFORE UPDATE trigger       → exercises the !current NOT_FOUND guard in pickTask
//   DELETE in an AFTER UPDATE trigger       → exercises the !updated INTERNAL_ERROR guards
// ---------------------------------------------------------------------------

describe('task workflow — defensive branch coverage (trigger-based)', () => {
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

  /** @returns {ReturnType<typeof taskSvc.createTask>} */
  function makeTask() {
    return taskSvc.createTask({
      parentReqId,
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
  }

  // -------------------------------------------------------------------------
  // pickTask
  // -------------------------------------------------------------------------

  it('pick_task: ROLLBACK branch fires when UPDATE throws inside transaction', () => {
    const t = makeTask();
    db.exec(`
      CREATE TRIGGER err_on_pick
      BEFORE UPDATE ON tasks
      WHEN OLD.status = 'ToDo' AND NEW.status = 'InProgress'
      BEGIN SELECT RAISE(ABORT, 'simulated pick failure'); END
    `);
    expect(() => wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' })).toThrow(
      /simulated pick failure/
    );
    // ROLLBACK worked — task is still ToDo
    expect(taskSvc.getTask({ id: t.id }).status).toBe('ToDo');
  });

  it('pick_task: NOT_FOUND guard fires when task is deleted inside transaction before UPDATE applies', () => {
    const t = makeTask();
    // BEFORE trigger deletes the row; UPDATE then matches 0 rows (changes=0);
    // the post-COMMIT getTaskRowById returns null → NOT_FOUND.
    db.exec(`
      CREATE TRIGGER del_before_pick
      BEFORE UPDATE ON tasks
      WHEN OLD.status = 'ToDo' AND NEW.status = 'InProgress'
      BEGIN DELETE FROM tasks WHERE id = OLD.id; END
    `);
    expect(() => wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' })).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' })
    );
  });

  it('pick_task: INTERNAL_ERROR guard fires when task is deleted after UPDATE within transaction', () => {
    const t = makeTask();
    // AFTER trigger deletes the row after the UPDATE succeeds (changes=1);
    // the post-COMMIT getTaskRowById returns null → INTERNAL_ERROR.
    db.exec(`
      CREATE TRIGGER del_after_pick
      AFTER UPDATE ON tasks
      WHEN NEW.status = 'InProgress'
      BEGIN DELETE FROM tasks WHERE id = NEW.id; END
    `);
    expect(() => wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' })).toThrow(
      expect.objectContaining({ code: 'INTERNAL_ERROR' })
    );
  });

  // -------------------------------------------------------------------------
  // completeTask
  // -------------------------------------------------------------------------

  it('complete_task: ROLLBACK branch fires when UPDATE throws inside transaction', () => {
    const t = makeTask();
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    db.exec(`
      CREATE TRIGGER err_on_complete
      BEFORE UPDATE ON tasks
      WHEN OLD.status = 'InProgress' AND NEW.status = 'Done'
      BEGIN SELECT RAISE(ABORT, 'simulated complete failure'); END
    `);
    expect(() => wfSvc.completeTask({ taskId: t.id, agentId: 'agent-1' })).toThrow(
      /simulated complete failure/
    );
    // ROLLBACK worked — task is still InProgress
    expect(taskSvc.getTask({ id: t.id }).status).toBe('InProgress');
  });

  it('complete_task: INTERNAL_ERROR guard fires when task is deleted after UPDATE within transaction', () => {
    const t = makeTask();
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    db.exec(`
      CREATE TRIGGER del_after_complete
      AFTER UPDATE ON tasks
      WHEN NEW.status = 'Done'
      BEGIN DELETE FROM tasks WHERE id = NEW.id; END
    `);
    expect(() => wfSvc.completeTask({ taskId: t.id, agentId: 'agent-1' })).toThrow(
      expect.objectContaining({ code: 'INTERNAL_ERROR' })
    );
  });

  // -------------------------------------------------------------------------
  // releaseTask
  // -------------------------------------------------------------------------

  it('release_task: ROLLBACK branch fires when UPDATE throws inside transaction', () => {
    const t = makeTask();
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    db.exec(`
      CREATE TRIGGER err_on_release
      BEFORE UPDATE ON tasks
      WHEN OLD.status = 'InProgress' AND NEW.status = 'ToDo'
      BEGIN SELECT RAISE(ABORT, 'simulated release failure'); END
    `);
    expect(() => wfSvc.releaseTask({ taskId: t.id, agentId: 'agent-1' })).toThrow(
      /simulated release failure/
    );
    // ROLLBACK worked — task is still InProgress
    expect(taskSvc.getTask({ id: t.id }).status).toBe('InProgress');
  });

  it('release_task: INTERNAL_ERROR guard fires when task is deleted after UPDATE within transaction', () => {
    const t = makeTask();
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    db.exec(`
      CREATE TRIGGER del_after_release
      AFTER UPDATE ON tasks
      WHEN NEW.status = 'ToDo' AND OLD.status = 'InProgress'
      BEGIN DELETE FROM tasks WHERE id = NEW.id; END
    `);
    expect(() => wfSvc.releaseTask({ taskId: t.id, agentId: 'agent-1' })).toThrow(
      expect.objectContaining({ code: 'INTERNAL_ERROR' })
    );
  });

  // -------------------------------------------------------------------------
  // forceReleaseTask
  // -------------------------------------------------------------------------

  it('force_release_task: ROLLBACK branch fires when UPDATE throws inside transaction', () => {
    const t = makeTask();
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    db.exec(`
      CREATE TRIGGER err_on_force_release
      BEFORE UPDATE ON tasks
      WHEN OLD.status = 'InProgress' AND NEW.status = 'ToDo'
      BEGIN SELECT RAISE(ABORT, 'simulated force-release failure'); END
    `);
    expect(() => wfSvc.forceReleaseTask({ taskId: t.id })).toThrow(
      /simulated force-release failure/
    );
    // ROLLBACK worked — task is still InProgress
    db.exec('DROP TRIGGER err_on_force_release');
    expect(taskSvc.getTask({ id: t.id }).status).toBe('InProgress');
  });

  it('force_release_task: INTERNAL_ERROR guard fires when task is deleted after UPDATE within transaction', () => {
    const t = makeTask();
    wfSvc.pickTask({ taskId: t.id, agentId: 'agent-1' });
    db.exec(`
      CREATE TRIGGER del_after_force_release
      AFTER UPDATE ON tasks
      WHEN NEW.status = 'ToDo' AND OLD.status = 'InProgress'
      BEGIN DELETE FROM tasks WHERE id = NEW.id; END
    `);
    expect(() => wfSvc.forceReleaseTask({ taskId: t.id })).toThrow(
      expect.objectContaining({ code: 'INTERNAL_ERROR' })
    );
  });
});
