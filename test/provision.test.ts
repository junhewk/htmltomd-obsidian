import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
  connectVaultLink,
  normalizeServerUrl,
  parseVaultLink,
  syncSecretName,
  type DestinationProbe,
  type SecretWriter,
  type VaultLink,
} from '../src/provision.js'
import type { DestinationSummary } from '../src/types.js'

const DESTINATION_ID = '44de045e-1c95-4824-b10e-6a1b03450229'
const SERVER = 'http://192.0.2.10:8787'
const TOKEN = 'sync-secret'

const destination: DestinationSummary = {
  id: DESTINATION_ID,
  name: 'iPhone Inbox',
  vaultName: 'Personal',
  vaultConnectedAt: '2026-01-02T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastSeenAt: null,
  counts: { queued: 0, processing: 0, ready: 2, review: 0, delivered: 0, dismissed: 0 },
}

function link(overrides: Partial<Record<'server' | 'destination' | 'token', string>> = {}): string {
  const url = new URL('htmltomd://vault')
  const values = { server: SERVER, destination: DESTINATION_ID, token: TOKEN, ...overrides }
  for (const [key, value] of Object.entries(values)) {
    if (value !== '') url.searchParams.set(key, value)
  }
  return url.toString()
}

class MemorySecrets implements SecretWriter {
  values = new Map<string, string>()
  setSecret(id: string, value: string): void { this.values.set(id, value) }
}

const probeReturning = (summary: DestinationSummary): { probe: DestinationProbe; seen: VaultLink[] } => {
  const seen: VaultLink[] = []
  return {
    seen,
    probe: async (parsed) => {
      seen.push(parsed)
      return summary
    },
  }
}

describe('vault provisioning', () => {
  it('normalizes a server origin', () => {
    assert.equal(normalizeServerUrl(' http://192.0.2.10:8787/ '), SERVER)
    assert.throws(() => normalizeServerUrl('192.0.2.10:8787'), /complete server URL/)
    assert.throws(() => normalizeServerUrl('http://host/path'), /base URL/)
  })

  it('reads a vault connection link issued by the server page', () => {
    assert.deepEqual(parseVaultLink(` ${link()} `), {
      serverUrl: SERVER,
      destinationId: DESTINATION_ID,
      syncToken: TOKEN,
    })
  })

  it('rejects links that are not usable vault connections', () => {
    assert.throws(() => parseVaultLink('   '), /Paste the vault connection link/)
    assert.throws(() => parseVaultLink('not a link'), /not a valid vault connection link/)
    assert.throws(() => parseVaultLink('https://example.com/?token=x'), /htmltomd:\/\/vault/)
    assert.throws(() => parseVaultLink('htmltomd://other?token=x'), /htmltomd:\/\/vault/)
    assert.throws(() => parseVaultLink(link({ destination: '' })), /no destination/)
    assert.throws(() => parseVaultLink(link({ token: '' })), /no sync credential/)
    assert.throws(() => parseVaultLink(link({ server: 'http://host/path' })), /base URL/)
  })

  it('verifies the link and stores only the sync token', async () => {
    const secrets = new MemorySecrets()
    const { probe, seen } = probeReturning(destination)
    const references = await connectVaultLink(link(), secrets, probe)
    assert.deepEqual(seen, [{ serverUrl: SERVER, destinationId: DESTINATION_ID, syncToken: TOKEN }])
    assert.deepEqual(references, {
      serverUrl: SERVER,
      destinationId: DESTINATION_ID,
      destinationName: 'iPhone Inbox',
      syncSecretName: syncSecretName(DESTINATION_ID),
    })
    assert.equal(secrets.values.get(references.syncSecretName), TOKEN)
    assert.equal(JSON.stringify(references).includes(TOKEN), false)
    assert.equal([...secrets.values.keys()].some((key) => key.includes('capture')), false)
  })

  it('does not contact the server for an unusable link', async () => {
    const secrets = new MemorySecrets()
    let probed = false
    await assert.rejects(
      () => connectVaultLink('htmltomd://vault?destination=only', secrets, async () => {
        probed = true
        return destination
      }),
      /no sync credential/,
    )
    assert.equal(probed, false)
    assert.equal(secrets.values.size, 0)
  })

  it('does not store secrets when the server rejects the credential', async () => {
    const secrets = new MemorySecrets()
    await assert.rejects(
      () => connectVaultLink(link(), secrets, async () => { throw new Error('Invalid sync credential.') }),
      /Invalid sync credential/,
    )
    assert.equal(secrets.values.size, 0)
  })
})
