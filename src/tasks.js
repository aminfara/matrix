import { nextId } from './db.js';
import { matrixError } from './errors.js';
import { recomputeRequirementStatus } from './requirements.js';
import { mapTaskRow, getTaskRowById, parseAcceptanceCriteria } from './task-helpers.js';

/**
 * @typedef {import('./models.js').CreateTaskInput} CreateTaskInput
 * @typedef {import('./models.js').UpdateTaskInput} UpdateTaskInput
 * @typedef {import('./models.js').DeleteTaskInput} DeleteTaskInput
 * @typedef {import('./models.js').GetTaskInput} GetTaskInput
 * @typedef {import('./models.js').ListTasksInput} ListTasksInput
 * @typedef {import('./models.js').NextTaskInput} NextTaskInput
 * @typedef {import('./models.js').Task} Task
 */

/**
 * @typedef {Object} TasksService
 * @property {(input: CreateTaskInput) => Task} createTask
 * @property {(input: UpdateTaskInput) => Task} updateTask
 * @property {(input: DeleteTaskInput) => Task} deleteTask
 * @property {(input: GetTaskInput) => Task} getTask
 * @property {(input: ListTasksInput) => Task[]} listTasks
 * @property {(input: NextTaskInput) => Task | null} nextTask
 */

/**
 * @typedef {Record<string, import('node:sqlite').SQLOutputValue>} SqlRow
 */

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {TasksService}
 */
