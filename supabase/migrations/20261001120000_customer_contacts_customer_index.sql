-- A client's contacts, by client. Every client list and detail page counts or
-- lists them per client; without this the only usable index leads on
-- tenant_id alone, so each client scans every contact in the firm (4.6s for
-- 3,000 clients in the perf tenant, docs/32-perf-tenant.md; 23ms with it).
CREATE INDEX idx_customer_contacts_tenant_customer
    ON customer_contacts (tenant_id, customer_id);
