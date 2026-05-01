/**
 * @typedef {import('../../../models.js').Task} Task
 * @typedef {import('../../../models.js').Requirement} Requirement
 */
import { escapeHtml } from './layout.js';

/**
 * @param {Task} task
 * @param {Requirement} requirement
 * @param {string} [csrfToken]
 * @returns {string}
 */
export function taskDetail(task, requirement, csrfToken = '') {
  const acceptance = listItems(task.acceptanceCriteria, 'No acceptance criteria.');
  const dependencies =
    task.dependencies.length === 0
      ? '<p>None</p>'
      : `<p>${task.dependencies.map((dep) => `<kbd>${escapeHtml(dep)}</kbd>`).join(', ')}</p>`;

  const pickForm =
    task.status === 'ToDo'
      ? `
      <form method="post" action="/tasks/${encodeURIComponent(task.id)}/pick">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <label for="pick-agentId">Your agent ID</label>
        <input type="text" id="pick-agentId" name="agentId" required autocomplete="off">
        <button type="submit">Pick Task</button>
      </form>
    `
      : '';

  const inProgressForms =
    task.status === 'InProgress'
      ? `
      <form method="post" action="/tasks/${encodeURIComponent(task.id)}/complete">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <label for="complete-agentId">Your agent ID</label>
        <input type="text" id="complete-agentId" name="agentId" required autocomplete="off">
        <button type="submit">Complete Task</button>
      </form>

      <form method="post" action="/tasks/${encodeURIComponent(task.id)}/release">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <label for="release-agentId">Your agent ID</label>
        <input type="text" id="release-agentId" name="agentId" required autocomplete="off">
        <button type="submit" class="secondary">Release Task</button>
      </form>
    `
      : '';

  return `
    <header>
      <h1>${escapeHtml(task.title)}</h1>
      <p><a href="/tasks/${encodeURIComponent(task.id)}/edit">Edit</a></p>
      <form method="post" action="/tasks/${encodeURIComponent(task.id)}/delete" onsubmit="return confirm('Delete this task?');">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <button type="submit" class="destructive">Delete</button>
      </form>
    </header>

    <article>
      <p><strong>ID:</strong> <kbd>${escapeHtml(task.id)}</kbd></p>
      <p><strong>Status:</strong> <mark>${escapeHtml(task.status)}</mark></p>
      <p><strong>Parent Requirement:</strong> <a href="/requirements/${encodeURIComponent(requirement.id)}"><kbd>${escapeHtml(requirement.id)}</kbd></a></p>
      <p><strong>Assigned To:</strong> ${escapeHtml(task.assignedTo ?? '')}</p>
      <p><strong>Description:</strong></p>
      <p>${escapeHtml(task.description)}</p>
      <p><strong>Acceptance Criteria:</strong></p>
      ${acceptance}
      <p><strong>Dependencies:</strong></p>
      ${dependencies}
    </article>

    <section>
      <h2>Workflow Actions</h2>
      ${pickForm}
      ${inProgressForms}
      <details>
        <summary>Admin: Force Release</summary>
        <form method="post" action="/tasks/${encodeURIComponent(task.id)}/force-release">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
          <button type="submit" class="secondary">Force Release</button>
        </form>
      </details>
    </section>
  `;
}

/**
 * @param {Task | undefined} task
 * @param {Requirement} parentReq
 * @param {string} [csrfToken]
 * @returns {string}
 */
export function taskForm(task, parentReq, csrfToken = '') {
  const isEdit = Boolean(task);
  const title = isEdit ? 'Edit Task' : 'New Task';
  const taskId = task?.id ?? '';
  const action = isEdit
    ? `/tasks/${encodeURIComponent(taskId)}/update`
    : `/requirements/${encodeURIComponent(parentReq.id)}/tasks`;

  const acceptanceValue = task ? task.acceptanceCriteria.join('\n') : '';
  const dependenciesValue = task ? task.dependencies.join('\n') : '';

  return `
    <h1>${title}</h1>
    <p>Requirement: <a href="/requirements/${encodeURIComponent(parentReq.id)}"><kbd>${escapeHtml(parentReq.id)}</kbd></a></p>
    <form method="post" action="${action}">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
      <label for="task-title">Title</label>
      <input type="text" id="task-title" name="title" required value="${escapeHtml(task?.title ?? '')}">

      <label for="task-description">Description</label>
      <textarea id="task-description" name="description" rows="5">${escapeHtml(task?.description ?? '')}</textarea>

      <label for="task-acceptanceCriteria">Acceptance Criteria</label>
      <textarea id="task-acceptanceCriteria" name="acceptanceCriteria" rows="6" placeholder="Enter one acceptance criterion per line">${escapeHtml(acceptanceValue)}</textarea>

      <label for="task-dependencies">Dependencies</label>
      <textarea id="task-dependencies" name="dependencies" rows="4" placeholder="Enter one task ID per line (e.g. tsk-00001)">${escapeHtml(dependenciesValue)}</textarea>

      <button type="submit">${isEdit ? 'Update Task' : 'Create Task'}</button>
    </form>
  `;
}

/**
 * @param {string[]} items
 * @param {string} emptyText
 * @returns {string}
 */
function listItems(items, emptyText) {
  if (items.length === 0) {
    return `<p>${escapeHtml(emptyText)}</p>`;
  }

  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}
