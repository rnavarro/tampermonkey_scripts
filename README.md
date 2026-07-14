# tampermonkey_scripts

Personal userscripts for [Tampermonkey](https://www.tampermonkey.net/).

## Scripts

### `alibaba-chat-exporter.user.js`

Adds three floating buttons to the Alibaba message center (`message.alibaba.com`):

- **📋 Copy chat** — copies the current conversation as a clean Markdown transcript.
- **{ } JSON** — copies the same conversation as a structured JSON array (one object per message: sender, direction, timestamp, type, text, quote, product/file/video payloads).
- **🐞 Debug** — copies the raw `outerHTML` of any message the parser couldn't fully classify (empty product-card title, unmatched wrapper, missing file/video fields), plus a type census. Paste that when a new message shape needs handling.

Messages are read straight from the live DOM (`.message-item-wrapper`), sorted chronologically by `sendTime`. Your own messages are labelled via the `SELF_NAME` constant at the top of the script — edit that one string to change it.

Handles: sent/received text, `<br>` newlines, emoji (`:smile_147:`), reply quotes, product cards, file attachments (name/size/download URL), videos, and recalled messages.

## Install

This repo is **private**, so Tampermonkey's install-from-URL and auto-update won't fetch the raw file without auth. Options:

1. **Manual (simplest):** open the `.user.js` file on GitHub → **Raw** → copy all → Tampermonkey dashboard → **+** (new script) → paste over the template → save. To update later, repaste.
2. **Clone locally** and paste from disk:
   ```bash
   git clone git@github.com:rnavarro/tampermonkey_scripts.git ~/workspace/tampermonkey_scripts
   ```
3. **Enable one-click install + auto-update:** either make the repo public, or serve the raw file with a token. The `@downloadURL`/`@updateURL` headers already point at the `main` raw URL, so if the repo becomes reachable, Tampermonkey auto-updates on its normal schedule.

## Notes

- `main` is protected by a global pre-commit guard (no direct commits). Work on a `feat/*` or `fix/*` branch and merge in.
