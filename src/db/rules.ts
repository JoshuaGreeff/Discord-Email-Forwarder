import { Database } from "./client";

export interface UnsubscribeRule {
  id?: number;
  guildId: string;
  channelId: string;
  fromAddress?: string;
  subjectContains?: string;
  createdAt?: number;
}

export async function createRule(db: Database, rule: UnsubscribeRule): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const maxId = db.data.unsubscribeRules.reduce((max, r) => Math.max(max, r.id ?? 0), 0);
  const recordId = maxId + 1;

  db.data.unsubscribeRules.push({
    id: recordId,
    guildId: rule.guildId,
    channelId: rule.channelId,
    fromAddress: rule.fromAddress,
    subjectContains: rule.subjectContains,
    createdAt: now,
  });

  await db.save();
  return recordId;
}

export async function listRulesForChannel(db: Database, guildId: string, channelId: string): Promise<UnsubscribeRule[]> {
  return db.data.unsubscribeRules
    .filter((rule) => rule.guildId === guildId && rule.channelId === channelId)
    .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
    .map((rule) => ({ ...rule }));
}

export async function deleteRule(db: Database, guildId: string, channelId: string, ruleId: number): Promise<boolean> {
  const index = db.data.unsubscribeRules.findIndex(
    (rule) => rule.id === ruleId && rule.guildId === guildId && rule.channelId === channelId
  );

  if (index === -1) return false;

  db.data.unsubscribeRules.splice(index, 1);
  await db.save();
  return true;
}

export function getRuleById(
  db: Database,
  guildId: string,
  channelId: string,
  ruleId: number
): UnsubscribeRule | null {
  const rule = db.data.unsubscribeRules.find(
    (r) => r.id === ruleId && r.guildId === guildId && r.channelId === channelId
  );
  return rule ? { ...rule } : null;
}

export async function updateRule(
  db: Database,
  guildId: string,
  channelId: string,
  ruleId: number,
  updates: Pick<UnsubscribeRule, "fromAddress" | "subjectContains">
): Promise<boolean> {
  const index = db.data.unsubscribeRules.findIndex(
    (r) => r.id === ruleId && r.guildId === guildId && r.channelId === channelId
  );
  if (index === -1) return false;

  db.data.unsubscribeRules[index] = {
    ...db.data.unsubscribeRules[index],
    fromAddress: updates.fromAddress,
    subjectContains: updates.subjectContains,
  };

  await db.save();
  return true;
}
