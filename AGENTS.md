# Repository Guidelines

## Structure and Commands

The Obsidian plugin entrypoint is `src/main.ts`. Keep server transport in `src/api.ts`,
verified delivery orchestration in `src/sync.ts`, and shared interfaces in `src/types.ts`.
Pure delivery tests live under `test/`. Root `manifest.json` and `versions.json` describe
Obsidian compatibility; generated `main.js` is a BRAT release asset and is gitignored.

Use `npm ci`, `npm run build`, `npm test`, or `npm run check`. The build must type-check
before bundling. Tests must mock both the server Interface and vault Interface rather than
contacting a live server or modifying a real vault.

## Style and Delivery Invariants

Use strict TypeScript, two-space indentation, single quotes, no semicolons, and explicit
interfaces at server/vault seams. Write through Obsidian's Vault API. Never acknowledge a
capture until downloaded content matches the server hash and vault readback matches the
same hash. Preserve `clip_id` recovery, collision suffixing, destination isolation, and
per-item error continuation.

Store only the SecretStorage reference in plugin data, never the token value. Do not log
tokens or note bodies. Keep `isDesktopOnly` and `minAppVersion` aligned with APIs used.

## Releases and Contributions

Use short imperative commits and include tests for synchronization or settings changes.
For releases, make the Git tag, release name, `package.json`, and `manifest.json` versions
identical. GitHub Actions attaches `main.js` and `manifest.json` for BRAT. Pull requests
should describe compatibility, migration, UI, or API-contract effects and list
`npm run check` in verification.
