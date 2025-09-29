#!/usr/bin/env node
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { loadTriviewForExport } from "../../lib/export/triview-adapter.mjs";
import { REPORT_FILES } from "../utils/project-paths.mjs";

const ROOT = process.cwd();

function runCommand(command, options = {}) {
  try {
    const output = execSync(command, {
      cwd: ROOT,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        FORCE_COLOR: "0",
        ...options.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeout ?? 5 * 60 * 1000,
    });
    return { ok: true, stdout: output.toString().trim() };
  } catch (error) {
    return {
      ok: false,
      stdout: (error.stdout || "").toString().trim(),
      stderr: (error.stderr || "").toString().trim(),
      message: error.message,
    };
  }
}

function readFileSafe(relPath) {
  const abs = join(ROOT, relPath);
  if (!existsSync(abs)) {
    return null;
  }
  return readFileSync(abs, "utf8");
}

function summarizeTriview(sections) {
  const totalRows = sections.reduce((acc, section) => acc + (section.rows?.length || 0), 0);
  const topSections = sections.slice(0, 5).map((section) => `${section.id} (${section.rows?.length || 0} rows)`);
  return {
    totalSections: sections.length,
    totalRows,
    topSections,
  };
}

async function main() {
  const server = new McpServer({
    name: "arabic-translation-project-insights",
    version: "1.0.0",
  });

  // Resources
  server.registerResource(
    "codex-support",
    "project://codex-support",
    {
      title: "Codex Support Bundle",
      description: "Latest CODEX_SUPPORT.md snapshot.",
      mimeType: "text/markdown",
    },
    async () => {
      const content = readFileSafe("CODEX_SUPPORT.md");
      return {
        contents: [
          {
            uri: "project://codex-support",
            text: content ?? "CODEX_SUPPORT.md not found. Run refresh_codex_support tool.",
          },
        ],
      };
    }
  );

  server.registerResource(
    "quality-report",
    "project://quality-report",
    {
      title: "Quality Gates Report",
      description: `Human-readable quality gates summary from ${REPORT_FILES.qualityMarkdown}.`,
      mimeType: "text/markdown",
    },
    async () => ({
      contents: [
        {
          uri: "project://quality-report",
          text: readFileSafe(REPORT_FILES.qualityMarkdown) ?? "Quality report not generated yet.",
        },
      ],
    })
  );

  server.registerResource(
    "deployment-report",
    "project://deployment/report",
    {
      title: "Deployment Readiness Report",
      description: `Latest deployment snapshot sourced from ${REPORT_FILES.deploymentMarkdown}.`,
      mimeType: "text/markdown",
    },
    async () => ({
      contents: [
        {
          uri: "project://deployment/report",
          text: readFileSafe(REPORT_FILES.deploymentMarkdown) ?? "Deployment report not generated yet.",
        },
      ],
    })
  );

  server.registerResource(
    "git-status",
    "project://git-status",
    {
      title: "Git Status",
      description: "Current git status summary.",
      mimeType: "text/plain",
    },
    async () => {
      const result = runCommand("git status -sb");
      const text = result.ok ? result.stdout : `Failed to read git status: ${result.stderr || result.message}`;
      return {
        contents: [
          {
            uri: "project://git-status",
            text,
          },
        ],
      };
    }
  );

  server.registerResource(
    "triview-summary",
    "project://triview/summary",
    {
      title: "Triview Summary",
      description: "High-level overview of triview sections and rows.",
      mimeType: "application/json",
    },
    async () => {
      try {
        const { sections } = loadTriviewForExport(ROOT);
        const summary = summarizeTriview(sections);
        return {
          contents: [
            {
              uri: "project://triview/summary",
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: "project://triview/summary",
              text: `Failed to load triview data: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Tools
  server.registerTool(
    "refresh_codex_support",
    {
      title: "Refresh Codex Support Bundle",
      description: "Regenerates CODEX_SUPPORT.md and returns a short confirmation.",
      inputSchema: z.object({}),
    },
    async () => {
      const result = runCommand("node scripts/codex-support.mjs");
      const summary = result.ok ? "CODEX_SUPPORT.md regenerated." : `Failed: ${result.stderr || result.message}`;
      return {
        content: [
          { type: "text", text: summary },
        ],
      };
    }
  );

  server.registerTool(
    "run_quality_validation",
    {
      title: "Run Quality Validation",
      description: "Executes scripts/quality-validation.mjs and returns the console output.",
      inputSchema: z.object({}),
    },
    async () => {
      const result = runCommand("npx tsx scripts/quality-validation.mjs", { env: { FORCE_COLOR: "0" } });
      const output = result.ok ? result.stdout : `Validation failed:\n${result.stdout}\n${result.stderr}`.trim();
      return {
        content: [
          { type: "text", text: output },
        ],
      };
    }
  );

  server.registerTool(
    "run_next_build",
    {
      title: "Run Next.js Build",
      description: "Runs npm run build and returns the summarized output.",
      inputSchema: z.object({ skipInstall: z.boolean().optional() }),
    },
    async ({ skipInstall }) => {
      let logs = [];
      if (!skipInstall) {
        const install = runCommand("npm install", { env: { npm_config_loglevel: "error" } });
        logs.push(install.ok ? "Dependencies are up to date." : `npm install failed: ${install.stderr || install.message}`);
        if (!install.ok) {
          return { content: [{ type: "text", text: logs.join("\n") }] };
        }
      }
      const build = runCommand("npm run build");
      logs.push(build.ok ? build.stdout : `Build failed:\n${build.stdout}\n${build.stderr}`.trim());
      return {
        content: [
          { type: "text", text: logs.join("\n\n") },
        ],
      };
    }
  );

  server.registerTool(
    "git_status",
    {
      title: "Git Status",
      description: "Returns git status --short --branch output.",
      inputSchema: z.object({}),
    },
    async () => {
      const result = runCommand("git status -sb");
      const text = result.ok ? result.stdout : `Failed: ${result.stderr || result.message}`;
      return {
        content: [{ type: "text", text }],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Failed to start project MCP server", error);
  process.exit(1);
});
