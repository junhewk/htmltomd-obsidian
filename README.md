# htmltomd Sync for Obsidian

Desktop Obsidian delivery adapter for the `htmltomd` server. It polls one destination,
writes validated Markdown into the configured folder, verifies the file by SHA-256, and
only then acknowledges delivery.

## Install with BRAT

Install BRAT, choose **Add a beta plugin**, and enter this repository's GitHub path.
Releases provide matching `manifest.json`, `main.js`, and optional `styles.css` assets.

Connect an iPhone from the server administration page first; Obsidian is not required for
capture. Then, on that page, choose **Connect Obsidian** on the capture destination, enter
the vault name, and copy the `htmltomd://vault` link it shows. Paste that link into
**Vault connection link** in plugin settings and choose **Connect**.

The link is verified against the server before anything is saved. `ADMIN_TOKEN` is never
entered here, and only the sync credential is stored in Obsidian SecretStorage. Existing
ready captures are imported into the default `Clippings` folder immediately after
connection.

## Development

```bash
npm ci
npm run check
```

Tag releases with the exact version from `manifest.json` and attach `main.js`,
`manifest.json`, and `styles.css` when present.
