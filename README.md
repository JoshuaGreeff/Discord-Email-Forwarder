# Discord Email Forwarder

A Discord bot that reads emails from a Microsoft 365 shared mailbox and forwards them to Discord channels with acknowledgements and unsubscribe rules.

## Features
- `/setup` to configure a channel + mailbox + Azure app creds; replies with the OAuth link for the service account.
- `/update` to adjust settings with masked secrets.
- Polls the configured mailbox (delegated auth) and posts each unread email (subject + body) to the target channel.
- Buttons:
  - **Acknowledge**: greys out after click and records the user in the embed footer.
  - **Unsubscribe**: opens a modal prefilled with From/Subject; saves a rule (sender match AND subject contains) to suppress future posts.
- Per-channel settings; multiple channels/mailboxes supported.

## Quick start
1) Ensure Azure app + delegated Graph permissions are configured (Mail.Read, Mail.Read.Shared, User.Read, offline_access) and client secret created.
2) Copy `.env.example` to `.env` and set:
   - `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `PORT` (for OAuth callback; defaults to 3000).
3) `npm install`
4) Start the bot: `npm run dev` (or `npm run build && npm start`).
5) Run `/setup` in your server (Manage Server required):
   - Provide channel, mailbox address (e.g., `admin-intake@yourcompany.com`), service account UPN, tenant ID, client ID, client secret, optional redirect URI (default `http://localhost:3000/auth/callback`).
   - Follow the OAuth link returned; on success the bot starts polling and posting.

## Notes
- Polling default is every 2 minutes (`*/2 * * * *`). Adjust with the `poll_cron` option on `/setup` or `/update` (currently shared global schedule).
- Rules skip delivery when the sender matches AND the subject contains the provided substring; matched emails are marked read in the mailbox.
- Data is stored in `data/bot.db` (SQLite); secrets are stored as provided—use OS-level protections.
