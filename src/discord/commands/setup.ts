import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionsBitField,
  SlashCommandBuilder,
} from "discord.js";
import { Database } from "sqlite";
import { upsertChannelSettings } from "../../db/settings";
import { getAuthUrl } from "../../graph/auth";

export const data = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Configure a channel to receive Microsoft 365 emails.")
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
    option
      .setName("mailbox_user")
      .setDescription("Service account UPN that has access to the shared mailbox.")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("tenant_id")
      .setDescription("Azure AD tenant ID.")
      .setRequired(true)
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
  .addStringOption((option) =>
    option
      .setName("redirect_uri")
      .setDescription("OAuth redirect URI configured on the Azure app (default: http://localhost:3000/auth/callback).")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("poll_cron")
      .setDescription("Cron expression for mailbox polling (default */2 * * * *).")
      .setRequired(false)
  );

export async function handleSetup(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
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
    await interaction.reply({ content: "You need the Manage Server permission to run /setup.", ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel("channel", true);
  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
    await interaction.reply({ content: "Channel must be a text or announcement channel.", ephemeral: true });
    return;
  }

  const mailboxAddress = interaction.options.getString("mailbox_address", true);
  const mailboxUser = interaction.options.getString("mailbox_user", true);
  const tenantId = interaction.options.getString("tenant_id", true);
  const clientId = interaction.options.getString("client_id", true);
  const clientSecret = interaction.options.getString("client_secret", true);
  const redirectUri =
    interaction.options.getString("redirect_uri") ?? "http://localhost:3000/auth/callback";
  const pollCron = interaction.options.getString("poll_cron") ?? "*/2 * * * *";

  const state = Buffer.from(`${interaction.guildId}:${channel.id}`).toString("base64url");
  const authUrl = getAuthUrl({
    tenantId,
    clientId,
    redirectUri,
    state,
  });

  await upsertChannelSettings(db, {
    guildId: interaction.guildId,
    channelId: channel.id,
    mailboxAddress,
    mailboxUser,
    tenantId,
    clientId,
    clientSecret,
    redirectUri,
    pollCron,
  });

  await interaction.reply({
    content: [
      `Saved config for <#${channel.id}>.`,
      "Authorize the mailbox reader using the link below, then the bot will start polling:",
      authUrl,
    ].join("\n"),
    ephemeral: true,
  });
}
