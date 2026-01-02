import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { Database } from "../db/client";
import { createRule, getRuleById, listRulesForChannel, updateRule } from "../db/rules";
import { getReceipt, markAcknowledged, setUnsubscribed } from "../db/messages";

const ACK_PREFIX = "ack:";
const UNSUB_PREFIX = "unsub:";
const UNSUB_MODAL_PREFIX = "unsub-modal:";
const RULES_PREFIX = "rules:";

function buildFooter(receipt: { acknowledgedBy?: string; unsubscribedBy?: string }): string {
  const parts: string[] = [];
  if (receipt.acknowledgedBy) parts.push(`Acknowledged by <@${receipt.acknowledgedBy}>`);
  if (receipt.unsubscribedBy) parts.push(`Unsubscribed by <@${receipt.unsubscribedBy}>`);
  if (!parts.length) return "Awaiting acknowledgement";
  return parts.join(" | ");
}

export function buildComponents(params: { messageId: string; disableAck: boolean; hasUnsubRule: boolean }) {
  const ackButton = new ButtonBuilder()
    .setCustomId(`${ACK_PREFIX}${params.messageId}`)
    .setLabel("Acknowledge")
    .setStyle(ButtonStyle.Success)
    .setDisabled(params.disableAck);

  const unsubButton = new ButtonBuilder()
    .setCustomId(`${UNSUB_PREFIX}${params.messageId}`)
    .setLabel(params.hasUnsubRule ? "Edit rule" : "Unsubscribe")
    .setStyle(params.hasUnsubRule ? ButtonStyle.Primary : ButtonStyle.Danger);

  const rulesButton = new ButtonBuilder()
    .setCustomId(`${RULES_PREFIX}${params.messageId}`)
    .setEmoji("⚙️")
    .setLabel("Rules")
    .setStyle(ButtonStyle.Secondary);

  return [new ActionRowBuilder<ButtonBuilder>().addComponents(ackButton, unsubButton, rulesButton)];
}

