import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";
import { Database } from "../db/client";
import { getReceipt, markAcknowledged } from "../db/messages";
import { logger } from "../logger";

const ACK_PREFIX = "ack:";
const SHOW_MORE_PREFIX = "showmore:";
const log = logger("discord:interactions");

function buildFooter(receipt: { acknowledgedBy?: string | null; acknowledgedName?: string | null }): string {
  if (!receipt.acknowledgedBy) return "Awaiting acknowledgement";
  const name = receipt.acknowledgedName ?? `<@${receipt.acknowledgedBy}>`;
  return `Acknowledged by ${name}`;
}

function resolveDisplayName(interaction: ButtonInteraction): string | null {
  const member = interaction.member;
  if (member && typeof member !== "string") {
    const nick = (member as any).nickname ?? (member as any).nick;
    if (nick) return nick;
  }
  const user = interaction.user;
  if (user.globalName) return user.globalName;
  if (user.username) return user.username;
  return null;
}

export function buildComponents(params: { messageId: string; disableAck: boolean; showMore?: boolean }) {
  const ackButton = new ButtonBuilder()
    .setCustomId(`${ACK_PREFIX}${params.messageId}`)
    .setLabel("Acknowledge")
    .setStyle(ButtonStyle.Success)
    .setDisabled(params.disableAck);

  const components: ButtonBuilder[] = [ackButton];

  if (params.showMore) {
    components.push(
      new ButtonBuilder().setCustomId(`${SHOW_MORE_PREFIX}${params.messageId}`).setLabel("Show more").setStyle(ButtonStyle.Primary)
    );
  }

  return [new ActionRowBuilder<ButtonBuilder>().addComponents(components)];
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
  const displayName = resolveDisplayName(interaction);
  await markAcknowledged(db, messageId, userId, displayName ?? undefined);

  const ackFooter = buildFooter({ acknowledgedBy: userId, acknowledgedName: displayName });

  try {
    await interaction.deferUpdate();
  } catch (err) {
    log.warn("Failed to defer interaction after acknowledgement", { err, messageId });
  }

  let deleted = false;
  try {
    await interaction.message.delete();
    deleted = true;
  } catch (err) {
    log.warn("Failed to delete acknowledged message", { err, messageId });
  }

  if (!deleted) {
    try {
      const baseEmbed = interaction.message.embeds[0] ?? new EmbedBuilder();
      const updatedEmbed = EmbedBuilder.from(baseEmbed).setFooter({ text: ackFooter }).setDescription(null).setFields([]);
      if (interaction.message.editable) {
        await interaction.message.edit({
          embeds: [updatedEmbed],
          components: buildComponents({
            messageId,
            disableAck: true,
          }),
        });
      }
    } catch (err) {
      log.warn("Failed to update message after failed delete", { err, messageId });
    }
  }
}

export function isAck(interaction: ButtonInteraction): boolean {
  return interaction.customId.startsWith(ACK_PREFIX);
}

export function isShowMore(interaction: ButtonInteraction): boolean {
  return interaction.customId.startsWith(SHOW_MORE_PREFIX);
}

export async function handleShowMore(interaction: ButtonInteraction, db: Database): Promise<void> {
  const messageId = interaction.customId.replace(SHOW_MORE_PREFIX, "");
  const receipt = await getReceipt(db, messageId);
  if (!receipt || !receipt.bodyFull) {
    await interaction.reply({
      content: "No additional content available for this message.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const body = receipt.bodyFull.length > 3900 ? `${receipt.bodyFull.slice(0, 3900)}…` : receipt.bodyFull;

  await interaction.reply({
    content: body,
    flags: MessageFlags.Ephemeral,
  });
}
