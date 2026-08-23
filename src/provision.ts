import type { DestinationSummary } from './types.js'

export interface VaultLink {
  serverUrl: string
  destinationId: string
  syncToken: string
}

export interface SecretWriter {
  setSecret(id: string, value: string): void
}

export interface ProvisionedReferences {
  serverUrl: string
  destinationId: string
  destinationName: string
  syncSecretName: string
}

/** Confirms a link before its credential is stored, and reports the destination it opens. */
export type DestinationProbe = (link: VaultLink) => Promise<DestinationSummary>

export function normalizeServerUrl(value: string): string {
  const text = value.trim().replace(/\/+$/, '')
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new Error('Enter a complete server URL beginning with http:// or https://.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('The server URL must begin with http:// or https://.')
  }
  if (url.username !== '' || url.password !== '' || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error('Enter only the server base URL without credentials, a path, query, or fragment.')
  }
  return url.origin
}

export function syncSecretName(destinationId: string): string {
  return `htmltomd-sync-${destinationId}`
}

/**
 * Reads the one-time vault link issued by the server administration page. The link carries
 * the destination and its sync credential so the administration token never reaches Obsidian.
 */
export function parseVaultLink(value: string): VaultLink {
  const text = value.trim()
  if (text === '') throw new Error('Paste the vault connection link from the htmltomd server page.')
  let link: URL
  try {
    link = new URL(text)
  } catch {
    throw new Error('That is not a valid vault connection link.')
  }
  if (link.protocol !== 'htmltomd:' || link.host !== 'vault') {
    throw new Error('Paste the htmltomd://vault link shown by the server page.')
  }
  const server = link.searchParams.get('server') ?? ''
  const destinationId = (link.searchParams.get('destination') ?? '').trim()
  const syncToken = (link.searchParams.get('token') ?? '').trim()
  if (destinationId === '') throw new Error('The vault connection link has no destination.')
  if (syncToken === '') throw new Error('The vault connection link has no sync credential.')
  return { serverUrl: normalizeServerUrl(server), destinationId, syncToken }
}

/**
 * Verifies the pasted link against the server before storing anything, then keeps only the
 * SecretStorage reference in plugin data.
 */
export async function connectVaultLink(
  value: string,
  secrets: SecretWriter,
  probe: DestinationProbe,
): Promise<ProvisionedReferences> {
  const link = parseVaultLink(value)
  const destination = await probe(link)
  const secretName = syncSecretName(link.destinationId)
  try {
    secrets.setSecret(secretName, link.syncToken)
  } catch (error) {
    secrets.setSecret(secretName, '')
    throw error
  }
  return {
    serverUrl: link.serverUrl,
    destinationId: link.destinationId,
    destinationName: destination.name,
    syncSecretName: secretName,
  }
}
