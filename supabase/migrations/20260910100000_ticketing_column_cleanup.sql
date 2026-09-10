-- =============================================================================
-- Kaaj — ticketing: drop dead and duplicated columns
-- =============================================================================
-- Audit (grep across apps/web/src/lib/server/ticketing/ticketing.repo.ts, the
-- sole file that queries these tables, plus routes/forms/RLS/audit-register/
-- spec-tests/fixture) found these columns either write-only-never-read, exact
-- duplicates of a column that IS read, or superseded by a newer mechanism.
-- Left untouched: ticketing_attachments (whole table currently unused — a
-- separate "build it or cut it" decision) and every column that backs a
-- documented-but-unbuilt spec feature (severity, tags, version, request_type,
-- the sla_*/first_response_at columns, ticketing_business_areas.roles,
-- ticketing_updates.attachments/changes) — dropping those would quietly
-- descope shipped spec surface, not clean up dead weight.
-- =============================================================================

-- ticketing_tickets.subject duplicated title (written identically on every
-- insert/update, never selected by app code) but fed the full-text-search
-- trigger at weight A. Repoint the trigger to title before dropping subject,
-- in the same migration, so search never silently goes blank. internal_summary
-- also fed the trigger (weight B) and is dropped below for the same
-- write-only-never-read reason — the trigger keeps external_summary at B.
CREATE OR REPLACE FUNCTION ticketing_tickets_search_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('simple', coalesce(NEW.title,'')),            'A') ||
        setweight(to_tsvector('simple', coalesce(NEW.external_summary,'')), 'B');
    RETURN NEW;
END; $$;

CREATE OR REPLACE TRIGGER trg_ticketing_tickets_search
    BEFORE INSERT OR UPDATE OF title, external_summary
    ON ticketing_tickets
    FOR EACH ROW EXECUTE FUNCTION ticketing_tickets_search_update();

-- prefix/sequence_number: written once at INSERT (from
-- ticketing_business_areas.prefix/current_sequence) to build ticket_number,
-- never read back — fully recoverable from ticket_number and business_area_id.
-- priority: selected but never written by any repo function (no create/update
-- path sets it) and never rendered — the fixture was the only thing giving it
-- a value. closed_by/resolution_notes/is_public: zero references anywhere.
-- reported_by (the bare text column, not reported_by_name/reported_by_email,
-- which stay): superseded by the logger_employee_id/logger_contact_id pair
-- ck_ticketing_tickets_one_logger now enforces. internal_summary: selected
-- and sanitized but no create/update path ever writes it and no page renders
-- it.
ALTER TABLE ticketing_tickets
    DROP COLUMN prefix,
    DROP COLUMN sequence_number,
    DROP COLUMN subject,
    DROP COLUMN priority,
    DROP COLUMN closed_by,
    DROP COLUMN resolution_notes,
    DROP COLUMN is_public,
    DROP COLUMN reported_by,
    DROP COLUMN internal_summary;

-- is_internal duplicated visibility (set to visibility = 'internal' at write
-- time, but neither app code nor RLS ever reads it — the portal-visibility
-- policy tests the text column directly). comment_text duplicated
-- content_text exactly on every write. content_html was never populated
-- through the app despite the name (rich text lands in content_text). author_id
-- is the pre-portal-split generic column, superseded by the
-- author_employee_id/author_contact_id pair ck_ticketing_updates_one_author
-- now enforces. update_id/edited_at/edited_by: zero app references, no
-- edit-a-comment feature exists. Dropping update_id also drops the unique
-- index/constraint on (tenant_id, update_id) and dropping author_id drops its
-- index — both solely existed to serve these columns.
ALTER TABLE ticketing_updates
    DROP COLUMN is_internal,
    DROP COLUMN comment_text,
    DROP COLUMN content_html,
    DROP COLUMN author_id,
    DROP COLUMN update_id,
    DROP COLUMN edited_at,
    DROP COLUMN edited_by;

-- active duplicated is_active exactly (written in lockstep by
-- createBusinessArea/archiveBusinessArea, only is_active ever read).
ALTER TABLE ticketing_business_areas
    DROP COLUMN active;