export function getTasksService(db) {
  return {
    createTask: (input) => {
      const requirementRow = db
        .prepare('SELECT status_locked FROM requirements WHERE id = ?')
        .get(input.parentReqId);

      if (!requirementRow) {
        throw matrixError('NOT_FOUND', `Requirement not found: ${input.parentReqId}`);
      }

      const now = new Date().toISOString();
      const id = nextId(db, 'tsk');

      const description = input.description ?? '';
      const acceptanceCriteria = input.acceptanceCriteria ?? [];
      const dependencies = input.dependencies ?? [];

      db.exec('BEGIN');
      try {
        db.prepare(
          `INSERT INTO tasks (id, parent_req_id, title, description, status, acceptance_criteria, assigned_to, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'ToDo', ?, NULL, ?, ?)`
        ).run(
          id,
          input.parentReqId,
          input.title,
          description,
          JSON.stringify(acceptanceCriteria),
          now,
          now
        );

        replaceTaskDependencies(db, id, input.parentReqId, dependencies);

        // If parent requirement was manually locked (Done), reset it — a new task reopens it
        if (Number(requirementRow['status_locked']) === 1) {
          db.prepare(
            'UPDATE requirements SET status_locked = 0, status = ?, updated_at = ? WHERE id = ?'
          ).run('ToDo', now, input.parentReqId);
        }

        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      // Recompute parent requirement status after task creation
      recomputeRequirementStatus(db, input.parentReqId);

      const row = getTaskRowById(db, id);
      if (!row) throw matrixError('INTERNAL_ERROR', `Task not found after create: ${id}`);

      return mapTaskRow(db, row);
    },

    updateTask: (input) => {
      const existing = getTaskRowById(db, input.id);
      if (!existing) {
        throw matrixError('NOT_FOUND', `Task not found: ${input.id}`);
      }

      const title = input.title ?? String(existing['title']);
      const description = input.description ?? String(existing['description'] ?? '');
      const acceptanceCriteria = input.acceptanceCriteria ?? parseAcceptanceCriteria(existing);
      const updatedAt = new Date().toISOString();
      const parentReqId = String(existing['parent_req_id']);

      db.exec('BEGIN');
      try {
        db.prepare(
          `UPDATE tasks SET title = ?, description = ?, acceptance_criteria = ?, updated_at = ? WHERE id = ?`
        ).run(title, description, JSON.stringify(acceptanceCriteria), updatedAt, input.id);

        replaceTaskDependencies(db, input.id, parentReqId, input.dependencies);

        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      const row = getTaskRowById(db, input.id);
      if (!row) throw matrixError('INTERNAL_ERROR', `Task not found after update: ${input.id}`);

      return mapTaskRow(db, row);
    },

    deleteTask: (input) => {
      const existing = getTaskRowById(db, input.id);
      if (!existing) {
        throw matrixError('NOT_FOUND', `Task not found: ${input.id}`);
      }

      // Guard: cannot delete a task that is currently InProgress
      if (String(existing['status']) === 'InProgress') {
        throw matrixError(
          'TASK_NOT_IN_PROGRESS',
          `Cannot delete task ${input.id}: it is currently InProgress. Release it first.`
        );
      }

      // Guard: other tasks within the same requirement depend on this one
      const dependents = db
        .prepare('SELECT from_task_id FROM task_dependencies WHERE to_task_id = ?')
        .all(input.id);
      if (dependents.length > 0) {
        const ids = dependents.map((r) => String(r['from_task_id'])).join(', ');
        throw matrixError(
          'HAS_DEPENDENTS',
          `Cannot delete task ${input.id}: referenced by tasks ${ids}`
        );
      }

      const parentReqId = String(existing['parent_req_id']);
      const deletedTask = mapTaskRow(db, existing);
      db.exec('BEGIN');
      try {
        const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(input.id);
        if (Number(result.changes) === 0) {
          throw matrixError('INTERNAL_ERROR', `Task not deleted: ${input.id}`);
        }

        // Recompute parent requirement status after deletion
        recomputeRequirementStatus(db, parentReqId);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      return deletedTask;
    },

    getTask: (input) => {
      const row = getTaskRowById(db, input.id);
      if (!row) {
        throw matrixError('NOT_FOUND', `Task not found: ${input.id}`);
      }

      return mapTaskRow(db, row);
    },

    listTasks: (input) => {
      const where = ['parent_req_id = ?'];
      const params = [input.parentReqId];

      if (input.status !== undefined) {
        where.push('status = ?');
        params.push(input.status);
      }

      const rows = db
        .prepare(
          `SELECT id, parent_req_id, title, description, status, acceptance_criteria, assigned_to, created_at, updated_at
           FROM tasks
           WHERE ${where.join(' AND ')}
           ORDER BY created_at ASC`
        )
        .all(...params);

      return rows.map((row) => mapTaskRow(db, /** @type {SqlRow} */ (row)));
    },

    nextTask: (_input) => {
      // 1. Find unblocked requirements (not Done, all dep reqs are Done), sorted by priority.
      const eligibleReqs = db
        .prepare(
          `SELECT r.id
           FROM requirements r
           WHERE r.status != 'Done'
             AND NOT EXISTS (
               SELECT 1
               FROM requirement_dependencies rd
               JOIN requirements dep ON dep.id = rd.to_req_id
               WHERE rd.from_req_id = r.id
                 AND dep.status != 'Done'
             )
           ORDER BY r.priority ASC`
        )
        .all();

      const nextEligibleTaskStmt = db.prepare(
        `SELECT t.id, t.parent_req_id, t.title, t.description, t.status,
                t.acceptance_criteria, t.assigned_to, t.created_at, t.updated_at
         FROM tasks t
         WHERE t.parent_req_id = ?
           AND t.status = 'ToDo'
           AND NOT EXISTS (
             SELECT 1
             FROM task_dependencies td
             JOIN tasks dep ON dep.id = td.to_task_id
             WHERE td.from_task_id = t.id
               AND dep.status != 'Done'
           )
         ORDER BY t.created_at ASC
         LIMIT 1`
      );

      for (const reqRow of eligibleReqs) {
        const reqId = String(reqRow['id']);

        // 2. Find the first ToDo task in this requirement whose dep tasks are all Done.
        const taskRow = nextEligibleTaskStmt.get(reqId);

        if (taskRow) {
          return mapTaskRow(db, /** @type {SqlRow} */ (taskRow));
        }
      }

      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Validates and replaces all dependency edges for a task.
 * Throws MatrixError for: self-deps, duplicates, cross-req deps, non-existent IDs, cycles.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} taskId
 * @param {string} parentReqId
 * @param {string[] | undefined} dependencies
 */
function replaceTaskDependencies(db, taskId, parentReqId, dependencies) {
  if (!dependencies) return;

  // Detect duplicates
  const seen = new Set();
  for (const depId of dependencies) {
    if (seen.has(depId)) {
      throw matrixError('DUPLICATE_DEPENDENCY', `Duplicate dependency: ${depId}`);
    }
    seen.add(depId);
  }

  // Detect self-dependency
  if (dependencies.includes(taskId)) {
    throw matrixError('INVALID_DEPENDENCY', `A task cannot depend on itself: ${taskId}`);
  }

  // Clear and return early if no dependencies
  if (dependencies.length === 0) {
    db.prepare('DELETE FROM task_dependencies WHERE from_task_id = ?').run(taskId);
    return;
  }

  // Validate all dep IDs exist within the same parent requirement
  const rows = db
    .prepare(
      `SELECT id FROM tasks WHERE parent_req_id = ? AND id IN (${dependencies.map(() => '?').join(', ')})`
    )
    .all(parentReqId, ...dependencies);

  const allowedIds = new Set(rows.map((r) => r['id']).filter((v) => typeof v === 'string'));

  for (const depId of dependencies) {
    if (!allowedIds.has(depId)) {
      throw matrixError(
        'INVALID_DEPENDENCY',
        `Dependency not found or belongs to a different requirement: ${depId}`
      );
    }
  }

  // Cycle detection: adding taskId → depId creates a cycle if depId can already reach taskId
  for (const depId of dependencies) {
    if (canReachTask(db, depId, taskId)) {
      throw matrixError(
        'CIRCULAR_DEPENDENCY',
        `Adding dependency ${taskId} → ${depId} would create a cycle`
      );
    }
  }

  db.prepare('DELETE FROM task_dependencies WHERE from_task_id = ?').run(taskId);

  const insert = db.prepare(
    'INSERT INTO task_dependencies (from_task_id, to_task_id) VALUES (?, ?)'
  );
  for (const depId of dependencies) {
    insert.run(taskId, depId);
  }
}

/**
 * BFS: returns true if `target` is reachable from `start` in the task dependency graph.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} start
 * @param {string} target
 * @returns {boolean}
 */
function canReachTask(db, start, target) {
  const visited = new Set();
  const queue = [start];
  const nextTaskDepsStmt = db.prepare(
    'SELECT to_task_id FROM task_dependencies WHERE from_task_id = ?'
  );
  while (queue.length > 0) {
    const current = /** @type {string} */ (queue.shift());
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const rows = nextTaskDepsStmt.all(current);
    for (const row of rows) {
      const next = row['to_task_id'];
      if (typeof next === 'string') queue.push(next);
    }
  }
  return false;
}
