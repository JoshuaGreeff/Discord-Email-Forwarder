import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SlashCommandBuilder,
} from "discord.js";
import { Database } from "../../db/client";
import { listRules, upsertRule } from "../../db/rules";
import { listChannelSettings, normalizeAddress } from "../../db/settings";

export const data = new SlashCommandBuilder()
  .setName("set-rule")
  .setDescription("Create or update a skip rule for a mailbox.")
  .addStringOption((option) =>
    option.setName("mailbox_address").setDescription("Mailbox address to filter.").setRequired(true)
  );

export async function handleSetRule(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
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
    await interaction.reply({ content: "You need the Manage Server permission to run /set-rule.", flags: MessageFlags.Ephemeral });
    return;
  }

  const mailboxAddress = interaction.options.getString("mailbox_address", true);
  const normalizedMailbox = normalizeAddress(mailboxAddress);
  const setting = (await listChannelSettings(db)).find(
    (s) => s.guildId === interaction.guildId && normalizeAddress(s.mailboxAddress) === normalizedMailbox
  );

  if (!setting) {
    await interaction.reply({
      content: "Mailbox not found in this server. Configure it with /setup first.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`setrule-modal:${setting.channelId}:${encodeURIComponent(setting.mailboxAddress)}`)
    .setTitle("Create / Update Rule");

  const friendlyInput = new TextInputBuilder()
    .setCustomId("friendly_name")
    .setLabel("Friendly name")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const senderInput = new TextInputBuilder()
    .setCustomId("sender_email")
    .setLabel("Exact sender email to skip")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const titleInput = new TextInputBuilder()
    .setCustomId("title_contains")
    .setLabel("Subject contains (optional)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(friendlyInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(senderInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput)
  );

  await interaction.showModal(modal);
}

export async function handleSetRuleModal(interaction: any, db: Database): Promise<void> {
  if (!interaction.guildId) return;

  const [channelId, mailboxEncoded] = interaction.customId.replace("setrule-modal:", "").split(":");
  const mailboxAddress = decodeURIComponent(mailboxEncoded ?? "");
  const normalizedMailbox = normalizeAddress(mailboxAddress);
  const setting = (await listChannelSettings(db)).find(
    (s) => s.guildId === interaction.guildId && normalizeAddress(s.mailboxAddress) === normalizedMailbox
  );

  if (!setting) {
    await interaction.reply({
      content: "Mailbox not found in this server. Configure it with /setup first.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const friendlyName = interaction.fields.getTextInputValue("friendly_name").trim();
  const senderEmail = interaction.fields.getTextInputValue("sender_email").trim();
  const titleContains = interaction.fields.getTextInputValue("title_contains").trim() || null;

  const id = await upsertRule(db, {
    guildId: interaction.guildId,
    channelId,
    mailboxAddress,
    fromAddress: senderEmail,
    subjectContains: titleContains,
    friendlyName,
  });

  const rules = await listRules(db, interaction.guildId, channelId, mailboxAddress);
  const summary = rules
    .map(
      (r) =>
        `- ${r.id}: ${r.friendlyName ?? "(unnamed)"} | from=${r.fromAddress} | title contains=${r.subjectContains ?? "*"}`
    )
    .join("\n");

  const embed = new EmbedBuilder()
    .setTitle("Rule saved")
    .setColor(0x1f8b4c)
    .addFields(
      { name: "Channel", value: `<#${channelId}>`, inline: false },
      { name: "Mailbox", value: mailboxAddress, inline: false },
      { name: "Rule", value: `${id}: ${friendlyName}`, inline: false },
      { name: "Match", value: `From: ${senderEmail}\nTitle contains: ${titleContains ?? "*"}`, inline: false },
      { name: "Current rules", value: summary || "(none)", inline: false }
    );

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}

export function isSetRuleModal(interaction: any): boolean {
  return typeof interaction.customId === "string" && interaction.customId.startsWith("setrule-modal:");
}
