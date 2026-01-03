import { Database } from "./client";
import { normalizeAddress } from "./settings";

export interface Rule {
  id?: number;
  guildId: string;
  channelId: string;
  mailboxAddress: string;
  friendlyName?: string | null;
  fromAddress: string;
  subjectContains?: string | null;
  createdAt?: number;
}

export async function upsertRule(db: Database, rule: Rule): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const normalizedMailbox = normalizeAddress(rule.mailboxAddress);
  const normalizedFrom = normalizeAddress(rule.fromAddress);
  const normalizedSubject = rule.subjectContains?.toLowerCase() ?? null;
  const friendlyName = rule.friendlyName ?? null;

  const existingIndex = db.data.rules.findIndex(
    (r) =>
      r.guildId === rule.guildId &&
      r.channelId === rule.channelId &&
      normalizeAddress(r.mailboxAddress) === normalizedMailbox &&
      normalizeAddress(r.fromAddress) === normalizedFrom &&
      (r.subjectContains ?? null) === normalizedSubject
  );

  if (existingIndex >= 0) {
    const existing = db.data.rules[existingIndex];
    db.data.rules[existingIndex] = {
      ...existing,
      subjectContains: normalizedSubject,
      createdAt: existing.createdAt ?? now,
      friendlyName,
    };
    await db.save();
    return existing.id;
  }

  const maxId = db.data.rules.reduce((max, r) => Math.max(max, r.id ?? 0), 0);
  const id = maxId + 1;
  db.data.rules.push({
    id,
    guildId: rule.guildId,
    channelId: rule.channelId,
    mailboxAddress: normalizedMailbox,
    friendlyName,
    fromAddress: normalizedFrom,
    subjectContains: normalizedSubject,
    createdAt: now,
  });
  await db.save();
  return id;
}

export function listRules(
  db: Database,
  guildId: string,
  channelId: string,
  mailboxAddress: string
): Rule[] {
  const normalizedMailbox = normalizeAddress(mailboxAddress);
  return db.data.rules
    .filter(
      (r) =>
        r.guildId === guildId &&
        r.channelId === channelId &&
        normalizeAddress(r.mailboxAddress) === normalizedMailbox
    )
    .map((r) => ({ ...r }));
}

export async function deleteRule(
  db: Database,
  guildId: string,
  channelId: string,
  ruleId: number
): Promise<boolean> {
  const idx = db.data.rules.findIndex((r) => r.id === ruleId && r.guildId === guildId && r.channelId === channelId);
  if (idx === -1) return false;
  db.data.rules.splice(idx, 1);
  await db.save();
  return true;
}

export async function deleteRulesForMailbox(
  db: Database,
  guildId: string,
  channelId: string,
  mailboxAddress: string
): Promise<number> {
  const normalizedMailbox = normalizeAddress(mailboxAddress);
  const before = db.data.rules.length;
  db.data.rules = db.data.rules.filter(
    (r) =>
      !(r.guildId === guildId && r.channelId === channelId && normalizeAddress(r.mailboxAddress) === normalizedMailbox)
  );
  const removed = before - db.data.rules.length;
  if (removed > 0) {
    await db.save();
  }
  return removed;
}

export function matchesRule(rule: Rule, email: { from?: string; subject?: string }): boolean {
  const fromMatch = email.from ? normalizeAddress(email.from) === normalizeAddress(rule.fromAddress) : false;
  const subjectMatch = rule.subjectContains
    ? Boolean(email.subject && email.subject.toLowerCase().includes(rule.subjectContains.toLowerCase()))
    : true;
  return fromMatch && subjectMatch;
}
