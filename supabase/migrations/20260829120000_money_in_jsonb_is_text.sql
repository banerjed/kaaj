-- Money held inside JSONB becomes text.
--
-- `firm_job_levels.salary_ranges` and `firm_benefit_items.costs_by_currency`
-- stored their amounts as JSON numbers. Postgres itself keeps a jsonb number as
-- `numeric`, so nothing was lost in the database — the loss is on the way out:
-- every driver hands a JSON number to JavaScript as a float64, and CLAUDE.md's
-- rule is that money is a string end to end for exactly that reason.
--
-- `::numeric::text` rather than a plain cast, so 95000 becomes '95000' and not
-- '95000.0', and so a value that was already text is left alone.

UPDATE firm_job_levels
   SET salary_ranges = (
         SELECT coalesce(jsonb_object_agg(cur, jsonb_build_object(
                  'min', to_jsonb(((band ->> 'min')::numeric)::text),
                  'max', to_jsonb(((band ->> 'max')::numeric)::text)
                )), '{}'::jsonb)
           FROM jsonb_each(salary_ranges) AS r(cur, band)
       )
 WHERE salary_ranges IS NOT NULL
   AND salary_ranges <> '{}'::jsonb
   AND EXISTS (
         SELECT 1 FROM jsonb_each(salary_ranges) AS r(cur, band)
          WHERE jsonb_typeof(band -> 'min') = 'number'
             OR jsonb_typeof(band -> 'max') = 'number'
       );

UPDATE firm_benefit_items
   SET costs_by_currency = (
         SELECT coalesce(jsonb_object_agg(cur, jsonb_build_object(
                  'employee', to_jsonb(((c ->> 'employee')::numeric)::text),
                  'employer', to_jsonb(((c ->> 'employer')::numeric)::text)
                )), '{}'::jsonb)
           FROM jsonb_each(costs_by_currency) AS r(cur, c)
       )
 WHERE costs_by_currency IS NOT NULL
   AND costs_by_currency <> '{}'::jsonb
   AND EXISTS (
         SELECT 1 FROM jsonb_each(costs_by_currency) AS r(cur, c)
          WHERE jsonb_typeof(c -> 'employee') = 'number'
             OR jsonb_typeof(c -> 'employer') = 'number'
       );
