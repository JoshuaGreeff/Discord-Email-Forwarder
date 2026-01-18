import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { Database } from "../../db/client";

export const data = new SlashCommandBuilder().setName("help").setDescription("Show available commands and what they do.");

export function buildHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Ack help")
    .setColor(0x1abc9c)
    .setDescription("Use /ack with the commands below.")
    .addFields(
      { name: "/ack email setup", value: "Configure a channel + mailbox (app-only). Verifies access before saving." },
      { name: "/ack email update", value: "Update an existing channel + mailbox configuration." },
      { name: "/ack settings", value: "View current settings (filter by channel/mailbox optional)." },
      { name: "/ack rule create", value: "Add a skip rule (sender + optional subject contains)." },
      { name: "/ack rule remove", value: "Remove an existing skip rule via selector." },
      { name: "/ack email delete", value: "Delete a mailbox binding from a channel and its rules." },
      { name: "/ack email history", value: "Show acknowledged emails (last 30 days) with filters." }
    );
}

export async function handleHelp(interaction: ChatInputCommandInteraction, _db: Database): Promise<void> {
  const embed = buildHelpEmbed();

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}
