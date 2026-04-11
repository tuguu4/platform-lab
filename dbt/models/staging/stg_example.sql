-- stg_example.sql
-- Skeleton staging model — materialised as a view.
--
-- Rename this file to stg_<source>_<entity>.sql and adapt the SELECT.
-- Before running, load the source table with:
--
--   CREATE OR REPLACE TABLE raw_sample AS
--   SELECT * FROM read_parquet('s3://raw-data/sample/*.parquet');
--   -- or: read_csv_auto('s3://raw-data/sample/*.csv')

{{ config(materialized='view') }}

SELECT
    id,
    -- add and cast columns here
    CURRENT_TIMESTAMP AS _loaded_at
FROM {{ source('raw', 'sample') }}
