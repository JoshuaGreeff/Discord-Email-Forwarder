import { Kysely, Selectable } from "kysely";
import { DB, RuleTable } from "./connection";
import { normalizeAddress } from "./settings";

export interface Rule {
  id: number;
  guildId: string;
  channelId: string;
  mailboxAddress: string;
  friendlyName: string | null;
  fromAddress: string;
  subjectContains: string | null;
  createdAt: number;
}

export interface RuleInput {
  id?: number;
  guildId: string;
  channelId: string;
  mailboxAddress: string;
  friendlyName?: string | null;
  fromAddress: string;
  subjectContains?: string | null;
}

function mapRule(row: Selectable<RuleTable>): Rule {
  return {
    id: Number(row.id),
    guildId: row.guild_id,
    channelId: row.channel_id,
    mailboxAddress: row.mailbox_address,
    friendlyName: row.friendly_name ?? null,
    fromAddress: row.from_address,
    subjectContains: row.subject_contains ?? null,
    createdAt: row.created_at,
  };
}

export async function upsertRule(db: Kysely<DB>, rule: RuleInput): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const normalizedMailbox = normalizeAddress(rule.mailboxAddress);
  const normalizedFrom = normalizeAddress(rule.fromAddress);
  const normalizedSubject = rule.subjectContains?.toLowerCase() ?? null;
  const friendlyName = rule.friendlyName ?? null;

  if (rule.id) {
    await db
      .updateTable("rules")
      .set({
        friendly_name: friendlyName,
        subject_contains: normalizedSubject,
        from_address: normalizedFrom,
        mailbox_address: normalizedMailbox,
      })
      .where("id", "=", rule.id)
      .execute();
    return rule.id;
  }

  const inserted = await db
    .insertInto("rules")
    .values({
      guild_id: rule.guildId,
      channel_id: rule.channelId,
      mailbox_address: normalizedMailbox,
      friendly_name: friendlyName,
      from_address: normalizedFrom,
      subject_contains: normalizedSubject,
      created_at: now,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return Number(inserted.id);
}

export async function listRules(db: Kysely<DB>, guildId: string, channelId: string, mailboxAddress: string): Promise<Rule[]> {
  const normalizedMailbox = normalizeAddress(mailboxAddress);
  const rows = await db
    .selectFrom("rules")
    .selectAll()
    .where("guild_id", "=", guildId)
    .where("channel_id", "=", channelId)
    .where("mailbox_address", "=", normalizedMailbox)
    .orderBy("id")
    .execute();
  return rows.map(mapRule);
}

export async function deleteRule(db: Kysely<DB>, guildId: string, channelId: string, ruleId: number): Promise<boolean> {
  const result = await db
    .deleteFrom("rules")
    .where("id", "=", ruleId)
    .where("guild_id", "=", guildId)
    .where("channel_id", "=", channelId)
    .executeTakeFirst();

  return (result.numDeletedRows ?? BigInt(0)) > BigInt(0);
}

export async function deleteRulesForMailbox(
  db: Kysely<DB>,
  guildId: string,
  channelId: string,
  mailboxAddress: string
): Promise<number> {
  const normalizedMailbox = normalizeAddress(mailboxAddress);
  const result = await db
    .deleteFrom("rules")
    .where("guild_id", "=", guildId)
    .where("channel_id", "=", channelId)
    .where("mailbox_address", "=", normalizedMailbox)
    .executeTakeFirst();
  return Number(result.numDeletedRows ?? 0);
}

export function matchesRule(rule: Rule, email: { from?: string; subject?: string }): boolean {
  const fromMatch = email.from ? normalizeAddress(email.from) === normalizeAddress(rule.fromAddress) : false;
  const subjectMatch = rule.subjectContains
    ? Boolean(email.subject && email.subject.toLowerCase().includes(rule.subjectContains.toLowerCase()))
    : true;
  return fromMatch && subjectMatch;
}
