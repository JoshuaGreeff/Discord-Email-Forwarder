import fs from "fs";
import { Kysely, PostgresDialect, Generated } from "kysely";
import pg from "pg";

export interface ChannelSettingsTable {
  id: string;
  guild_id: string;
  channel_id: string;
  mailbox_address: string;
  mailbox_user: string;
  ack_expiry_days: number;
  resource_id: string;
  check_junk: boolean;
  created_at: number;
  updated_at: number;
}

export interface ResourceTable {
  id: string;
  mailbox_address: string;
  tenant_id: string;
  client_id: string;
  client_secret: string;
  access_token: string | null;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface RuleTable {
  id: Generated<number>;
  guild_id: string;
  channel_id: string;
  mailbox_address: string;
  friendly_name: string | null;
  from_address: string;
  subject_contains: string | null;
  created_at: number;
}

export interface MessageReceiptTable {
  message_id: string;
  guild_id: string;
  channel_id: string;
  mailbox_address: string;
  email_id: string;
  received_at: string | null;
  body_preview: string | null;
  body_full: string | null;
  created_at: number;
  from_address: string | null;
  subject: string | null;
  acknowledged_by: string | null;
  acknowledged_at: number | null;
  acknowledged_name: string | null;
}

export interface DB {
  channel_settings: ChannelSettingsTable;
  resources: ResourceTable;
  rules: RuleTable;
  message_receipts: MessageReceiptTable;
}

let dbInstance: Kysely<DB> | null = null;

function readSecret(name: string): string | undefined {
  const file = process.env[`${name}_FILE`];
  if (file) {
    try {
      return fs.readFileSync(file, "utf8").trim();
    } catch {
      // ignore
    }
  }
  return process.env[name];
}

function buildConnectionString(): string {
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT ?? "5432";
  const user = process.env.DB_USER;
  const password = readSecret("DB_PASSWORD");
  const name = process.env.DB_NAME;

  if (!host || !user || !password || !name) {
    throw new Error("Database configuration missing (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME required)");
  }

  const p = port ? `:${port}` : "";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}${p}/${name}`;
}

export function getDb(): Kysely<DB> {
  if (dbInstance) return dbInstance;

  const connectionString = buildConnectionString();
  const pool = new pg.Pool(
    connectionString
      ? { connectionString, ssl: process.env.DB_SSL === "1" ? { rejectUnauthorized: false } : undefined }
      : undefined
  );

  dbInstance = new Kysely<DB>({
    dialect: new PostgresDialect({ pool }),
  });

  return dbInstance;
}

export async function ensureSchema(db: Kysely<DB>): Promise<void> {
  await db.schema
    .createTable("resources")
    .ifNotExists()
    .addColumn("id", "varchar", (col) => col.primaryKey())
    .addColumn("mailbox_address", "varchar", (col) => col.notNull().unique())
    .addColumn("tenant_id", "varchar", (col) => col.notNull())
    .addColumn("client_id", "varchar", (col) => col.notNull())
    .addColumn("client_secret", "varchar", (col) => col.notNull())
    .addColumn("access_token", "varchar")
    .addColumn("expires_at", "integer")
    .addColumn("created_at", "integer", (col) => col.notNull())
    .addColumn("updated_at", "integer", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("channel_settings")
    .ifNotExists()
    .addColumn("id", "varchar", (col) => col.primaryKey())
    .addColumn("guild_id", "varchar", (col) => col.notNull())
    .addColumn("channel_id", "varchar", (col) => col.notNull())
    .addColumn("mailbox_address", "varchar", (col) => col.notNull())
    .addColumn("mailbox_user", "varchar", (col) => col.notNull())
    .addColumn("ack_expiry_days", "integer", (col) => col.notNull())
    .addColumn("resource_id", "varchar", (col) => col.notNull())
    .addColumn("check_junk", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "integer", (col) => col.notNull())
    .addColumn("updated_at", "integer", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("rules")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("guild_id", "varchar", (col) => col.notNull())
    .addColumn("channel_id", "varchar", (col) => col.notNull())
    .addColumn("mailbox_address", "varchar", (col) => col.notNull())
    .addColumn("friendly_name", "varchar")
    .addColumn("from_address", "varchar", (col) => col.notNull())
    .addColumn("subject_contains", "varchar")
    .addColumn("created_at", "integer", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("message_receipts")
    .ifNotExists()
    .addColumn("message_id", "varchar", (col) => col.primaryKey())
    .addColumn("guild_id", "varchar", (col) => col.notNull())
    .addColumn("channel_id", "varchar", (col) => col.notNull())
    .addColumn("mailbox_address", "varchar", (col) => col.notNull())
    .addColumn("email_id", "varchar", (col) => col.notNull())
    .addColumn("received_at", "varchar")
    .addColumn("body_preview", "varchar")
    .addColumn("body_full", "text")
    .addColumn("created_at", "integer", (col) => col.notNull())
    .addColumn("from_address", "varchar")
    .addColumn("subject", "varchar")
    .addColumn("acknowledged_by", "varchar")
    .addColumn("acknowledged_at", "integer")
    .addColumn("acknowledged_name", "varchar")
    .execute();

  await db.schema
    .createIndex("idx_channel_settings_mailbox")
    .ifNotExists()
    .on("channel_settings")
    .columns(["guild_id", "channel_id", "mailbox_address"])
    .execute();

  await db.schema
    .createIndex("idx_rules_mailbox")
    .ifNotExists()
    .on("rules")
    .columns(["guild_id", "channel_id", "mailbox_address"])
    .execute();

  await db.schema
    .createIndex("idx_receipts_mailbox")
    .ifNotExists()
    .on("message_receipts")
    .columns(["guild_id", "channel_id", "mailbox_address"])
    .execute();
}
