-- =============================================================================
-- Kaaj — messaging looks a sender up by number or address, per inbound message
-- =============================================================================
-- messaging.repo.ts matchContact() compares the carrier's E.164 number with
-- customer_contacts.phone stripped of punctuation, and the sender's address
-- with lower(email). customer_contacts is SCALE_SENSITIVE: without an index
-- on exactly those expressions, every inbound SMS and email is a sequential
-- scan of the tenant's whole contact list. The expressions here must match
-- the query's text for the planner to use them.
-- =============================================================================

CREATE INDEX idx_customer_contacts_phone_digits
    ON customer_contacts (tenant_id, (regexp_replace(coalesce(phone, ''), '[^0-9+]', '', 'g')))
    WHERE is_active;

CREATE INDEX idx_customer_contacts_email_lower
    ON customer_contacts (tenant_id, lower(email))
    WHERE is_active;
