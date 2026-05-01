import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { initDb } from '../src/db.js';
import { getRequirementsService } from '../src/requirements.js';
import { getTasksService } from '../src/tasks.js';
import { createApp } from '../src/interface/web/server.js';

/** @returns {import('node:sqlite').DatabaseSync} */
function makeDb() {
  const db = new DatabaseSync(':memory:');
  initDb(db);
  return db;
}

describe('web server', () => {
  /** @type {import('node:sqlite').DatabaseSync} */
  let db;
  /** @type {import('express').Application} */
  let app;
  /** @type {ReturnType<typeof getRequirementsService>} */
  let reqSvc;
  /** @type {ReturnType<typeof getTasksService>} */
  let taskSvc;
  /** @type {string} */
  let reqId;
  /** @type {string} */
  let taskId;

  beforeEach(() => {
    db = makeDb();
    app = createApp(db, { disableCsrf: true });
    reqSvc = getRequirementsService(db);
    taskSvc = getTasksService(db);

    const req = reqSvc.createRequirement({
      title: 'Seed requirement',
      description: '',
      priority: 3,
      acceptanceCriteria: [],
      dependencies: [],
    });
    reqId = req.id;

    const task = taskSvc.createTask({
      parentReqId: reqId,
      title: 'Seed task',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    taskId = task.id;
  });

  afterEach(() => {
    db.close();
  });

  it('GET / redirects to /requirements', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/requirements');
  });

  it('GET /requirements returns 200 with requirements HTML', async () => {
    const res = await request(app).get('/requirements');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Requirements');
  });

  it('GET /requirements/new returns 200 with a form', async () => {
    const res = await request(app).get('/requirements/new');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<form');
  });

  it('POST /requirements with valid data creates a requirement and redirects', async () => {
    const res = await request(app)
      .post('/requirements')
      .type('form')
      .send({
        title: 'New requirement',
        description: '',
        priority: '3',
        acceptanceCriteria: '',
        dependencies: '',
      });

    expect(res.status).toBe(303);
    expect(res.headers['location']).toMatch(/^\/requirements\/req-\d{5}$/);

    const createdId = /** @type {string} */ (/** @type {string} */ (res.headers['location']).split('/').pop());
    const created = reqSvc.getRequirement({ id: createdId });
    expect(created.title).toBe('New requirement');
  });

  it('POST /requirements with invalid data returns 400 validation error', async () => {
    const res = await request(app)
      .post('/requirements')
      .type('form')
      .send({
        title: '',
        description: '',
        priority: '3',
        acceptanceCriteria: '',
        dependencies: '',
      });

    expect(res.status).toBe(400);
    expect(res.text).toContain('Validation Error');
  });

  it('GET /requirements/:id returns 200 with requirement detail', async () => {
    const res = await request(app).get(`/requirements/${reqId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Seed requirement');
  });

  it('GET /requirements/:id for unknown id returns 400 error page', async () => {
    const res = await request(app).get('/requirements/req-99999');
    expect(res.status).toBe(400);
    expect(res.text).toContain('Error');
    expect(res.text).toContain('NOT_FOUND');
  });

  it('POST /requirements/:reqId/tasks with valid data creates a task and redirects', async () => {
    const res = await request(app)
      .post(`/requirements/${reqId}/tasks`)
      .type('form')
      .send({
        title: 'New task',
        description: '',
        acceptanceCriteria: '',
        dependencies: '',
      });

    expect(res.status).toBe(303);
    expect(res.headers['location']).toMatch(/^\/tasks\/tsk-\d{5}$/);

    const createdId = /** @type {string} */ (/** @type {string} */ (res.headers['location']).split('/').pop());
    const created = taskSvc.getTask({ id: createdId });
    expect(created.title).toBe('New task');
  });

  it('POST /requirements/:reqId/tasks with invalid data returns 400', async () => {
    const res = await request(app)
      .post(`/requirements/${reqId}/tasks`)
      .type('form')
      .send({
        title: '',
        description: '',
        acceptanceCriteria: '',
        dependencies: '',
      });

    expect(res.status).toBe(400);
    expect(res.text).toContain('Validation Error');
  });

  it('GET /tasks/:id returns 200 with task detail', async () => {
    const res = await request(app).get(`/tasks/${taskId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Seed task');
  });

  it('GET /tasks/:id for non-existent task returns 400', async () => {
    const res = await request(app).get('/tasks/tsk-99999');
    expect(res.status).toBe(400);
    expect(res.text).toContain('NOT_FOUND');
  });

  it('GET /requirements/:id/edit returns 200 with edit form', async () => {
    const res = await request(app).get(`/requirements/${reqId}/edit`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Edit Requirement');
  });

  it('POST /requirements/:id/update with valid data redirects', async () => {
    const res = await request(app)
      .post(`/requirements/${reqId}/update`)
      .type('form')
      .send({
        title: 'Updated Title',
        description: '',
        priority: '2',
        status: '',
        acceptanceCriteria: '',
        dependencies: '',
      });

    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe(`/requirements/${reqId}`);
  });

  it('POST /requirements/:id/delete redirects to requirements list', async () => {
    const fresh = getRequirementsService(db).createRequirement({
      title: 'To Delete',
      description: '',
      priority: 3,
      acceptanceCriteria: [],
      dependencies: [],
    });

    const res = await request(app).post(`/requirements/${fresh.id}/delete`);
    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe('/requirements');
  });

  it('GET /tasks/:id/edit returns 200 with task edit form', async () => {
    const res = await request(app).get(`/tasks/${taskId}/edit`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Edit Task');
  });

  it('POST /tasks/:id/update with valid data redirects', async () => {
    const res = await request(app)
      .post(`/tasks/${taskId}/update`)
      .type('form')
      .send({
        title: 'Updated Task',
        description: '',
        acceptanceCriteria: '',
        dependencies: '',
      });

    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe(`/tasks/${taskId}`);
  });

  it('POST /tasks/:id/delete with ToDo task redirects to requirement', async () => {
    const res = await request(app).post(`/tasks/${taskId}/delete`);
    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe(`/requirements/${reqId}`);
  });

  it('POST /tasks/:id/pick with valid agentId picks the task', async () => {
    const res = await request(app).post(`/tasks/${taskId}/pick`).type('form').send({
      agentId: 'agent-a',
    });

    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe(`/tasks/${taskId}`);

    const task = taskSvc.getTask({ id: taskId });
    expect(task.status).toBe('InProgress');
    expect(task.assignedTo).toBe('agent-a');
  });

  it('POST /tasks/:id/complete with correct agentId completes the task', async () => {
    await request(app).post(`/tasks/${taskId}/pick`).type('form').send({ agentId: 'agent-a' });

    const res = await request(app).post(`/tasks/${taskId}/complete`).type('form').send({
      agentId: 'agent-a',
    });

    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe(`/tasks/${taskId}`);

    const task = taskSvc.getTask({ id: taskId });
    expect(task.status).toBe('Done');
    expect(task.assignedTo).toBeUndefined();
  });

  it('POST /tasks/:id/complete with wrong agent returns 400', async () => {
    await request(app).post(`/tasks/${taskId}/pick`).type('form').send({ agentId: 'agent-a' });

    const res = await request(app).post(`/tasks/${taskId}/complete`).type('form').send({
      agentId: 'agent-b',
    });

    expect(res.status).toBe(400);
    expect(res.text).toContain('NOT_OWNER');
  });

  it('POST /tasks/:id/release with correct agentId releases the task', async () => {
    await request(app).post(`/tasks/${taskId}/pick`).type('form').send({ agentId: 'agent-a' });

    const res = await request(app).post(`/tasks/${taskId}/release`).type('form').send({
      agentId: 'agent-a',
    });

    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe(`/tasks/${taskId}`);

    const task = taskSvc.getTask({ id: taskId });
    expect(task.status).toBe('ToDo');
    expect(task.assignedTo).toBeUndefined();
  });

  it('POST /tasks/:id/force-release force-releases a task', async () => {
    await request(app).post(`/tasks/${taskId}/pick`).type('form').send({ agentId: 'agent-a' });

    const res = await request(app).post(`/tasks/${taskId}/force-release`).type('form').send();

    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe(`/tasks/${taskId}`);

    const task = taskSvc.getTask({ id: taskId });
    expect(task.status).toBe('ToDo');
    expect(task.assignedTo).toBeUndefined();
  });

  describe('CSRF enforcement', () => {
    it('POST mutation without a CSRF token is rejected with 403 when CSRF is enabled', async () => {
      const csrfApp = createApp(db);
      const res = await request(csrfApp)
        .post('/requirements')
        .type('form')
        .send({
          title: 'Should be blocked',
          description: '',
          priority: '3',
          acceptanceCriteria: '',
          dependencies: '',
        });
      expect(res.status).toBe(403);
    });
  });
});
