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

export async function postEmailToChannel(params: {
  client: Client;
  db: Database;
  guildId: string;
  channelId: string;
  mailboxAddress: string;
  email: MailMessage;
}): Promise<void> {
  const channel = await params.client.channels.fetch(params.channelId);
  if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
    return;
  }

  const bodyPreview = cleanBodyPreview(params.email.body, params.email.bodyType, 1800);
  const embed = new EmbedBuilder()
    .setTitle(params.email.subject || "(no subject)")
    .setDescription(bodyPreview || "_No content_")
    .addFields(
      { name: "From", value: params.email.from ?? "Unknown", inline: true },
      { name: "Received", value: params.email.receivedAt ?? "Unknown", inline: true }
    )
    .setFooter({ text: "Awaiting acknowledgement" });

  const message = await (channel as TextChannel).send({
    embeds: [embed],
    components: buildComponents({
      messageId: "pending",
      disableAck: false,
      hasUnsubRule: false,
    }),
  });

  // Now that we have the Discord message ID, rebuild components with the real ID
  await message.edit({
    components: buildComponents({
      messageId: message.id,
      disableAck: false,
      hasUnsubRule: false,
    }),
  });

  await saveMessageReceipt(params.db, {
    messageId: message.id,
    guildId: params.guildId,
    channelId: params.channelId,
    mailboxAddress: params.mailboxAddress,
    emailId: params.email.id,
    fromAddress: params.email.from,
    subject: params.email.subject,
  });
}
