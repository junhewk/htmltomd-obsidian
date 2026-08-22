# htmltomd Sync for Obsidian

Desktop Obsidian delivery adapter for the `htmltomd` server. It polls one destination,
writes validated Markdown into the configured folder, verifies the file by SHA-256, and
only then acknowledges delivery.

## Install with BRAT

Install BRAT, choose **Add a beta plugin**, and enter this repository's GitHub path.
Releases provide matching `manifest.json`, `main.js`, and optional `styles.css` assets.

In plugin settings, enter the server URL and the server `ADMIN_TOKEN`, then choose
**Register this vault**. The token is used for that request only and is not saved. The
plugin registers the current vault name and stores its capture and sync credentials in
Obsidian SecretStorage. The default target folder is `Clippings`.

Use the settings buttons or the **Copy Shortcut capture endpoint/token** commands to set
up the iPhone Shortcut. The iPhone must use the capture token, never the sync or admin
token.

## Development

```bash
npm ci
npm run check
```

Tag releases with the exact version from `manifest.json` and attach `main.js`,
`manifest.json`, and `styles.css` when present.
