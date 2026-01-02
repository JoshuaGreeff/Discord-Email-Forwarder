import { Database } from "sqlite";

export interface MessageReceipt {
  messageId: string;
  guildId: string;
  channelId: string;
  emailId: string;
  fromAddress?: string;
  subject?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
}

export async function saveMessageReceipt(db: Database, receipt: MessageReceipt): Promise<void> {
  await db.run(
    `
      INSERT INTO message_receipts (message_id, guild_id, channel_id, email_id, from_address, subject, acknowledged_by, acknowledged_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      receipt.messageId,
      receipt.guildId,
      receipt.channelId,
      receipt.emailId,
      receipt.fromAddress ?? null,
      receipt.subject ?? null,
      receipt.acknowledgedBy ?? null,
      receipt.acknowledgedAt ?? null,
    ]
  );
}

export async function markAcknowledged(db: Database, messageId: string, userId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.run(
    `
      UPDATE message_receipts
      SET acknowledged_by = ?, acknowledged_at = ?
      WHERE message_id = ?
    `,
    [userId, now, messageId]
  );
}

export async function getReceipt(db: Database, messageId: string): Promise<MessageReceipt | null> {
  const row = await db.get(
    `
      SELECT message_id, guild_id, channel_id, email_id, from_address, subject, acknowledged_by, acknowledged_at
      FROM message_receipts
      WHERE message_id = ?
    `,
    [messageId]
  );

  if (!row) {
    return null;
  }

  return {
    messageId: row.message_id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    emailId: row.email_id,
    fromAddress: row.from_address ?? undefined,
    subject: row.subject ?? undefined,
    acknowledgedBy: row.acknowledged_by ?? undefined,
    acknowledgedAt: row.acknowledged_at ?? undefined,
  };
}
