import fs from "fs";
import path from "path";

type ChannelSettingsRecord = {
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
};

type UnsubscribeRuleRecord = {
  id: number;
  guildId: string;
  channelId: string;
  fromAddress?: string;
  subjectContains?: string;
  createdAt?: number;
};

type MessageReceiptRecord = {
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
};

export type DatabaseData = {
  channelSettings: ChannelSettingsRecord[];
  unsubscribeRules: UnsubscribeRuleRecord[];
  messageReceipts: MessageReceiptRecord[];
};

export interface Database {
  data: DatabaseData;
  save(): Promise<void>;
}

const DATA_FILE = path.join(process.cwd(), "data", "db.json");
let dbInstance: Database | null = null;

async function readData(): Promise<DatabaseData> {
  if (!fs.existsSync(DATA_FILE)) {
    return { channelSettings: [], unsubscribeRules: [], messageReceipts: [] };
  }

  const raw = await fs.promises.readFile(DATA_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return {
      channelSettings: parsed.channelSettings ?? [],
      unsubscribeRules: parsed.unsubscribeRules ?? [],
      messageReceipts: parsed.messageReceipts ?? [],
    };
  } catch {
    return { channelSettings: [], unsubscribeRules: [], messageReceipts: [] };
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
