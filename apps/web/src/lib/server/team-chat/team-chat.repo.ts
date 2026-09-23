import type { Tx } from "../db/tenant"

/**
 * Team chat — DMs and channels. See docs/20-team-chat.md; RLS
 * (team_chat_conversation_visibility / team_chat_member_visibility /
 * team_chat_message_visibility, 20260923050000) is what actually separates
 * what each caller can see, the same principle documents.repo.ts uses.
 *
 * `member_ids` on team_chat_conversations, not team_chat_members itself, is
 * what every visibility check reads — see the migration's own header and
 * docs/10-lessons-learned.md L93 for why. Two consequences for every
 * function below that writes team_chat_members:
 *
 *   - A brand-new conversation always seeds `member_ids` with every initial
 *     participant AT INSERT TIME (never leaves it to the trigger to catch
 *     up) — otherwise the conversation's own `RETURNING` sees nothing.
 *   - No INSERT or UPDATE against team_chat_members ever uses `RETURNING`.
 *     The member_ids-sync trigger's write is visible to the NEXT statement
 *     in the same transaction, never to the RETURNING clause of the
 *     statement that fired it (L93). Existence is confirmed with a plain
 *     SELECT instead, or simply by "no exception was thrown."
 */

export const CONVERSATION_KINDS = ["channel", "dm"] as const
export type ConversationKind = (typeof CONVERSATION_KINDS)[number]

export const CHANNEL_VISIBILITIES = ["public", "private"] as const
export type ChannelVisibility = (typeof CHANNEL_VISIBILITIES)[number]

export const MEMBER_ROLES = ["owner", "member"] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

export class TeamChatRefused extends Error {
  constructor(
    readonly reason:
      | "no_such_conversation"
      | "no_such_message"
      | "not_a_member"
      | "empty_participants",
    readonly detail?: string,
  ) {
    super(reason)
    this.name = "TeamChatRefused"
  }
}

export type ConversationSummary = {
  id: string
  kind: ConversationKind
  name: string | null
  topic: string | null
  visibility: ChannelVisibility | null
  archived_at: Date | null
  other_member_names: string | null // DMs only — the other participant(s)
  last_message_body: string | null
  last_message_at: Date | null
  unread_count: number
}

export type MemberRow = {
  id: string
  employee_id: string
  employee_name: string
  role: MemberRole
  joined_at: Date
  left_at: Date | null
}

export type MessageRow = {
  id: string
  conversation_id: string
  author_employee_id: string
  author_name: string
  body: string | null // NULL when deleted_at is set — see messages() below
  created_at: Date
  edited_at: Date | null
  deleted_at: Date | null
}

/** Canonical dm_key: sorted, de-duplicated participant ids, comma-joined. */
export function dmKey(employeeIds: string[]): string {
  return [...new Set(employeeIds)].sort().join(",")
}

/**
 * Every conversation the actor belongs to, most recent activity first, with
 * an unread count and a last-message preview computed in ONE query — no
 * per-conversation follow-up (`verify-no-loop-queries.mjs`), no full scan of
 * the SCALE_SENSITIVE messages table (the join condition uses
 * `last_read_at`/`created_at DESC` against idx_team_chat_messages_conversation).
 * A deleted message's body is nulled in SQL, never handed to the template to
 * hide (CLAUDE.md's disclosure lens — a flag that governs disclosure is
 * enforced where the data is read).
 */
export async function listConversations(
  tx: Tx,
  employeeId: string,
): Promise<ConversationSummary[]> {
  return tx<ConversationSummary[]>`
    SELECT
      c.id, c.kind, c.name, c.topic, c.visibility, c.archived_at,
      CASE WHEN c.kind = 'dm' THEN (
        SELECT string_agg(e.first_name || ' ' || e.last_name, ', ' ORDER BY e.first_name)
          FROM employees e WHERE e.id = ANY (c.member_ids) AND e.id <> ${employeeId}::uuid
      ) END AS other_member_names,
      last_msg.body AS last_message_body,
      last_msg.created_at AS last_message_at,
      coalesce(unread.n, 0)::int AS unread_count
    FROM team_chat_conversations c
    JOIN team_chat_members m ON m.conversation_id = c.id
      AND m.employee_id = ${employeeId}::uuid AND m.left_at IS NULL
    LEFT JOIN LATERAL (
      SELECT (CASE WHEN deleted_at IS NOT NULL THEN NULL ELSE body END) AS body, created_at
        FROM team_chat_messages msg
       WHERE msg.conversation_id = c.id
       ORDER BY created_at DESC LIMIT 1
    ) last_msg ON true
    LEFT JOIN LATERAL (
      -- count(*) is bigint -> postgres.js returns it as a string; ::int
      -- keeps unread_count a real number for the sidebar badge (an unread
      -- count in the billions was never a real concern here).
      SELECT count(*)::int AS n FROM team_chat_messages msg
       WHERE msg.conversation_id = c.id AND msg.created_at > m.last_read_at
    ) unread ON true
    WHERE c.archived_at IS NULL
    ORDER BY coalesce(last_msg.created_at, c.created_at) DESC
  `
}

