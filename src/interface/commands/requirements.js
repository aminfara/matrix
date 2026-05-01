import { input, confirm, select } from '@inquirer/prompts';
import { openDatabase } from '../../db.js';
import { getRequirementsService } from '../../requirements.js';
import { handleError } from './utils.js';

/**
 * @typedef {import('../../models.js').Requirement} Requirement
 */

/**
 * @param {{ status?: 'ToDo' | 'InProgress' | 'Done', priority?: number | string }} [options]
 * @returns {Promise<void>}
 */
export async function listRequirements(options = {}) {
  try {
    const db = openDatabase();
    const svc = getRequirementsService(db);
    const priority =
      options.priority === undefined ? undefined : Number.parseInt(String(options.priority), 10);

    const requirements = svc.listRequirements({
      status: options.status,
      priority: Number.isNaN(priority) ? undefined : priority,
    });

    printRequirementsTable(requirements);
  } catch (error) {
    handleError(error);
  }
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function getRequirement(id) {
  try {
    const db = openDatabase();
    const svc = getRequirementsService(db);
    const requirement = svc.getRequirement({ id });
    printRequirement(requirement);
  } catch (error) {
    handleError(error);
  }
}

/**
 * @returns {Promise<void>}
 */
export async function createRequirement() {
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

    const priority = await select({
      message: 'Priority',
      choices: [1, 2, 3, 4, 5].map((value) => ({ name: String(value), value })),
      default: 3,
    });

    const acceptanceCriteriaRaw = await input({
      message: 'Acceptance criteria (comma or newline separated)',
      default: '',
    });

    const dependenciesRaw = await input({
      message: 'Dependencies (comma or newline separated requirement IDs)',
      default: '',
    });

    const db = openDatabase();
    const svc = getRequirementsService(db);
    const created = svc.createRequirement({
      title: title.trim(),
      description,
      priority,
      acceptanceCriteria: parseListInput(acceptanceCriteriaRaw),
      dependencies: parseListInput(dependenciesRaw),
    });

    console.log(`✓ Created: ${created.id}`);
    printRequirement(created);
  } catch (error) {
    handleError(error);
  }
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function updateRequirement(id) {
  try {
    const db = openDatabase();
    const svc = getRequirementsService(db);
    const current = svc.getRequirement({ id });

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

    const status = await select({
      message: 'Status',
      choices: ['ToDo', 'InProgress', 'Done'].map((value) => ({ name: value, value })),
      default: current.status,
    });

    const priority = await select({
      message: 'Priority',
      choices: [1, 2, 3, 4, 5].map((value) => ({ name: String(value), value })),
      default: current.priority,
    });

    const acceptanceCriteriaRaw = await input({
      message: 'Acceptance criteria (comma or newline separated)',
      default: current.acceptanceCriteria.join('\n'),
    });

    const dependenciesRaw = await input({
      message: 'Dependencies (comma or newline separated requirement IDs)',
      default: current.dependencies.join(', '),
    });

    const updated = svc.updateRequirement({
      id,
      title: title.trim(),
      description,
      status: /** @type {'ToDo' | 'InProgress' | 'Done'} */ (status),
      priority,
      acceptanceCriteria: parseListInput(acceptanceCriteriaRaw),
      dependencies: parseListInput(dependenciesRaw),
    });

    console.log(`✓ Updated: ${updated.id}`);
    printRequirement(updated);
  } catch (error) {
    handleError(error);
  }
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteRequirement(id) {
  try {
    const shouldDelete = await confirm({
      message: `Delete requirement ${id}?`,
      default: false,
    });

    if (!shouldDelete) {
      console.log('Cancelled.');
      return;
    }

    const db = openDatabase();
    const svc = getRequirementsService(db);
    const deleted = svc.deleteRequirement({ id });

    console.log(`✓ Deleted: ${deleted.id}`);
    printRequirement(deleted);
  } catch (error) {
    handleError(error);
  }
}

/**
 * @param {Requirement[]} requirements
 */
function printRequirementsTable(requirements) {
  if (requirements.length === 0) {
    console.log('No requirements found.');
    return;
  }

  const rows = requirements.map((item) => ({
    id: item.id,
    title: item.title,
    status: item.status,
    priority: String(item.priority),
    updated: item.updatedAt.toISOString(),
  }));

  const columns = [
    { key: 'id', title: 'ID' },
    { key: 'title', title: 'TITLE' },
    { key: 'status', title: 'STATUS' },
    { key: 'priority', title: 'PRI' },
    { key: 'updated', title: 'UPDATED' },
  ];

  const widths = columns.map((column) => {
    const maxCellWidth = rows.reduce((max, row) => {
      const value =
        row[/** @type {'id' | 'title' | 'status' | 'priority' | 'updated'} */ (column.key)];
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
          row[/** @type {'id' | 'title' | 'status' | 'priority' | 'updated'} */ (column.key)];
        return value.padEnd(widths[index] ?? value.length, ' ');
      })
      .join('  ');
    console.log(line);
  }
}

/**
 * @param {Requirement} requirement
 */
function printRequirement(requirement) {
  console.log(`ID:          ${requirement.id}`);
  console.log(`Title:       ${requirement.title}`);
  console.log(`Status:      ${requirement.status}`);
  console.log(`Priority:    ${requirement.priority}`);
  console.log(`Description: ${requirement.description}`);
  console.log(`Acceptance:  ${requirement.acceptanceCriteria.join(', ')}`);
  console.log(`Depends On:  ${requirement.dependencies.join(', ')}`);
  console.log(`Created At:  ${requirement.createdAt.toISOString()}`);
  console.log(`Updated At:  ${requirement.updatedAt.toISOString()}`);
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
