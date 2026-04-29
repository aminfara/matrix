# MATRIX

**Multi-Agent Task & Requirement IndeX** — A local, project-scoped Requirement Management MCP server for multi-agent, multi-session work. Think of it as a lightweight local project manager, backed by SQLite, that AI agents can connect to via the Model Context Protocol.

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
