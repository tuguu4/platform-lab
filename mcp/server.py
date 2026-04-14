"""
Platform Lab — MCP Server
Exposes DuckDB + Groq tools via the Model Context Protocol.

Transports:
  stdio  — for Claude Desktop local integration (MCP_TRANSPORT=stdio)
  sse    — Docker / HTTP clients; MCP SSE mounted at /mcp/sse

REST convenience endpoints (used by the chat-ui):
  POST /ask    {"question": str}  → {"sql": str, "result": str}
  POST /query  {"sql": str}       → {"result": str}
  GET  /tables                    → {"result": str}
"""

from __future__ import annotations

import os
from typing import Optional

import duckdb
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from groq import Groq
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel

load_dotenv()

# ── Configuration ─────────────────────────────────────────────────
GROQ_API_KEY     = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL       = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")
DUCKDB_PATH      = os.environ.get("DUCKDB_PATH", "./data/warehouse.duckdb")
MINIO_ENDPOINT   = os.environ.get("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.environ.get("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.environ.get("MINIO_SECRET_KEY", "minioadmin")

groq_client = Groq(api_key=GROQ_API_KEY)
mcp = FastMCP("platform-lab")


# ── DB helper ──────────────────────────────────────────────────────

def _get_db() -> duckdb.DuckDBPyConnection:
    """Open a DuckDB connection pre-configured for MinIO/S3 access."""
    conn = duckdb.connect(DUCKDB_PATH)
    conn.execute("INSTALL httpfs; LOAD httpfs;")
    conn.execute(f"""
        SET s3_endpoint          = '{MINIO_ENDPOINT}';
        SET s3_access_key_id     = '{MINIO_ACCESS_KEY}';
        SET s3_secret_access_key = '{MINIO_SECRET_KEY}';
        SET s3_use_ssl           = false;
        SET s3_url_style         = 'path';
    """)
    return conn


def _schema_context(conn: duckdb.DuckDBPyConnection) -> str:
    """Return a compact schema summary suitable for LLM prompting."""
    try:
        df = conn.execute("SHOW ALL TABLES").fetchdf()
        return df.to_string(index=False) if not df.empty else "No tables found."
    except Exception:
        return "Unable to retrieve schema."


# ── Business logic (called by both MCP tools and REST routes) ─────

def _list_tables_impl() -> str:
    conn = _get_db()
    try:
        return _schema_context(conn)
    finally:
        conn.close()


def _execute_sql_impl(query: str) -> str:
    conn = _get_db()
    try:
        result = conn.execute(query).fetchdf()
        return result.to_string(index=False) if not result.empty else "(no rows returned)"
    except Exception as exc:
        return f"Error: {exc}"
    finally:
        conn.close()


def _nl_to_sql_impl(question: str, schema_hint: Optional[str] = None) -> dict[str, str]:
    """
    Returns {"sql": <generated sql>, "result": <pandas table text>}.
    Raises on LLM or execution failure.
    """
    conn = _get_db()
    try:
        schema = schema_hint or _schema_context(conn)

        response = groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a DuckDB SQL expert. "
                        "Return ONLY a valid DuckDB SQL query — no explanation, no markdown fences.\n\n"
                        f"Available tables:\n{schema}"
                    ),
                },
                {"role": "user", "content": question},
            ],
            temperature=0,
            max_tokens=512,
        )

        sql = response.choices[0].message.content.strip()

        # Strip markdown code fences if the model included them
        if sql.startswith("```"):
            lines = sql.splitlines()
            sql = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        result = conn.execute(sql).fetchdf()
        result_text = result.to_string(index=False) if not result.empty else "(no rows)"
        return {"sql": sql, "result": result_text}

    finally:
        conn.close()


# ── MCP tools (thin wrappers over the impl functions) ─────────────

@mcp.tool()
def list_tables() -> str:
    """List all tables and views available in the DuckDB warehouse."""
    return _list_tables_impl()


@mcp.tool()
def execute_sql(query: str) -> str:
    """
    Execute a SQL query against DuckDB and return results as a formatted string.

    Args:
        query: Valid DuckDB SQL statement.
    """
    return _execute_sql_impl(query)


@mcp.tool()
def nl_to_sql(question: str, schema_hint: Optional[str] = None) -> str:
    """
    Translate a natural-language question into SQL, execute it, and return results.

    Uses Groq (llama-3.1-8b-instant) for SQL generation.

    Args:
        question:    Natural language question about the data.
        schema_hint: Optional extra schema context to pass to the LLM.
    """
    try:
        r = _nl_to_sql_impl(question, schema_hint)
        return f"Generated SQL:\n{r['sql']}\n\nResult:\n{r['result']}"
    except Exception as exc:
        return f"Error: {exc}"


# ── FastAPI app with REST convenience routes ───────────────────────

api = FastAPI(title="Platform Lab API")


class AskRequest(BaseModel):
    question: str


class QueryRequest(BaseModel):
    sql: str


@api.post("/ask")
def ask(req: AskRequest):
    """Natural language → SQL → results. Used by the chat-ui."""
    try:
        return _nl_to_sql_impl(req.question)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@api.post("/query")
def query(req: QueryRequest):
    """Execute raw SQL. Used by the chat-ui."""
    return {"result": _execute_sql_impl(req.sql)}


@api.get("/tables")
def tables():
    """List warehouse tables. Used by the chat-ui."""
    return {"result": _list_tables_impl()}


# Mount MCP SSE transport under /mcp (keeps /mcp/sse available for Claude Desktop)
api.mount("/mcp", mcp.sse_app())


# ── Entry point ───────────────────────────────────────────────────

if __name__ == "__main__":
    transport = os.environ.get("MCP_TRANSPORT", "stdio")
    if transport == "sse":
        import uvicorn
        port = int(os.environ.get("PORT", 8000))
        uvicorn.run(api, host="0.0.0.0", port=port)
    else:
        mcp.run()