/**
 * Conversation ids the employee currently belongs to — no message bodies,
 * no counts. For registering an SSE stream's interest at connect time
 * (docs/20-team-chat.md §5), where `listConversations`' joins would be
 * wasted work.
 */
export async function memberConversationIds(
  tx: Tx,
  employeeId: string,
): Promise<string[]> {
  const rows = await tx<{ conversation_id: string }[]>`
    SELECT conversation_id FROM team_chat_members
     WHERE employee_id = ${employeeId}::uuid AND left_at IS NULL
  `
  return rows.map((r) => r.conversation_id)
}

/** Public channels the actor hasn't joined yet — for "browse channels." */
export async function browsablePublicChannels(
  tx: Tx,
  employeeId: string,
): Promise<{ id: string; name: string; topic: string | null }[]> {
  return tx<{ id: string; name: string; topic: string | null }[]>`
    SELECT id, name, topic
      FROM team_chat_conversations
     WHERE kind = 'channel' AND visibility = 'public' AND archived_at IS NULL
       AND NOT (${employeeId}::uuid = ANY (member_ids))
     ORDER BY name
  `
}

/**
 * The viewer's own timezone — chat is rendered in the READER's office, a
 * deliberate choice (not the sender's, not bare UTC): a shared thread has no
 * single office of record the way an office-scoped table does, and "when
 * did I see this" is naturally the viewer's own frame.
 */
export async function viewerTimezone(
  tx: Tx,
  employeeId: string,
): Promise<string> {
  const [row] = await tx<{ timezone: string | null }[]>`
    SELECT timezone FROM employees WHERE id = ${employeeId}::uuid
  `
  return row?.timezone ?? "UTC"
}

export async function conversation(
  tx: Tx,
  id: string,
): Promise<{
  id: string
  kind: ConversationKind
  name: string | null
  topic: string | null
  visibility: ChannelVisibility | null
  archived_at: Date | null
} | null> {
  const [row] = await tx<
    {
      id: string
      kind: ConversationKind
      name: string | null
      topic: string | null
      visibility: ChannelVisibility | null
      archived_at: Date | null
    }[]
  >`
    SELECT id, kind, name, topic, visibility, archived_at
      FROM team_chat_conversations WHERE id = ${id}::uuid
  `
  return row ?? null
}

export async function members(
  tx: Tx,
  conversationId: string,
): Promise<MemberRow[]> {
  return tx<MemberRow[]>`
    SELECT m.id, m.employee_id, e.first_name || ' ' || e.last_name AS employee_name,
           m.role, m.joined_at, m.left_at
      FROM team_chat_members m
      JOIN employees e ON e.id = m.employee_id
     WHERE m.conversation_id = ${conversationId}::uuid AND m.left_at IS NULL
     ORDER BY m.joined_at
  `
}

/** The actor's own role in a conversation, or null if not a current member. */
export async function myRole(
  tx: Tx,
  conversationId: string,
  employeeId: string,
): Promise<MemberRole | null> {
  const [row] = await tx<{ role: MemberRole }[]>`
    SELECT role FROM team_chat_members
     WHERE conversation_id = ${conversationId}::uuid AND employee_id = ${employeeId}::uuid
       AND left_at IS NULL
  `
  return row?.role ?? null
}

/**
 * Find the existing DM for exactly this set of participants, or create one.
 * `member_ids` is seeded with every participant at INSERT time — see the
 * header — so both the conversation's own RETURNING and every subsequent
 * team_chat_members insert for these same participants are safe.
 */
