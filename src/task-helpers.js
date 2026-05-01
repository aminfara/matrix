/**
 * @typedef {Record<string, import('node:sqlite').SQLOutputValue>} SqlRow
 */

/**
 * @param {SqlRow} row
 * @returns {string[]}
 */
export function parseAcceptanceCriteria(row) {
  const raw = row['acceptance_criteria'];
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} taskId
 * @returns {string[]}
 */
export function getTaskDependencies(db, taskId) {
  const rows = db
    .prepare(
      `SELECT to_task_id FROM task_dependencies WHERE from_task_id = ? ORDER BY to_task_id ASC`
    )
    .all(taskId);

  return rows.map((row) => row['to_task_id']).filter((v) => typeof v === 'string');
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {SqlRow} row
 * @returns {import('./models.js').Task}
 */
export function mapTaskRow(db, row) {
  const createdAt = row['created_at'];
  const updatedAt = row['updated_at'];
  const assignedToRaw = row['assigned_to'];
  const { description = '' } = row;

  return {
    id: String(row['id']),
    parentReqId: String(row['parent_req_id']),
    title: String(row['title']),
    description: String(description),
    status: /** @type {'ToDo' | 'InProgress' | 'Done'} */ (String(row['status'])),
    acceptanceCriteria: parseAcceptanceCriteria(row),
    dependencies: getTaskDependencies(db, String(row['id'])),
    assignedTo: typeof assignedToRaw === 'string' ? assignedToRaw : undefined,
    createdAt: new Date(String(createdAt)),
    updatedAt: new Date(String(updatedAt)),
  };
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} id
 * @returns {SqlRow | null}
 */
export function getTaskRowById(db, id) {
  const row = db
    .prepare(
      `SELECT id, parent_req_id, title, description, status, acceptance_criteria, assigned_to, created_at, updated_at
       FROM tasks WHERE id = ?`
    )
    .get(id);

  return /** @type {SqlRow | null} */ (row ?? null);
}
