import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { doubleCsrf } from 'csrf-csrf';
import { randomBytes } from 'node:crypto';
import { getRequirementsService } from '../../requirements.js';
import { getTasksService } from '../../tasks.js';
import { getTaskWorkflowService } from '../../task-workflow.js';
import {
  createRequirementInputSchema,
  updateRequirementInputSchema,
  createTaskInputSchema,
  updateTaskInputSchema,
  pickTaskInputSchema,
  completeTaskInputSchema,
  releaseTaskInputSchema,
  forceReleaseTaskInputSchema,
} from '../../models.js';
import { MATRIX_ERROR_SYMBOL } from '../../errors.js';
import { layout, escapeHtml } from './views/layout.js';
import { requirementsList, requirementDetail, requirementForm } from './views/requirements.js';
import { taskDetail, taskForm } from './views/tasks.js';

const CSRF_SECRET = randomBytes(32).toString('hex');

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ disableCsrf?: boolean }} [options]
 * @returns {import('express').Application}
 */
export function createApp(db, options = {}) {
  const { disableCsrf = false } = options;
  const app = express();
  const requirements = getRequirementsService(db);
  const tasks = getTasksService(db);
  const workflow = getTaskWorkflowService(db);
  const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
    getSecret: () => CSRF_SECRET,
    getSessionIdentifier: (req) => req.ip ?? '',
    cookieName: 'x-csrf-token',
    cookieOptions: {
      sameSite: 'strict',
      secure: false,
      httpOnly: true,
      path: '/',
    },
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        },
      },
    })
  );

  app.use(cookieParser());
  app.use(express.urlencoded({ extended: false }));

  if (!disableCsrf) {
    app.use(doubleCsrfProtection);
  }

  app.get('/', (_req, res) => {
    try {
      res.redirect('/requirements');
    } catch (error) {
      renderError(res, error);
    }
  });

  app.get('/requirements', (_req, res) => {
    try {
      const reqs = requirements.listRequirements({});
      res.status(200).send(layout('Requirements', requirementsList(reqs)));
    } catch (error) {
      renderError(res, error);
    }
  });

  app.get('/requirements/new', (req, res) => {
    try {
      const csrfToken = disableCsrf ? '' : generateCsrfToken(req, res);
      res.status(200).send(layout('New Requirement', requirementForm(undefined, csrfToken)));
    } catch (error) {
      renderError(res, error);
    }
  });

  app.post('/requirements', (req, res) => {
    try {
      const parseResult = createRequirementInputSchema.safeParse({
        title: readString(req.body.title),
        description: readString(req.body.description),
        priority: parsePriority(req.body.priority),
        acceptanceCriteria: parseList(req.body.acceptanceCriteria),
        dependencies: parseList(req.body.dependencies),
      });
      if (!parseResult.success) {
        renderValidationError(
          res,
          parseResult.error.issues.map((issue) => issue.message)
        );
        return;
      }

      const created = requirements.createRequirement(parseResult.data);
      res.redirect(303, `/requirements/${encodeURIComponent(created.id)}`);
    } catch (error) {
      renderError(res, error);
    }
  });

  app.get('/requirements/:id', (req, res) => {
    try {
      const csrfToken = disableCsrf ? '' : generateCsrfToken(req, res);
      const requirement = requirements.getRequirement({ id: req.params.id });
      const reqTasks = tasks.listTasks({ parentReqId: requirement.id });
      res
        .status(200)
        .send(layout(requirement.title, requirementDetail(requirement, reqTasks, csrfToken)));
    } catch (error) {
      renderError(res, error);
    }
  });

  app.get('/requirements/:id/edit', (req, res) => {
    try {
      const csrfToken = disableCsrf ? '' : generateCsrfToken(req, res);
      const requirement = requirements.getRequirement({ id: req.params.id });
      res.status(200).send(layout('Edit Requirement', requirementForm(requirement, csrfToken)));
    } catch (error) {
      renderError(res, error);
    }
  });

  app.post('/requirements/:id/update', (req, res) => {
    try {
      const parseResult = updateRequirementInputSchema.safeParse({
        id: req.params.id,
        title: readString(req.body.title),
        description: readString(req.body.description),
        priority: parsePriority(req.body.priority),
        acceptanceCriteria: parseList(req.body.acceptanceCriteria),
        dependencies: parseList(req.body.dependencies),
      });
      if (!parseResult.success) {
        renderValidationError(
          res,
          parseResult.error.issues.map((issue) => issue.message)
        );
        return;
      }

      const updated = requirements.updateRequirement(parseResult.data);
      res.redirect(303, `/requirements/${encodeURIComponent(updated.id)}`);
    } catch (error) {
      renderError(res, error);
    }
  });

  app.post('/requirements/:id/delete', (req, res) => {
    try {
      requirements.deleteRequirement({ id: req.params.id });
      res.redirect(303, '/requirements');
    } catch (error) {
      renderError(res, error);
    }
  });

  app.get('/requirements/:reqId/tasks/new', (req, res) => {
    try {
      const csrfToken = disableCsrf ? '' : generateCsrfToken(req, res);
      const requirement = requirements.getRequirement({ id: req.params.reqId });
      res.status(200).send(layout('New Task', taskForm(undefined, requirement, csrfToken)));
    } catch (error) {
      renderError(res, error);
    }
  });

  app.post('/requirements/:reqId/tasks', (req, res) => {
    try {
      const parseResult = createTaskInputSchema.safeParse({
        parentReqId: req.params.reqId,
        title: readString(req.body.title),
        description: readString(req.body.description),
        acceptanceCriteria: parseList(req.body.acceptanceCriteria),
        dependencies: parseList(req.body.dependencies),
      });
      if (!parseResult.success) {
        renderValidationError(
          res,
          parseResult.error.issues.map((issue) => issue.message)
        );
        return;
      }

      const created = tasks.createTask(parseResult.data);
      res.redirect(303, `/tasks/${encodeURIComponent(created.id)}`);
    } catch (error) {
      renderError(res, error);
    }
  });

  app.get('/tasks/:id', (req, res) => {
    try {
      const csrfToken = disableCsrf ? '' : generateCsrfToken(req, res);
      const task = tasks.getTask({ id: req.params.id });
      const requirement = requirements.getRequirement({ id: task.parentReqId });
      res.status(200).send(layout(task.title, taskDetail(task, requirement, csrfToken)));
    } catch (error) {
      renderError(res, error);
    }
  });

  app.get('/tasks/:id/edit', (req, res) => {
    try {
      const csrfToken = disableCsrf ? '' : generateCsrfToken(req, res);
      const task = tasks.getTask({ id: req.params.id });
      const requirement = requirements.getRequirement({ id: task.parentReqId });
      res.status(200).send(layout('Edit Task', taskForm(task, requirement, csrfToken)));
    } catch (error) {
      renderError(res, error);
    }
  });

  app.post('/tasks/:id/update', (req, res) => {
    try {
      const parseResult = updateTaskInputSchema.safeParse({
        id: req.params.id,
        title: readString(req.body.title),
        description: readString(req.body.description),
        acceptanceCriteria: parseList(req.body.acceptanceCriteria),
        dependencies: parseList(req.body.dependencies),
      });
      if (!parseResult.success) {
        renderValidationError(
          res,
          parseResult.error.issues.map((issue) => issue.message)
        );
        return;
      }

      const updated = tasks.updateTask(parseResult.data);
      res.redirect(303, `/tasks/${encodeURIComponent(updated.id)}`);
    } catch (error) {
      renderError(res, error);
    }
  });

  app.post('/tasks/:id/delete', (req, res) => {
    try {
      const existing = tasks.getTask({ id: req.params.id });
      tasks.deleteTask({ id: req.params.id });
      res.redirect(303, `/requirements/${encodeURIComponent(existing.parentReqId)}`);
    } catch (error) {
      renderError(res, error);
    }
  });

  app.post('/tasks/:id/pick', (req, res) => {
    try {
      const parseResult = pickTaskInputSchema.safeParse({
        taskId: req.params.id,
        agentId: readString(req.body.agentId),
      });
      if (!parseResult.success) {
        renderValidationError(
          res,
          parseResult.error.issues.map((issue) => issue.message)
        );
        return;
      }

      workflow.pickTask(parseResult.data);
      res.redirect(303, `/tasks/${encodeURIComponent(req.params.id)}`);
    } catch (error) {
      renderError(res, error);
    }
  });

  app.post('/tasks/:id/complete', (req, res) => {
    try {
      const parseResult = completeTaskInputSchema.safeParse({
        taskId: req.params.id,
        agentId: readString(req.body.agentId),
      });
      if (!parseResult.success) {
        renderValidationError(
          res,
          parseResult.error.issues.map((issue) => issue.message)
        );
        return;
      }

      workflow.completeTask(parseResult.data);
      res.redirect(303, `/tasks/${encodeURIComponent(req.params.id)}`);
    } catch (error) {
      renderError(res, error);
    }
  });

  app.post('/tasks/:id/release', (req, res) => {
    try {
      const parseResult = releaseTaskInputSchema.safeParse({
        taskId: req.params.id,
        agentId: readString(req.body.agentId),
      });
      if (!parseResult.success) {
        renderValidationError(
          res,
          parseResult.error.issues.map((issue) => issue.message)
        );
        return;
      }

      workflow.releaseTask(parseResult.data);
      res.redirect(303, `/tasks/${encodeURIComponent(req.params.id)}`);
    } catch (error) {
      renderError(res, error);
    }
  });

  app.post('/tasks/:id/force-release', (req, res) => {
    try {
      const parseResult = forceReleaseTaskInputSchema.safeParse({ taskId: req.params.id });
      if (!parseResult.success) {
        renderValidationError(
          res,
          parseResult.error.issues.map((issue) => issue.message)
        );
        return;
      }

      workflow.forceReleaseTask(parseResult.data);
      res.redirect(303, `/tasks/${encodeURIComponent(req.params.id)}`);
    } catch (error) {
      renderError(res, error);
    }
  });

  return app;
}

