import { Database } from "sqlite";

export interface ChannelSettings {
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
}

export async function upsertChannelSettings(db: Database, settings: ChannelSettings): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.run(
    `
      INSERT INTO channel_settings (
        guild_id, channel_id, mailbox_address, mailbox_user, tenant_id, client_id, client_secret,
        redirect_uri, access_token, refresh_token, expires_at, poll_cron, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, channel_id) DO UPDATE SET
        mailbox_address=excluded.mailbox_address,
        mailbox_user=excluded.mailbox_user,
        tenant_id=excluded.tenant_id,
        client_id=excluded.client_id,
        client_secret=excluded.client_secret,
        redirect_uri=excluded.redirect_uri,
        access_token=excluded.access_token,
        refresh_token=excluded.refresh_token,
        expires_at=excluded.expires_at,
        poll_cron=excluded.poll_cron,
        updated_at=excluded.updated_at
    `,
    [
      settings.guildId,
      settings.channelId,
      settings.mailboxAddress,
      settings.mailboxUser,
      settings.tenantId,
      settings.clientId,
      settings.clientSecret,
      settings.redirectUri,
      settings.accessToken ?? null,
      settings.refreshToken ?? null,
      settings.expiresAt ?? null,
      settings.pollCron ?? null,
      now,
      now,
    ]
  );
}

export async function getChannelSettings(db: Database, guildId: string, channelId: string): Promise<ChannelSettings | null> {
  const row = await db.get(
    `
      SELECT guild_id, channel_id, mailbox_address, mailbox_user, tenant_id, client_id, client_secret,
             redirect_uri, access_token, refresh_token, expires_at, poll_cron
      FROM channel_settings
      WHERE guild_id = ? AND channel_id = ?
    `,
    [guildId, channelId]
  );

  if (!row) {
    return null;
  }

  return {
    guildId: row.guild_id,
    channelId: row.channel_id,
    mailboxAddress: row.mailbox_address,
    mailboxUser: row.mailbox_user,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    clientSecret: row.client_secret,
    redirectUri: row.redirect_uri,
    accessToken: row.access_token ?? undefined,
    refreshToken: row.refresh_token ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    pollCron: row.poll_cron ?? undefined,
  };
}

export async function listChannelSettings(db: Database): Promise<ChannelSettings[]> {
  const rows = await db.all(
    `SELECT guild_id, channel_id, mailbox_address, mailbox_user, tenant_id, client_id,
            client_secret, redirect_uri, access_token, refresh_token, expires_at, poll_cron
       FROM channel_settings`
  );
  return rows.map((row) => ({
    guildId: row.guild_id,
    channelId: row.channel_id,
    mailboxAddress: row.mailbox_address,
    mailboxUser: row.mailbox_user,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    clientSecret: row.client_secret,
    redirectUri: row.redirect_uri,
    accessToken: row.access_token ?? undefined,
    refreshToken: row.refresh_token ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    pollCron: row.poll_cron ?? undefined,
  }));
}
