# tampermonkey_scripts

Personal userscripts for [Tampermonkey](https://www.tampermonkey.net/). Public repo, so scripts install and auto-update straight from their raw URL.

## Scripts

### `alibaba-chat-exporter.user.js`

Adds three floating buttons to the Alibaba message center (`message.alibaba.com`):

- **📋 Copy chat** — copies the current conversation as a clean Markdown transcript.
- **{ } JSON** — copies the same conversation as a structured JSON array (one object per message: sender, direction, timestamp, type, text, quote, product/file/video payloads).
- **🐞 Debug** — copies the raw `outerHTML` of any message the parser couldn't fully classify (empty product-card title, unmatched wrapper, missing file/video fields), plus a type census. Paste that into an issue when a new message shape needs handling.

Messages are read straight from the live DOM (`.message-item-wrapper`), sorted chronologically by `sendTime`. Your own messages are labelled via the `SELF_NAME` constant at the top of the script — edit that one string to change it.

Handles: sent/received text, `<br>` newlines, emoji (`:smile_147:`), reply quotes, product cards, file attachments (name/size/download URL), videos, and recalled messages.

## Install

Open the raw URL in a browser that has Tampermonkey installed — it intercepts any `.user.js` URL and shows the install page:

```
https://raw.githubusercontent.com/rnavarro/tampermonkey_scripts/main/alibaba-chat-exporter.user.js
```

Each script's `@downloadURL`/`@updateURL` headers point at that same raw file on `main`, so Tampermonkey **auto-updates** it on its normal check schedule. To pull an update immediately: Tampermonkey dashboard → **Utilities** → *Check for userscript updates*, or right-click the script → *Check for updates*.

If you previously pasted a script by hand, delete that manual copy so it doesn't inject alongside the URL-installed one.

## Update workflow (required)

`main` is protected by a global pre-commit guard — **no direct commits to `main`**. Bring every change in through a branch and a merge.

1. Branch off `main`:
   ```bash
   git switch main && git pull
   git switch -c fix/<short-name>      # or feat/…, docs/…
   ```
2. Make the change. **If you touched a `.user.js` file, bump its `@version` header** (e.g. `1.1` → `1.2`) — Tampermonkey only pulls an update when the remote `@version` is higher than the installed one. No bump means clients never see the change.
3. Commit on the branch, then merge into `main` (merges are allowed; direct commits are not):
   ```bash
   git switch main
   git merge --no-ff fix/<short-name>
   git push
   ```
4. Delete the merged branch to keep things tidy:
   ```bash
   git branch -d fix/<short-name>
   ```

Once `main` is pushed, installed clients auto-update to the new `@version` on their next check.

### Versioning convention

- **Patch** (`1.1` → `1.1.1`): selector fix, bug fix, no behavior change.
- **Minor** (`1.1` → `1.2`): new capability (a button, a new message type handled).
- **Major** (`1.x` → `2.0`): output format or interface change that could surprise an existing user.

## Notes

- Escape hatches for the branch guards (use sparingly): `git commit --no-verify`, or per-repo opt-out via `git config hooks.protectedBranches ""`.
- The guards live in `~/.config/git/hooks/` (`protected-branch-guard`, `push-protected-branch-guard`).