/**
 * @param {import('express').Response} res
 * @param {unknown} error
 */
function renderError(res, error) {
  const objectError =
    error && typeof error === 'object' ? /** @type {Record<PropertyKey, unknown>} */ (error) : null;
  const isMatrixError = Boolean(objectError && objectError[MATRIX_ERROR_SYMBOL] === true);

  if (isMatrixError) {
    const message = error instanceof Error ? error.message : String(error);
    const code =
      objectError && 'code' in objectError ? String(objectError['code']) : 'INVALID_INPUT';
    res.status(400).send(layout('Error', errorHtml(code, message)));
    return;
  }

  const message = error instanceof Error ? error.message : 'Internal server error';
  res.status(500).send(layout('Error', errorHtml('INTERNAL_ERROR', message)));
}

/**
 * @param {import('express').Response} res
 * @param {string[]} issues
 * @returns {void}
 */
function renderValidationError(res, issues) {
  const message = issues.length > 0 ? issues.join('; ') : 'Invalid input';
  res
    .status(400)
    .send(
      layout(
        'Validation Error',
        `<article><h2>Validation Error</h2><p>${escapeHtml(message)}</p><p><a href="javascript:history.back()">← Go back</a></p></article>`
      )
    );
}

/**
 * @param {string} code
 * @param {string} message
 * @returns {string}
 */
function errorHtml(code, message) {
  return `
    <h1>Error</h1>
    <article>
      <p><strong>Code:</strong> ${escapeHtml(code)}</p>
      <p><strong>Message:</strong> ${escapeHtml(message)}</p>
      <p><a href="/requirements">Back to requirements</a></p>
    </article>
  `;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function readString(value) {
  if (typeof value !== 'string') return '';
  return value;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function parsePriority(value) {
  const parsed = Number.parseInt(readString(value), 10);
  return Number.isNaN(parsed) ? 3 : parsed;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function parseList(value) {
  const raw = readString(value);
  if (raw.length === 0) return [];
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
