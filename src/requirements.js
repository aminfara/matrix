import { nextId } from './db.js';
import { matrixError } from './errors.js';
import { parseAcceptanceCriteria } from './task-helpers.js';

/**
 * @typedef {import('./models.js').CreateRequirementInput} CreateRequirementInput
 * @typedef {import('./models.js').UpdateRequirementInput} UpdateRequirementInput
 * @typedef {import('./models.js').DeleteRequirementInput} DeleteRequirementInput
 * @typedef {import('./models.js').GetRequirementInput} GetRequirementInput
 * @typedef {import('./models.js').ListRequirementsInput} ListRequirementsInput
 * @typedef {import('./models.js').Requirement} Requirement
 */

/**
 * @typedef {Object} RequirementsService
 * @property {(input: CreateRequirementInput) => Requirement} createRequirement
 * @property {(input: UpdateRequirementInput) => Requirement} updateRequirement
 * @property {(input: DeleteRequirementInput) => Requirement} deleteRequirement
 * @property {(input: GetRequirementInput) => Requirement} getRequirement
 * @property {(input: ListRequirementsInput) => Requirement[]} listRequirements
 */

/**
 * @typedef {Record<string, import('node:sqlite').SQLOutputValue>} SqlRow
 */

/**
 * Recomputes and persists the status of a requirement based on its tasks.
 * No-op if the requirement is manually status-locked (status_locked = 1) or not found.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} reqId
 */
