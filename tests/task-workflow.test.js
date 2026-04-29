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
});
