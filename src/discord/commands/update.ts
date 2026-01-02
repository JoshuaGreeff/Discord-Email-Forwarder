import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionsBitField,
  SlashCommandBuilder,
} from "discord.js";
import { Database } from "../../db/client";
import { getChannelSettings, upsertChannelSettings } from "../../db/settings";

const POLL_CRON_FIXED = "*/5 * * * *";

export const data = new SlashCommandBuilder()
  .setName("update")
  .setDescription("Update channel email forwarding settings.")
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription("Channel that is already configured.")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true)
  )
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

  const channel = interaction.options.getChannel("channel", true);
  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
    await interaction.reply({ content: "Channel must be a text or announcement channel.", flags: MessageFlags.Ephemeral });
    return;
  }

  const targetMailbox = interaction.options.getString("mailbox_address", true);
  const existing = await getChannelSettings(db, interaction.guildId, channel.id, targetMailbox);
  if (!existing) {
    await interaction.reply({
      content: "No settings found for that channel + mailbox. Run /setup first.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const updated = {
    guildId: interaction.guildId,
    channelId: channel.id,
    mailboxAddress: existing.mailboxAddress,
    mailboxUser: interaction.options.getString("mailbox_alias") ?? existing.mailboxUser ?? existing.mailboxAddress,
    tenantId: interaction.options.getString("tenant_id") ?? existing.tenantId,
    clientId: interaction.options.getString("client_id") ?? existing.clientId,
    clientSecret: interaction.options.getString("client_secret") ?? existing.clientSecret,
    redirectUri: existing.redirectUri ?? "app-only",
    accessToken: existing.accessToken,
    refreshToken: existing.refreshToken,
    expiresAt: existing.expiresAt,
    pollCron: POLL_CRON_FIXED,
  };

  const credentialsChanged =
    updated.tenantId !== existing.tenantId ||
    updated.clientId !== existing.clientId ||
    updated.clientSecret !== existing.clientSecret;

  if (credentialsChanged) {
    updated.accessToken = undefined;
    updated.refreshToken = undefined;
    updated.expiresAt = undefined;
  }

  await upsertChannelSettings(db, updated);

  const maskedSecret =
    updated.clientSecret && updated.clientSecret.length > 6
      ? `${updated.clientSecret.slice(0, 6)}***`
      : "(hidden)";
  await interaction.reply({
    content: [
      `Updated settings for <#${channel.id}>.`,
      `Mailbox: ${updated.mailboxAddress}`,
      `Service account: ${updated.mailboxUser}`,
      `Tenant: ${updated.tenantId}`,
      `Client ID: ${updated.clientId}`,
      `Client Secret: ${maskedSecret}`,
      `Cron: ${updated.pollCron} (fixed)`,
      "App-only access tokens will refresh automatically when needed.",
    ].join("\n"),
    flags: MessageFlags.Ephemeral,
  });
}
