import { Database } from "./client";

export interface ChannelSettings {
  id?: string;
  guildId: string;
  channelId: string;
  mailboxAddress: string;
  mailboxUser: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  pollCron?: string;
  createdAt?: number;
  updatedAt?: number;
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export async function upsertChannelSettings(db: Database, settings: ChannelSettings): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const pollCron = settings.pollCron ?? "*/5 * * * *";
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
      createdAt: existing.createdAt ?? now,
      updatedAt: now,
      id: existing.id ?? `${settings.guildId}:${settings.channelId}:${normalizedAddress}`,
    };
  } else {
    db.data.channelSettings.push({
      id: settings.id ?? `${settings.guildId}:${settings.channelId}:${normalizedAddress}`,
      ...settings,
      pollCron,
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
  return record ? { ...record, pollCron: record.pollCron ?? "*/5 * * * *" } : null;
}

export async function listChannelSettings(db: Database): Promise<ChannelSettings[]> {
  return db.data.channelSettings.map((row) => ({
    ...row,
    pollCron: row.pollCron ?? "*/5 * * * *",
  }));
}
