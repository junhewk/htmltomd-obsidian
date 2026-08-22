import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
  captureEndpoint,
  normalizeServerUrl,
  provisionVault,
  type ProvisionedDestination,
  type ProvisioningApi,
  type SecretWriter,
} from '../src/provision.js'

const result: ProvisionedDestination = {
  destination: { id: '44de045e-1c95-4824-b10e-6a1b03450229', name: 'Personal' },
  captureToken: 'capture-secret',
  syncToken: 'sync-secret',
}

class MemoryApi implements ProvisioningApi {
  names: string[] = []
  async registerVault(name: string): Promise<ProvisionedDestination> {
    this.names.push(name)
    return result
  }
}

class MemorySecrets implements SecretWriter {
  values = new Map<string, string>()
  setSecret(id: string, value: string): void { this.values.set(id, value) }
}

describe('vault provisioning', () => {
  it('normalizes a server origin and constructs the Shortcut endpoint', () => {
    assert.equal(normalizeServerUrl(' http://192.0.2.10:8787/ '), 'http://192.0.2.10:8787')
    assert.equal(
      captureEndpoint('http://192.0.2.10:8787/', result.destination.id),
      `http://192.0.2.10:8787/api/v1/destinations/${result.destination.id}/captures`,
    )
    assert.throws(() => normalizeServerUrl('192.0.2.10:8787'), /complete server URL/)
    assert.throws(() => normalizeServerUrl('http://host/path'), /base URL/)
  })

  it('registers the current vault and stores tokens only in secret storage', async () => {
    const api = new MemoryApi()
    const secrets = new MemorySecrets()
    const references = await provisionVault(api, secrets, ' Personal ')
    assert.deepEqual(api.names, ['Personal'])
    assert.deepEqual(references, {
      destinationId: result.destination.id,
      destinationName: 'Personal',
      captureSecretName: `htmltomd-capture-${result.destination.id}`,
      syncSecretName: `htmltomd-sync-${result.destination.id}`,
    })
    assert.equal(secrets.values.get(references.captureSecretName), 'capture-secret')
    assert.equal(secrets.values.get(references.syncSecretName), 'sync-secret')
    assert.equal(JSON.stringify(references).includes('capture-secret'), false)
    assert.equal(JSON.stringify(references).includes('sync-secret'), false)
  })

  it('does not call the server for an empty vault name', async () => {
    const api = new MemoryApi()
    await assert.rejects(() => provisionVault(api, new MemorySecrets(), '  '), /vault name is empty/)
    assert.deepEqual(api.names, [])
  })

  it('does not store secrets when server registration fails', async () => {
    const secrets = new MemorySecrets()
    const api: ProvisioningApi = {
      async registerVault(): Promise<ProvisionedDestination> { throw new Error('Invalid admin token.') },
    }
    await assert.rejects(() => provisionVault(api, secrets, 'Personal'), /Invalid admin token/)
    assert.equal(secrets.values.size, 0)
  })
})
