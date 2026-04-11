# Platform Lab

A local data platform sandbox — MinIO, DuckDB, Prefect, dbt, and Groq, all running in Docker.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac or Windows)
- Python 3.12+ (for running dbt and MCP server outside Docker)
- A free [Groq API key](https://console.groq.com) (`llama-3.1-8b-instant` model)

## Quick Start

```bash
# 1. Copy and fill in your API key
cp .env.example .env
# Open .env and set GROQ_API_KEY=gsk_...

# 2. Start all services
docker compose up -d

# 3. Check everything is running
docker compose ps
```

## Service URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| MinIO Console | <http://localhost:9001> | minioadmin / minioadmin |
| Prefect UI | <http://localhost:4200> | — |
| MCP Server (SSE) | <http://localhost:8000> | — |

DuckDB runs **embedded** — no separate service. Warehouse file: `data/warehouse.duckdb`.

## Project Structure

```
platform-lab/
├── docker-compose.yml
├── .env.example
├── CLAUDE.md               # Stack conventions for Claude Code
├── data/                   # Local warehouse + raw files (gitignored)
├── mcp/                    # Python MCP server (Groq + DuckDB)
│   ├── server.py
│   ├── Dockerfile
│   └── requirements.txt
└── dbt/                    # dbt project (dbt-duckdb adapter)
    ├── dbt_project.yml
    ├── profiles.yml
    └── models/
        ├── staging/
        └── marts/
```

## dbt Setup

```bash
# Install dbt locally
pip install dbt-duckdb

# Option A — copy profiles to the dbt default location
cp dbt/profiles.yml ~/.dbt/profiles.yml

# Option B — pass --profiles-dir at runtime (no copy needed)
cd dbt
dbt deps
dbt run --profiles-dir .
dbt test --profiles-dir .
```

### dbt Targets

| Target | Description |
|--------|-------------|
| `dev` (default) | Local DuckDB only — no MinIO required |
| `s3` | DuckDB + MinIO via httpfs & Iceberg |

```bash
dbt run --profiles-dir . --target s3
```

## MCP Server

The MCP server exposes DuckDB + Groq as tools via the Model Context Protocol.

### Running in Docker (SSE mode)

Already started by `docker compose up -d`. Available at `http://localhost:8000`.

### Running locally for Claude Desktop (stdio mode)

```bash
cd mcp
pip install -r requirements.txt
```

Add to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "platform-lab": {
      "command": "python",
      "args": ["/absolute/path/to/mcp/server.py"],
      "env": {
        "GROQ_API_KEY": "gsk_...",
        "DUCKDB_PATH": "/absolute/path/to/data/warehouse.duckdb"
      }
    }
  }
}
```

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `list_tables` | List all tables and views in the DuckDB warehouse |
| `execute_sql` | Execute arbitrary DuckDB SQL and return results |
| `nl_to_sql` | Natural language → SQL via Groq → execute → return results |

## Loading Data

```python
import duckdb

conn = duckdb.connect("data/warehouse.duckdb")

# From a local file
conn.execute("CREATE TABLE my_table AS SELECT * FROM read_csv_auto('path/to/file.csv')")

# From MinIO (after docker compose up)
conn.execute("""
    SET s3_endpoint='localhost:9000';
    SET s3_access_key_id='minioadmin';
    SET s3_secret_access_key='minioadmin';
    SET s3_use_ssl=false;
    SET s3_url_style='path';
    INSTALL httpfs; LOAD httpfs;
""")
conn.execute("CREATE TABLE parquet_data AS SELECT * FROM read_parquet('s3://raw-data/myfile.parquet')")
```

## Stopping Services

```bash
docker compose down           # stop containers, keep volumes
docker compose down -v        # stop containers AND delete volumes (full reset)
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| MinIO init container exits with error | Wait ~15 s, then `docker compose up minio-init` |
| Prefect UI not loading | Give it ~30 s to initialise its internal database |
| `GROQ_API_KEY` not set error | Add key to `.env`, then `docker compose up -d mcp-server` |
| DuckDB file locked | Only one process can write at a time — close other connections |
| `mc: command not found` | Install [MinIO Client](https://min.io/docs/minio/linux/reference/minio-mc.html) locally |
