import { Database } from "./client";

export interface MessageReceipt {
  messageId: string;
  guildId: string;
  channelId: string;
  mailboxAddress: string;
  emailId: string;
  fromAddress?: string;
  subject?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
  unsubRuleId?: number;
  unsubscribedBy?: string;
  unsubscribedAt?: number;
}

export async function saveMessageReceipt(db: Database, receipt: MessageReceipt): Promise<void> {
  const existingIndex = db.data.messageReceipts.findIndex((r) => r.messageId === receipt.messageId);
  const record = { ...receipt };

  if (existingIndex >= 0) {
    db.data.messageReceipts[existingIndex] = record;
  } else {
    db.data.messageReceipts.push(record);
  }

  await db.save();
}

export async function markAcknowledged(db: Database, messageId: string, userId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const receipt = db.data.messageReceipts.find((r) => r.messageId === messageId);
  if (!receipt) return;

  receipt.acknowledgedBy = userId;
  receipt.acknowledgedAt = now;

  await db.save();
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

export async function setUnsubscribed(
  db: Database,
  messageId: string,
  ruleId: number,
  userId: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const receipt = db.data.messageReceipts.find((r) => r.messageId === messageId);
  if (!receipt) return;

  receipt.unsubRuleId = ruleId;
  receipt.unsubscribedBy = userId;
  receipt.unsubscribedAt = now;

  await db.save();
}
