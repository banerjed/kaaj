-- =============================================================================
-- Kaaj — team chat: DMs, channels, and LISTEN/NOTIFY realtime delivery
-- =============================================================================
-- docs/20-team-chat.md. Internal, employee-only messaging — team_chat_* /
-- team_chat.* throughout, deliberately never sharing a table or permission
-- name with 17-customer-portal.md §4's own (unbuilt) chat_*/chat.* namespace.
--
-- member_ids on team_chat_conversations is the load-bearing anti-self-
-- reference trick (L92): team_chat_members/team_chat_messages' policies
-- query team_chat_conversations (a DIFFERENT table) rather than re-querying
-- their own table from their own policy. A trigger keeps member_ids current.
--
-- Verified empirically against the local stack before writing this, per the
-- spec's own §10.1 instruction and CLAUDE.md's "watch the guard fail"
-- standard — see docs/10-lessons-learned.md L93 for what that surfaced:
--
--   1. The trigger function MUST be SECURITY DEFINER. Without it, its own
--      SELECT against team_chat_members is filtered by team_chat_members'
--      own RLS policy, which requires the actor already be in member_ids —
--      exactly the value the trigger exists to compute. On a brand-new
--      conversation this doesn't error, it just silently aggregates zero
--      rows and writes member_ids = '{}' back, forever, for every future
--      member too, not only the first.
--   2. Even fixed, INSERT ... RETURNING on team_chat_members still fails for
--      a self-service join (`new row violates row-level security policy`)
--      — the trigger's write is visible to the NEXT statement in the same
--      transaction, never to the RETURNING clause of the statement that
--      fired it. The application never RETURNINGs from that insert; see
--      team-chat.repo.ts.
--
-- Every policy below is AS RESTRICTIVE: PERMISSIVE policies OR together, and
-- a table with only RESTRICTIVE policies and no PERMISSIVE one denies
-- everything outright (CLAUDE.md's row-policy rule) — tenant_isolation is
-- the PERMISSIVE policy each of these restricts.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Schema
-- -----------------------------------------------------------------------------

CREATE TABLE team_chat_conversations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    kind              TEXT NOT NULL CHECK (kind IN ('channel', 'dm')),
    name              VARCHAR(80),
    topic             TEXT,
    visibility        TEXT CHECK (visibility IN ('public', 'private')),
    CHECK (
      (kind = 'channel' AND name IS NOT NULL AND visibility IS NOT NULL)
      OR (kind = 'dm' AND visibility IS NULL)
    ),

    -- Denormalized membership, recomputed by trigger whenever
    -- team_chat_members changes. See the header above and L93.
    member_ids        UUID[] NOT NULL DEFAULT '{}',

    -- Canonical participant key for a DM ("sorted employee ids, joined"), so
    -- "message Aisha and Marcus" finds the existing thread. NULL for channels.
    dm_key            TEXT,

    created_by_employee_id UUID NOT NULL REFERENCES employees(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at       TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_team_chat_dm_key
    ON team_chat_conversations (tenant_id, dm_key) WHERE kind = 'dm';

-- No index on member_ids: every policy below reads it as
-- `current_employee_id() = ANY (member_ids)`, a ScalarArrayOpExpr that a
-- GIN array_ops index cannot accelerate (it only serves `&&`/`@>`/`<@`/`=`
-- on two arrays) — confirmed empirically with `enable_seqscan = off`, where
-- that predicate still falls back to a Seq Scan while `member_ids @> ...`
-- correctly uses the index. team_chat_conversations is NOT_SCALE_SENSITIVE
-- (bounded by org size, not by events), so a seq scan here is fine, and an
-- index that can never be used by any query in this file is pure
-- write-amplification.

ALTER TABLE team_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_chat_conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON team_chat_conversations
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());


CREATE TABLE team_chat_members (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id   UUID NOT NULL REFERENCES team_chat_conversations(id) ON DELETE CASCADE,
    employee_id       UUID NOT NULL REFERENCES employees(id),

    role              TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    joined_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    left_at           TIMESTAMPTZ,          -- soft leave; DELETE is revoked from app_user
    last_read_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (tenant_id, conversation_id, employee_id)
);

ALTER TABLE team_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_chat_members FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON team_chat_members
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());


