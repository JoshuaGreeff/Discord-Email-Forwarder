import { Client } from "discord.js";
import { Database } from "./db/client";
import { ChannelSettings, listChannelSettings } from "./db/settings";
import { getReceiptByEmailId, pruneMessageReceipts } from "./db/messages";
import { fetchUnreadMessages, fetchUnreadFromJunk, markMessageRead } from "./graph/mail";
import { getAppOnlyToken, getGraphClient } from "./graph/auth";
import { postEmailToChannel } from "./discord/postEmail";
import { logger } from "./logger";
import { ResourceStore, getResourceById, upsertResource } from "./db/resources";
import { normalizeAddress } from "./db/settings";
import { listRules, matchesRule } from "./db/rules";
import { POLL_INTERVAL_MS } from "./config/poll";

const log = logger("emailPoller");

async function processMailbox(db: Database, resources: ResourceStore, client: Client, target: ChannelSettings) {
  let resource = getResourceById(resources, target.resourceId);
  if (!resource) {
    const legacy = target as any;
    if (legacy.tenantId && legacy.clientId && legacy.clientSecret) {
      log.warn("Migrating legacy credentials into resource store", { channelId: target.channelId });
      resource = await upsertResource(resources, {
        id: target.resourceId ?? normalizeAddress(target.mailboxAddress),
        mailboxAddress: target.mailboxAddress,
        tenantId: legacy.tenantId,
        clientId: legacy.clientId,
        clientSecret: legacy.clientSecret,
        accessToken: legacy.accessToken ?? null,
        expiresAt: legacy.expiresAt ?? null,
      });
    } else {
      log.warn("Missing mailbox resource", { channelId: target.channelId, resourceId: target.resourceId });
      return;
    }
  }

  log.info("Polling mailbox", {
    mailbox: resource.mailboxAddress,
    channelId: target.channelId,
    guildId: target.guildId,
  });

  let accessToken = resource.accessToken ?? null;
  const now = Math.floor(Date.now() / 1000);
  if (!accessToken || !resource.expiresAt || resource.expiresAt < now + 60) {
    try {
      const tokens = await getAppOnlyToken({
        tenantId: resource.tenantId,
        clientId: resource.clientId,
        clientSecret: resource.clientSecret,
      });
      accessToken = tokens.accessToken;
      await upsertResource(resources, {
        ...resource,
        accessToken: tokens.accessToken,
        expiresAt: tokens.expiresAt,
      });
    } catch (err) {
      log.error("Failed to fetch app-only token", { channelId: target.channelId, err });
      return;
    }
  }

  const graph = getGraphClient(accessToken);
  let messages;
  try {
    messages = await fetchUnreadMessages(graph, resource.mailboxAddress);
  } catch (err) {
    log.error("Failed to fetch unread (Inbox)", { mailbox: resource.mailboxAddress, channelId: target.channelId, err });
    return;
  }
  log.info("Fetched unread (Inbox)", {
    count: messages.length,
    mailbox: resource.mailboxAddress,
    channelId: target.channelId,
  });
  if (!messages.length && (target.checkJunk ?? false)) {
    try {
      const junkMessages = await fetchUnreadFromJunk(graph, resource.mailboxAddress);
      log.info("Fetched unread (Junk)", {
        count: junkMessages.length,
        mailbox: resource.mailboxAddress,
        channelId: target.channelId,
      });
      messages = junkMessages;
    } catch (err) {
      log.error("Failed to fetch unread from Junk", {
        mailbox: resource.mailboxAddress,
        channelId: target.channelId,
        err,
      });
      return;
    }
    if (!messages.length) {
      log.debug("No messages to process", { mailbox: resource.mailboxAddress, channelId: target.channelId });
      return;
    }
  } else if (!messages.length) {
    log.debug("No messages to process", { mailbox: resource.mailboxAddress, channelId: target.channelId });
    return;
  }

  for (const mail of messages) {
    const alreadyHandled = getReceiptByEmailId(db, mail.id, target.channelId, resource.mailboxAddress);
    if (alreadyHandled) {
      try {
        await markMessageRead(graph, resource.mailboxAddress, mail.id);
      } catch (err) {
        log.warn("Failed to mark read (already handled)", { emailId: mail.id, err });
      }
      continue;
    }

    const rules = listRules(db, target.guildId, target.channelId, resource.mailboxAddress);
    const shouldSkip = rules.some((rule) => matchesRule(rule, { from: mail.from, subject: mail.subject }));
    if (shouldSkip) {
      log.info("Skipped email due to rule", { emailId: mail.id, channelId: target.channelId });
      try {
        await markMessageRead(graph, resource.mailboxAddress, mail.id);
      } catch (err) {
        log.warn("Failed to mark read (rule skip)", { emailId: mail.id, err });
      }
      continue;
    }

    const posted = await postEmailToChannel({
      client,
      db,
      guildId: target.guildId,
      channelId: target.channelId,
      mailboxAddress: resource.mailboxAddress,
      email: mail,
    });

    if (posted) {
      try {
        await markMessageRead(graph, resource.mailboxAddress, mail.id);
      } catch (err) {
        log.warn("Failed to mark read after posting", { emailId: mail.id, err });
      }

      log.info("Posted email to channel", { emailId: mail.id, channelId: target.channelId });
    } else {
      log.warn("Did not post email (channel missing or send failed)", { emailId: mail.id, channelId: target.channelId });
    }
  }
}

export function startPolling(db: Database, resources: ResourceStore, client: Client): void {
  let running = false;

  const runCycle = async () => {
    if (running) return;
    running = true;

    const cycleStart = Date.now();
    try {
      const pruned = await pruneMessageReceipts(db);
      if (pruned > 0) {
        log.debug("Pruned old receipts", { pruned });
      }

      const settings = await listChannelSettings(db);
      for (const setting of settings) {
        try {
          await processMailbox(db, resources, client, setting);
        } catch (err) {
          log.error("Error processing channel", { channelId: setting.channelId, err });
        }
      }
    } finally {
      running = false;
      const elapsed = Date.now() - cycleStart;
      const delay = Math.max(0, POLL_INTERVAL_MS - elapsed);
      setTimeout(runCycle, delay);
    }
  };

  runCycle().catch((err) => console.error("Error during initial poll", err));
}