export async function handleAck(interaction: ButtonInteraction, db: Database): Promise<void> {
  const messageId = interaction.customId.replace(ACK_PREFIX, "");
  const receipt = await getReceipt(db, messageId);
  if (!receipt) {
    await interaction.reply({ content: "No tracking found for this message.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (receipt.acknowledgedBy) {
    await interaction.reply({
      content: `Already acknowledged by <@${receipt.acknowledgedBy}>.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const userId = interaction.user.id;
  await markAcknowledged(db, messageId, userId);

  const baseEmbed = interaction.message.embeds[0] ?? new EmbedBuilder();
  const updatedFooter = buildFooter({ acknowledgedBy: userId, unsubscribedBy: receipt.unsubscribedBy });
  const updatedEmbed = EmbedBuilder.from(baseEmbed).setFooter({ text: updatedFooter });

  await interaction.update({
    embeds: [updatedEmbed],
    components: buildComponents({
      messageId,
      disableAck: true,
      hasUnsubRule: Boolean(receipt.unsubRuleId),
    }),
  });
}

export async function handleUnsubscribe(interaction: ButtonInteraction, db: Database): Promise<void> {
  const messageId = interaction.customId.replace(UNSUB_PREFIX, "");
  const receipt = await getReceipt(db, messageId);
  if (!receipt) {
    await interaction.reply({ content: "No tracking found for this message.", flags: MessageFlags.Ephemeral });
    return;
  }

  const existingRule = receipt.unsubRuleId
    ? getRuleById(db, receipt.guildId, receipt.channelId, receipt.unsubRuleId)
    : null;

  const modal = new ModalBuilder()
    .setCustomId(`${UNSUB_MODAL_PREFIX}${messageId}`)
    .setTitle(existingRule ? "Update unsubscribe rule" : "Unsubscribe rule");

  const fromInput = new TextInputBuilder()
    .setCustomId("from_address")
    .setLabel("From address (exact match)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(existingRule?.fromAddress ?? receipt.fromAddress ?? "");

  const subjectInput = new TextInputBuilder()
    .setCustomId("subject_contains")
    .setLabel("Subject contains")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(existingRule?.subjectContains ?? receipt.subject ?? "");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(fromInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(subjectInput)
  );

  await interaction.showModal(modal);
}

export async function handleUnsubscribeModal(interaction: ModalSubmitInteraction, db: Database): Promise<void> {
  const messageId = interaction.customId.replace(UNSUB_MODAL_PREFIX, "");
  const receipt = await getReceipt(db, messageId);
  if (!receipt) {
    await interaction.reply({ content: "No tracking found for this message.", flags: MessageFlags.Ephemeral });
    return;
  }

  const fromAddress = interaction.fields.getTextInputValue("from_address").trim();
  const subjectContains = interaction.fields.getTextInputValue("subject_contains").trim();

  const existingRuleId = receipt.unsubRuleId;
  let ruleId = existingRuleId;

  if (existingRuleId !== undefined && getRuleById(db, receipt.guildId, receipt.channelId, existingRuleId)) {
    const updated = await updateRule(db, receipt.guildId, receipt.channelId, existingRuleId, {
      fromAddress: fromAddress || undefined,
      subjectContains: subjectContains || undefined,
    });
    if (!updated) {
      ruleId = await createRule(db, {
        guildId: receipt.guildId,
        channelId: receipt.channelId,
        fromAddress: fromAddress || undefined,
        subjectContains: subjectContains || undefined,
      });
    }
  } else {
    ruleId = await createRule(db, {
      guildId: receipt.guildId,
      channelId: receipt.channelId,
      fromAddress: fromAddress || undefined,
      subjectContains: subjectContains || undefined,
    });
  }

  if (ruleId === undefined) {
    await interaction.reply({
      content: "Unable to save rule. Please try again.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await setUnsubscribed(db, messageId, ruleId, interaction.user.id);

  const baseEmbed = interaction.message?.embeds[0] ?? new EmbedBuilder();
  const footerText = buildFooter({ acknowledgedBy: receipt.acknowledgedBy, unsubscribedBy: interaction.user.id });
  const updatedEmbed = EmbedBuilder.from(baseEmbed).setFooter({ text: footerText });

  if (interaction.message && interaction.message.editable) {
    await interaction.message.edit({
      embeds: [updatedEmbed],
      components: buildComponents({
        messageId,
        disableAck: Boolean(receipt.acknowledgedBy),
        hasUnsubRule: true,
      }),
    });
  }

  await interaction.reply({
    content: `Rule ${ruleId} saved. Future emails matching this sender AND subject substring will be skipped.`,
    flags: MessageFlags.Ephemeral,
  });
}

export function isAck(interaction: ButtonInteraction): boolean {
  return interaction.customId.startsWith(ACK_PREFIX);
}

export function isUnsub(interaction: ButtonInteraction): boolean {
  return interaction.customId.startsWith(UNSUB_PREFIX);
}

export function isUnsubModal(interaction: ModalSubmitInteraction): boolean {
  return interaction.customId.startsWith(UNSUB_MODAL_PREFIX);
}

export function isShowRules(interaction: ButtonInteraction): boolean {
  return interaction.customId.startsWith(RULES_PREFIX);
}

export async function handleShowRules(interaction: ButtonInteraction, db: Database): Promise<void> {
  const messageId = interaction.customId.replace(RULES_PREFIX, "");
  const receipt = await getReceipt(db, messageId);
  if (!receipt) {
    await interaction.reply({ content: "No tracking found for this message.", flags: MessageFlags.Ephemeral });
    return;
  }

  const rules = await listRulesForChannel(db, receipt.guildId, receipt.channelId);
  if (!rules.length) {
    await interaction.reply({
      content: "No unsubscribe rules for this channel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lines = rules.map(
    (r) => `- ${r.id}: from=${r.fromAddress || "*"} | subject contains=${r.subjectContains || "*"}`
  );

  await interaction.reply({
    content: ["Unsubscribe rules for this channel:", ...lines].join("\n"),
    flags: MessageFlags.Ephemeral,
  });
}
