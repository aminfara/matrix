import { getRequirementsService } from './requirements.js';
import { getTasksService } from './tasks.js';
import { getTaskWorkflowService } from './task-workflow.js';
import {
  createRequirementInputSchema,
  updateRequirementInputSchema,
  getRequirementInputSchema,
  listRequirementsInputSchema,
  deleteRequirementInputSchema,
  createTaskInputSchema,
  updateTaskInputSchema,
  getTaskInputSchema,
  listTasksInputSchema,
  deleteTaskInputSchema,
  pickTaskInputSchema,
  completeTaskInputSchema,
  releaseTaskInputSchema,
  forceReleaseTaskInputSchema,
  nextTaskInputSchema,
} from './models.js';

/**
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {import("node:sqlite").DatabaseSync} db
 */
export function registerTools(server, db) {
  const requirements = getRequirementsService(db);
  const tasks = getTasksService(db);
  const workflow = getTaskWorkflowService(db);

  /**
   * Wraps a tool handler so any thrown MatrixError (or generic Error) is returned
   * as a structured MCP error response instead of crashing the server.
   *
   * @template T
   * @param {(args: T) => unknown} fn
   * @returns {(args: T) => Promise<import("@modelcontextprotocol/sdk/types.js").CallToolResult>}
   */
  function wrap(fn) {
    return async (args) => {
      try {
        const result = fn(args);
        return {
          content: [{ type: /** @type {'text'} */ ('text'), text: JSON.stringify(result) }],
        };
      } catch (/** @type {any} */ err) {
        const code = err?.code ?? 'INTERNAL_ERROR';
        const message = err?.message ?? 'An unexpected error occurred';
        return {
          isError: true,
          content: [
            { type: /** @type {'text'} */ ('text'), text: JSON.stringify({ code, message }) },
          ],
        };
      }
    };
  }

  // Requirements — Commands
  // ------------------------------------------------------------------

  server.registerTool(
    'create_requirement',
    {
      description:
        'Create a new requirement. Returns the created requirement with an auto-generated sequential ID (req-00001, req-00002, ...).',
      inputSchema: createRequirementInputSchema.shape,
    },
    wrap((args) => requirements.createRequirement(args))
  );

  server.registerTool(
    'update_requirement',
    {
      description:
        'Update one or more fields of an existing requirement. status may only be set to "Done" or "ToDo" — "InProgress" is always auto-computed and will be rejected. Returns the updated requirement.',
      inputSchema: updateRequirementInputSchema.shape,
    },
    wrap((args) => requirements.updateRequirement(args))
  );

  server.registerTool(
    'delete_requirement',
    {
      description:
        'Permanently delete a requirement and ALL of its child tasks. Fails with HAS_DEPENDENTS if another requirement depends on this one — remove the dependency first. Irreversible.',
      inputSchema: deleteRequirementInputSchema.shape,
    },
    wrap((args) => requirements.deleteRequirement(args))
  );

  // Requirements — Queries
  // ------------------------------------------------------------------

  server.registerTool(
    'get_requirement',
    {
      description:
        'Fetch a single requirement by ID. Returns the requirement or a NOT_FOUND error.',
      inputSchema: getRequirementInputSchema.shape,
    },
    wrap((args) => requirements.getRequirement(args))
  );

  server.registerTool(
    'list_requirements',
    {
      description:
        'List all requirements sorted by priority ascending (1 = highest). Optionally filter by status or priority. Returns an array of requirements (empty array if none match).',
      inputSchema: listRequirementsInputSchema.shape,
    },
    wrap((args) => requirements.listRequirements(args))
  );

  // Tasks — Commands
  // ------------------------------------------------------------------

  server.registerTool(
    'create_task',
    {
      description:
        'Create a new task under an existing requirement. task dependencies must reference other task IDs within the same parent requirement. Fails if parent_req_id does not exist. Returns the created task.',
      inputSchema: createTaskInputSchema.shape,
    },
    wrap((args) => tasks.createTask(args))
  );

  server.registerTool(
    'update_task',
    {
      description:
        'Update one or more fields of an existing task. Does NOT change status or assigned_to — use pick_task, complete_task, or release_task for status transitions. Returns the updated task.',
      inputSchema: updateTaskInputSchema.shape,
    },
    wrap((args) => tasks.updateTask(args))
  );

  server.registerTool(
    'delete_task',
    {
      description:
        'Permanently delete a single task. Fails with HAS_DEPENDENTS if another task within the same requirement depends on this one. Fails if the task is In Progress — release it first. Irreversible.',
      inputSchema: deleteTaskInputSchema.shape,
    },
    wrap((args) => tasks.deleteTask(args))
  );

  // Tasks — Queries
  // ------------------------------------------------------------------

  server.registerTool(
    'get_task',
    {
      description: 'Fetch a single task by ID. Returns the task or a NOT_FOUND error.',
      inputSchema: getTaskInputSchema.shape,
    },
    wrap((args) => tasks.getTask(args))
  );

  server.registerTool(
    'list_tasks',
    {
      description:
        'List all tasks for a given requirement. Optionally filter by status. Returns an array of tasks (empty array if none match).',
      inputSchema: listTasksInputSchema.shape,
    },
    wrap((args) => tasks.listTasks(args))
  );

  // Task Workflow — Status Transitions
  // ------------------------------------------------------------------

  server.registerTool(
    'pick_task',
    {
      description:
        'Claim a task for the calling agent. Sets status to "InProgress" and assigns the task to agent_id. Fails with TASK_NOT_OPEN if the task is not "ToDo", or DEPENDENCIES_NOT_SATISFIED if its task or requirement dependencies are not all "Done". Returns the updated task.',
      inputSchema: pickTaskInputSchema.shape,
    },
    wrap((args) => workflow.pickTask(args))
  );

  server.registerTool(
    'complete_task',
    {
      description:
        'Mark a task as Done. All acceptance criteria must be met before calling this. Fails with TASK_NOT_IN_PROGRESS or NOT_OWNER if preconditions are not met. Triggers requirement status recomputation. Returns the updated task.',
      inputSchema: completeTaskInputSchema.shape,
    },
    wrap((args) => workflow.completeTask(args))
  );

  server.registerTool(
    'release_task',
    {
      description:
        'Release a task back to "ToDo" so another agent can pick it up. Call this when you must stop before finishing. Fails with TASK_NOT_IN_PROGRESS or NOT_OWNER if preconditions are not met. Returns the updated task.',
      inputSchema: releaseTaskInputSchema.shape,
    },
    wrap((args) => workflow.releaseTask(args))
  );

  // Admin
  // ------------------------------------------------------------------

  server.registerTool(
    'force_release_task',
    {
      description:
        'Force any "InProgress" task back to "ToDo" regardless of which agent owns it. Use to recover stale locks from crashed agents. Fails with TASK_NOT_IN_PROGRESS if the task is not currently in progress. Returns the updated task.',
      inputSchema: forceReleaseTaskInputSchema.shape,
    },
    wrap((args) => workflow.forceReleaseTask(args))
  );

  // Recommendation
  // ------------------------------------------------------------------

  server.registerTool(
    'next_task',
    {
      description:
        'Recommend the next best available task to work on. Selects from unblocked requirements (all dependency reqs Done, req itself not Done), sorted by priority, picking the first "ToDo" task whose dependencies are all Done. Returns the task, or null if no eligible task exists.',
      inputSchema: nextTaskInputSchema.shape,
    },
    wrap((args) => tasks.nextTask(args))
  );
}
