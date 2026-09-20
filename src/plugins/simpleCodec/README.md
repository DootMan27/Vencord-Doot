# SimpleCodec for Vencord

A Vencord user plugin for the same simple `DCE1:` password encoding used by the original console snippet. It has native controls, a checkbox for outgoing encoding, automatic decoding, message badges, and separate enable switches for each server and for DMs.

## Install

Vencord custom plugins require a source build. Follow the official [custom plugin instructions](https://docs.vencord.dev/installing/custom-plugins/) and [source installation guide](https://docs.vencord.dev/installing/) if you do not have one yet.

1. Copy this **whole `simpleCodec` folder** into your Vencord checkout's `src/userplugins` directory. The entry point must be `src/userplugins/simpleCodec/index.tsx`.
2. In that Vencord checkout, run `pnpm install --frozen-lockfile` if dependencies are not installed.
3. Build with `pnpm build` for Discord desktop or `pnpm buildWeb` for a browser installation.
4. Install your custom build using Vencord's source installation guide. For Discord desktop, `pnpm inject` opens its installer. An existing installation already linked to your checkout only needs rebuilding and restarting.
5. Restart Discord, then enable **Settings → Vencord → Plugins → SimpleCodec**.

This is a source plugin, not a BetterDiscord `.plugin.js` file and not a console command. The ZIP contains the folder ready to extract into `src/userplugins`.

## Use

1. Open the desired server and click the **lock icon** beside the chat input.
2. Check **Enable SimpleCodec in this server**.
3. Enter the shared password and check **Encode outgoing text**.
4. Send or edit messages normally. The other participant enables their plugin in that server and uses the same password.

The lock opens a native Discord dialog. You can also access these controls from the plugin's settings page, where they apply to the currently selected server or DM.

Every server starts **disabled**. Its enable switch applies to all of its channels and threads, and controls outgoing encoding, automatic decoding, and badges. DMs and group DMs share a separate **Enable SimpleCodec in DMs** switch. Choices are remembered in Vencord settings. The outgoing checkbox is a session-wide switch: it affects only enabled servers and enabled DMs.

The password and outgoing checkbox reset when Discord restarts or the plugin stops. The password is never written to Vencord settings. With outgoing encoding unchecked, enabled servers still decode matching messages. Disabling a server restores the encoded text in its local message cache.

## Message markers

Badges appear next to message headers in enabled servers and DMs:

| Badge | Meaning |
| --- | --- |
| **DCE1 decoded**, green | The message arrived in DCE1 format and is displayed decoded locally. |
| **DCE1 encoded**, amber | DCE1-formatted text is still encoded; enter a matching password. |
| **Plain text**, gray | The message text was not sent in DCE1 format. |

Badges describe the text format, not cryptographic security. File-only messages have no text badge; attachments themselves are never encoded.

## Behavior and limits

- Encoding adds repeating UTF-8 password bytes modulo 256, then applies Base64 with the `DCE1:` prefix. It is deliberately weak obfuscation, not secure encryption. There is no cryptographic integrity check; the short internal marker is only a format check.
- The wire format is compatible with the original console snippet. Starting the plugin removes that snippet if it is still running.
- Normal chat text, replies, edits, and attachment captions use Vencord's pre-send and pre-edit hooks. Missing passwords and results over 2,000 characters explicitly cancel those actions instead of falling back to plaintext. The limit allows about 1,489 UTF-8 bytes of original text.
- Native message rendering and editing use the decoded local text. Discord's server still holds the encoded message. Copying text or another plugin reading the local message cache can see the decoded text.
- Files, filenames, stickers, slash commands, forum creation, forwarding, notifications, and messages sent by other plugins outside Vencord's normal composer hooks are outside the encoding scope.
- The global encoding switch may conflict with other plugins that transform outgoing text. Avoid applying multiple message transformations to the same send.
- Turning the plugin off restores its cached encoded messages. It never rewrites or deletes server messages.

## Validation

Validated against official Vencord source at commit `59a54286542651fff5ea53f0ce6cadf2a6aa7521` (version 1.15.6) on September 20, 2026. The local checks cover codec compatibility, Unicode, outgoing cancellation, native hook wiring, reversible decoding, badges, per-server and DM gating, settings persistence, and stopping/restarting. They use mocked Discord stores and callbacks, not a live Discord account.

All **27 behavior tests**, the full checkout's TypeScript check, plugin ESLint and CSS checks, and both desktop and browser builds passed. Live Discord delivery has not been tested, and the build has not been injected into the installed Discord client.

The accompanying development tests are in `vencord/tests/verify.cjs`. Run them from the parent `discord-simple-codec` directory with:

```powershell
node vencord/tests/verify.cjs "C:\path\to\Vencord"
```

For source checks inside your Vencord checkout:

```powershell
pnpm exec tsc --noEmit
pnpm exec eslint src/userplugins/simpleCodec
pnpm build
```

License: GPL-3.0-or-later.
