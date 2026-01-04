import { Kysely } from "kysely";
import { ChannelSettingsTable, DB } from "./connection";

export interface ChannelSettings {
  id: string;
  guildId: string;
  channelId: string;
  mailboxAddress: string;
  mailboxUser: string;
  ackExpiryDays: number;
  resourceId: string;
  checkJunk: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ChannelSettingsInput {
  id?: string;
  guildId: string;
  channelId: string;
  mailboxAddress: string;
  mailboxUser: string;
  ackExpiryDays?: number;
  resourceId: string;
  checkJunk?: boolean;
}

export const DEFAULT_ACK_EXPIRY_DAYS = 5;

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export async function upsertChannelSettings(db: Kysely<DB>, settings: ChannelSettingsInput): Promise<ChannelSettings> {
  const now = Math.floor(Date.now() / 1000);
  const ackExpiryDays = settings.ackExpiryDays ?? DEFAULT_ACK_EXPIRY_DAYS;
  const checkJunk = settings.checkJunk ?? false;
  const normalizedAddress = normalizeAddress(settings.mailboxAddress);
  const id = settings.id ?? `${settings.guildId}:${settings.channelId}:${normalizedAddress}`;

  await db
    .insertInto("channel_settings")
    .values({
      id,
      guild_id: settings.guildId,
      channel_id: settings.channelId,
      mailbox_address: normalizedAddress,
      mailbox_user: settings.mailboxUser,
      ack_expiry_days: ackExpiryDays,
      resource_id: settings.resourceId,
      check_junk: checkJunk,
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        mailbox_user: settings.mailboxUser,
        ack_expiry_days: ackExpiryDays,
        resource_id: settings.resourceId,
        check_junk: checkJunk,
        updated_at: now,
      })
    )
    .execute();

  const row = await getChannelSettings(db, settings.guildId, settings.channelId, settings.mailboxAddress);
  if (!row) {
    throw new Error("Failed to upsert channel settings");
  }
  return row;
}

export async function getChannelSettings(
  db: Kysely<DB>,
  guildId: string,
  channelId: string,
  mailboxAddress: string
): Promise<ChannelSettings | null> {
  const normalizedAddress = normalizeAddress(mailboxAddress);
  const record = await db
    .selectFrom("channel_settings")
    .selectAll()
    .where("guild_id", "=", guildId)
    .where("channel_id", "=", channelId)
    .where("mailbox_address", "=", normalizedAddress)
    .executeTakeFirst();

  return record ? mapChannelSettings(record) : null;
}

export async function listChannelSettings(db: Kysely<DB>): Promise<ChannelSettings[]> {
  const rows = await db.selectFrom("channel_settings").selectAll().execute();
  return rows.map(mapChannelSettings);
}

export async function deleteChannelSettings(
  db: Kysely<DB>,
  guildId: string,
  channelId: string,
  mailboxAddress: string
): Promise<boolean> {
  const normalized = normalizeAddress(mailboxAddress);
  const result = await db
    .deleteFrom("channel_settings")
    .where("guild_id", "=", guildId)
    .where("channel_id", "=", channelId)
    .where("mailbox_address", "=", normalized)
    .executeTakeFirst();

  return (result.numDeletedRows ?? BigInt(0)) > BigInt(0);
}

function mapChannelSettings(row: ChannelSettingsTable): ChannelSettings {
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    mailboxAddress: row.mailbox_address,
    mailboxUser: row.mailbox_user,
    ackExpiryDays: row.ack_expiry_days ?? DEFAULT_ACK_EXPIRY_DAYS,
    resourceId: row.resource_id,
    checkJunk: row.check_junk ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
