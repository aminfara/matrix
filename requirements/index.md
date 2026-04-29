# Product: MATRIX

## Vision

MATRIX (Multi-Agent Task & Requirement IndeX) is a local, project-scoped requirement and task management MCP server that enables multiple AI agents across multiple sessions to coordinate work reliably. It is the single source of truth for what needs to be built, what's in progress, and what's done — backed by persistent storage, with built-in dependency enforcement, ownership-based locking, and automatic status computation.

## Goals

- **G1: Reliable multi-agent coordination** — Multiple agents can concurrently claim, execute, and complete tasks without conflicts or lost work.
- **G2: Structured requirement tracking** — All work is captured as requirements broken into tasks with clear acceptance criteria, priorities, and dependencies.
- **G3: Zero-configuration startup** — An agent can start using MATRIX immediately with no setup beyond connecting to the MCP server.
- **G4: Self-describing API** — The MCP instructions and tool schemas are detailed enough that any agent can use the system correctly without external documentation.

## Backlog

| Req ID  | Title             | Func/Non-Func  | Priority | Status     | Summary                                                               | Link                  |
| ------- | ----------------- | -------------- | -------- | ---------- | --------------------------------------------------------------------- | --------------------- |
| REQ-008 | Automated Testing | Non-Functional | P0       | InProgress | Unit tests complete; integration tests (MCP tool layer) still pending | [REQ-008](REQ-008.md) |

## Done

| Req ID  | Title                            | Func/Non-Func  | Priority | Completed  | Summary                                                                | Link                  |
| ------- | -------------------------------- | -------------- | -------- | ---------- | ---------------------------------------------------------------------- | --------------------- |
| REQ-001 | Data Persistence & Configuration | Non-Functional | P0       | 2026-04-29 | Persistent storage with configurable location and concurrent access    | [REQ-001](REQ-001.md) |
| REQ-002 | Requirement Management           | Functional     | P0       | 2026-04-29 | Create, read, list, update requirements via MCP tools                  | [REQ-002](REQ-002.md) |
| REQ-003 | Task Management                  | Functional     | P0       | 2026-04-29 | Create, read, list, update tasks under requirements via MCP tools      | [REQ-003](REQ-003.md) |
| REQ-004 | Task Workflow                    | Functional     | P0       | 2026-04-29 | Pick, complete, release tasks with agent ownership enforcement         | [REQ-004](REQ-004.md) |
| REQ-005 | Dependency Management            | Functional     | P0       | 2026-04-29 | Req-to-req and task-to-task dependencies with validation and blocking  | [REQ-005](REQ-005.md) |
| REQ-006 | Requirement Status Computation   | Functional     | P0       | 2026-04-29 | Auto-compute requirement status from task states, with manual override | [REQ-006](REQ-006.md) |
| REQ-007 | Structured Error Responses       | Non-Functional | P0       | 2026-04-29 | MCP-compliant errors with machine-readable error codes                 | [REQ-007](REQ-007.md) |
| REQ-009 | Smart Task Recommendation        | Functional     | P1       | 2026-04-29 | next_task tool that recommends the best available task                 | [REQ-009](REQ-009.md) |
| REQ-010 | Admin Task Recovery              | Functional     | P1       | 2026-04-29 | force_release_task to recover stale locks from crashed agents          | [REQ-010](REQ-010.md) |
| REQ-011 | Deletion Tools                   | Functional     | P1       | 2026-04-29 | delete_requirement (cascade) and delete_task                           | [REQ-011](REQ-011.md) |
