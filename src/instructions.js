export const AGENT_INSTRUCTIONS = `
MATRIX — Requirements & Task Management

MATRIX is a persistent coordination layer for multi-agent projects. Agents define requirements,
break them into tasks, claim and complete tasks, and track progress across sessions.

---

## Workflows

### When starting new work — Plan
1. list_requirements — check what already exists.
2. create_requirement for each new piece of work. Set priority (1 = most urgent, 5 = lowest),
   dependencies on other requirements where ordering matters, and acceptanceCriteria as the
   definition of done for the requirement as a whole.
3. create_task({ parentReqId, ... }) to break each requirement into concrete units of work.
   Set task dependencies (same requirement only) where one task must finish before another.
4. Repeat until all requirements are fully broken down into actionable tasks.

### When executing work — Implement (loop until next_task returns null)
1. next_task({ agentId }) — get the best available task automatically.
2. pick_task({ taskId, agentId }) — claim it (sets status InProgress).
   If TASK_NOT_OPEN or DEPENDENCIES_NOT_SATISFIED → call next_task again.
3. Do the work. Verify every acceptanceCriterion is met before proceeding.
4. complete_task({ taskId, agentId }) — mark it Done.
5. If you must stop early → release_task({ taskId, agentId }) so another agent can continue.

### When assessing project health — Report
1. list_requirements → get status overview.
2. list_tasks({ parentReqId }) for requirements needing detail.
3. Identify stale InProgress tasks (agent crashed without releasing).
   Call force_release_task({ taskId }) to recover them.
4. Summarise: % complete, what is blocked and why, upcoming priorities.

---

## Data Model

**Requirement** fields: id (req-00001…), title, description, priority (1–5),
status (ToDo | InProgress | Done), acceptanceCriteria: string[], dependencies: string[],
createdAt, updatedAt.

**Task** fields: id (tsk-00001…), parentReqId (immutable), title, description,
status (ToDo | InProgress | Done), acceptanceCriteria: string[], dependencies: string[],
assignedTo: string | null, createdAt, updatedAt.

**Requirement status** is auto-computed from its tasks (unless manually overridden):
- Done → all tasks Done (≥1 task exists)
- InProgress → any task is InProgress
- ToDo → otherwise (no tasks, or all tasks ToDo)

Manual override: update_requirement can set status to "Done" (suppresses auto-recompute) or
"ToDo" (resumes auto-recompute). Setting "InProgress" is rejected. Creating a new task under
a manually-Done requirement resets it to ToDo and resumes auto-recompute.

---

## Tool Reference

### Requirements
| Tool | Required params | Optional params | Returns |
|---|---|---|---|
| create_requirement | title, description, priority, acceptanceCriteria[], dependencies[] | — | Requirement |
| update_requirement | id | title, description, priority, status, acceptanceCriteria[], dependencies[] | Requirement |
| delete_requirement | id | — | Deleted Requirement (cascades child tasks) |
| get_requirement | id | — | Requirement |
| list_requirements | — | status, priority | Requirement[] sorted by priority asc |

### Tasks
| Tool | Required params | Optional params | Returns |
|---|---|---|---|
| create_task | parentReqId, title, description, acceptanceCriteria[], dependencies[] | — | Task |
| update_task | id | title, description, acceptanceCriteria[], dependencies[] | Task |
| delete_task | id | — | Deleted Task (fails if InProgress or has dependents) |
| get_task | id | — | Task |
| list_tasks | parentReqId | status | Task[] |

### Workflow & Admin
| Tool | Required params | Effect |
|---|---|---|
| pick_task | taskId, agentId | ToDo → InProgress. Checks: task deps Done + parent req deps Done |
| complete_task | taskId, agentId | InProgress → Done. Must be owner. |
| release_task | taskId, agentId | InProgress → ToDo. Must be owner. |
| force_release_task | taskId | InProgress → ToDo. No owner check (admin recovery). |
| next_task | agentId | Returns best unblocked ToDo task sorted by req priority, or null |

**Constraints:** Task dependencies must reference tasks within the same parentReq only.
Requirement dependencies may reference any other requirement.

---

## Error Codes

| Code | When |
|---|---|
| NOT_FOUND | Entity does not exist |
| INVALID_INPUT | Schema validation failed (wrong type, missing field, out-of-range) |
| TASK_NOT_OPEN | pick_task: task is not ToDo |
| TASK_NOT_IN_PROGRESS | complete/release/force_release: task is not InProgress. Also delete_task: task IS InProgress (release first) |
| NOT_OWNER | complete_task / release_task: agentId ≠ assignedTo |
| DEPENDENCIES_NOT_SATISFIED | pick_task: a task dep or parent req dep is not Done |
| CIRCULAR_DEPENDENCY | Dependency would create a cycle |
| INVALID_DEPENDENCY | ID is self-referential, does not exist, or is a task in a different requirement |
| DUPLICATE_DEPENDENCY | Same ID appears more than once in dependencies array |
| INVALID_STATUS | update_requirement: tried to set status to InProgress |
| HAS_DEPENDENTS | delete: another entity lists this one as a dependency |
| INTERNAL_ERROR | Unexpected server error |

All errors: { isError: true, content: [{ type: "text", text: JSON.stringify({ code, message }) }] }
`;
