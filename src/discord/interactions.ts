import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { Database } from "sqlite";
import { createRule } from "../db/rules";
import { getReceipt, markAcknowledged } from "../db/messages";

const ACK_PREFIX = "ack:";
const UNSUB_PREFIX = "unsub:";
const UNSUB_MODAL_PREFIX = "unsub-modal:";

export function buildComponents(messageId: string, disableAck: boolean, fromAddress?: string, subject?: string) {
  const ackButton = new ButtonBuilder()
    .setCustomId(`${ACK_PREFIX}${messageId}`)
    .setLabel("Acknowledge")
    .setStyle(ButtonStyle.Success)
    .setDisabled(disableAck);

  const unsubButton = new ButtonBuilder()
    .setCustomId(`${UNSUB_PREFIX}${messageId}`)
    .setLabel("Unsubscribe")
    .setStyle(ButtonStyle.Danger);

  return [new ActionRowBuilder<ButtonBuilder>().addComponents(ackButton, unsubButton)];
}

export async function handleAck(interaction: ButtonInteraction, db: Database): Promise<void> {
  const messageId = interaction.customId.replace(ACK_PREFIX, "");
  const receipt = await getReceipt(db, messageId);
  if (!receipt) {
    await interaction.reply({ content: "No tracking found for this message.", ephemeral: true });
    return;
  }

  if (receipt.acknowledgedBy) {
    await interaction.reply({
      content: `Already acknowledged by <@${receipt.acknowledgedBy}>.`,
      ephemeral: true,
    });
    return;
  }

  const userId = interaction.user.id;
  await markAcknowledged(db, messageId, userId);

  const baseEmbed = interaction.message.embeds[0] ?? new EmbedBuilder();
  const updatedFooter = `Acknowledged by ${interaction.user.username}`;
  const updatedEmbed = EmbedBuilder.from(baseEmbed).setFooter({ text: updatedFooter });

  await interaction.update({
    embeds: [updatedEmbed],
    components: buildComponents(messageId, true, receipt.fromAddress, receipt.subject),
  });
}

export async function handleUnsubscribe(interaction: ButtonInteraction, db: Database): Promise<void> {
  const messageId = interaction.customId.replace(UNSUB_PREFIX, "");
  const receipt = await getReceipt(db, messageId);
  if (!receipt) {
    await interaction.reply({ content: "No tracking found for this message.", ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`${UNSUB_MODAL_PREFIX}${messageId}`)
    .setTitle("Unsubscribe rule");

  const fromInput = new TextInputBuilder()
    .setCustomId("from_address")
    .setLabel("From address (exact match)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(receipt.fromAddress ?? "");

  const subjectInput = new TextInputBuilder()
    .setCustomId("subject_contains")
    .setLabel("Subject contains")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(receipt.subject ?? "");

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
    await interaction.reply({ content: "No tracking found for this message.", ephemeral: true });
    return;
  }

  const fromAddress = interaction.fields.getTextInputValue("from_address").trim();
  const subjectContains = interaction.fields.getTextInputValue("subject_contains").trim();

  await createRule(db, {
    guildId: receipt.guildId,
    channelId: receipt.channelId,
    fromAddress: fromAddress || undefined,
    subjectContains: subjectContains || undefined,
  });

  await interaction.reply({
    content: "Rule saved. Future emails matching this sender AND subject substring will be skipped.",
    ephemeral: true,
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
