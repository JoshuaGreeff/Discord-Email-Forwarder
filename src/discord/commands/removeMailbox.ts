import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
  SlashCommandBuilder,
} from "discord.js";
import { Database } from "../../db/client";
import { deleteChannelSettings, listChannelSettings, normalizeAddress } from "../../db/settings";
import { deleteRulesForMailbox } from "../../db/rules";

export const data = new SlashCommandBuilder()
  .setName("remove-mailbox")
  .setDescription("Remove a mailbox configuration from a channel.")
  .addStringOption((option) =>
    option.setName("mailbox_address").setDescription("Mailbox address to remove.").setRequired(true)
  );

export async function handleRemoveMailbox(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
    return;
  }

  const member = interaction.member;
  const hasAdmin =
    member &&
    typeof member !== "string" &&
    (member.permissions as PermissionsBitField).has(PermissionsBitField.Flags.ManageGuild);

  if (!hasAdmin) {
    await interaction.reply({
      content: "You need the Manage Server permission to run /remove-mailbox.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const mailboxAddress = interaction.options.getString("mailbox_address", true);
  const normalizedMailbox = normalizeAddress(mailboxAddress);
  const existing = (await listChannelSettings(db)).find(
    (s) => s.guildId === interaction.guildId && normalizeAddress(s.mailboxAddress) === normalizedMailbox
  );
  if (!existing) {
    await interaction.reply({
      content: "No settings found for that mailbox. Nothing to remove.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const removedRules = await deleteRulesForMailbox(db, interaction.guildId, existing.channelId, mailboxAddress);
  const removedSettings = await deleteChannelSettings(db, interaction.guildId, existing.channelId, mailboxAddress);

  const embed = new EmbedBuilder()
    .setTitle("Mailbox removed")
    .setColor(0xe67e22)
    .addFields(
      { name: "Channel", value: `<#${existing.channelId}>`, inline: false },
      { name: "Mailbox", value: mailboxAddress, inline: false },
      { name: "Rules removed", value: `${removedRules}`, inline: false }
    );

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });

  if (!removedSettings) {
    await interaction.followUp({
      content: "Warning: mailbox removal may not have completed as expected.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