export function recomputeRequirementStatus(db, reqId) {
  const req = db.prepare('SELECT status_locked FROM requirements WHERE id = ?').get(reqId);
  if (!req || Number(req['status_locked']) === 1) return;

  const tasks = db.prepare('SELECT status FROM tasks WHERE parent_req_id = ?').all(reqId);

  let newStatus;
  if (tasks.length === 0) {
    newStatus = 'ToDo';
  } else if (tasks.every((t) => String(t['status']) === 'Done')) {
    newStatus = 'Done';
  } else if (tasks.some((t) => String(t['status']) === 'InProgress')) {
    newStatus = 'InProgress';
  } else {
    newStatus = 'ToDo';
  }

  db.prepare('UPDATE requirements SET status = ?, updated_at = ? WHERE id = ?').run(
    newStatus,
    new Date().toISOString(),
    reqId
  );
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {RequirementsService}
 */
export function getRequirementsService(db) {
  return {
    createRequirement: (input) => {
      const now = new Date().toISOString();
      const id = nextId(db, 'req');

      const description = input.description ?? '';
      const priority = input.priority ?? 3;
      const acceptanceCriteria = input.acceptanceCriteria ?? [];
      const dependencies = input.dependencies ?? [];

      db.exec('BEGIN');
      try {
        db.prepare(
          `INSERT INTO requirements (id, title, description, status, status_locked, priority, acceptance_criteria, created_at, updated_at)
           VALUES (?, ?, ?, 'ToDo', 0, ?, ?, ?, ?)`
        ).run(id, input.title, description, priority, JSON.stringify(acceptanceCriteria), now, now);

        replaceRequirementDependencies(db, id, dependencies);

        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      const row = getRequirementRowById(db, id);
      if (!row) throw matrixError('INTERNAL_ERROR', `Requirement not found after create: ${id}`);

      return mapRequirementRow(db, row);
    },

    updateRequirement: (input) => {
      const existing = getRequirementRowById(db, input.id);
      if (!existing) {
        throw matrixError('NOT_FOUND', `Requirement not found: ${input.id}`);
      }

      if (input.status === 'InProgress') {
        throw matrixError(
          'INVALID_STATUS',
          'Status "InProgress" cannot be set manually — it is computed automatically'
        );
      }

      const title = input.title ?? String(existing['title']);
      const description = input.description ?? String(existing['description'] ?? '');
      const priority = input.priority ?? Number(existing['priority']);
      const acceptanceCriteria = input.acceptanceCriteria ?? parseAcceptanceCriteria(existing);
      const status = input.status ?? String(existing['status']);
      // status_locked: 1 if manually set to Done (suppresses auto-recompute), 0 if set to ToDo (resumes it)
      const statusLocked =
        input.status === undefined ? Number(existing['status_locked']) : status === 'Done' ? 1 : 0;
      const updatedAt = new Date().toISOString();

      db.exec('BEGIN');
      try {
        db.prepare(
          `UPDATE requirements
           SET title = ?, description = ?, status = ?, status_locked = ?, priority = ?, acceptance_criteria = ?, updated_at = ?
           WHERE id = ?`
        ).run(
          title,
          description,
          status,
          statusLocked,
          priority,
          JSON.stringify(acceptanceCriteria),
          updatedAt,
          input.id
        );

        replaceRequirementDependencies(db, input.id, input.dependencies);

        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      const row = getRequirementRowById(db, input.id);
      if (!row)
        throw matrixError('INTERNAL_ERROR', `Requirement not found after update: ${input.id}`);

      return mapRequirementRow(db, row);
    },

    deleteRequirement: (input) => {
      const existing = getRequirementRowById(db, input.id);
      if (!existing) {
        throw matrixError('NOT_FOUND', `Requirement not found: ${input.id}`);
      }

      // Guard: other requirements depend on this one — must remove the dependency first
      const dependents = db
        .prepare('SELECT from_req_id FROM requirement_dependencies WHERE to_req_id = ?')
        .all(input.id);
      if (dependents.length > 0) {
        const ids = dependents.map((r) => String(r['from_req_id'])).join(', ');
        throw matrixError(
          'HAS_DEPENDENTS',
          `Cannot delete requirement ${input.id}: referenced by ${ids}`
        );
      }

      const deletedRequirement = mapRequirementRow(db, existing);

      db.exec('BEGIN');
      try {
        // Clean up task dependencies before deleting tasks (avoids ON DELETE RESTRICT on to_task_id)
        db.prepare(
          `DELETE FROM task_dependencies
           WHERE from_task_id IN (SELECT id FROM tasks WHERE parent_req_id = ?)`
        ).run(input.id);

        // Delete all child tasks
        db.prepare('DELETE FROM tasks WHERE parent_req_id = ?').run(input.id);

        // Delete the requirement (ON DELETE CASCADE on requirement_dependencies.from_req_id auto-cleans outgoing req deps)
        const result = db.prepare('DELETE FROM requirements WHERE id = ?').run(input.id);
        if (Number(result.changes) === 0) {
          throw matrixError('INTERNAL_ERROR', `Requirement not deleted: ${input.id}`);
        }

        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      return deletedRequirement;
    },

    getRequirement: (input) => {
      const row = getRequirementRowById(db, input.id);
      if (!row) {
        throw matrixError('NOT_FOUND', `Requirement not found: ${input.id}`);
      }

      return mapRequirementRow(db, row);
    },

    listRequirements: (input) => {
      const where = [];
      const params = [];

      if (input.status !== undefined) {
        where.push('status = ?');
        params.push(input.status);
      }

      if (input.priority !== undefined) {
        where.push('priority = ?');
        params.push(input.priority);
      }

      const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const rows = db
        .prepare(
          `SELECT id, title, description, status, status_locked, priority, acceptance_criteria, created_at, updated_at
           FROM requirements ${whereClause}
           ORDER BY priority ASC, created_at ASC`
        )
        .all(...params);

      return rows.map((row) => mapRequirementRow(db, /** @type {SqlRow} */ (row)));
    },
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} requirementId
 * @returns {string[]}
 */
function getRequirementDependencies(db, requirementId) {
  const rows = db
    .prepare(
      `SELECT to_req_id FROM requirement_dependencies WHERE from_req_id = ? ORDER BY to_req_id ASC`
    )
    .all(requirementId);

  return rows.map((row) => row['to_req_id']).filter((value) => typeof value === 'string');
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {SqlRow} row
 * @returns {Requirement}
 */
function mapRequirementRow(db, row) {
  const createdAt = row['created_at'];
  const updatedAt = row['updated_at'];

  return {
    id: String(row['id']),
    title: String(row['title']),
    description: String(row['description'] ?? ''),
    status: /** @type {'ToDo' | 'InProgress' | 'Done'} */ (String(row['status'])),
    priority: Number(row['priority']),
    acceptanceCriteria: parseAcceptanceCriteria(row),
    dependencies: getRequirementDependencies(db, String(row['id'])),
    createdAt: new Date(typeof createdAt === 'string' ? createdAt : String(createdAt)),
    updatedAt: new Date(typeof updatedAt === 'string' ? updatedAt : String(updatedAt)),
  };
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} id
 * @returns {SqlRow | null}
 */
function getRequirementRowById(db, id) {
  const row = db
    .prepare(
      `SELECT id, title, description, status, status_locked, priority, acceptance_criteria, created_at, updated_at
       FROM requirements WHERE id = ?`
    )
    .get(id);

  return /** @type {SqlRow | null} */ (row ?? null);
}

/**
 * Validates and replaces all dependency edges for a requirement.
 * Throws MatrixError for: self-deps, duplicates, non-existent dep IDs, and cycles.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} requirementId
 * @param {string[] | undefined} dependencies
 */
function replaceRequirementDependencies(db, requirementId, dependencies) {
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
  if (dependencies.includes(requirementId)) {
    throw matrixError(
      'INVALID_DEPENDENCY',
      `A requirement cannot depend on itself: ${requirementId}`
    );
  }

  // Validate all dep IDs exist
  for (const depId of dependencies) {
    const exists = db.prepare('SELECT 1 FROM requirements WHERE id = ?').get(depId);
    if (!exists) {
      throw matrixError('INVALID_DEPENDENCY', `Dependency not found: ${depId}`);
    }
  }

  // Cycle detection: adding requirementId → depId creates a cycle if depId can already reach requirementId
  for (const depId of dependencies) {
    if (canReachRequirement(db, depId, requirementId)) {
      throw matrixError(
        'CIRCULAR_DEPENDENCY',
        `Adding dependency ${requirementId} → ${depId} would create a cycle`
      );
    }
  }

  db.prepare('DELETE FROM requirement_dependencies WHERE from_req_id = ?').run(requirementId);

  const insert = db.prepare(
    'INSERT INTO requirement_dependencies (from_req_id, to_req_id) VALUES (?, ?)'
  );
  for (const depId of dependencies) {
    insert.run(requirementId, depId);
  }
}

/**
 * BFS: returns true if `target` is reachable from `start` in the requirement dependency graph.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} start
 * @param {string} target
 * @returns {boolean}
 */
function canReachRequirement(db, start, target) {
  const visited = new Set();
  const queue = [start];
  const nextReqDepsStmt = db.prepare(
    'SELECT to_req_id FROM requirement_dependencies WHERE from_req_id = ?'
  );
  while (queue.length > 0) {
    const current = /** @type {string} */ (queue.shift());
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const rows = nextReqDepsStmt.all(current);
    for (const row of rows) {
      const next = row['to_req_id'];
      if (typeof next === 'string') queue.push(next);
    }
  }
  return false;
}
