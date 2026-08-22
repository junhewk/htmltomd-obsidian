import type { DestinationSummary } from './types.js'

export interface VaultConnection {
  destination: DestinationSummary
  syncToken: string
}

export interface ProvisioningApi {
  listDestinations(): Promise<DestinationSummary[]>
  connectVault(destinationId: string, vaultName: string): Promise<VaultConnection>
}

export interface SecretWriter {
  setSecret(id: string, value: string): void
}

export interface ProvisionedReferences {
  destinationId: string
  destinationName: string
  syncSecretName: string
}

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

export async function connectVault(
  api: ProvisioningApi,
  secrets: SecretWriter,
  destinationId: string,
  vaultName: string,
): Promise<ProvisionedReferences> {
  const name = vaultName.trim()
  if (name === '') throw new Error('The Obsidian vault name is empty.')
  if (destinationId.trim() === '') throw new Error('Select a capture destination.')
  const connected = await api.connectVault(destinationId, name)
  const syncSecretName = `htmltomd-sync-${connected.destination.id}`
  try {
    secrets.setSecret(syncSecretName, connected.syncToken)
  } catch (error) {
    secrets.setSecret(syncSecretName, '')
    throw error
  }
  return {
    destinationId: connected.destination.id,
    destinationName: connected.destination.name,
    syncSecretName,
  }
}
