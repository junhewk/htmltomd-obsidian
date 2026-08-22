# htmltomd Sync for Obsidian

Desktop Obsidian delivery adapter for the `htmltomd` server. It polls one destination,
writes validated Markdown into the configured folder, verifies the file by SHA-256, and
only then acknowledges delivery.

## Install with BRAT

Install BRAT, choose **Add a beta plugin**, and enter this repository's GitHub path.
Releases provide matching `manifest.json`, `main.js`, and optional `styles.css` assets.

Create the signed iPhone Shortcut from the server administration page first; Obsidian is
not required for capture. Later, enter the server URL and `ADMIN_TOKEN` in plugin settings,
choose **Load destinations**, select the existing capture destination, and choose
**Connect this vault**. The admin token is not saved, and only the resulting sync
credential is stored in Obsidian SecretStorage. Existing ready captures are imported into
the default `Clippings` folder immediately after connection.

## Development

```bash
npm ci
npm run check
```

Tag releases with the exact version from `manifest.json` and attach `main.js`,
`manifest.json`, and `styles.css` when present.
