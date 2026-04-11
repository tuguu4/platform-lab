# Platform Lab — Claude Code Guide

## Stack at a Glance

| Component | Image / Package | Port | Purpose |
|-----------|----------------|------|---------|
| MinIO | `minio/minio:latest` | 9000 (API), 9001 (UI) | S3-compatible local object store |
| Prefect | `prefecthq/prefect:3-latest` | 4200 | Workflow orchestration |
| MCP Server | `./mcp` (Python 3.12) | 8000 | NL→SQL bridge (Groq + DuckDB) |
| DuckDB | embedded in Python | — | OLAP query engine with Iceberg support |
| Groq API | `groq` Python SDK | — | LLM inference — `llama-3.1-8b-instant` |
| dbt | `dbt-duckdb` adapter | — | SQL transformation layer |

DuckDB is **embedded** (not a separate service). The warehouse file lives at `data/warehouse.duckdb`.

## Project Layout

```
platform-lab/
├── docker-compose.yml      # Spin up the full stack
├── .env                    # Local secrets — never committed
├── .env.example            # Template — copy to .env
├── CLAUDE.md               # This file
├── README.md               # Human-facing setup guide
├── data/                   # DuckDB warehouse + raw files (gitignored)
├── mcp/                    # Python MCP server
│   ├── server.py           # FastMCP app — add @mcp.tool() here
│   ├── Dockerfile
│   └── requirements.txt
└── dbt/                    # dbt project (dbt-duckdb adapter)
    ├── dbt_project.yml
    ├── profiles.yml        # Connection config — copy to ~/.dbt/
    ├── packages.yml
    └── models/
        ├── staging/        # Views:  stg_<source>_<entity>.sql
        └── marts/          # Tables: domain-named .sql files
```

## Running the Stack

```bash
cp .env.example .env          # fill in GROQ_API_KEY
docker compose up -d          # starts MinIO, Prefect, MCP server
docker compose logs -f mcp-server
```

## Conventions

### Python — mcp/
- **Type hints** on all function signatures.
- New tools: add `@mcp.tool()` decorated functions in `server.py`.
- DuckDB connections: always `conn = _get_db()` and `conn.close()` in a `finally` block.
- LLM model is `llama-3.1-8b-instant` via Groq. Keep `temperature=0` for SQL generation.
- Strip markdown fences from LLM output before executing SQL.

### SQL — dbt/
- **Staging** layer: `view`, named `stg_<source>_<entity>` (e.g., `stg_minio_orders`).
- **Marts** layer: `table`, domain-named (e.g., `orders_daily`).
- Use DuckDB-native functions where helpful: `read_parquet()`, `read_csv_auto()`, `strftime()`.
- MinIO S3 paths follow `s3://raw-data/<entity>/`.

### Storage Buckets (MinIO)
| Bucket | Purpose |
|--------|---------|
| `raw-data` | Landing zone for inbound files |
| `iceberg` | Iceberg table data managed by DuckDB |
| `dbt-artifacts` | Compiled dbt manifests and run results |

## Key Commands

```bash
# dbt
cd dbt
dbt deps                          # install packages
dbt run --profiles-dir .          # run all models
dbt test --profiles-dir .         # run tests
dbt docs generate --profiles-dir . && dbt docs serve --profiles-dir .

# DuckDB quick query (from repo root)
python -c "import duckdb; print(duckdb.connect('data/warehouse.duckdb').sql('SHOW ALL TABLES').df())"

# MinIO CLI (requires mc installed locally)
mc alias set local http://localhost:9000 minioadmin minioadmin
mc ls local/
mc cp myfile.parquet local/raw-data/
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GROQ_API_KEY` | Yes | — | Groq API key for LLM inference |
| `MINIO_ROOT_USER` | No | `minioadmin` | MinIO admin username |
| `MINIO_ROOT_PASSWORD` | No | `minioadmin` | MinIO admin password |
