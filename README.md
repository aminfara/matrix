# MATRIX

**Multi-Agent Task & Requirement IndeX** — A local, project-scoped Requirement Management MCP server for multi-agent, multi-session work. Think of it as a lightweight local project manager, backed by SQLite, that AI agents can connect to via the Model Context Protocol.

## Requirements

- **Node.js ≥ 22.5.0** — required for the built-in `node:sqlite` module

## Installation & Configuration

MATRIX is project-scoped: each project gets its own `.matrix/matrix.db` database. The server resolves the DB path relative to its working directory (`process.cwd()`), so **you must set `cwd` to your project root** in your MCP client config.

### Claude Desktop

```json
{
  "mcpServers": {
    "matrix": {
      "command": "npx",
      "args": ["-y", "matrix-mcp"],
      "cwd": "/absolute/path/to/your/project"
    }
  }
}
```

### Cursor / VS Code (`.cursor/mcp.json` or `.vscode/mcp.json`)

```json
{
  "servers": {
    "matrix": {
      "command": "npx",
      "args": ["-y", "matrix-mcp"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

> **Note:** `${workspaceFolder}` is expanded by Cursor/VS Code to the workspace root automatically.

### Custom DB path

To store the database somewhere other than `<project-root>/.matrix/matrix.db`, set the `MATRIX_DB_PATH` environment variable to an absolute path:

```json
{
  "mcpServers": {
    "matrix": {
      "command": "npx",
      "args": ["-y", "matrix-mcp"],
      "env": {
        "MATRIX_DB_PATH": "/absolute/path/to/matrix.db"
      }
    }
  }
}
```

## Human Interface (CLI & Web)

MATRIX also ships a `matrix-mcp-cli` CLI for humans to browse and manage the database directly.

```bash
matrix-mcp-cli --help
```

```bash
matrix-mcp-cli list # lists requirements
matrix-mcp-cli get req-00001
matrix-mcp-cli pick tsk-00001 --agent my-agent
matrix-mcp-cli serve --port 3000
```

DB path: `--matrix-db-path` flag > `MATRIX_DB_PATH` env var > `.matrix/matrix.db`
