import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionsBitField,
  SlashCommandBuilder,
} from "discord.js";
import { Database } from "sqlite";
import { getChannelSettings, upsertChannelSettings } from "../../db/settings";

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
    option.setName("mailbox_address").setDescription("Shared mailbox address.").setRequired(false)
  )
  .addStringOption((option) =>
    option.setName("mailbox_user").setDescription("Service account UPN.").setRequired(false)
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
  .addStringOption((option) =>
    option.setName("redirect_uri").setDescription("OAuth redirect URI.").setRequired(false)
  )
  .addStringOption((option) =>
    option.setName("poll_cron").setDescription("Cron expression for polling.").setRequired(false)
  );

export async function handleUpdate(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }

  const member = interaction.member;
  const hasAdmin =
    member &&
    typeof member !== "string" &&
    (member.permissions as PermissionsBitField).has(PermissionsBitField.Flags.ManageGuild);

  if (!hasAdmin) {
    await interaction.reply({ content: "You need the Manage Server permission to run /update.", ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel("channel", true);
  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
    await interaction.reply({ content: "Channel must be a text or announcement channel.", ephemeral: true });
    return;
  }

  const existing = await getChannelSettings(db, interaction.guildId, channel.id);
  if (!existing) {
    await interaction.reply({
      content: "No settings found for that channel. Run /setup first.",
      ephemeral: true,
    });
    return;
  }

  const updated = {
    guildId: interaction.guildId,
    channelId: channel.id,
    mailboxAddress: interaction.options.getString("mailbox_address") ?? existing.mailboxAddress,
    mailboxUser: interaction.options.getString("mailbox_user") ?? existing.mailboxUser,
    tenantId: interaction.options.getString("tenant_id") ?? existing.tenantId,
    clientId: interaction.options.getString("client_id") ?? existing.clientId,
    clientSecret: interaction.options.getString("client_secret") ?? existing.clientSecret,
    redirectUri: interaction.options.getString("redirect_uri") ?? existing.redirectUri,
    accessToken: existing.accessToken,
    refreshToken: existing.refreshToken,
    expiresAt: existing.expiresAt,
    pollCron: interaction.options.getString("poll_cron") ?? existing.pollCron,
  };

  await upsertChannelSettings(db, updated);

  const maskedSecret = `${updated.clientSecret.slice(0, 6)}…`;
  await interaction.reply({
    content: [
      `Updated settings for <#${channel.id}>.`,
      `Mailbox: ${updated.mailboxAddress}`,
      `Service account: ${updated.mailboxUser}`,
      `Tenant: ${updated.tenantId}`,
      `Client ID: ${updated.clientId}`,
      `Client Secret: ${maskedSecret}`,
      `Redirect URI: ${updated.redirectUri}`,
      `Cron: ${updated.pollCron}`,
      "Re-run the OAuth link if client/secret/tenant/redirect changed.",
    ].join("\n"),
    ephemeral: true,
  });
}
