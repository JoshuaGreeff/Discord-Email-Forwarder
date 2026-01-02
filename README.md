# Discord Email Forwarder

A Discord bot that reads emails from a Microsoft 365 shared mailbox (Azure app-only) and forwards them to Discord channels with acknowledgements and unsubscribe rules.

## Features
- `/setup` to configure a channel + mailbox + Azure app creds; app-only auth means no user OAuth links.
- `/update` to adjust settings with masked secrets; tokens refresh automatically (select the channel and mailbox to update).
- Polls each configured mailbox (application Graph access) and posts each unread email (subject + body) to the target channel. Poll runs immediately on boot, then every 5 minutes.
- Buttons on each posted email:
  - **Acknowledge**: greys out after click and records the user in the embed footer.
  - **Unsubscribe/Edit rule**: opens a modal prefilled with From/Subject; creates or edits a rule (sender match AND subject contains) to suppress future posts.
  - **Rules ⚙️**: shows all unsubscribe rules for that channel.
- Per-channel settings now support multiple mailboxes per channel; each mailbox is tracked independently.

## Quick start
1) Create an Azure app with **application** Graph permissions (Mail.Read or Mail.ReadBasic.All) and grant admin consent. Give the app access to the mailbox via an application access policy or full access on the shared mailbox. Create a client secret.
2) Copy `.env.example` to `.env` and set:
   - `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `PORT` (health endpoint; defaults to 3000).
3) `npm install`
4) Start the bot: `npm run dev` (or `npm run build && npm start`).
5) Run `/setup` in your server (Manage Server required):
   - Provide channel, mailbox address (e.g., `admin-intake@yourcompany.com`), optional mailbox alias (shown in Discord), tenant ID, client ID, client secret.
   - The bot will fetch app-only tokens automatically once saved. Polling is fixed at every 5 minutes (top 10 unread per mailbox).
   - You can add multiple mailboxes to the same channel by running `/setup` again with a different mailbox address.

## Notes
- Polling is every 5 minutes (cron `*/5 * * * *`, fetches top 10 unread). This schedule is fixed.
- Rules skip delivery when the sender matches AND the subject contains the provided substring; matched emails are marked read in the mailbox.
- Data is stored in `data/db.json` (plain JSON file); secrets are stored as provided-use OS-level protections.

## Adding shared mailboxes (joshuagreeff.cc)
Use one app registration (application permissions) and one mail-enabled security group to scope mailbox access. Add each shared mailbox you want to forward into that group, then run `/setup` per Discord channel.

Azure/Exchange (once):
- App registration: create the app, note Tenant ID and Client ID, create a client secret. Grant Microsoft Graph Application permission `Mail.Read` (or `Mail.ReadBasic.All`) and admin consent.
- Security group to scope access:
  ```powershell
  Connect-ExchangeOnline
  New-DistributionGroup -Name "DiscordForwarderAccessSec" -Alias DiscordForwarderAccessSec `
    -PrimarySmtpAddress forwarder-access@joshuagreeff.cc -Type Security
  ```
- Application access policy pointing at the group:
  ```powershell
  New-ApplicationAccessPolicy -AppId <CLIENT_ID> `
    -PolicyScopeGroupId "DiscordForwarderAccessSec" `
    -AccessRight RestrictAccess `
    -Description "Allow bot to read scoped mailboxes"
  ```

Add a mailbox (repeat for each):
- Add the mailbox to the group:
  ```powershell
  Add-DistributionGroupMember -Identity "DiscordForwarderAccessSec" -Member hetzner-cloud-notifications@joshuagreeff.cc
  # repeat with additional mailboxes, e.g.:
  # Add-DistributionGroupMember -Identity "DiscordForwarderAccessSec" -Member another-mailbox@joshuagreeff.cc
  ```
- (Optional) Validate policy:
  ```powershell
  Test-ApplicationAccessPolicy -AppId <CLIENT_ID> -Identity hetzner-cloud-notifications@joshuagreeff.cc
  ```

Bot setup per mailbox/channel:
- Ensure `.env` has `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `PORT` (if changing the health port).
- In Discord, run `/setup` with:
  - `channel`: target channel
  - `mailbox_address`: e.g., `hetzner-cloud-notifications@joshuagreeff.cc`
  - `tenant_id`: your tenant GUID
  - `client_id`: the app client ID
  - `client_secret`: the app secret
The bot will fetch app-only tokens automatically; no OAuth link is needed.
