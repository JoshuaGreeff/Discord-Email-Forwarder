import { Database } from "sqlite";

export interface UnsubscribeRule {
  id?: number;
  guildId: string;
  channelId: string;
  fromAddress?: string;
  subjectContains?: string;
}

export async function createRule(db: Database, rule: UnsubscribeRule): Promise<void> {
  await db.run(
    `
      INSERT INTO unsubscribe_rules (guild_id, channel_id, from_address, subject_contains)
      VALUES (?, ?, ?, ?)
    `,
    [rule.guildId, rule.channelId, rule.fromAddress ?? null, rule.subjectContains ?? null]
  );
}

export async function listRulesForChannel(db: Database, guildId: string, channelId: string): Promise<UnsubscribeRule[]> {
  const rows = await db.all(
    `
      SELECT id, guild_id, channel_id, from_address, subject_contains
      FROM unsubscribe_rules
      WHERE guild_id = ? AND channel_id = ?
      ORDER BY id DESC
    `,
    [guildId, channelId]
  );

  return rows.map((row) => ({
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    fromAddress: row.from_address ?? undefined,
    subjectContains: row.subject_contains ?? undefined,
  }));
}
