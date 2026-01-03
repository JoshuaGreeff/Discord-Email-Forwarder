import fs from "fs";
import path from "path";
import { normalizeAddress } from "./settings";

type ChannelSettingsRecord = {
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
};

type MessageReceiptRecord = {
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
};

type RuleRecord = {
  id: number;
  guildId: string;
  channelId: string;
  mailboxAddress: string;
  friendlyName: string | null;
  fromAddress: string;
  subjectContains: string | null;
  createdAt: number;
};

export type DatabaseData = {
  channelSettings: ChannelSettingsRecord[];
  rules: RuleRecord[];
  messageReceipts: MessageReceiptRecord[];
};

export interface Database {
  data: DatabaseData;
  save(): Promise<void>;
}

const DATA_FILE = path.join(process.cwd(), "data", "db.json");
let dbInstance: Database | null = null;

const DEFAULT_ACK_EXPIRY_DAYS = 5;

function normalizeChannelSettings(records: any[]): ChannelSettingsRecord[] {
  return records.map((record) => {
    const now = Math.floor(Date.now() / 1000);
    const ackExpiryDays = record.ackExpiryDays ?? DEFAULT_ACK_EXPIRY_DAYS;
    const checkJunk = record.checkJunk ?? false;

    return {
      id: record.id ?? `${record.guildId}:${record.channelId}:${String(record.mailboxAddress).toLowerCase()}`,
      guildId: record.guildId,
      channelId: record.channelId,
      mailboxAddress: record.mailboxAddress,
      mailboxUser: record.mailboxUser,
      ackExpiryDays,
      checkJunk,
      resourceId:
        record.resourceId ??
        record.id ??
        `${record.guildId}:${record.channelId}:${String(record.mailboxAddress).toLowerCase()}`,
      createdAt: record.createdAt ?? now,
      updatedAt: record.updatedAt ?? now,
    };
  });
}

function normalizeMessageReceipts(records: any[]): MessageReceiptRecord[] {
  return records.map((record) => {
    const now = Math.floor(Date.now() / 1000);
    return {
      messageId: record.messageId,
      guildId: record.guildId,
      channelId: record.channelId,
      mailboxAddress: record.mailboxAddress,
      emailId: record.emailId,
      receivedAt: record.receivedAt ?? null,
      bodyPreview: record.bodyPreview ?? null,
      bodyFull: record.bodyFull ?? null,
      createdAt: record.createdAt ?? now,
      fromAddress: record.fromAddress ?? null,
      subject: record.subject ?? null,
      acknowledgedBy: record.acknowledgedBy ?? null,
      acknowledgedAt: record.acknowledgedAt ?? null,
      acknowledgedName: record.acknowledgedName ?? null,
    };
  });
}

function normalizeRules(records: any[]): RuleRecord[] {
  return records.map((record, idx) => {
    const now = Math.floor(Date.now() / 1000);
    return {
      id: record.id ?? idx + 1,
      guildId: record.guildId,
      channelId: record.channelId,
      mailboxAddress: normalizeAddress(record.mailboxAddress),
      friendlyName: record.friendlyName ?? null,
      fromAddress: normalizeAddress(record.fromAddress ?? ""),
      subjectContains: record.subjectContains ?? null,
      createdAt: record.createdAt ?? now,
    };
  });
}

async function readData(): Promise<DatabaseData> {
  if (!fs.existsSync(DATA_FILE)) {
    return { channelSettings: [], rules: [], messageReceipts: [] };
  }

  const raw = await fs.promises.readFile(DATA_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return {
      channelSettings: normalizeChannelSettings(parsed.channelSettings ?? []),
      rules: normalizeRules(parsed.rules ?? []),
      messageReceipts: normalizeMessageReceipts(parsed.messageReceipts ?? []),
    };
  } catch {
    return { channelSettings: [], rules: [], messageReceipts: [] };
  }
}

async function writeData(data: DatabaseData): Promise<void> {
  const dir = path.dirname(DATA_FILE);
  await fs.promises.mkdir(dir, { recursive: true });
  const tempPath = `${DATA_FILE}.tmp`;
  await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  await fs.promises.rm(DATA_FILE, { force: true });
  await fs.promises.rename(tempPath, DATA_FILE);
}

export async function getDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  const data = await readData();
  dbInstance = {
    data,
    async save() {
      await writeData(data);
    },
  };

  return dbInstance;
}
