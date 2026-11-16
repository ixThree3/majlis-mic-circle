<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- Members log in by username only: the auth email is derived from a hash of the normalized username (`src/lib/auth-utils.ts`); guests use anonymous sign-in. Why: the chat has no email field, and the hash keeps Arabic names valid as emails.
- Profiles are created by the `handle_new_user` trigger from signup metadata `username`; it rejects names already held by a member. Why: one place enforces name rules for guests and members.
- Mic seats change only through the `take_mic` / `leave_mic` / `mic_heartbeat` database functions; a seat whose holder stops heartbeating for 45s counts as free. Why: closed tabs never leave a seat stuck.
- Voice is peer-to-peer WebRTC (`src/lib/voice-mesh.ts`): each mic holder sends audio directly to every room member, signaling over the room's realtime broadcast channel. Why: no paid media server; fine for 5 speakers and modest rooms. Without a TURN server some strict networks can't connect.
- Site-wide "who's online" uses realtime presence on the `online` channel (`OnlineProvider`); room membership uses presence on `room:<id>`. Why: no database writes for presence.
