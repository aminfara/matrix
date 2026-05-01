import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

describe('interface service integration', () => {
  /** @type {import('node:sqlite').DatabaseSync} */
  let db;
  /** @type {ReturnType<typeof getRequirementsService>} */
  let reqSvc;
  /** @type {ReturnType<typeof getTasksService>} */
  let taskSvc;
  /** @type {ReturnType<typeof getTaskWorkflowService>} */
  let workflow;

  beforeEach(() => {
    db = makeDb();
    reqSvc = getRequirementsService(db);
    taskSvc = getTasksService(db);
    workflow = getTaskWorkflowService(db);
  });

  afterEach(() => {
    db.close();
  });

  it('runs a multi-step workflow and auto-transitions parent requirement to Done', () => {
    const req = reqSvc.createRequirement({
      title: 'Main requirement',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });

    const first = taskSvc.createTask({
      parentReqId: req.id,
      title: 'First task',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const second = taskSvc.createTask({
      parentReqId: req.id,
      title: 'Second task',
      description: '',
      acceptanceCriteria: [],
      dependencies: [first.id],
    });

    expect(() => workflow.pickTask({ taskId: second.id, agentId: 'agent-b' })).toThrow(
      expect.objectContaining({ code: 'DEPENDENCIES_NOT_SATISFIED' })
    );

    const firstPicked = workflow.pickTask({ taskId: first.id, agentId: 'agent-a' });
    expect(firstPicked.status).toBe('InProgress');
    expect(reqSvc.getRequirement({ id: req.id }).status).toBe('InProgress');

    workflow.completeTask({ taskId: first.id, agentId: 'agent-a' });

    const secondPicked = workflow.pickTask({ taskId: second.id, agentId: 'agent-b' });
    expect(secondPicked.status).toBe('InProgress');

    workflow.completeTask({ taskId: second.id, agentId: 'agent-b' });
    expect(reqSvc.getRequirement({ id: req.id }).status).toBe('Done');
  });

  it('enforces ownership: another agent cannot complete an assigned task', () => {
    const req = reqSvc.createRequirement({
      title: 'Ownership requirement',
      description: '',
      priority: 2,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const task = taskSvc.createTask({
      parentReqId: req.id,
      title: 'Owned task',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });

    workflow.pickTask({ taskId: task.id, agentId: 'agent-a' });

    expect(() => workflow.completeTask({ taskId: task.id, agentId: 'agent-b' })).toThrow(
      expect.objectContaining({ code: 'NOT_OWNER' })
    );
  });

  it('blocks pick_task while task dependencies are not Done', () => {
    const req = reqSvc.createRequirement({
      title: 'Task dependency requirement',
      description: '',
      priority: 3,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const blocker = taskSvc.createTask({
      parentReqId: req.id,
      title: 'Blocker task',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    const blocked = taskSvc.createTask({
      parentReqId: req.id,
      title: 'Blocked task',
      description: '',
      acceptanceCriteria: [],
      dependencies: [blocker.id],
    });

    expect(() => workflow.pickTask({ taskId: blocked.id, agentId: 'agent-a' })).toThrow(
      expect.objectContaining({ code: 'DEPENDENCIES_NOT_SATISFIED' })
    );
  });

  it('blocks pick_task when the parent requirement has unsatisfied requirement dependencies', () => {
    const blockerReq = reqSvc.createRequirement({
      title: 'Blocking requirement',
      description: '',
      priority: 2,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const blockedReq = reqSvc.createRequirement({
      title: 'Blocked requirement',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [blockerReq.id],
    });
    const blockedTask = taskSvc.createTask({
      parentReqId: blockedReq.id,
      title: 'Blocked by requirement dependency',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });

    expect(() => workflow.pickTask({ taskId: blockedTask.id, agentId: 'agent-a' })).toThrow(
      expect.objectContaining({ code: 'DEPENDENCIES_NOT_SATISFIED' })
    );

    reqSvc.updateRequirement({ id: blockerReq.id, status: 'Done' });
    const picked = workflow.pickTask({ taskId: blockedTask.id, agentId: 'agent-a' });
    expect(picked.status).toBe('InProgress');
  });

  it('allows force_release_task regardless of current ownership', () => {
    const req = reqSvc.createRequirement({
      title: 'Force release requirement',
      description: '',
      priority: 2,
      acceptanceCriteria: [],
      dependencies: [],
    });
    const task = taskSvc.createTask({
      parentReqId: req.id,
      title: 'Recoverable task',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });

    workflow.pickTask({ taskId: task.id, agentId: 'agent-a' });

    const released = workflow.forceReleaseTask({ taskId: task.id });
    expect(released.status).toBe('ToDo');
    expect(released.assignedTo).toBeUndefined();

    const rePicked = workflow.pickTask({ taskId: task.id, agentId: 'agent-b' });
    expect(rePicked.assignedTo).toBe('agent-b');
  });
});
