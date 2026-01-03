import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { Database } from "../../db/client";

export const data = new SlashCommandBuilder().setName("help").setDescription("Show available commands and what they do.");

export async function handleHelp(interaction: ChatInputCommandInteraction, _db: Database): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle("Help")
    .setColor(0x1abc9c)
    .addFields(
      { name: "/setup", value: "Configure a channel + mailbox (app-only). Verifies access before saving." },
      { name: "/update", value: "Update an existing channel + mailbox configuration." },
      { name: "/settings", value: "View current settings (filter by channel/mailbox optional)." },
      { name: "/set-rule", value: "Add a skip rule (sender + optional subject contains)." },
      { name: "/remove-rule", value: "Remove an existing skip rule via selector." },
      { name: "/remove-mailbox", value: "Delete a mailbox binding from a channel and its rules." },
      { name: "/history", value: "Show acknowledged emails (last 30 days) with filters." }
    );

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}
