/**
 * Platform Lab Chat UI — Express backend
 *
 * Proxies calls to the MCP server, parses pandas-formatted text output into
 * structured JSON, and serves the built React app as static files.
 */

import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MCP_URL = process.env.MCP_URL || "http://mcp-server:8000/sse";
const PORT = parseInt(process.env.PORT || "3000", 10);

const app = express();
app.use(express.json());

// ── Serve built React app ─────────────────────────────────────────
app.use(express.static(join(__dirname, "dist")));

// ── MCP client helper ─────────────────────────────────────────────

async function callMCPTool(toolName, args = {}) {
  const transport = new SSEClientTransport(new URL(MCP_URL));
  const client = new Client({ name: "chat-ui", version: "1.0.0" }, {});
  await client.connect(transport);
  try {
    const result = await client.callTool({ name: toolName, arguments: args });
    const textContent = result.content.find((c) => c.type === "text");
    return textContent?.text ?? "";
  } finally {
    await client.close();
  }
}

// ── Parsers ───────────────────────────────────────────────────────

/**
 * Parse pandas DataFrame.to_string(index=False) output into { columns, rows }.
 * Splits on 2+ consecutive spaces to handle numeric / short-string data.
 */
function parsePandasTable(text) {
  if (!text) return { columns: [], rows: [] };

  const noRows =
    text.trim() === "(no rows)" || text.trim() === "(no rows returned)";
  if (noRows) return { columns: [], rows: [] };

  const lines = text
    .trim()
    .split("\n")
    .filter((l) => l.trim());
  if (lines.length === 0) return { columns: [], rows: [] };

  const columns = lines[0]
    .trim()
    .split(/\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);

  const rows = lines.slice(1).map((line) => {
    const values = line
      .trim()
      .split(/\s{2,}/)
      .map((s) => s.trim());
    const row = {};
    columns.forEach((col, i) => {
      row[col] = values[i] ?? "";
    });
    return row;
  });

  return { columns, rows };
}

/**
 * Split the nl_to_sql text response into { sql, tableText }.
 * Expected format from server.py:
 *   Generated SQL:\n<sql>\n\nResult:\n<table>
 */
function parseNlToSqlResponse(text) {
  const sqlMatch = text.match(/Generated SQL:\n([\s\S]+?)\n\nResult:/);
  const resultMatch = text.match(/Result:\n([\s\S]+)$/);
  return {
    sql: sqlMatch ? sqlMatch[1].trim() : null,
    tableText: resultMatch ? resultMatch[1].trim() : null,
  };
}

// ── API routes ────────────────────────────────────────────────────

// POST /api/chat  — natural language → SQL → results
app.post("/api/chat", async (req, res) => {
  const { question } = req.body ?? {};
  if (!question?.trim()) {
    return res.status(400).json({ error: "question is required" });
  }

  try {
    const raw = await callMCPTool("nl_to_sql", { question: question.trim() });
    const { sql, tableText } = parseNlToSqlResponse(raw);
    const table = parsePandasTable(tableText);
    res.json({ tool: "nl_to_sql", sql, table, raw });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sql  — execute raw SQL
app.post("/api/sql", async (req, res) => {
  const { query } = req.body ?? {};
  if (!query?.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

  try {
    const raw = await callMCPTool("execute_sql", { query: query.trim() });
    const table = parsePandasTable(raw);
    res.json({ tool: "execute_sql", table, raw });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tables  — list warehouse tables
app.get("/api/tables", async (req, res) => {
  try {
    const raw = await callMCPTool("list_tables");
    const table = parsePandasTable(raw);
    res.json({ tool: "list_tables", table, raw });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback: React SPA
app.get("*", (_req, res) => {
  res.sendFile(join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () =>
  console.log(`chat-ui listening on :${PORT}  (MCP → ${MCP_URL})`)
);
