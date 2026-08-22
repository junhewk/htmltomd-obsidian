export interface ProvisionedDestination {
  destination: { id: string; name: string }
  captureToken: string
  syncToken: string
}

export interface ProvisioningApi {
  registerVault(name: string): Promise<ProvisionedDestination>
}

export interface SecretWriter {
  setSecret(id: string, value: string): void
}

export interface ProvisionedReferences {
  destinationId: string
  destinationName: string
  captureSecretName: string
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

export function captureEndpoint(serverUrl: string, destinationId: string): string {
  return `${normalizeServerUrl(serverUrl)}/api/v1/destinations/${destinationId}/captures`
}

export async function provisionVault(
  api: ProvisioningApi,
  secrets: SecretWriter,
  vaultName: string,
): Promise<ProvisionedReferences> {
  const name = vaultName.trim()
  if (name === '') throw new Error('The Obsidian vault name is empty.')
  const created = await api.registerVault(name)
  const syncSecretName = `htmltomd-sync-${created.destination.id}`
  const captureSecretName = `htmltomd-capture-${created.destination.id}`
  try {
    secrets.setSecret(syncSecretName, created.syncToken)
    secrets.setSecret(captureSecretName, created.captureToken)
  } catch (error) {
    secrets.setSecret(syncSecretName, '')
    secrets.setSecret(captureSecretName, '')
    throw error
  }
  return {
    destinationId: created.destination.id,
    destinationName: created.destination.name,
    captureSecretName,
    syncSecretName,
  }
}
