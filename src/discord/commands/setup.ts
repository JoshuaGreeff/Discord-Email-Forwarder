import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionsBitField,
  SlashCommandBuilder,
} from "discord.js";
import { Database } from "../../db/client";
import { upsertChannelSettings } from "../../db/settings";

const APP_ONLY_REDIRECT_PLACEHOLDER = "app-only";
const POLL_CRON_FIXED = "*/5 * * * *";

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
  const mailboxAlias = interaction.options.getString("mailbox_alias") ?? mailboxAddress;
  const tenantId = interaction.options.getString("tenant_id", true);
  const clientId = interaction.options.getString("client_id", true);
  const clientSecret = interaction.options.getString("client_secret", true);
  const pollCron = POLL_CRON_FIXED;

  await upsertChannelSettings(db, {
    guildId: interaction.guildId,
    channelId: channel.id,
    mailboxAddress,
    mailboxUser: mailboxAlias,
    tenantId,
    clientId,
    clientSecret,
    redirectUri: APP_ONLY_REDIRECT_PLACEHOLDER,
    pollCron,
  });

  await interaction.reply({
    content: [
      `Saved config for <#${channel.id}>.`,
      "Using Azure app-only permissions. Tokens will be issued automatically with the provided tenant/client/secret.",
      "Ensure the app has Mail.Read (application) permission and access to the mailbox (via an application access policy or full access).",
      `Polling schedule: ${pollCron}`,
    ].join("\n"),
    flags: MessageFlags.Ephemeral,
  });
}
