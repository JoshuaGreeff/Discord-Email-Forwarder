import {
  ChannelType,
  Client,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import { Database } from "../db/client";
import { saveMessageReceipt } from "../db/messages";
import { MailMessage } from "../graph/mail";
import { buildComponents } from "./interactions";
import { cleanBodyPreview } from "../mail/normalize";
import { logger } from "../logger";

const log = logger("discord:postEmail");

export async function postEmailToChannel(params: {
  client: Client;
  db: Database;
  guildId: string;
  channelId: string;
  mailboxAddress: string;
  email: MailMessage;
}): Promise<boolean> {
  log.debug("Preparing to post email", {
    guildId: params.guildId,
    channelId: params.channelId,
    mailbox: params.mailboxAddress,
    emailId: params.email.id,
    subject: params.email.subject,
  });

  const channel = await params.client.channels.fetch(params.channelId);
  if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
    log.warn("Channel not found or unsupported type", { channelId: params.channelId, type: channel?.type });
    return false;
  }

  const fullBody = cleanBodyPreview(params.email.body, params.email.bodyType, 4000);
  const truncatedPreview =
    fullBody.length > 500 ? `${fullBody.slice(0, 500)}…` : fullBody.length ? fullBody : "_No content_";
  const hasOverflow = fullBody.length > 500;
  const parsedReceived = params.email.receivedAt ? Date.parse(params.email.receivedAt) : NaN;
  const receivedText = params.email.receivedAt ?? "Unknown";
  const embed = new EmbedBuilder()
    .setAuthor({ name: params.email.from ?? "Unknown sender" })
    .setTitle(params.email.subject || "(no subject)")
    .setDescription(truncatedPreview || "_No content_")
    .setFooter({
      text: Number.isNaN(parsedReceived) ? `Awaiting acknowledgement • Received: ${receivedText}` : "Awaiting acknowledgement",
    });

  let message;
  try {
    message = await (channel as TextChannel).send({
      embeds: [embed],
      components: buildComponents({
        messageId: "pending",
        disableAck: false,
        showMore: hasOverflow,
      }),
    });
  } catch (err) {
    log.error("Failed to send message to channel", { channelId: params.channelId, err });
    return false;
  }

  // Now that we have the Discord message ID, rebuild components with the real ID
  try {
    await message.edit({
      components: buildComponents({
        messageId: message.id,
        disableAck: false,
        showMore: hasOverflow,
      }),
    });
  } catch (err) {
    log.warn("Failed to edit message to set customId", { messageId: message.id, err });
  }

  try {
    await saveMessageReceipt(params.db, {
      messageId: message.id,
      guildId: params.guildId,
      channelId: params.channelId,
      mailboxAddress: params.mailboxAddress,
      emailId: params.email.id,
      fromAddress: params.email.from,
      subject: params.email.subject,
      receivedAt: params.email.receivedAt,
      bodyPreview: truncatedPreview,
      bodyFull: fullBody,
    });
    log.info("Posted email to channel and saved receipt", {
      emailId: params.email.id,
      messageId: message.id,
      channelId: params.channelId,
    });
  } catch (err) {
    log.error("Failed to save message receipt", { err, emailId: params.email.id, messageId: message.id });
  }

  return true;
}
