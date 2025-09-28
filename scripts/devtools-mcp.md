# Chrome DevTools MCP Helper

## How to Run

```bash
npm run mcp:devtools
```

Running the script launches `chrome-devtools-mcp` via `npx`. The package auto-installs if it is missing.

## Requirements
- A local Chrome / Chromium installation.
- The command opens a debug port and hosts an MCP server for DevTools.

## Using with Agents
- After starting the MCP server, note the host/port printed in the console (defaults to `127.0.0.1:9222`).
- Configure your MCP-capable agent (Cursor, ChatGPT, etc.) to connect to that endpoint.
- The agent can then inspect the active Chrome tab: console logs, network requests, DOM snapshots, etc.

## Workflow Intent
During “Dad Mode” reviews we attach Chrome DevTools through MCP to inspect the Vercel preview directly:
- Launch the preview (`npm run dev` or deployed link).
- Start the MCP server with `npm run mcp:devtools`.
- Point the reviewing agent to the MCP host/port so it can collect console warnings, network traces, and DOM state while reviewing the preview build.
