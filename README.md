# htmltomd Sync for Obsidian

Desktop Obsidian delivery adapter for the `htmltomd` server. It polls one destination,
writes validated Markdown into the configured folder, verifies the file by SHA-256, and
only then acknowledges delivery.

## Install with BRAT

Install BRAT, choose **Add beta plugin**, and enter:

```text
junhewk/htmltomd-obsidian
```

BRAT has no plugin directory to browse; the repository path is typed in. Builds are
published as GitHub pre-releases, which BRAT selects automatically by highest semantic
version, and each release carries matching `manifest.json` and `main.js` assets.

To install without BRAT, download those two assets from the
[latest release](https://github.com/junhewk/htmltomd-obsidian/releases) into
`<vault>/.obsidian/plugins/htmltomd-sync/`, then enable the plugin.

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