export async function findOrCreateDm(
  tx: Tx,
  params: { tenantId: string; participantIds: string[] },
): Promise<string> {
  const ids = [...new Set(params.participantIds)]
  if (ids.length === 0) throw new TeamChatRefused("empty_participants")
  const key = dmKey(ids)

  const [existing] = await tx<{ id: string }[]>`
    SELECT id FROM team_chat_conversations
     WHERE tenant_id = ${params.tenantId}::uuid AND kind = 'dm' AND dm_key = ${key}
  `
  if (existing) return existing.id

  // Racing with another "start this same DM" request is benign — the
  // partial unique index on (tenant_id, dm_key) makes this ON CONFLICT DO
  // NOTHING, and the follow-up SELECT finds whichever request won.
  const [created] = await tx<{ id: string }[]>`
    INSERT INTO team_chat_conversations (tenant_id, kind, member_ids, dm_key, created_by_employee_id)
    VALUES (${params.tenantId}::uuid, 'dm', ${ids}::uuid[], ${key}, ${ids[0]}::uuid)
    ON CONFLICT (tenant_id, dm_key) WHERE kind = 'dm' DO NOTHING
    RETURNING id
  `
  const conversationId =
    created?.id ??
    (
      await tx<{ id: string }[]>`
        SELECT id FROM team_chat_conversations
         WHERE tenant_id = ${params.tenantId}::uuid AND kind = 'dm' AND dm_key = ${key}
      `
    )[0]?.id

  if (!conversationId) throw new TeamChatRefused("no_such_conversation")

  if (created) {
    // One statement for every participant — never a per-employee round trip
    // (verify-no-loop-queries.mjs).
    await tx`
      INSERT INTO team_chat_members (tenant_id, conversation_id, employee_id)
      SELECT ${params.tenantId}::uuid, ${conversationId}::uuid, employee_id
        FROM unnest(${ids}::uuid[]) AS employee_id
      ON CONFLICT (tenant_id, conversation_id, employee_id) DO NOTHING
    `
  }
  return conversationId
}

export async function createChannel(
  tx: Tx,
  params: {
    tenantId: string
    creatorEmployeeId: string
    name: string
    topic: string | null
    visibility: ChannelVisibility
  },
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO team_chat_conversations (
      tenant_id, kind, name, topic, visibility, member_ids, created_by_employee_id
    ) VALUES (
      ${params.tenantId}::uuid, 'channel', ${params.name}, ${params.topic}, ${params.visibility},
      ${[params.creatorEmployeeId]}::uuid[], ${params.creatorEmployeeId}::uuid
    )
    RETURNING id
  `
  await tx`
    INSERT INTO team_chat_members (tenant_id, conversation_id, employee_id, role)
    VALUES (${params.tenantId}::uuid, ${row.id}::uuid, ${params.creatorEmployeeId}::uuid, 'owner')
  `
  return row.id
}

/** Self-service join to a public channel — or rejoin, if the employee had left. */
const UNIQUE_VIOLATION = "23505"

/**
 * Insert-or-reactivate a membership row — deliberately NOT `INSERT ... ON
 * CONFLICT DO UPDATE`. That form makes Postgres run the UPDATE policy's
 * check-option machinery (`ExecWithCheckOptions`) against the resulting row
 * unconditionally, the same RETURNING-adjacent check L93 already found,
 * EVEN with no `RETURNING` clause written — verified empirically: a fresh
 * self-service join through `ON CONFLICT DO UPDATE` raised "new row
 * violates row-level security policy" even though the plain two-statement
 * form below (try INSERT, fall back to UPDATE on a real conflict) does not.
 * A plain `INSERT` and a plain `UPDATE`, each with no `RETURNING`, are the
 * only forms confirmed safe against this table's own policies.
 */
async function upsertMembership(
  tx: Tx,
  params: { tenantId: string; conversationId: string; employeeId: string },
): Promise<void> {
  try {
    // A SAVEPOINT, not a bare try/catch around the INSERT: Postgres marks
    // the whole surrounding transaction aborted on any statement error, so
    // the fallback UPDATE below would itself fail with "current
    // transaction is aborted" unless the INSERT's failure is scoped to its
    // own savepoint first.
    await tx.savepoint(async (sp) => {
      await sp`
        INSERT INTO team_chat_members (tenant_id, conversation_id, employee_id)
        VALUES (${params.tenantId}::uuid, ${params.conversationId}::uuid, ${params.employeeId}::uuid)
      `
    })
  } catch (e) {
    if (
      typeof e === "object" &&
      e &&
      (e as { code?: string }).code === UNIQUE_VIOLATION
    ) {
      await tx`
        UPDATE team_chat_members SET left_at = NULL, joined_at = now()
         WHERE tenant_id = ${params.tenantId}::uuid
           AND conversation_id = ${params.conversationId}::uuid
           AND employee_id = ${params.employeeId}::uuid
      `
      return
    }
    throw e
  }
}

export const joinPublicChannel = upsertMembership

/** An existing member adding someone else — private-channel-owner-only is an app-layer check, not RLS (see the migration's §3 note). */
export const addMember = upsertMembership

async function setLeft(
  tx: Tx,
  conversationId: string,
  employeeId: string,
): Promise<void> {
  const [row] = await tx<{ id: string }[]>`
    SELECT id FROM team_chat_members
     WHERE conversation_id = ${conversationId}::uuid AND employee_id = ${employeeId}::uuid
       AND left_at IS NULL
  `
  if (!row) throw new TeamChatRefused("not_a_member")
  await tx`
    UPDATE team_chat_members SET left_at = now()
     WHERE conversation_id = ${conversationId}::uuid AND employee_id = ${employeeId}::uuid
  `
}

export const leaveConversation = setLeft
export const removeMember = setLeft

export async function archiveChannel(tx: Tx, id: string): Promise<void> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE team_chat_conversations SET archived_at = now()
     WHERE id = ${id}::uuid AND kind = 'channel' AND archived_at IS NULL
    RETURNING id
  `
  if (!row) throw new TeamChatRefused("no_such_conversation")
}

