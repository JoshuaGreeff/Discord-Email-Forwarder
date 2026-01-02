import {
  ChannelType,
  Client,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import { Database } from "sqlite";
import { saveMessageReceipt } from "../db/messages";
import { MailMessage } from "../graph/mail";
import { buildComponents } from "./interactions";

export async function postEmailToChannel(params: {
  client: Client;
  db: Database;
  guildId: string;
  channelId: string;
  email: MailMessage;
}): Promise<void> {
  const channel = await params.client.channels.fetch(params.channelId);
  if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
    return;
  }

  const bodyPreview = params.email.body.length > 1800 ? `${params.email.body.slice(0, 1800)}…` : params.email.body;
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
    components: buildComponents("pending", false, params.email.from, params.email.subject),
  });

  // Now that we have the Discord message ID, rebuild components with the real ID
  await message.edit({
    components: buildComponents(message.id, false, params.email.from, params.email.subject),
  });

  await saveMessageReceipt(params.db, {
    messageId: message.id,
    guildId: params.guildId,
    channelId: params.channelId,
    emailId: params.email.id,
    fromAddress: params.email.from,
    subject: params.email.subject,
  });
}
