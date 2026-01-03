import { Database } from "./client";

export interface ChannelSettings {
  id?: string;
  guildId: string;
  channelId: string;
  mailboxAddress: string;
  mailboxUser: string;
  ackExpiryDays?: number;
  resourceId: string;
  checkJunk?: boolean;
  pollCron?: string;
  createdAt?: number;
  updatedAt?: number;
}

export const DEFAULT_ACK_EXPIRY_DAYS = 5;

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export async function upsertChannelSettings(db: Database, settings: ChannelSettings): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const pollCron = settings.pollCron ?? "*/5 * * * *";
  const ackExpiryDays = settings.ackExpiryDays ?? DEFAULT_ACK_EXPIRY_DAYS;
  const checkJunk = settings.checkJunk ?? false;
  const normalizedAddress = normalizeAddress(settings.mailboxAddress);
  const existingIndex = db.data.channelSettings.findIndex(
    (record) =>
      record.guildId === settings.guildId &&
      record.channelId === settings.channelId &&
      normalizeAddress(record.mailboxAddress) === normalizedAddress
  );

  if (existingIndex >= 0) {
    const existing = db.data.channelSettings[existingIndex];
    db.data.channelSettings[existingIndex] = {
      ...existing,
      ...settings,
      pollCron,
      ackExpiryDays,
      checkJunk,
      createdAt: existing.createdAt ?? now,
      updatedAt: now,
      id: existing.id ?? `${settings.guildId}:${settings.channelId}:${normalizedAddress}`,
    };
  } else {
    db.data.channelSettings.push({
      id: settings.id ?? `${settings.guildId}:${settings.channelId}:${normalizedAddress}`,
      ...settings,
      pollCron,
      ackExpiryDays,
      checkJunk,
      createdAt: now,
      updatedAt: now,
    });
  }

  await db.save();
}

export async function getChannelSettings(
  db: Database,
  guildId: string,
  channelId: string,
  mailboxAddress: string
): Promise<ChannelSettings | null> {
  const normalizedAddress = normalizeAddress(mailboxAddress);
  const record = db.data.channelSettings.find(
    (row) =>
      row.guildId === guildId &&
      row.channelId === channelId &&
      normalizeAddress(row.mailboxAddress) === normalizedAddress
  );
  return record
    ? {
        ...record,
        pollCron: record.pollCron ?? "*/5 * * * *",
        ackExpiryDays: record.ackExpiryDays ?? DEFAULT_ACK_EXPIRY_DAYS,
        checkJunk: record.checkJunk ?? false,
      }
    : null;
}

export async function listChannelSettings(db: Database): Promise<ChannelSettings[]> {
  return db.data.channelSettings.map((row) => ({
    ...row,
    pollCron: row.pollCron ?? "*/5 * * * *",
    ackExpiryDays: row.ackExpiryDays ?? DEFAULT_ACK_EXPIRY_DAYS,
    checkJunk: row.checkJunk ?? false,
  }));
}

export async function deleteChannelSettings(
  db: Database,
  guildId: string,
  channelId: string,
  mailboxAddress: string
): Promise<boolean> {
  const normalized = normalizeAddress(mailboxAddress);
  const idx = db.data.channelSettings.findIndex(
    (row) =>
      row.guildId === guildId &&
      row.channelId === channelId &&
      normalizeAddress(row.mailboxAddress) === normalized
  );
  if (idx === -1) return false;
  db.data.channelSettings.splice(idx, 1);
  await db.save();
  return true;
}
