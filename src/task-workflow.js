import { matrixError } from './errors.js';
import { recomputeRequirementStatus } from './requirements.js';
import { mapTaskRow, getTaskRowById } from './task-helpers.js';

/**
 * @typedef {import('./models.js').PickTaskInput} PickTaskInput
 * @typedef {import('./models.js').CompleteTaskInput} CompleteTaskInput
 * @typedef {import('./models.js').ReleaseTaskInput} ReleaseTaskInput
 * @typedef {import('./models.js').ForceReleaseTaskInput} ForceReleaseTaskInput
 * @typedef {import('./models.js').Task} Task
 */

/**
 * @typedef {Object} TaskWorkflowService
 * @property {(input: PickTaskInput) => Task} pickTask
 * @property {(input: CompleteTaskInput) => Task} completeTask
 * @property {(input: ReleaseTaskInput) => Task} releaseTask
 * @property {(input: ForceReleaseTaskInput) => Task} forceReleaseTask
 */

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {TaskWorkflowService}
 */
export function getTaskWorkflowService(db) {
  return {
    pickTask: (input) => {
      const row = getTaskRowById(db, input.taskId);
      if (!row) {
        throw matrixError('NOT_FOUND', `Task not found: ${input.taskId}`);
      }

      if (String(row['status']) !== 'ToDo') {
        throw matrixError(
          'TASK_NOT_OPEN',
          `Task is not open: ${input.taskId} (status: ${row['status']})`
        );
      }

      // Check all task dependencies are Done
      const unsatisfiedTaskDeps = db
        .prepare(
          `SELECT td.to_task_id
           FROM task_dependencies td
           JOIN tasks dep ON dep.id = td.to_task_id
           WHERE td.from_task_id = ? AND dep.status != 'Done'`
        )
        .all(input.taskId);

      if (unsatisfiedTaskDeps.length > 0) {
        const ids = unsatisfiedTaskDeps.map((r) => String(r['to_task_id'])).join(', ');
        throw matrixError(
          'DEPENDENCIES_NOT_SATISFIED',
          `Task ${input.taskId} has unsatisfied task dependencies: ${ids}`
        );
      }

      // Check all parent requirement's dependency requirements are Done
      const parentReqId = String(row['parent_req_id']);
      const unsatisfiedReqDeps = db
        .prepare(
          `SELECT rd.to_req_id
           FROM requirement_dependencies rd
           JOIN requirements dep ON dep.id = rd.to_req_id
           WHERE rd.from_req_id = ? AND dep.status != 'Done'`
        )
        .all(parentReqId);

      if (unsatisfiedReqDeps.length > 0) {
        const ids = unsatisfiedReqDeps.map((r) => String(r['to_req_id'])).join(', ');
        throw matrixError(
          'DEPENDENCIES_NOT_SATISFIED',
          `Parent requirement ${parentReqId} has unsatisfied requirement dependencies: ${ids}`
        );
      }

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE tasks SET status = 'InProgress', assigned_to = ?, updated_at = ? WHERE id = ?`
      ).run(input.agentId, now, input.taskId);

      recomputeRequirementStatus(db, parentReqId);

      const updated = getTaskRowById(db, input.taskId);
      if (!updated)
        throw matrixError('INTERNAL_ERROR', `Task not found after pick: ${input.taskId}`);
      return mapTaskRow(db, updated);
    },

    completeTask: (input) => {
      const row = getTaskRowById(db, input.taskId);
      if (!row) {
        throw matrixError('NOT_FOUND', `Task not found: ${input.taskId}`);
      }

      if (String(row['status']) !== 'InProgress') {
        throw matrixError(
          'TASK_NOT_IN_PROGRESS',
          `Task is not in progress: ${input.taskId} (status: ${row['status']})`
        );
      }

      if (row['assigned_to'] !== input.agentId) {
        throw matrixError(
          'NOT_OWNER',
          `Ownership mismatch: task ${input.taskId} is assigned to ${row['assigned_to']}, not ${input.agentId}`
        );
      }

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE tasks SET status = 'Done', assigned_to = NULL, updated_at = ? WHERE id = ?`
      ).run(now, input.taskId);

      const parentReqId = String(row['parent_req_id']);
      recomputeRequirementStatus(db, parentReqId);

      const updated = getTaskRowById(db, input.taskId);
      if (!updated)
        throw matrixError('INTERNAL_ERROR', `Task not found after complete: ${input.taskId}`);
      return mapTaskRow(db, updated);
    },

    releaseTask: (input) => {
      const row = getTaskRowById(db, input.taskId);
      if (!row) {
        throw matrixError('NOT_FOUND', `Task not found: ${input.taskId}`);
      }

      if (String(row['status']) !== 'InProgress') {
        throw matrixError(
          'TASK_NOT_IN_PROGRESS',
          `Task is not in progress: ${input.taskId} (status: ${row['status']})`
        );
      }

      if (row['assigned_to'] !== input.agentId) {
        throw matrixError(
          'NOT_OWNER',
          `Ownership mismatch: task ${input.taskId} is assigned to ${row['assigned_to']}, not ${input.agentId}`
        );
      }

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE tasks SET status = 'ToDo', assigned_to = NULL, updated_at = ? WHERE id = ?`
      ).run(now, input.taskId);

      const parentReqId = String(row['parent_req_id']);
      recomputeRequirementStatus(db, parentReqId);

      const updated = getTaskRowById(db, input.taskId);
      if (!updated)
        throw matrixError('INTERNAL_ERROR', `Task not found after release: ${input.taskId}`);
      return mapTaskRow(db, updated);
    },

    forceReleaseTask: (input) => {
      const row = getTaskRowById(db, input.taskId);
      if (!row) {
        throw matrixError('NOT_FOUND', `Task not found: ${input.taskId}`);
      }

      if (String(row['status']) !== 'InProgress') {
        throw matrixError(
          'TASK_NOT_IN_PROGRESS',
          `Task is not in progress: ${input.taskId} (status: ${row['status']})`
        );
      }

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE tasks SET status = 'ToDo', assigned_to = NULL, updated_at = ? WHERE id = ?`
      ).run(now, input.taskId);

      const parentReqId = String(row['parent_req_id']);
      recomputeRequirementStatus(db, parentReqId);

      const updated = getTaskRowById(db, input.taskId);
      if (!updated)
        throw matrixError('INTERNAL_ERROR', `Task not found after force-release: ${input.taskId}`);
      return mapTaskRow(db, updated);
    },
  };
}
