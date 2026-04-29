import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDb } from '../src/db.js';
import { getRequirementsService } from '../src/requirements.js';
import { getTasksService } from '../src/tasks.js';

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
});
