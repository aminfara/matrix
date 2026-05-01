import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDb } from '../src/db.js';
import { registerTools } from '../src/tools.js';

/** @returns {import('node:sqlite').DatabaseSync} */
function makeDb() {
  const db = new DatabaseSync(':memory:');
  initDb(db);
  return db;
}

/**
 * @typedef {{
 *   inputSchema: Record<string, unknown>,
 *   handler: (args: any) => Promise<any>
 * }} RegisteredTool
 */

describe('MCP tool coverage - requirements', () => {
  /** @type {import('node:sqlite').DatabaseSync} */
  let db;
  /** @type {Map<string, RegisteredTool>} */
  let tools;

  beforeEach(() => {
    db = makeDb();
    tools = new Map();

    registerTools(
      /** @type {any} */ ({
        registerTool(
          /** @type {any} */ name,
          /** @type {any} */ schema,
          /** @type {any} */ handler
        ) {
          tools.set(name, { inputSchema: schema.inputSchema, handler });
        },
      }),
      db
    );
  });

  afterEach(() => {
    db.close();
  });

  /** @param {string} name @param {any} args */
  async function callTool(name, args) {
    const tool = tools.get(name);
    if (!tool) throw new Error(`Tool not registered: ${name}`);
    return tool.handler(args);
  }

  /** @param {any} result */
  function readJson(result) {
    return JSON.parse(result.content[0].text);
  }

  it('create_requirement with valid input returns requirement', async () => {
    const result = await callTool('create_requirement', {
      title: 'Req A',
      description: '',
      priority: 2,
      acceptanceCriteria: [],
      dependencies: [],
    });

    expect(result.isError).toBeUndefined();
    const created = readJson(result);
    expect(created.id).toMatch(/^req-\d{5}$/);
    expect(created.title).toBe('Req A');
  });

  it('create_requirement with unknown dependency returns INVALID_DEPENDENCY', async () => {
    const result = await callTool('create_requirement', {
      title: 'Req A',
      description: '',
      priority: 2,
      acceptanceCriteria: [],
      dependencies: ['req-99999'],
    });

    expect(result.isError).toBe(true);
    expect(readJson(result)).toEqual(expect.objectContaining({ code: 'INVALID_DEPENDENCY' }));
  });

  it('get_requirement with valid id returns requirement', async () => {
    const created = readJson(
      await callTool('create_requirement', {
        title: 'Req A',
        description: '',
        priority: 3,
        acceptanceCriteria: [],
        dependencies: [],
      })
    );

    const result = await callTool('get_requirement', { id: created.id });
    expect(result.isError).toBeUndefined();
    expect(readJson(result).id).toBe(created.id);
  });

  it('get_requirement with unknown id returns NOT_FOUND', async () => {
    const result = await callTool('get_requirement', { id: 'req-99999' });
    expect(result.isError).toBe(true);
    expect(readJson(result)).toEqual(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('list_requirements returns empty array on empty db', async () => {
    const result = await callTool('list_requirements', {});
    expect(result.isError).toBeUndefined();
    expect(readJson(result)).toEqual([]);
  });

  it('list_requirements with malformed payload returns INTERNAL_ERROR', async () => {
    const result = await callTool('list_requirements', undefined);
    expect(result.isError).toBe(true);
    expect(readJson(result)).toEqual(expect.objectContaining({ code: 'INTERNAL_ERROR' }));
  });

  it('update_requirement can change title and priority', async () => {
    const created = readJson(
      await callTool('create_requirement', {
        title: 'Req A',
        description: '',
        priority: 3,
        acceptanceCriteria: [],
        dependencies: [],
      })
    );

    const result = await callTool('update_requirement', {
      id: created.id,
      title: 'Req Updated',
      priority: 1,
    });

    expect(result.isError).toBeUndefined();
    const updated = readJson(result);
    expect(updated.title).toBe('Req Updated');
    expect(updated.priority).toBe(1);
  });

  it('update_requirement unknown id returns NOT_FOUND', async () => {
    const result = await callTool('update_requirement', { id: 'req-99999', title: 'Nope' });
    expect(result.isError).toBe(true);
    expect(readJson(result)).toEqual(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('delete_requirement deletes existing requirement', async () => {
    const created = readJson(
      await callTool('create_requirement', {
        title: 'Req A',
        description: '',
        priority: 3,
        acceptanceCriteria: [],
        dependencies: [],
      })
    );

    const deleted = await callTool('delete_requirement', { id: created.id });
    expect(deleted.isError).toBeUndefined();
    expect(readJson(deleted).id).toBe(created.id);

    const getAfterDelete = await callTool('get_requirement', { id: created.id });
    expect(getAfterDelete.isError).toBe(true);
    expect(readJson(getAfterDelete)).toEqual(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('delete_requirement unknown id returns NOT_FOUND', async () => {
    const result = await callTool('delete_requirement', { id: 'req-99999' });
    expect(result.isError).toBe(true);
    expect(readJson(result)).toEqual(expect.objectContaining({ code: 'NOT_FOUND' }));
  });
});

describe('MCP tool coverage - tasks', () => {
  /** @type {import('node:sqlite').DatabaseSync} */
  let db;
  /** @type {Map<string, RegisteredTool>} */
  let tools;
  /** @type {string} */
  let reqId;

  beforeEach(async () => {
    db = makeDb();
    tools = new Map();

    registerTools(
      /** @type {any} */ ({
        registerTool(
          /** @type {any} */ name,
          /** @type {any} */ schema,
          /** @type {any} */ handler
        ) {
          tools.set(name, { inputSchema: schema.inputSchema, handler });
        },
      }),
      db
    );

    const created = await tools.get('create_requirement')?.handler({
      title: 'Parent req',
      description: '',
      priority: 2,
      acceptanceCriteria: [],
      dependencies: [],
    });
    reqId = JSON.parse(created.content[0].text).id;
  });

  afterEach(() => {
    db.close();
  });

  /** @param {string} name @param {any} args */
  async function callTool(name, args) {
    const tool = tools.get(name);
    if (!tool) throw new Error(`Tool not registered: ${name}`);
    return tool.handler(args);
  }

  /** @param {any} result */
  function readJson(result) {
    return JSON.parse(result.content[0].text);
  }

  it('create_task with valid input returns task', async () => {
    const result = await callTool('create_task', {
      parentReqId: reqId,
      title: 'Task A',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });

    expect(result.isError).toBeUndefined();
    const created = readJson(result);
    expect(created.id).toMatch(/^tsk-\d{5}$/);
    expect(created.parentReqId).toBe(reqId);
  });

  it('create_task with unknown parent requirement returns NOT_FOUND', async () => {
    const result = await callTool('create_task', {
      parentReqId: 'req-99999',
      title: 'Task A',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });

    expect(result.isError).toBe(true);
    expect(readJson(result)).toEqual(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('get_task with valid id returns task', async () => {
    const created = readJson(
      await callTool('create_task', {
        parentReqId: reqId,
        title: 'Task A',
        description: '',
        acceptanceCriteria: [],
        dependencies: [],
      })
    );

    const result = await callTool('get_task', { id: created.id });
    expect(result.isError).toBeUndefined();
    expect(readJson(result).id).toBe(created.id);
  });

  it('get_task with unknown id returns NOT_FOUND', async () => {
    const result = await callTool('get_task', { id: 'tsk-99999' });
    expect(result.isError).toBe(true);
    expect(readJson(result)).toEqual(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('list_tasks returns tasks for requirement', async () => {
    await callTool('create_task', {
      parentReqId: reqId,
      title: 'Task A',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    await callTool('create_task', {
      parentReqId: reqId,
      title: 'Task B',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });

    const result = await callTool('list_tasks', { parentReqId: reqId });
    expect(result.isError).toBeUndefined();
    expect(readJson(result)).toHaveLength(2);
  });

  it('list_tasks with malformed payload returns INTERNAL_ERROR', async () => {
    const result = await callTool('list_tasks', undefined);
    expect(result.isError).toBe(true);
    expect(readJson(result)).toEqual(expect.objectContaining({ code: 'INTERNAL_ERROR' }));
  });

  it('update_task updates title', async () => {
    const created = readJson(
      await callTool('create_task', {
        parentReqId: reqId,
        title: 'Task A',
        description: '',
        acceptanceCriteria: [],
        dependencies: [],
      })
    );

    const result = await callTool('update_task', {
      id: created.id,
      title: 'Task Updated',
    });

    expect(result.isError).toBeUndefined();
    expect(readJson(result).title).toBe('Task Updated');
  });

  it('update_task unknown id returns NOT_FOUND', async () => {
    const result = await callTool('update_task', { id: 'tsk-99999', title: 'Nope' });
    expect(result.isError).toBe(true);
    expect(readJson(result)).toEqual(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('delete_task deletes an existing ToDo task', async () => {
    const created = readJson(
      await callTool('create_task', {
        parentReqId: reqId,
        title: 'Task A',
        description: '',
        acceptanceCriteria: [],
        dependencies: [],
      })
    );

    const deleted = await callTool('delete_task', { id: created.id });
    expect(deleted.isError).toBeUndefined();
    expect(readJson(deleted).id).toBe(created.id);
  });

  it('delete_task unknown id returns NOT_FOUND', async () => {
    const result = await callTool('delete_task', { id: 'tsk-99999' });
    expect(result.isError).toBe(true);
    expect(readJson(result)).toEqual(expect.objectContaining({ code: 'NOT_FOUND' }));
  });
});

describe('MCP tool coverage - workflow', () => {
  /** @type {import('node:sqlite').DatabaseSync} */
  let db;
  /** @type {Map<string, RegisteredTool>} */
  let tools;
  /** @type {string} */
  let reqId;
  /** @type {string} */
  let taskId;

  beforeEach(async () => {
    db = makeDb();
    tools = new Map();

    registerTools(
      /** @type {any} */ ({
        registerTool(
          /** @type {any} */ name,
          /** @type {any} */ schema,
          /** @type {any} */ handler
        ) {
          tools.set(name, { inputSchema: schema.inputSchema, handler });
        },
      }),
      db
    );

    const req = await tools.get('create_requirement')?.handler({
      title: 'Parent req',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    reqId = JSON.parse(req.content[0].text).id;

    const task = await tools.get('create_task')?.handler({
      parentReqId: reqId,
      title: 'Task A',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    taskId = JSON.parse(task.content[0].text).id;
  });

  afterEach(() => {
    db.close();
  });

  /** @param {string} name @param {any} args */
  async function callTool(name, args) {
    const tool = tools.get(name);
    if (!tool) throw new Error(`Tool not registered: ${name}`);
    return tool.handler(args);
  }

  /** @param {any} result */
  function readJson(result) {
    return JSON.parse(result.content[0].text);
  }

  it('pick_task transitions ToDo to InProgress', async () => {
    const result = await callTool('pick_task', { taskId, agentId: 'agent-a' });
    expect(result.isError).toBeUndefined();
    expect(readJson(result)).toEqual(expect.objectContaining({ status: 'InProgress' }));
  });

  it('pick_task unknown id returns NOT_FOUND', async () => {
    const result = await callTool('pick_task', { taskId: 'tsk-99999', agentId: 'agent-a' });
    expect(result.isError).toBe(true);
    expect(readJson(result)).toEqual(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('complete_task transitions InProgress to Done for owner', async () => {
    await callTool('pick_task', { taskId, agentId: 'agent-a' });
    const result = await callTool('complete_task', { taskId, agentId: 'agent-a' });
    expect(result.isError).toBeUndefined();
    expect(readJson(result)).toEqual(expect.objectContaining({ status: 'Done' }));
  });

  it('complete_task with wrong owner returns NOT_OWNER', async () => {
    await callTool('pick_task', { taskId, agentId: 'agent-a' });
    const result = await callTool('complete_task', { taskId, agentId: 'agent-b' });
    expect(result.isError).toBe(true);
    expect(readJson(result)).toEqual(expect.objectContaining({ code: 'NOT_OWNER' }));
  });

  it('release_task transitions InProgress to ToDo for owner', async () => {
    await callTool('pick_task', { taskId, agentId: 'agent-a' });
    const result = await callTool('release_task', { taskId, agentId: 'agent-a' });
    expect(result.isError).toBeUndefined();
    expect(readJson(result)).toEqual(expect.objectContaining({ status: 'ToDo' }));
  });

  it('release_task with wrong owner returns NOT_OWNER', async () => {
    await callTool('pick_task', { taskId, agentId: 'agent-a' });
    const result = await callTool('release_task', { taskId, agentId: 'agent-b' });
    expect(result.isError).toBe(true);
    expect(readJson(result)).toEqual(expect.objectContaining({ code: 'NOT_OWNER' }));
  });

  it('force_release_task releases an in-progress task', async () => {
    await callTool('pick_task', { taskId, agentId: 'agent-a' });
    const result = await callTool('force_release_task', { taskId });
    expect(result.isError).toBeUndefined();
    expect(readJson(result)).toEqual(expect.objectContaining({ status: 'ToDo' }));
  });

  it('force_release_task on non-in-progress task returns TASK_NOT_IN_PROGRESS', async () => {
    const result = await callTool('force_release_task', { taskId });
    expect(result.isError).toBe(true);
    expect(readJson(result)).toEqual(expect.objectContaining({ code: 'TASK_NOT_IN_PROGRESS' }));
  });

  it('next_task returns the first eligible ToDo task', async () => {
    const result = await callTool('next_task', { agentId: 'agent-a' });
    expect(result.isError).toBeUndefined();
    expect(readJson(result)).toEqual(expect.objectContaining({ id: taskId }));
  });

  it('next_task returns null when all tasks are in progress', async () => {
    await callTool('pick_task', { taskId, agentId: 'agent-a' });
    const result = await callTool('next_task', { agentId: 'agent-b' });
    expect(result.isError).toBeUndefined();
    expect(readJson(result)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// wrap() error handling edge cases (tools.js branch coverage)
// ---------------------------------------------------------------------------

describe('MCP tool wrap — error handling branches', () => {
  /** @type {import('node:sqlite').DatabaseSync} */
  let db;
  /** @type {Map<string, RegisteredTool>} */
  let tools;

  beforeEach(() => {
    db = makeDb();
    tools = new Map();

    registerTools(
      /** @type {any} */ ({
        registerTool(
          /** @type {any} */ name,
          /** @type {any} */ schema,
          /** @type {any} */ handler
        ) {
          tools.set(name, { inputSchema: schema.inputSchema, handler });
        },
      }),
      db
    );
  });

  afterEach(() => {
    try {
      db?.close();
    } catch {
      // already closed
    }
  });

  /** @param {string} name @param {any} args */
  async function callTool(name, args) {
    const tool = tools.get(name);
    if (!tool) throw new Error(`Tool not registered: ${name}`);
    return tool.handler(args);
  }

  /** @param {any} result */
  function readJson(result) {
    return JSON.parse(result.content[0].text);
  }

  it('wrap catches non-Error throws (no code, no message) and fills in defaults', async () => {
    // Close the DB so any tool call throws a native error without MatrixError.code
    db.close();
    // Prevent afterEach from trying to close again
    db = /** @type {any} */ (null);
    const freshDb = makeDb();
    try {
      const result = await callTool('list_requirements', undefined);
      // Calling with undefined args throws a TypeError (no .code) → defaults to INTERNAL_ERROR
      expect(result.isError).toBe(true);
      const parsed = readJson(result);
      expect(parsed.code).toBe('INTERNAL_ERROR');
      expect(typeof parsed.message).toBe('string');
    } finally {
      freshDb.close();
    }
  });
});
