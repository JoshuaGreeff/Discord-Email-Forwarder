import { Database } from "./client";
import { DEFAULT_ACK_EXPIRY_DAYS, normalizeAddress } from "./settings";

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

export async function saveMessageReceipt(db: Database, receipt: MessageReceiptInput): Promise<void> {
  const existingIndex = db.data.messageReceipts.findIndex((r) => r.messageId === receipt.messageId);
  const now = Math.floor(Date.now() / 1000);
  const record: MessageReceipt = {
    ...receipt,
    createdAt: receipt.createdAt ?? now,
    fromAddress: receipt.fromAddress ?? null,
    subject: receipt.subject ?? null,
    receivedAt: receipt.receivedAt ?? null,
    bodyPreview: receipt.bodyPreview ?? null,
    bodyFull: receipt.bodyFull ?? null,
    acknowledgedBy: receipt.acknowledgedBy ?? null,
    acknowledgedAt: receipt.acknowledgedAt ?? null,
    acknowledgedName: receipt.acknowledgedName ?? null,
  };

  if (existingIndex >= 0) {
    const existing = db.data.messageReceipts[existingIndex];
    record.createdAt = existing.createdAt ?? record.createdAt;
    db.data.messageReceipts[existingIndex] = record;
  } else {
    db.data.messageReceipts.push(record);
  }

  await db.save();
}

export async function markAcknowledged(
  db: Database,
  messageId: string,
  userId: string,
  displayName?: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const receipt = db.data.messageReceipts.find((r) => r.messageId === messageId);
  if (!receipt) return;

  receipt.acknowledgedBy = userId;
  receipt.acknowledgedAt = now;
  receipt.acknowledgedName = displayName ?? null;

  await db.save();
  await pruneMessageReceipts(db);
}

export async function getReceipt(db: Database, messageId: string): Promise<MessageReceipt | null> {
  const receipt = db.data.messageReceipts.find((r) => r.messageId === messageId);
  return receipt ? { ...receipt } : null;
}

export function getReceiptByEmailId(
  db: Database,
  emailId: string,
  channelId?: string,
  mailboxAddress?: string
): MessageReceipt | null {
  const receipt = db.data.messageReceipts.find(
    (r) =>
      r.emailId === emailId &&
      (!channelId || r.channelId === channelId) &&
      (!mailboxAddress || r.mailboxAddress === mailboxAddress)
  );
  return receipt ? { ...receipt } : null;
}

function resolveAckExpiryDays(db: Database, receipt: MessageReceipt): number {
  const normalizedMailbox = normalizeAddress(receipt.mailboxAddress);
  const channel = db.data.channelSettings.find(
    (setting) =>
      setting.guildId === receipt.guildId &&
      setting.channelId === receipt.channelId &&
      normalizeAddress(setting.mailboxAddress) === normalizedMailbox
  );

  const days = channel?.ackExpiryDays ?? DEFAULT_ACK_EXPIRY_DAYS;
  if (days === 0) return 0;
  return days > 0 ? days : DEFAULT_ACK_EXPIRY_DAYS;
}

export async function pruneMessageReceipts(db: Database, now = Math.floor(Date.now() / 1000)): Promise<number> {
  const before = db.data.messageReceipts.length;
  const maxAgeSeconds = 30 * 86400;

  for (const receipt of db.data.messageReceipts) {
    if (!receipt.acknowledgedAt) {
      const expiryDays = resolveAckExpiryDays(db, receipt);
      if (expiryDays !== 0) {
        const expirySeconds = expiryDays * 86400;
        const createdAt = receipt.createdAt ?? now;
        if (createdAt + expirySeconds <= now) {
          receipt.acknowledgedAt = now;
          receipt.acknowledgedBy = "auto";
          receipt.acknowledgedName = "Auto-acknowledged";
        }
      }
    }
  }

  db.data.messageReceipts = db.data.messageReceipts.filter((receipt) => {
    const createdAt = receipt.createdAt ?? now;
    return createdAt + maxAgeSeconds > now;
  });

  const removed = before - db.data.messageReceipts.length;
  if (removed > 0) {
    await db.save();
  }

  return removed;
}
