import { openDatabase } from '../../db.js';
import { getTaskWorkflowService } from '../../task-workflow.js';
import { handleError } from './utils.js';

/**
 * @typedef {import('../../models.js').Task} Task
 */

/**
 * @param {string} taskId
 * @param {string} agentId
 * @returns {Promise<void>}
 */
export async function pickTask(taskId, agentId) {
  try {
    const db = openDatabase();
    const workflow = getTaskWorkflowService(db);
    const task = workflow.pickTask({ taskId, agentId });
    printSuccess('Picked', task);
  } catch (error) {
    handleError(error);
  }
}

/**
 * @param {string} taskId
 * @param {string} agentId
 * @returns {Promise<void>}
 */
export async function completeTask(taskId, agentId) {
  try {
    const db = openDatabase();
    const workflow = getTaskWorkflowService(db);
    const task = workflow.completeTask({ taskId, agentId });
    printSuccess('Completed', task);
  } catch (error) {
    handleError(error);
  }
}

/**
 * @param {string} taskId
 * @param {string} agentId
 * @returns {Promise<void>}
 */
export async function releaseTask(taskId, agentId) {
  try {
    const db = openDatabase();
    const workflow = getTaskWorkflowService(db);
    const task = workflow.releaseTask({ taskId, agentId });
    printSuccess('Released', task);
  } catch (error) {
    handleError(error);
  }
}

/**
 * @param {string} taskId
 * @returns {Promise<void>}
 */
export async function forceReleaseTask(taskId) {
  try {
    const db = openDatabase();
    const workflow = getTaskWorkflowService(db);
    const task = workflow.forceReleaseTask({ taskId });
    printSuccess('Force-released', task);
  } catch (error) {
    handleError(error);
  }
}

/**
 * @param {string} verb
 * @param {Task} task
 */
function printSuccess(verb, task) {
  console.log(`✓ ${verb}: ${task.id}`);
  console.log(JSON.stringify(task, null, 2));
}
