-- Payroll export (docs/36): Brightline exports to ADP RUN. Every source has a
-- code and every employee an id, so the export page reviews the whole firm,
-- and the file route builds the whole file, at the size they will meet.

INSERT INTO payroll_export_settings (tenant_id, provider, company_code)
VALUES (_perf.tenant(), 'adp_run', 'BRIGHT01');

INSERT INTO payroll_export_codes (id, tenant_id, provider, source, code)
SELECT _perf.u('export-code', n), _perf.tenant(), 'adp_run', source, code
  FROM (
    SELECT row_number() OVER (ORDER BY source) AS n, source, code
      FROM (
        VALUES ('regular', 'REG'), ('overtime', 'OVT'), ('double_time', 'DBL')
        UNION ALL
        SELECT 'time_off:' || p.policy_code,
               CASE WHEN p.time_off_type = 'sick' THEN 'SCK' ELSE 'VAC' END
          FROM hr_time_off_policies p
         WHERE p.tenant_id = _perf.tenant() AND p.policy_code IS NOT NULL
      ) AS s(source, code)
  ) AS numbered;

INSERT INTO payroll_employee_ids (id, tenant_id, employee_id, provider, external_id)
SELECT _perf.u('export-id', row_number() OVER (ORDER BY e.employee_number)),
       _perf.tenant(), e.id, 'adp_run', e.employee_number
  FROM employees e
 WHERE e.tenant_id = _perf.tenant();
