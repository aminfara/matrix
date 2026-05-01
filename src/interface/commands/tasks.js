import { input, confirm } from '@inquirer/prompts';
import { openDatabase } from '../../db.js';
import { getTasksService } from '../../tasks.js';
import { handleError } from './utils.js';

/**
 * @typedef {import('../../models.js').Task} Task
 */

/**
 * @param {string} reqId
 * @param {{ status?: 'ToDo' | 'InProgress' | 'Done' }} [options]
 * @returns {Promise<void>}
 */
export async function listTasks(reqId, options = {}) {
  try {
    const db = openDatabase();
    const svc = getTasksService(db);
    const tasks = svc.listTasks({ parentReqId: reqId, status: options.status });
    printTasksTable(tasks);
  } catch (error) {
    handleError(error);
  }
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function getTask(id) {
  try {
    const db = openDatabase();
    const svc = getTasksService(db);
    const task = svc.getTask({ id });
    printTask(task);
  } catch (error) {
    handleError(error);
  }
}

/**
 * @param {string} reqId
 * @returns {Promise<void>}
 */
export async function createTask(reqId) {
  try {
    const title = await input({
      message: 'Title',
      validate: /** @param {string} value */ (value) =>
        value.trim().length > 0 ? true : 'Title is required',
    });

    const description = await input({
      message: 'Description',
      default: '',
    });

    const acceptanceCriteriaRaw = await input({
      message: 'Acceptance criteria (comma or newline separated)',
      default: '',
    });

    const dependenciesRaw = await input({
      message: 'Dependencies (comma or newline separated task IDs)',
      default: '',
    });

    const db = openDatabase();
    const svc = getTasksService(db);
    const created = svc.createTask({
      parentReqId: reqId,
      title: title.trim(),
      description,
      acceptanceCriteria: parseListInput(acceptanceCriteriaRaw),
      dependencies: parseListInput(dependenciesRaw),
    });

    console.log(`✓ Created: ${created.id}`);
    printTask(created);
  } catch (error) {
    handleError(error);
  }
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function updateTask(id) {
  try {
    const db = openDatabase();
    const svc = getTasksService(db);
    const current = svc.getTask({ id });

    const title = await input({
      message: 'Title',
      default: current.title,
      validate: /** @param {string} value */ (value) =>
        value.trim().length > 0 ? true : 'Title is required',
    });

    const description = await input({
      message: 'Description',
      default: current.description,
    });

    const acceptanceCriteriaRaw = await input({
      message: 'Acceptance criteria (comma or newline separated)',
      default: current.acceptanceCriteria.join('\n'),
    });

    const dependenciesRaw = await input({
      message: 'Dependencies (comma or newline separated task IDs)',
      default: current.dependencies.join(', '),
    });

    const updated = svc.updateTask({
      id,
      title: title.trim(),
      description,
      acceptanceCriteria: parseListInput(acceptanceCriteriaRaw),
      dependencies: parseListInput(dependenciesRaw),
    });

    console.log(`✓ Updated: ${updated.id}`);
    printTask(updated);
  } catch (error) {
    handleError(error);
  }
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteTask(id) {
  try {
    const shouldDelete = await confirm({
      message: `Delete task ${id}?`,
      default: false,
    });

    if (!shouldDelete) {
      console.log('Cancelled.');
      return;
    }

    const db = openDatabase();
    const svc = getTasksService(db);
    const deleted = svc.deleteTask({ id });

    console.log(`✓ Deleted: ${deleted.id}`);
    printTask(deleted);
  } catch (error) {
    handleError(error);
  }
}

/**
 * @param {Task[]} tasks
 */
function printTasksTable(tasks) {
  if (tasks.length === 0) {
    console.log('No tasks found.');
    return;
  }

  const rows = tasks.map((item) => ({
    id: item.id,
    title: item.title,
    status: item.status,
    assignedTo: item.assignedTo ?? '',
    updated: item.updatedAt.toISOString(),
  }));

  const columns = [
    { key: 'id', title: 'ID' },
    { key: 'title', title: 'TITLE' },
    { key: 'status', title: 'STATUS' },
    { key: 'assignedTo', title: 'ASSIGNED TO' },
    { key: 'updated', title: 'UPDATED' },
  ];

  const widths = columns.map((column) => {
    const maxCellWidth = rows.reduce((max, row) => {
      const value =
        row[/** @type {'id' | 'title' | 'status' | 'assignedTo' | 'updated'} */ (column.key)];
      return Math.max(max, value.length);
    }, column.title.length);
    return maxCellWidth;
  });

  const header = columns
    .map((column, index) => column.title.padEnd(widths[index] ?? column.title.length, ' '))
    .join('  ');

  console.log(header);
  for (const row of rows) {
    const line = columns
      .map((column, index) => {
        const value =
          row[/** @type {'id' | 'title' | 'status' | 'assignedTo' | 'updated'} */ (column.key)];
        return value.padEnd(widths[index] ?? value.length, ' ');
      })
      .join('  ');
    console.log(line);
  }
}

/**
 * @param {Task} task
 */
function printTask(task) {
  console.log(`ID:          ${task.id}`);
  console.log(`Parent Req:  ${task.parentReqId}`);
  console.log(`Title:       ${task.title}`);
  console.log(`Status:      ${task.status}`);
  console.log(`Assigned To: ${task.assignedTo ?? ''}`);
  console.log(`Description: ${task.description}`);
  console.log(`Acceptance:  ${task.acceptanceCriteria.join(', ')}`);
  console.log(`Depends On:  ${task.dependencies.join(', ')}`);
  console.log(`Created At:  ${task.createdAt.toISOString()}`);
  console.log(`Updated At:  ${task.updatedAt.toISOString()}`);
}

/**
 * @param {string | undefined} raw
 * @returns {string[]}
 */
function parseListInput(raw) {
  if (!raw) return [];
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
