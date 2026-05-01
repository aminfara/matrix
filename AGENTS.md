# Project: MATRIX

## Structure

- `requirements/` — Product requirements and backlog (managed by Percy)
- `architecture/` — System architecture docs (managed by Archie)
  - `database.md` — DB schema, tables, indexes, pragmas, design decisions
  - `overview.md` — Module map, tool catalogue, error-handling model
  - `interface.md` — CLI + Web UI architecture, file map, route table, library choices
- `src/` — Source code (server, db, models, requirements, tasks, task-workflow, task-helpers, tools, errors, instructions) plus `interface/` sub-folder for CLI + web UI
- `src/interface/` — CLI (`matrix-mcp-cli`) and embedded web server for human users
  - `cli.js` — Entry point binary; `commander` + `@inquirer/prompts`; DB path resolution
  - `commands/` — CLI handlers for requirements, tasks, workflow; shared `utils.js`
  - `web/` — Express app (`server.js`) + server-side rendered HTML views (`views/`)
- `tests/` — Unit tests (vitest, in-memory SQLite)

## Development Setup

- **Install:** `npm install`
- **Start MCP server:** `node src/server.js` (or via MCP client config)
- **Start CLI:** `node src/interface/cli.js --help` (or `matrix-mcp-cli` after `npm link`)
- **Start web UI:** `node src/interface/cli.js serve [--port 3000]` — binds to `127.0.0.1` only
- **DB path (CLI):** `--matrix-db-path` arg > `MATRIX_DB_PATH` env var > `.matrix/matrix.db`
- **Node.js required:** ≥ 22.5.0 (requires `node:sqlite` built-in)
- **Environment variables:** `MATRIX_DB_PATH` — override default DB path (`.matrix/matrix.db` relative to cwd)

## Testing

- **Unit tests:** `npm test` (vitest, all tests use in-memory SQLite via `initDb`)
- **Type check:** `npm run typecheck`
- **Current coverage:** 112 tests across 6 files — unit tests (requirements, tasks, task-workflow), MCP tool layer integration tests (`tests/tools.test.js`), interface service integration tests (`tests/interface-services.test.js`), and web server HTTP tests (`tests/web-server.test.js`).

## Build & Deploy

- **Publish:** `npm publish` (package name: `matrix-mcp`, bins: `matrix-mcp → src/server.js`, `matrix-mcp-cli → src/interface/cli.js`)
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
