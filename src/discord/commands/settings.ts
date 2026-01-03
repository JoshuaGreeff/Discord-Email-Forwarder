import {
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { Database } from "../../db/client";
import { listChannelSettings } from "../../db/settings";
import { listRules } from "../../db/rules";
import { POLL_INTERVAL_MINUTES } from "../../config/poll";

export const data = new SlashCommandBuilder()
  .setName("settings")
  .setDescription("Show current settings for this server (optionally filter by channel/mailbox).")
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription("Filter by configured channel.")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(false)
  )
  .addStringOption((option) =>
    option.setName("mailbox_address").setDescription("Filter by mailbox address.").setRequired(false)
  );

export async function handleSettings(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
    return;
  }

  const filterChannel = interaction.options.getChannel("channel");
  const filterMailbox = interaction.options.getString("mailbox_address")?.toLowerCase();

  const settings = (await listChannelSettings(db)).filter(
    (s) =>
      s.guildId === interaction.guildId &&
      (!filterChannel || s.channelId === filterChannel.id) &&
      (!filterMailbox || s.mailboxAddress.toLowerCase() === filterMailbox)
  );

  if (!settings.length) {
    await interaction.reply({
      content: "No settings found for that scope.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lines: string[] = [];
  for (const setting of settings) {
    const rules = listRules(db, setting.guildId, setting.channelId, setting.mailboxAddress);
    const ackText = setting.ackExpiryDays === 0 ? "never (manual only)" : `${setting.ackExpiryDays ?? 5} day(s)`;

    lines.push(
      [
        `Channel: <#${setting.channelId}>`,
        `Mailbox: ${setting.mailboxAddress} (${setting.mailboxUser})`,
        `Polling: Every ${POLL_INTERVAL_MINUTES} minutes (Junk: ${setting.checkJunk ? "on" : "off"})`,
        `Ack expiry: ${ackText}`,
        `Rules: ${rules.length ? rules.map((r) => `${r.id}:${r.friendlyName ?? r.fromAddress}`).join(", ") : "none"}`,
      ].join("\n")
    );
  }

  const embed = new EmbedBuilder()
    .setTitle("Current settings")
    .setColor(0x9b59b6)
    .setDescription(lines.join("\n\n"));

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}
