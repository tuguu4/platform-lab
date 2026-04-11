"""
Quick end-to-end smoke test for the platform-lab stack.
Run from repo root:  python test_stack.py
Requires: pip install mcp duckdb groq python-dotenv
"""

import asyncio
import duckdb
from dotenv import load_dotenv
from mcp import ClientSession
from mcp.client.sse import sse_client

load_dotenv()

DB_PATH  = "data/warehouse.duckdb"
MCP_URL  = "http://localhost:8000/sse"


# ── Step 1: seed DuckDB with sample data ──────────────────────────
def seed_duckdb():
    conn = duckdb.connect(DB_PATH)
    conn.execute("""
        CREATE OR REPLACE TABLE sales AS
        SELECT
            range           AS id,
            'product_' || (range % 5 + 1) AS product,
            (random() * 100)::INT          AS quantity,
            (random() * 50 + 10)::DECIMAL(8,2) AS unit_price
        FROM range(1, 21)
    """)
    rows = conn.execute("SELECT COUNT(*) FROM sales").fetchone()[0]
    conn.close()
    print(f"[1] DuckDB seeded — sales table has {rows} rows")


# ── Step 2: call MCP tools via SSE ────────────────────────────────
async def test_mcp():
    async with sse_client(MCP_URL) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # list_tables
            r = await session.call_tool("list_tables", {})
            print(f"\n[2] list_tables:\n{r.content[0].text}")

            # execute_sql
            r = await session.call_tool(
                "execute_sql",
                {"query": "SELECT product, SUM(quantity) AS total_qty FROM sales GROUP BY product ORDER BY total_qty DESC"}
            )
            print(f"\n[3] execute_sql (sales by product):\n{r.content[0].text}")

            # nl_to_sql — uses Groq
            r = await session.call_tool(
                "nl_to_sql",
                {"question": "Which product had the highest total revenue?"}
            )
            print(f"\n[4] nl_to_sql (Groq → DuckDB):\n{r.content[0].text}")


if __name__ == "__main__":
    seed_duckdb()
    asyncio.run(test_mcp())
    print("\nAll checks passed.")
