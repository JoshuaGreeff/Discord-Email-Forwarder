import fs from "fs";
import path from "path";
import { normalizeAddress } from "./settings";

export interface MailboxResource {
  id: string;
  mailboxAddress: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  accessToken: string | null;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface MailboxResourceInput {
  id?: string;
  mailboxAddress: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  accessToken?: string | null;
  expiresAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
}

type ResourceData = {
  mailboxes: MailboxResource[];
};

export interface ResourceStore {
  data: ResourceData;
  save(): Promise<void>;
}

const DATA_FILE = path.join(process.cwd(), "data", "resources.json");
let resourceInstance: ResourceStore | null = null;

function normalizeMailboxResource(record: MailboxResourceInput): MailboxResource {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: record.id ?? normalizeAddress(record.mailboxAddress),
    mailboxAddress: normalizeAddress(record.mailboxAddress),
    tenantId: record.tenantId,
    clientId: record.clientId,
    clientSecret: record.clientSecret,
    accessToken: record.accessToken ?? null,
    expiresAt: record.expiresAt ?? null,
    createdAt: record.createdAt ?? now,
    updatedAt: record.updatedAt ?? now,
  };
}

async function readData(): Promise<ResourceData> {
  if (!fs.existsSync(DATA_FILE)) {
    return { mailboxes: [] };
  }

  const raw = await fs.promises.readFile(DATA_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return {
      mailboxes: Array.isArray(parsed.mailboxes)
        ? parsed.mailboxes.map((r: MailboxResource) => normalizeMailboxResource(r))
        : [],
    };
  } catch {
    return { mailboxes: [] };
  }
}

async function writeData(data: ResourceData): Promise<void> {
  const dir = path.dirname(DATA_FILE);
  await fs.promises.mkdir(dir, { recursive: true });
  const tempPath = `${DATA_FILE}.tmp`;
  await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  await fs.promises.rm(DATA_FILE, { force: true });
  await fs.promises.rename(tempPath, DATA_FILE);
}

export async function getResourceStore(): Promise<ResourceStore> {
  if (resourceInstance) return resourceInstance;

  const data = await readData();
  resourceInstance = {
    data,
    async save() {
      await writeData(data);
    },
  };

  return resourceInstance;
}

export function findResourceByMailbox(store: ResourceStore, mailboxAddress: string): MailboxResource | null {
  const target = normalizeAddress(mailboxAddress);
  const found = store.data.mailboxes.find((r) => normalizeAddress(r.mailboxAddress) === target);
  return found ? { ...found } : null;
}

export function getResourceById(store: ResourceStore, id: string): MailboxResource | null {
  const found = store.data.mailboxes.find((r) => r.id === id);
  return found ? { ...found } : null;
}

export async function upsertResource(store: ResourceStore, resource: MailboxResourceInput): Promise<MailboxResource> {
  const normalized = normalizeMailboxResource(resource);
  const existingIndex = store.data.mailboxes.findIndex((r) => r.id === normalized.id);
  const now = Math.floor(Date.now() / 1000);

  if (existingIndex >= 0) {
    const existing = store.data.mailboxes[existingIndex];
    store.data.mailboxes[existingIndex] = {
      ...existing,
      ...normalized,
      createdAt: existing.createdAt ?? now,
      updatedAt: now,
    };
  } else {
    store.data.mailboxes.push({
      ...normalized,
      createdAt: normalized.createdAt ?? now,
      updatedAt: now,
    });
  }

  await store.save();
  return normalized;
}
