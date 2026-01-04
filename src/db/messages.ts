import { Kysely } from "kysely";
import { DB, MessageReceiptTable } from "./connection";
import { DEFAULT_ACK_EXPIRY_DAYS, normalizeAddress } from "./settings";
import { ChannelSettings } from "./settings";

export interface MessageReceipt {
  messageId: string;
  guildId: string;
  channelId: string;
  mailboxAddress: string;
  emailId: string;
  receivedAt: string | null;
  bodyPreview: string | null;
  bodyFull: string | null;
  createdAt: number;
  fromAddress: string | null;
  subject: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: number | null;
  acknowledgedName: string | null;
}

export interface MessageReceiptInput {
  messageId: string;
  guildId: string;
  channelId: string;
  mailboxAddress: string;
  emailId: string;
  receivedAt?: string | null;
  bodyPreview?: string | null;
  bodyFull?: string | null;
  createdAt?: number;
  fromAddress?: string | null;
  subject?: string | null;
  acknowledgedBy?: string | null;
  acknowledgedAt?: number | null;
  acknowledgedName?: string | null;
}

function mapReceipt(row: MessageReceiptTable): MessageReceipt {
  return {
    messageId: row.message_id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    mailboxAddress: row.mailbox_address,
    emailId: row.email_id,
    receivedAt: row.received_at ?? null,
    bodyPreview: row.body_preview ?? null,
    bodyFull: row.body_full ?? null,
    createdAt: row.created_at,
    fromAddress: row.from_address ?? null,
    subject: row.subject ?? null,
    acknowledgedBy: row.acknowledged_by ?? null,
    acknowledgedAt: row.acknowledged_at ?? null,
    acknowledgedName: row.acknowledged_name ?? null,
  };
}

export async function saveMessageReceipt(db: Kysely<DB>, receipt: MessageReceiptInput): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const normalizedMailbox = normalizeAddress(receipt.mailboxAddress);
  await db
    .insertInto("message_receipts")
    .values({
      message_id: receipt.messageId,
      guild_id: receipt.guildId,
      channel_id: receipt.channelId,
      mailbox_address: normalizedMailbox,
      email_id: receipt.emailId,
      received_at: receipt.receivedAt ?? null,
      body_preview: receipt.bodyPreview ?? null,
      body_full: receipt.bodyFull ?? null,
      created_at: receipt.createdAt ?? now,
      from_address: receipt.fromAddress ?? null,
      subject: receipt.subject ?? null,
      acknowledged_by: receipt.acknowledgedBy ?? null,
      acknowledged_at: receipt.acknowledgedAt ?? null,
      acknowledged_name: receipt.acknowledgedName ?? null,
    })
    .onConflict((oc) =>
      oc.column("message_id").doUpdateSet({
        received_at: receipt.receivedAt ?? null,
        body_preview: receipt.bodyPreview ?? null,
        body_full: receipt.bodyFull ?? null,
        from_address: receipt.fromAddress ?? null,
        subject: receipt.subject ?? null,
        acknowledged_by: receipt.acknowledgedBy ?? null,
        acknowledged_at: receipt.acknowledgedAt ?? null,
        acknowledged_name: receipt.acknowledgedName ?? null,
      })
    )
    .execute();
}

export async function markAcknowledged(
  db: Kysely<DB>,
  messageId: string,
  userId: string,
  displayName?: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .updateTable("message_receipts")
    .set({
      acknowledged_by: userId,
      acknowledged_at: now,
      acknowledged_name: displayName ?? null,
    })
    .where("message_id", "=", messageId)
    .execute();
}

export async function getReceipt(db: Kysely<DB>, messageId: string): Promise<MessageReceipt | null> {
  const row = await db.selectFrom("message_receipts").selectAll().where("message_id", "=", messageId).executeTakeFirst();
  return row ? mapReceipt(row) : null;
}

export async function getReceiptByEmailId(
  db: Kysely<DB>,
  emailId: string,
  channelId?: string,
  mailboxAddress?: string
): Promise<MessageReceipt | null> {
  let query = db.selectFrom("message_receipts").selectAll().where("email_id", "=", emailId);
  if (channelId) query = query.where("channel_id", "=", channelId);
  if (mailboxAddress) query = query.where("mailbox_address", "=", normalizeAddress(mailboxAddress));
  const row = await query.executeTakeFirst();
  return row ? mapReceipt(row) : null;
}

export async function pruneMessageReceipts(db: Kysely<DB>, channels: ChannelSettings[]): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const maxAgeSeconds = 30 * 86400;

  const receipts = await db.selectFrom("message_receipts").selectAll().execute();
  const channelLookup = new Map<string, ChannelSettings>();
  for (const c of channels) {
    channelLookup.set(`${c.guildId}:${c.channelId}:${normalizeAddress(c.mailboxAddress)}`, c);
  }

  for (const receipt of receipts) {
    if (!receipt.acknowledged_at) {
      const key = `${receipt.guild_id}:${receipt.channel_id}:${normalizeAddress(receipt.mailbox_address)}`;
      const channel = channelLookup.get(key);
      const days = channel?.ackExpiryDays ?? DEFAULT_ACK_EXPIRY_DAYS;
      if (days !== 0) {
        const expirySeconds = days * 86400;
        const createdAt = receipt.created_at ?? now;
        if (createdAt + expirySeconds <= now) {
          await db
            .updateTable("message_receipts")
            .set({
              acknowledged_at: now,
              acknowledged_by: "auto",
              acknowledged_name: "Auto-acknowledged",
            })
            .where("message_id", "=", receipt.message_id)
            .execute();
        }
      }
    }
  }

  const result = await db
    .deleteFrom("message_receipts")
    .where("created_at", "<", now - maxAgeSeconds)
    .executeTakeFirst();

  return Number(result.numDeletedRows ?? 0);
}

export async function listMessageReceipts(
  db: Kysely<DB>,
  filters: {
    guildId: string;
    channelId?: string;
    mailboxAddress?: string;
    acknowledgerId?: string;
    sender?: string;
    contentContains?: string;
    titleContains?: string;
    since?: number;
  }
): Promise<MessageReceipt[]> {
  let query = db.selectFrom("message_receipts").selectAll().where("guild_id", "=", filters.guildId);
  if (filters.channelId) query = query.where("channel_id", "=", filters.channelId);
  if (filters.mailboxAddress) query = query.where("mailbox_address", "=", normalizeAddress(filters.mailboxAddress));
  if (filters.acknowledgerId) query = query.where("acknowledged_by", "=", filters.acknowledgerId);
  if (filters.since) query = query.where("created_at", ">=", filters.since);

  const rows = await query.execute();
  const lowerContent = filters.contentContains?.toLowerCase();
  const lowerTitle = filters.titleContains?.toLowerCase();
  const lowerSender = filters.sender?.toLowerCase();

  return rows
    .map(mapReceipt)
    .filter((r) => (lowerSender ? (r.fromAddress ?? "").toLowerCase().includes(lowerSender) : true))
    .filter((r) => (lowerContent ? (r.bodyPreview ?? "").toLowerCase().includes(lowerContent) : true))
    .filter((r) => (lowerTitle ? (r.subject ?? "").toLowerCase().includes(lowerTitle) : true))
    .sort((a, b) => (b.acknowledgedAt ?? b.createdAt ?? 0) - (a.acknowledgedAt ?? a.createdAt ?? 0));
}