CREATE TABLE team_chat_messages (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id   UUID NOT NULL REFERENCES team_chat_conversations(id) ON DELETE CASCADE,
    author_employee_id UUID NOT NULL REFERENCES employees(id),

    body              TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    edited_at         TIMESTAMPTZ,
    deleted_at        TIMESTAMPTZ            -- tombstone: renders "message deleted", never removed
);

-- Keyset pagination, newest-first, per conversation (SCALE_SENSITIVE — §7).
-- tenant_id leads (ADR-003 #2, same shape as idx_ticketing_updates_ticket_id);
-- the (conversation_id, created_at DESC) suffix still serves the per-
-- conversation range scan since conversation_id is a leftmost-prefix equality.
CREATE INDEX idx_team_chat_messages_conversation
    ON team_chat_messages (tenant_id, conversation_id, created_at DESC);

ALTER TABLE team_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_chat_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON team_chat_messages
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());


-- -----------------------------------------------------------------------------
-- 2. member_ids sync — SECURITY DEFINER is load-bearing, see L93
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.team_chat_sync_member_ids() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.team_chat_conversations
  SET member_ids = (
    SELECT coalesce(array_agg(employee_id), '{}')
    FROM public.team_chat_members
    WHERE conversation_id = NEW.conversation_id AND left_at IS NULL
  )
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;

GRANT EXECUTE ON FUNCTION app.team_chat_sync_member_ids() TO app_user;

CREATE TRIGGER team_chat_sync_member_ids
AFTER INSERT OR UPDATE OF left_at ON team_chat_members
FOR EACH ROW EXECUTE FUNCTION app.team_chat_sync_member_ids();


-- -----------------------------------------------------------------------------
-- 3. Row visibility
-- -----------------------------------------------------------------------------

