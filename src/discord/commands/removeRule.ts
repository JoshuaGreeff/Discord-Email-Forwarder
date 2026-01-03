import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionsBitField,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { Database } from "../../db/client";
import { deleteRule, listRules } from "../../db/rules";
import { listChannelSettings, normalizeAddress } from "../../db/settings";

const REMOVE_RULE_PREFIX = "remove-rule:";

export const data = new SlashCommandBuilder()
  .setName("remove-rule")
  .setDescription("Remove a skip rule for a mailbox.")
  .addStringOption((option) =>
    option.setName("mailbox_address").setDescription("Mailbox address to filter.").setRequired(true)
  );

export async function handleRemoveRule(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
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
    await interaction.reply({ content: "You need the Manage Server permission to run /remove-rule.", flags: MessageFlags.Ephemeral });
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

  const rules = listRules(db, interaction.guildId, setting.channelId, mailboxAddress);

  if (!rules.length) {
    await interaction.reply({
      content: "No rules exist for that channel/mailbox.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${REMOVE_RULE_PREFIX}${setting.channelId}:${encodeURIComponent(mailboxAddress)}`)
    .setPlaceholder("Select a rule to remove")
    .addOptions(
      rules.slice(0, 25).map((r) => ({
        label: (r.friendlyName || r.fromAddress).slice(0, 100),
        description: `from=${r.fromAddress} | title contains=${r.subjectContains ?? "*"}`,
        value: String(r.id),
      }))
    );

  await interaction.reply({
    content: "Select a rule to remove:",
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleRemoveRuleSelect(interaction: any, db: Database): Promise<void> {
  const custom = interaction.customId.replace(REMOVE_RULE_PREFIX, "");
  const [channelId, mailboxEncoded] = custom.split(":");
  const mailboxAddress = decodeURIComponent(mailboxEncoded ?? "");
  const ruleId = Number(interaction.values[0]);

  if (!interaction.guildId) {
    await interaction.reply({ content: "Guild required.", flags: MessageFlags.Ephemeral });
    return;
  }

  const removed = await deleteRule(db, interaction.guildId, channelId, ruleId);
  if (!removed) {
    await interaction.reply({
      content: "Rule not found or already removed.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.update({
    content: `Removed rule ${ruleId} for <#${channelId}> / ${mailboxAddress}.`,
    components: [],
  });
}

export function isRemoveRuleSelect(interaction: any): boolean {
  return interaction.customId.startsWith(REMOVE_RULE_PREFIX);
}
