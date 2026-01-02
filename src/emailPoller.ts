import cron from "node-cron";
import { Client } from "discord.js";
import { Database } from "./db/client";
import { ChannelSettings, listChannelSettings, upsertChannelSettings } from "./db/settings";
import { listRulesForChannel } from "./db/rules";
import { getReceiptByEmailId } from "./db/messages";
import { shouldSkipEmail } from "./rules/filters";
import { fetchUnreadMessages, markMessageRead } from "./graph/mail";
import { getAppOnlyToken, getGraphClient } from "./graph/auth";
import { postEmailToChannel } from "./discord/postEmail";

async function processMailbox(db: Database, client: Client, target: ChannelSettings) {
  if (!target.clientId || !target.clientSecret || !target.tenantId) {
    console.warn(`Missing app-only credentials for ${target.channelId}; update settings.`);
    return;
  }

  let accessToken = target.accessToken;
  const now = Math.floor(Date.now() / 1000);
  if (!accessToken || !target.expiresAt || target.expiresAt < now + 60) {
    try {
      const tokens = await getAppOnlyToken({
        tenantId: target.tenantId,
        clientId: target.clientId,
        clientSecret: target.clientSecret,
      });
      accessToken = tokens.accessToken;
      await upsertChannelSettings(db, {
        ...target,
        accessToken: tokens.accessToken,
        refreshToken: undefined,
        expiresAt: tokens.expiresAt,
      });
    } catch (err) {
      console.error(`Failed to fetch app-only token for ${target.channelId}`, err);
      return;
    }
  }

  const graph = getGraphClient(accessToken);
  const rules = await listRulesForChannel(db, target.guildId, target.channelId);
  const messages = await fetchUnreadMessages(graph, target.mailboxAddress);

  for (const mail of messages) {
    const alreadyHandled = getReceiptByEmailId(db, mail.id, target.channelId, target.mailboxAddress);
    if (alreadyHandled) {
      try {
        await markMessageRead(graph, target.mailboxAddress, mail.id);
      } catch (err) {
        console.warn(`Failed to mark read (already handled) for ${mail.id}: ${String(err)}`);
      }
      continue;
    }

    if (shouldSkipEmail(rules, { from: mail.from, subject: mail.subject })) {
      try {
        await markMessageRead(graph, target.mailboxAddress, mail.id);
      } catch (err) {
        console.warn(`Failed to mark read (skipped) for ${mail.id}: ${String(err)}`);
      }
      continue;
    }

    await postEmailToChannel({
      client,
      db,
      guildId: target.guildId,
      channelId: target.channelId,
      mailboxAddress: target.mailboxAddress,
      email: mail,
    });

    try {
      await markMessageRead(graph, target.mailboxAddress, mail.id);
    } catch (err) {
      console.warn(`Failed to mark read for ${mail.id}: ${String(err)}`);
    }
  }
}

export function startPolling(db: Database, client: Client): void {
  cron.schedule("*/5 * * * *", async () => {
    const settings = await listChannelSettings(db);
    for (const setting of settings) {
      try {
        await processMailbox(db, client, setting);
      } catch (err) {
        console.error(`Error processing channel ${setting.channelId}`, err);
      }
    }
  });

  // Run once on startup so we don't wait for the first cron interval.
  (async () => {
    const settings = await listChannelSettings(db);
    for (const setting of settings) {
      try {
        await processMailbox(db, client, setting);
      } catch (err) {
        console.error(`Error processing channel ${setting.channelId}`, err);
      }
    }
  })();
}