export async function markRead(
  tx: Tx,
  conversationId: string,
  employeeId: string,
): Promise<void> {
  await tx`
    UPDATE team_chat_members SET last_read_at = now()
     WHERE conversation_id = ${conversationId}::uuid AND employee_id = ${employeeId}::uuid
  `
}

/**
 * Newest-first keyset page. `before` (a message id already loaded) fetches
 * the next OLDER page — never OFFSET, per §7 (a fast-growing table shifts
 * every offset as people type). A deleted message's body is nulled in SQL.
 */
export async function messages(
  tx: Tx,
  conversationId: string,
  opts: { before?: string; limit?: number } = {},
): Promise<MessageRow[]> {
  const limit = opts.limit ?? 25
  return tx<MessageRow[]>`
    SELECT msg.id, msg.conversation_id, msg.author_employee_id,
           e.first_name || ' ' || e.last_name AS author_name,
           CASE WHEN msg.deleted_at IS NOT NULL THEN NULL ELSE msg.body END AS body,
           msg.created_at, msg.edited_at, msg.deleted_at
      FROM team_chat_messages msg
      JOIN employees e ON e.id = msg.author_employee_id
     WHERE msg.conversation_id = ${conversationId}::uuid
       AND (
         ${opts.before ?? null}::uuid IS NULL
         OR msg.created_at < (SELECT created_at FROM team_chat_messages WHERE id = ${opts.before ?? null}::uuid)
       )
     ORDER BY msg.created_at DESC
     LIMIT ${limit}
  `
}

/** Oldest-first, strictly after `afterId` — the SSE/poll backfill query (§5). */
export async function messagesAfter(
  tx: Tx,
  conversationId: string,
  afterId: string,
): Promise<MessageRow[]> {
  return tx<MessageRow[]>`
    SELECT msg.id, msg.conversation_id, msg.author_employee_id,
           e.first_name || ' ' || e.last_name AS author_name,
           CASE WHEN msg.deleted_at IS NOT NULL THEN NULL ELSE msg.body END AS body,
           msg.created_at, msg.edited_at, msg.deleted_at
      FROM team_chat_messages msg
      JOIN employees e ON e.id = msg.author_employee_id
     WHERE msg.conversation_id = ${conversationId}::uuid
       AND msg.created_at > (SELECT created_at FROM team_chat_messages WHERE id = ${afterId}::uuid)
     ORDER BY msg.created_at ASC
     LIMIT 200
  `
}

export async function postMessage(
  tx: Tx,
  params: {
    tenantId: string
    conversationId: string
    authorEmployeeId: string
    body: string
  },
): Promise<{ id: string; created_at: Date }> {
  const [row] = await tx<{ id: string; created_at: Date }[]>`
    INSERT INTO team_chat_messages (tenant_id, conversation_id, author_employee_id, body)
    VALUES (${params.tenantId}::uuid, ${params.conversationId}::uuid, ${params.authorEmployeeId}::uuid, ${params.body})
    RETURNING id, created_at
  `
  return row
}

export async function editMessage(
  tx: Tx,
  params: { id: string; authorEmployeeId: string; body: string },
): Promise<void> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE team_chat_messages SET body = ${params.body}, edited_at = now()
     WHERE id = ${params.id}::uuid AND author_employee_id = ${params.authorEmployeeId}::uuid
       AND deleted_at IS NULL
    RETURNING id
  `
  if (!row) throw new TeamChatRefused("no_such_message")
}

export async function deleteMessage(
  tx: Tx,
  params: { id: string; authorEmployeeId: string },
): Promise<void> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE team_chat_messages SET deleted_at = now()
     WHERE id = ${params.id}::uuid AND author_employee_id = ${params.authorEmployeeId}::uuid
       AND deleted_at IS NULL
    RETURNING id
  `
  if (!row) throw new TeamChatRefused("no_such_message")
}
