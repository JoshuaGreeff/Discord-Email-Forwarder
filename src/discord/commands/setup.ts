import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionsBitField,
  SlashCommandBuilder,
} from "discord.js";
import { Database } from "../../db/client";
import { DEFAULT_ACK_EXPIRY_DAYS, listChannelSettings, upsertChannelSettings } from "../../db/settings";
import { findResourceByMailbox, upsertResource } from "../../db/resources";
import { verifyMailboxAccess } from "../../mail/verify";
import { EmbedBuilder } from "discord.js";
import { POLL_INTERVAL_MINUTES } from "../../config/poll";

export const data = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Configure a channel to receive Microsoft 365 emails using app-only auth.")
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription("Channel that will receive forwarded email notifications.")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("mailbox_address")
      .setDescription("The shared mailbox address to read from.")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("tenant_id").setDescription("Azure AD tenant ID.").setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("client_id")
      .setDescription("Azure app registration client ID.")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("client_secret")
      .setDescription("Azure app registration client secret.")
      .setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName("ack_expiry_days")
      .setDescription("Days before auto-ack (default 5). Set 0 to never auto-ack.")
      .setMinValue(0)
      .setRequired(false)
  )
  .addBooleanOption((option) =>
    option
      .setName("check_junk")
      .setDescription("Also poll the Junk folder (default: false).")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("mailbox_alias")
      .setDescription("Optional friendly alias shown in acknowledgements.")
      .setRequired(false)
  );

export async function handleSetup(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
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
    await interaction.reply({ content: "You need the Manage Server permission to run /setup.", flags: MessageFlags.Ephemeral });
    return;
  }

  const channel = interaction.options.getChannel("channel", true);
  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
    await interaction.reply({ content: "Channel must be a text or announcement channel.", flags: MessageFlags.Ephemeral });
    return;
  }

  const mailboxAddress = interaction.options.getString("mailbox_address", true);
  const mailboxAlias =
    interaction.options.getString("mailbox_alias") ??
    mailboxAddress.split("@")[0] ??
    mailboxAddress;
  const tenantId = interaction.options.getString("tenant_id", true);
  const clientId = interaction.options.getString("client_id", true);
  const clientSecret = interaction.options.getString("client_secret", true);
  const ackExpiryDays = interaction.options.getInteger("ack_expiry_days") ?? undefined;
  const checkJunk = interaction.options.getBoolean("check_junk") ?? false;

  const existingResource = await findResourceByMailbox(db, mailboxAddress);
  if (existingResource) {
    const settings = await listChannelSettings(db);
    const inUse = settings.find((setting) => setting.resourceId === existingResource.id && setting.channelId !== channel.id);
    if (inUse) {
      await interaction.reply({
        content: "This mailbox is already configured for another channel. Please remove it there first.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  const verifyResult = await verifyMailboxAccess({
    tenantId,
    clientId,
    clientSecret,
    mailboxAddress,
  });

  if (!verifyResult.ok) {
    await interaction.reply({
      content: `Unable to verify mailbox access: ${verifyResult.error}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const resource = await upsertResource(db, {
    id: existingResource?.id ?? mailboxAddress.toLowerCase(),
    mailboxAddress,
    tenantId,
    clientId,
    clientSecret,
    accessToken: verifyResult.tokens?.accessToken ?? null,
    expiresAt: verifyResult.tokens?.expiresAt ?? null,
  });

  await upsertChannelSettings(db, {
    guildId: interaction.guildId,
    channelId: channel.id,
    mailboxAddress,
    mailboxUser: mailboxAlias,
    resourceId: resource.id,
    ackExpiryDays,
    checkJunk,
  });

  const ackText = ackExpiryDays === 0 ? "never (manual only)" : `${ackExpiryDays ?? DEFAULT_ACK_EXPIRY_DAYS} day(s)`;
  const mask = (value?: string) =>
    value && value.length > 6 ? `${value.slice(0, 5)}***` : "(hidden)";
  const maskedTenant = mask(tenantId);
  const maskedClient = mask(clientId);

  const embed = new EmbedBuilder()
    .setTitle("Channel configured")
    .setColor(0x2ecc71)
    .addFields(
      { name: "Channel", value: `<#${channel.id}>`, inline: false },
      { name: "Mailbox", value: mailboxAddress, inline: false },
      { name: "Alias", value: mailboxAlias, inline: false },
      { name: "Polling", value: `Every ${POLL_INTERVAL_MINUTES} minutes (Junk: ${checkJunk ? "on" : "off"})`, inline: false },
      { name: "Tenant / Client", value: `${maskedTenant}\n${maskedClient}`, inline: false },
      { name: "Ack", value: `Auto after: ${ackText}\nHistory: 30 days`, inline: false }
    );

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}
