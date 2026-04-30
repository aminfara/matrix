# Project: MATRIX

## Structure

- `requirements/` — Product requirements and backlog (managed by Percy)
- `architecture/` — System architecture docs (managed by Archie)
  - `database.md` — DB schema, tables, indexes, pragmas, design decisions
  - `overview.md` — Module map, tool catalogue, error-handling model
- `src/` — Source code (server, db, models, requirements, tasks, task-workflow, task-helpers, tools, errors, instructions)
- `tests/` — Unit tests (vitest, in-memory SQLite)

## Development Setup

- **Install:** `npm install`
- **Start dev server:** `node src/server.js` (or via MCP client config)
- **Node.js required:** ≥ 22.5.0 (requires `node:sqlite` built-in)
- **Environment variables:** `MATRIX_DB_PATH` — override default DB path (`.matrix/matrix.db` relative to cwd)

## Testing

- **Unit tests:** `npm test` (vitest, all tests use in-memory SQLite via `initDb`)
- **Type check:** `npm run typecheck`
- **Current coverage:** 55 unit tests across requirements, tasks, and task-workflow services. No integration (MCP tool layer) tests yet — see REQ-008.

## Build & Deploy

- **Publish:** `npm publish` (package name: `matrix-mcp`, bin: `matrix-mcp → src/server.js`)
- **Run via npx:** `npx matrix-mcp` (run in project cwd so DB resolves correctly)

## Conventions

- ES Modules (`"type": "module"`)
- No ORM — raw SQL prepared statements only (`node:sqlite` `DatabaseSync`)
- All multi-statement DB writes use explicit `BEGIN / COMMIT / ROLLBACK`
- Error codes are typed via `MatrixErrorCode` in `src/errors.js` — do not invent new codes without updating `src/instructions.js` and `src/errors.js`
- Zod schemas in `src/models.js` are the single source of truth for input validation
- `parseAcceptanceCriteria` is the single authoritative implementation in `src/task-helpers.js` — do not duplicate it
- Sequential IDs use `nextId(db, prefix)` in `src/db.js` — never use `MAX(id)+1`
- DB schema changes: append a new entry to the `MIGRATIONS` array in `src/db.js` — never modify existing entries
- `// SECURITY:` comments are Sammy's annotations and must not be removed until the underlying issue is resolved

## Key Decisions

- See `architecture/database.md` for DB design decisions (junction tables, atomic IDs, status_locked flag, WAL mode)
- See `architecture/overview.md` for module map and full tool catalogue
