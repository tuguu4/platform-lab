-- example_mart.sql
-- Skeleton mart model — materialised as a table.
--
-- Rename to a domain-specific name (e.g., orders_daily.sql)
-- and replace the SELECT with your aggregations.

{{ config(materialized='table') }}

SELECT
    id,
    _loaded_at
FROM {{ ref('stg_example') }}
