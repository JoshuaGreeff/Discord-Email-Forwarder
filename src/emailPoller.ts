import cron from "node-cron";
import { Client } from "discord.js";
import { Database } from "sqlite";
import { listChannelSettings, upsertChannelSettings } from "./db/settings";
import { listRulesForChannel } from "./db/rules";
import { shouldSkipEmail } from "./rules/filters";
import { fetchUnreadMessages, markMessageRead } from "./graph/mail";
import { getGraphClient, refreshAccessToken } from "./graph/auth";
import { postEmailToChannel } from "./discord/postEmail";

async function processMailbox(db: Database, client: Client, opts: { guildId: string; channelId: string }) {
  const settingsList = await listChannelSettings(db);
  const target = settingsList.find(
    (s) => s.guildId === opts.guildId && s.channelId === opts.channelId
  );

  if (!target) return;
  if (!target.accessToken || !target.refreshToken) {
    console.warn(`No tokens for ${opts.channelId}; run /setup OAuth.`);
    return;
  }

  let accessToken = target.accessToken;
  if (!target.expiresAt || target.expiresAt < Math.floor(Date.now() / 1000) + 60) {
    try {
      const refreshed = await refreshAccessToken({
        tenantId: target.tenantId,
        clientId: target.clientId,
        clientSecret: target.clientSecret,
        redirectUri: target.redirectUri,
        refreshToken: target.refreshToken,
      });
      accessToken = refreshed.accessToken;
      await upsertChannelSettings(db, {
        ...target,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
      });
    } catch (err) {
      console.error("Failed to refresh token", err);
      return;
    }
  }

  const graph = getGraphClient(accessToken);
  const rules = await listRulesForChannel(db, target.guildId, target.channelId);
  const messages = await fetchUnreadMessages(graph, target.mailboxAddress);

  for (const mail of messages) {
    if (shouldSkipEmail(rules, { from: mail.from, subject: mail.subject })) {
      await markMessageRead(graph, target.mailboxAddress, mail.id);
      continue;
    }

    await postEmailToChannel({
      client,
      db,
      guildId: target.guildId,
      channelId: target.channelId,
      email: mail,
    });

    await markMessageRead(graph, target.mailboxAddress, mail.id);
  }
}

export function startPolling(db: Database, client: Client): void {
  cron.schedule("*/2 * * * *", async () => {
    const settings = await listChannelSettings(db);
    for (const setting of settings) {
      try {
        await processMailbox(db, client, { guildId: setting.guildId, channelId: setting.channelId });
      } catch (err) {
        console.error(`Error processing channel ${setting.channelId}`, err);
      }
    }
  });
}
