import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
  SlashCommandBuilder,
} from "discord.js";
import { Database } from "../../db/client";
import { DEFAULT_ACK_EXPIRY_DAYS, listChannelSettings, normalizeAddress, upsertChannelSettings } from "../../db/settings";
import { getResourceStore, getResourceById, upsertResource } from "../../db/resources";
import { verifyMailboxAccess } from "../../mail/verify";

const POLL_CRON_FIXED = "*/5 * * * *";

export const data = new SlashCommandBuilder()
  .setName("update")
  .setDescription("Update channel email forwarding settings.")
  .addStringOption((option) =>
    option.setName("mailbox_address").setDescription("Shared mailbox address to update.").setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("mailbox_alias")
      .setDescription("Friendly mailbox label (shown in Discord).")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option.setName("tenant_id").setDescription("Azure AD tenant ID.").setRequired(false)
  )
  .addStringOption((option) =>
    option.setName("client_id").setDescription("Azure app registration client ID.").setRequired(false)
  )
  .addStringOption((option) =>
    option.setName("client_secret").setDescription("Azure app client secret.").setRequired(false)
  )
  .addBooleanOption((option) =>
    option
      .setName("check_junk")
      .setDescription("Also poll the Junk folder (default follows current setting).")
      .setRequired(false)
  )
  .addIntegerOption((option) =>
    option
      .setName("ack_expiry_days")
      .setDescription("Days before auto-ack (default 5). Set 0 to never auto-ack.")
      .setMinValue(0)
      .setRequired(false)
  );

export async function handleUpdate(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
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
    await interaction.reply({ content: "You need the Manage Server permission to run /update.", flags: MessageFlags.Ephemeral });
    return;
  }

  const targetMailbox = interaction.options.getString("mailbox_address", true);
  const normalizedMailbox = normalizeAddress(targetMailbox);
  const existing = (await listChannelSettings(db)).find(
    (s) => s.guildId === interaction.guildId && normalizeAddress(s.mailboxAddress) === normalizedMailbox
  );
  if (!existing) {
    await interaction.reply({
      content: "No settings found for that mailbox. Run /setup first.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const resources = await getResourceStore();
  const resource = getResourceById(resources, existing.resourceId);
  if (!resource) {
    await interaction.reply({
      content: "Mailbox credentials missing. Please re-run /setup for this mailbox.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const tenantId = interaction.options.getString("tenant_id") ?? resource.tenantId;
  const clientId = interaction.options.getString("client_id") ?? resource.clientId;
  const clientSecret = interaction.options.getString("client_secret") ?? resource.clientSecret;
  const mailboxUser =
    interaction.options.getString("mailbox_alias") ??
    existing.mailboxUser ??
    existing.mailboxAddress.split("@")[0] ??
    existing.mailboxAddress;
  const ackExpiryDays = interaction.options.getInteger("ack_expiry_days") ?? existing.ackExpiryDays ?? DEFAULT_ACK_EXPIRY_DAYS;
  const checkJunk = interaction.options.getBoolean("check_junk") ?? existing.checkJunk ?? false;

  const verifyResult = await verifyMailboxAccess({
    tenantId,
    clientId,
    clientSecret,
    mailboxAddress: existing.mailboxAddress,
  });

  if (!verifyResult.ok) {
    await interaction.reply({
      content: `Unable to verify mailbox access with updated credentials: ${verifyResult.error}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await upsertResource(resources, {
    ...resource,
    tenantId,
    clientId,
    clientSecret,
    accessToken: verifyResult.tokens?.accessToken ?? null,
    expiresAt: verifyResult.tokens?.expiresAt ?? null,
  });

  await upsertChannelSettings(db, {
    guildId: interaction.guildId,
    channelId: existing.channelId,
    mailboxAddress: existing.mailboxAddress,
    mailboxUser,
    pollCron: POLL_CRON_FIXED,
    ackExpiryDays,
    checkJunk,
    resourceId: resource.id,
  });

  const mask = (value?: string) =>
    value && value.length > 6 ? `${value.slice(0, 5)}***` : "(hidden)";
  const maskedSecret = mask(clientSecret);
  const maskedTenant = mask(tenantId);
  const maskedClient = mask(clientId);
  const ackText = ackExpiryDays === 0 ? "never (manual only)" : `${ackExpiryDays} day(s)`;
  const embed = new EmbedBuilder()
    .setTitle("Settings updated")
    .setColor(0x3498db)
    .addFields(
      { name: "Channel", value: `<#${existing.channelId}>`, inline: false },
      { name: "Mailbox", value: existing.mailboxAddress, inline: false },
      { name: "Alias", value: mailboxUser, inline: false },
      { name: "Tenant / Client", value: `${maskedTenant}\n${maskedClient}`, inline: false },
      { name: "Secret", value: maskedSecret, inline: false },
      { name: "Polling", value: `${POLL_CRON_FIXED} (Junk: ${checkJunk ? "on" : "off"})`, inline: false },
      { name: "Ack", value: `Auto after: ${ackText}\nHistory: 30 days`, inline: false }
    );

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}
