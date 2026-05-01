/**
 * @typedef {import('../../../models.js').Requirement} Requirement
 * @typedef {import('../../../models.js').Task} Task
 */
import { escapeHtml } from './layout.js';

/**
 * @param {Requirement[]} requirements
 * @returns {string}
 */
export function requirementsList(requirements) {
  if (requirements.length === 0) {
    return `
      <header>
        <h1>Requirements</h1>
        <p><a href="/requirements/new" role="button">+ New Requirement</a></p>
      </header>
      <p>No requirements yet. Create your first requirement to get started.</p>
    `;
  }

  const rows = requirements
    .map(
      (req) => `
        <tr>
          <td><a href="/requirements/${encodeURIComponent(req.id)}"><kbd>${escapeHtml(req.id)}</kbd></a></td>
          <td><a href="/requirements/${encodeURIComponent(req.id)}">${escapeHtml(req.title)}</a></td>
          <td><mark>${escapeHtml(req.status)}</mark></td>
          <td>${req.priority}</td>
          <td>${escapeHtml(req.updatedAt.toISOString())}</td>
        </tr>
      `
    )
    .join('');

  return `
    <header>
      <h1>Requirements</h1>
      <p><a href="/requirements/new" role="button">+ New Requirement</a></p>
    </header>
    <figure>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </figure>
  `;
}

/**
 * @param {Requirement} requirement
 * @param {Task[]} tasks
 * @param {string} [csrfToken]
 * @returns {string}
 */
export function requirementDetail(requirement, tasks, csrfToken = '') {
  const acceptance = listItems(requirement.acceptanceCriteria, 'No acceptance criteria.');
  const dependencies =
    requirement.dependencies.length === 0
      ? '<p>None</p>'
      : `<p>${requirement.dependencies.map((dep) => `<kbd>${escapeHtml(dep)}</kbd>`).join(', ')}</p>`;

  const tasksHtml =
    tasks.length === 0
      ? '<p>No tasks yet.</p>'
      : `
      <figure>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Status</th>
              <th>Assigned To</th>
            </tr>
          </thead>
          <tbody>
            ${tasks
              .map(
                (task) => `
                  <tr>
                    <td><a href="/tasks/${encodeURIComponent(task.id)}"><kbd>${escapeHtml(task.id)}</kbd></a></td>
                    <td><a href="/tasks/${encodeURIComponent(task.id)}">${escapeHtml(task.title)}</a></td>
                    <td><mark>${escapeHtml(task.status)}</mark></td>
                    <td>${escapeHtml(task.assignedTo ?? '')}</td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </figure>
    `;

  return `
    <header>
      <h1>${escapeHtml(requirement.title)}</h1>
      <p>
        <a href="/requirements/${encodeURIComponent(requirement.id)}/edit">Edit</a>
      </p>
      <form method="post" action="/requirements/${encodeURIComponent(requirement.id)}/delete" onsubmit="return confirm('Delete this requirement?');">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <button type="submit" class="destructive">Delete</button>
      </form>
      <p><a href="/requirements/${encodeURIComponent(requirement.id)}/tasks/new" role="button">+ New Task</a></p>
    </header>

    <article>
      <p><strong>ID:</strong> <kbd>${escapeHtml(requirement.id)}</kbd></p>
      <p><strong>Status:</strong> <mark>${escapeHtml(requirement.status)}</mark></p>
      <p><strong>Priority:</strong> ${requirement.priority}</p>
      <p><strong>Description:</strong></p>
      <p>${escapeHtml(requirement.description)}</p>
      <p><strong>Acceptance Criteria:</strong></p>
      ${acceptance}
      <p><strong>Dependencies:</strong></p>
      ${dependencies}
    </article>

    <section>
      <h2>Tasks</h2>
      ${tasksHtml}
    </section>
  `;
}

/**
 * @param {Requirement | undefined} requirement
 * @param {string} [csrfToken]
 * @returns {string}
 */
export function requirementForm(requirement, csrfToken = '') {
  const isEdit = Boolean(requirement);
  const title = isEdit ? 'Edit Requirement' : 'New Requirement';
  const action = requirement
    ? `/requirements/${encodeURIComponent(requirement.id)}/update`
    : '/requirements';

  const acceptanceValue = requirement ? requirement.acceptanceCriteria.join('\n') : '';
  const dependenciesValue = requirement ? requirement.dependencies.join('\n') : '';

  return `
    <h1>${title}</h1>
    <form method="post" action="${action}">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
      <label for="req-title">Title</label>
      <input type="text" id="req-title" name="title" required value="${escapeHtml(requirement?.title ?? '')}">

      <label for="req-description">Description</label>
      <textarea id="req-description" name="description" rows="5">${escapeHtml(requirement?.description ?? '')}</textarea>

      <label for="req-priority">Priority</label>
      <select id="req-priority" name="priority">
        ${[1, 2, 3, 4, 5]
          .map((value) => {
            const selected = value === (requirement?.priority ?? 3) ? ' selected' : '';
            return `<option value="${value}"${selected}>${value}</option>`;
          })
          .join('')}
      </select>

      <label for="req-acceptanceCriteria">Acceptance Criteria</label>
      <textarea id="req-acceptanceCriteria" name="acceptanceCriteria" rows="6" placeholder="Enter one acceptance criterion per line">${escapeHtml(acceptanceValue)}</textarea>

      <label for="req-dependencies">Dependencies</label>
      <textarea id="req-dependencies" name="dependencies" rows="4" placeholder="Enter one requirement ID per line (e.g. req-00001)">${escapeHtml(dependenciesValue)}</textarea>

      <button type="submit">${isEdit ? 'Update Requirement' : 'Create Requirement'}</button>
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
