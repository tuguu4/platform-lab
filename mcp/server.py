"""
Platform Lab — MCP Server
Exposes DuckDB + Groq tools via the Model Context Protocol.

Transport modes (set MCP_TRANSPORT env var):
  stdio  (default) — for Claude Desktop local integration
  sse              — for Docker / HTTP clients
"""

from __future__ import annotations

import os
from typing import Optional

import duckdb
from dotenv import load_dotenv
from groq import Groq
from mcp.server.fastmcp import FastMCP

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


# ── Helpers ───────────────────────────────────────────────────────

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


# ── Tools ─────────────────────────────────────────────────────────

@mcp.tool()
def list_tables() -> str:
    """List all tables and views available in the DuckDB warehouse."""
    conn = _get_db()
    try:
        return _schema_context(conn)
    finally:
        conn.close()


@mcp.tool()
def execute_sql(query: str) -> str:
    """
    Execute a SQL query against DuckDB and return results as a formatted string.

    Args:
        query: Valid DuckDB SQL statement.
    """
    conn = _get_db()
    try:
        result = conn.execute(query).fetchdf()
        return result.to_string(index=False) if not result.empty else "(no rows returned)"
    except Exception as exc:
        return f"Error: {exc}"
    finally:
        conn.close()


@mcp.tool()
def nl_to_sql(question: str, schema_hint: Optional[str] = None) -> str:
    """
    Translate a natural-language question into SQL, execute it, and return results.

    Uses Groq (llama-3.1-8b-instant) for SQL generation.

    Args:
        question:    Natural language question about the data.
        schema_hint: Optional extra schema context to pass to the LLM.
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
        rows = result.to_string(index=False) if not result.empty else "(no rows)"
        return f"Generated SQL:\n{sql}\n\nResult:\n{rows}"

    except Exception as exc:
        return f"Error: {exc}"
    finally:
        conn.close()


# ── Entry point ───────────────────────────────────────────────────

if __name__ == "__main__":
    transport = os.environ.get("MCP_TRANSPORT", "stdio")
    if transport == "sse":
        mcp.run(transport="sse")
    else:
        mcp.run()
