import { Database } from "sqlite";

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS channel_settings (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    mailbox_address TEXT NOT NULL,
    mailbox_user TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at INTEGER,
    poll_cron TEXT DEFAULT '*/2 * * * *',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    PRIMARY KEY (guild_id, channel_id)
  );
`,
  `
  CREATE TABLE IF NOT EXISTS unsubscribe_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    from_address TEXT,
    subject_contains TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`,
  `
  CREATE TABLE IF NOT EXISTS message_receipts (
    message_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    email_id TEXT NOT NULL,
    from_address TEXT,
    subject TEXT,
    acknowledged_by TEXT,
    acknowledged_at INTEGER
  );
`
];

export async function runMigrations(db: Database): Promise<void> {
  for (const sql of MIGRATIONS) {
    await db.exec(sql);
  }
}
