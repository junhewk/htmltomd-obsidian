import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
  connectVault,
  normalizeServerUrl,
  type ProvisioningApi,
  type SecretWriter,
  type VaultConnection,
} from '../src/provision.js'
import type { DestinationSummary } from '../src/types.js'

const destination: DestinationSummary = {
  id: '44de045e-1c95-4824-b10e-6a1b03450229',
  name: 'iPhone Inbox',
  vaultName: null,
  vaultConnectedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastSeenAt: null,
  counts: { queued: 0, processing: 0, ready: 2, review: 0, delivered: 0, dismissed: 0 },
}

const result: VaultConnection = {
  destination: { ...destination, vaultName: 'Personal', vaultConnectedAt: '2026-01-02T00:00:00.000Z' },
  syncToken: 'sync-secret',
}

class MemoryApi implements ProvisioningApi {
  connections: Array<{ destinationId: string; vaultName: string }> = []
  async listDestinations(): Promise<DestinationSummary[]> { return [destination] }
  async connectVault(destinationId: string, vaultName: string): Promise<VaultConnection> {
    this.connections.push({ destinationId, vaultName })
    return result
  }
}

class MemorySecrets implements SecretWriter {
  values = new Map<string, string>()
  setSecret(id: string, value: string): void { this.values.set(id, value) }
}

describe('vault provisioning', () => {
  it('normalizes a server origin', () => {
    assert.equal(normalizeServerUrl(' http://192.0.2.10:8787/ '), 'http://192.0.2.10:8787')
    assert.throws(() => normalizeServerUrl('192.0.2.10:8787'), /complete server URL/)
    assert.throws(() => normalizeServerUrl('http://host/path'), /base URL/)
  })

  it('connects the current vault and stores only the sync token', async () => {
    const api = new MemoryApi()
    const secrets = new MemorySecrets()
    const references = await connectVault(api, secrets, destination.id, ' Personal ')
    assert.deepEqual(api.connections, [{ destinationId: destination.id, vaultName: 'Personal' }])
    assert.deepEqual(references, {
      destinationId: result.destination.id,
      destinationName: 'iPhone Inbox',
      syncSecretName: `htmltomd-sync-${result.destination.id}`,
    })
    assert.equal(secrets.values.get(references.syncSecretName), 'sync-secret')
    assert.equal(JSON.stringify(references).includes('sync-secret'), false)
    assert.equal([...secrets.values.keys()].some((key) => key.includes('capture')), false)
  })

  it('does not call the server for an empty vault name', async () => {
    const api = new MemoryApi()
    await assert.rejects(() => connectVault(api, new MemorySecrets(), destination.id, '  '), /vault name is empty/)
    assert.deepEqual(api.connections, [])
  })

  it('does not call the server without a selected destination', async () => {
    const api = new MemoryApi()
    await assert.rejects(() => connectVault(api, new MemorySecrets(), '  ', 'Personal'), /Select a capture destination/)
    assert.deepEqual(api.connections, [])
  })

  it('does not store secrets when server connection fails', async () => {
    const secrets = new MemorySecrets()
    const api: ProvisioningApi = {
      async listDestinations(): Promise<DestinationSummary[]> { return [destination] },
      async connectVault(): Promise<VaultConnection> { throw new Error('Invalid admin token.') },
    }
    await assert.rejects(() => connectVault(api, secrets, destination.id, 'Personal'), /Invalid admin token/)
    assert.equal(secrets.values.size, 0)
  })
})
