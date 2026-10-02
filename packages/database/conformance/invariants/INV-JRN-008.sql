-- INV-JRN-008 Posting metadata: date, source type, actor, timestamp, number.
SELECT je.id::text, je.entry_number,
       concat_ws(', ',
         CASE WHEN je.entry_date IS NULL THEN 'entry_date' END,
         CASE WHEN je.source_type IS NULL THEN 'source_type' END,
         CASE WHEN je.posted_by IS NULL THEN 'posted_by' END,
         CASE WHEN je.posted_at IS NULL THEN 'posted_at' END,
         CASE WHEN je.entry_number IS NULL OR je.entry_number = '' THEN 'entry_number' END) AS missing
  FROM journal_entries je
 WHERE je.tenant_id = $1 AND je.status = 'posted'
   AND (je.entry_date IS NULL OR je.source_type IS NULL OR je.posted_by IS NULL
        OR je.posted_at IS NULL OR je.entry_number IS NULL OR je.entry_number = '')
