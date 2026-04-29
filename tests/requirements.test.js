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
