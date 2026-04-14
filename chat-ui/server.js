/**
 * Platform Lab Chat UI — Express backend
 *
 * Calls the MCP server's REST convenience endpoints (/ask, /query, /tables),
 * parses pandas-formatted text output into structured JSON, and serves the
 * built React app as static files.
 */

import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MCP_BASE = process.env.MCP_BASE_URL || "http://mcp-server:8000";
const PORT = parseInt(process.env.PORT || "3000", 10);

const app = express();
app.use(express.json());

// ── Serve built React app ─────────────────────────────────────────
app.use(express.static(join(__dirname, "dist")));

// ── MCP REST helpers ──────────────────────────────────────────────

async function mcpAsk(question) {
  const res = await fetch(`${MCP_BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`/ask ${res.status}: ${body}`);
  }
  return res.json(); // { sql, result }
}

async function mcpQuery(sql) {
  const res = await fetch(`${MCP_BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`/query ${res.status}: ${body}`);
  }
  return res.json(); // { result }
}

async function mcpTables() {
  const res = await fetch(`${MCP_BASE}/tables`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`/tables ${res.status}: ${body}`);
  }
  return res.json(); // { result }
}

// ── Parsers ───────────────────────────────────────────────────────

/**
 * Parse pandas DataFrame.to_string(index=False) output into { columns, rows }.
 * Splits on 2+ consecutive spaces — works for numeric / short-string data.
 */
function parsePandasTable(text) {
  if (!text) return { columns: [], rows: [] };

  const trimmed = text.trim();
  if (trimmed === "(no rows)" || trimmed === "(no rows returned)") {
    return { columns: [], rows: [] };
  }

  const lines = trimmed.split("\n").filter((l) => l.trim());
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

// ── API routes ────────────────────────────────────────────────────

// POST /api/chat  — natural language → SQL → results
app.post("/api/chat", async (req, res) => {
  const { question } = req.body ?? {};
  if (!question?.trim()) {
    return res.status(400).json({ error: "question is required" });
  }

  try {
    const { sql, result } = await mcpAsk(question.trim());
    const table = parsePandasTable(result);
    res.json({ tool: "nl_to_sql", sql, table });
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
    const { result } = await mcpQuery(query.trim());
    const table = parsePandasTable(result);
    res.json({ tool: "execute_sql", table });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tables  — list warehouse tables
app.get("/api/tables", async (req, res) => {
  try {
    const { result } = await mcpTables();
    const table = parsePandasTable(result);
    res.json({ tool: "list_tables", table });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback: React SPA
app.get("*", (_req, res) => {
  res.sendFile(join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () =>
  console.log(`chat-ui listening on :${PORT}  (MCP → ${MCP_BASE})`)
);
