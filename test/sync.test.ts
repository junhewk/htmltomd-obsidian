import { strict as assert } from 'node:assert'
import { before, describe, it } from 'node:test'
import { sha256, syncOutbox } from '../src/sync.js'
import type { DeliveryApi, DestinationSummary, OutboxItem, VaultPort } from '../src/types.js'

class MemoryVault implements VaultPort {
  readonly files = new Map<string, string>()
  async ensureFolder(): Promise<void> {}
  async exists(path: string): Promise<boolean> { return this.files.has(path) }
  async read(path: string): Promise<string> {
    const content = this.files.get(path)
    if (content === undefined) throw new Error('missing')
    return content
  }
  async create(path: string, content: string): Promise<void> { this.files.set(path, content) }
}

class MemoryApi implements DeliveryApi {
  acknowledgments: Array<{ id: string; path: string; sha256: string }> = []
  constructor(readonly items: OutboxItem[], readonly content: Map<string, string>) {}
  async summary(): Promise<DestinationSummary> { throw new Error('unused') }
  async outbox(): Promise<OutboxItem[]> { return this.items }
  async markdown(item: OutboxItem): Promise<string> { return this.content.get(item.id) ?? '' }
  async acknowledge(item: OutboxItem, path: string, hash: string): Promise<void> { this.acknowledgments.push({ id: item.id, path, sha256: hash }) }
}

describe('syncOutbox', () => {
  let markdown: string
  let item: OutboxItem

  before(async () => {
    markdown = `---\nclip_id: clip-1\ntitle: "Article"\n---\n\n# Article\n\nBody.`
    item = { id: 'clip-1', title: 'Article', suggestedFilename: 'Article.md', sha256: await sha256(markdown), markdownUrl: '/markdown', createdAt: '' }
  })

  it('writes, reads back and acknowledges Markdown', async () => {
    const vault = new MemoryVault()
    const api = new MemoryApi([item], new Map([[item.id, markdown]]))
    assert.deepEqual(await syncOutbox(api, vault, 'Clippings'), { imported: 1, alreadyPresent: 0, errors: [] })
    assert.equal(vault.files.get('Clippings/Article.md'), markdown)
    assert.equal(api.acknowledgments[0]?.path, 'Clippings/Article.md')
  })

  it('acknowledges a matching prior write without duplicating it', async () => {
    const vault = new MemoryVault()
    vault.files.set('Clippings/Article.md', markdown)
    const api = new MemoryApi([item], new Map([[item.id, markdown]]))
    assert.deepEqual(await syncOutbox(api, vault, 'Clippings'), { imported: 0, alreadyPresent: 1, errors: [] })
    assert.equal(vault.files.size, 1)
  })

  it('suffixes a genuine filename collision', async () => {
    const vault = new MemoryVault()
    vault.files.set('Clippings/Article.md', 'unrelated')
    const api = new MemoryApi([item], new Map([[item.id, markdown]]))
    const result = await syncOutbox(api, vault, 'Clippings')
    assert.equal(result.imported, 1)
    assert.equal(vault.files.get('Clippings/Article-1.md'), markdown)
  })

  it('does not write or acknowledge content with the wrong hash', async () => {
    const vault = new MemoryVault()
    const bad = { ...item, sha256: 'wrong' }
    const api = new MemoryApi([bad], new Map([[bad.id, markdown]]))
    const result = await syncOutbox(api, vault, 'Clippings')
    assert.equal(result.errors.length, 1)
    assert.equal(vault.files.size, 0)
    assert.equal(api.acknowledgments.length, 0)
  })
})