-- Same shape as app.reads_all_tickets()/reads_all_employees(): the tenant's
-- own admins see everything in their tenant, full stop — every table in
-- this schema that layers a visibility policy on top of tenant_isolation
-- keeps that guarantee (verify-rls.sql's B/owner-sees-own has no exemption
-- path; it is a hard, checked invariant, not a convention). No functional
-- role is added — unlike ticketing, nothing about chat gives it_admin or
-- auditor an obvious reason to read every DM in the firm.
CREATE OR REPLACE FUNCTION app.reads_all_team_chat() RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce((claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin'), false);
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END $$;

GRANT EXECUTE ON FUNCTION app.reads_all_team_chat() TO app_user;

-- NOT is_portal_contact() guards the WHOLE policy, not just the public-
-- channel arm: this is employee-only messaging (§1), a different trust
-- boundary from 17§4's own (unbuilt) customer-facing chat, and without the
-- guard a portal contact satisfies "kind='channel' AND visibility='public'"
-- the same as any employee would, browsing the EXISTENCE of internal public
-- channels — found by a row-visibility test asserting a portal contact
-- sees nothing here, not by reasoning about the policy in isolation.
CREATE POLICY team_chat_conversation_visibility ON team_chat_conversations AS RESTRICTIVE FOR SELECT
USING (
  NOT (SELECT app.is_portal_contact())
  AND (
    (SELECT app.reads_all_team_chat())
    OR app.current_employee_id() = ANY (member_ids)
    OR (kind = 'channel' AND visibility = 'public')   -- browsable before joining
  )
);

-- created_by_employee_id must be the actor, and the actor must already be
-- in the member_ids they're proposing — a DB-level guarantee that a
-- conversation is never created without its own creator as a member, which
-- is what lets the creator's own subsequent team_chat_members insert (and
-- every RETURNING-free operation after it) see the conversation at all.
CREATE POLICY team_chat_conversation_insert ON team_chat_conversations AS RESTRICTIVE FOR INSERT
WITH CHECK (
  created_by_employee_id = app.current_employee_id()
  AND app.current_employee_id() = ANY (member_ids)
);

CREATE POLICY team_chat_conversation_update ON team_chat_conversations AS RESTRICTIVE FOR UPDATE
USING (app.current_employee_id() = ANY (member_ids))
WITH CHECK (app.current_employee_id() = ANY (member_ids));

-- The `employee_id = current_employee_id()` arm matters more than it looks:
-- Postgres requires SELECT visibility to find a row for UPDATE/DELETE too
-- (verified empirically, see L95) — without it, someone who just left a
-- conversation can no longer even locate their OWN (left_at IS NOT NULL)
-- row to rejoin, because by then they've dropped out of member_ids and the
-- membership-based arm alone no longer admits them.
CREATE POLICY team_chat_member_visibility ON team_chat_members AS RESTRICTIVE FOR SELECT
USING (
  (SELECT app.reads_all_team_chat())
  OR employee_id = app.current_employee_id()
  OR EXISTS (
    SELECT 1 FROM team_chat_conversations c
    WHERE c.id = team_chat_members.conversation_id
      AND app.current_employee_id() = ANY (c.member_ids)
  )
);

-- Self-service join to a public channel (first arm), or any existing member
-- adding anyone to a conversation they themselves already belong to (second
-- arm) — checked against team_chat_conversations.member_ids, never against
-- team_chat_members itself (the self-reference this design exists to avoid).
-- "Only an owner may invite to a PRIVATE channel" (§10.2's default) is an
-- application-layer check, same split as every other coarse-permission-plus-
-- RLS pair in this codebase — RLS's job here is just "you must already be
-- someone this conversation admits."
CREATE POLICY team_chat_member_insert ON team_chat_members AS RESTRICTIVE FOR INSERT
WITH CHECK (
  (
    employee_id = app.current_employee_id()
    AND EXISTS (
      SELECT 1 FROM team_chat_conversations c
      WHERE c.id = team_chat_members.conversation_id
        AND c.kind = 'channel' AND c.visibility = 'public'
    )
  )
  OR EXISTS (
    SELECT 1 FROM team_chat_conversations c
    WHERE c.id = team_chat_members.conversation_id
      AND app.current_employee_id() = ANY (c.member_ids)
  )
);

-- Leaving (own row) or being removed (an existing member acting on someone
-- else's row) — same member_ids check, never team_chat_members itself.
CREATE POLICY team_chat_member_update ON team_chat_members AS RESTRICTIVE FOR UPDATE
USING (
  employee_id = app.current_employee_id()
  OR EXISTS (
    SELECT 1 FROM team_chat_conversations c
    WHERE c.id = team_chat_members.conversation_id
      AND app.current_employee_id() = ANY (c.member_ids)
  )
)
WITH CHECK (
  employee_id = app.current_employee_id()
  OR EXISTS (
    SELECT 1 FROM team_chat_conversations c
    WHERE c.id = team_chat_members.conversation_id
      AND app.current_employee_id() = ANY (c.member_ids)
  )
);

CREATE POLICY team_chat_message_visibility ON team_chat_messages AS RESTRICTIVE FOR SELECT
USING (
  (SELECT app.reads_all_team_chat())
  OR EXISTS (
    SELECT 1 FROM team_chat_conversations c
    WHERE c.id = team_chat_messages.conversation_id
      AND app.current_employee_id() = ANY (c.member_ids)
  )
);

CREATE POLICY team_chat_message_insert ON team_chat_messages AS RESTRICTIVE FOR INSERT
WITH CHECK (
  author_employee_id = app.current_employee_id()     -- same-row check, inline (L92-safe)
  AND EXISTS (
    SELECT 1 FROM team_chat_conversations c
    WHERE c.id = team_chat_messages.conversation_id
      AND app.current_employee_id() = ANY (c.member_ids)
  )
);

-- Editing/soft-deleting one's own message.
CREATE POLICY team_chat_message_update ON team_chat_messages AS RESTRICTIVE FOR UPDATE
USING (author_employee_id = app.current_employee_id())
WITH CHECK (author_employee_id = app.current_employee_id());


-- -----------------------------------------------------------------------------
-- 4. Realtime: pg_notify on every new message (docs/20-team-chat.md §5)
-- -----------------------------------------------------------------------------
-- Payload carries only ids, never body/author — NOTIFY/LISTEN has no concept
-- of row security, so treating the payload as content would give it a
-- second, unprotected home (CLAUDE.md's disclosure lens). The relay decides
-- who might be interested; a normal RLS-protected read decides who may see it.

CREATE OR REPLACE FUNCTION app.team_chat_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify(
    'team_chat_message',
    json_build_object(
      'tenant_id', NEW.tenant_id,
      'conversation_id', NEW.conversation_id,
      'message_id', NEW.id
    )::text
  );
  RETURN NEW;
END $$;

GRANT EXECUTE ON FUNCTION app.team_chat_notify() TO app_user;

CREATE TRIGGER team_chat_notify
AFTER INSERT ON team_chat_messages
FOR EACH ROW EXECUTE FUNCTION app.team_chat_notify();
