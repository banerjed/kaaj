-- Development aid for writing generator steps: every column of the tables
-- named in :'tables' (comma-separated), with type, nullability, default and
-- the CHECK and foreign-key constraints that bind them.
--   psql "$URL" -v tables=customers,crm_deals -f packages/database/perf/describe.sql
SELECT c.table_name AS t, c.column_name AS col, c.data_type AS type,
       CASE WHEN c.is_nullable = 'NO' THEN 'NOT NULL' ELSE '' END AS nn,
       left(coalesce(c.column_default, ''), 40) AS dflt
  FROM information_schema.columns c
 WHERE c.table_schema = 'public'
   AND c.table_name = ANY (string_to_array(:'tables', ','))
 ORDER BY array_position(string_to_array(:'tables', ','), c.table_name::text),
          c.ordinal_position;

SELECT conrelid::regclass AS t, contype AS k, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
 WHERE conrelid::regclass::text = ANY (string_to_array(:'tables', ','))
   AND contype IN ('c', 'f', 'u')
 ORDER BY 1, 2;
