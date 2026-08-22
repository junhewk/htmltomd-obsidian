import type { DeliveryApi, OutboxItem, VaultPort } from './types.js'

export interface SyncResult {
  imported: number
  alreadyPresent: number
  errors: Array<{ id: string; message: string }>
}

export async function sha256(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function joinPath(folder: string, filename: string): string {
  const cleanFolder = folder.replace(/^\/+|\/+$/g, '')
  const cleanFilename = filename.replace(/[\\/]/g, ' ').trim() || 'Untitled.md'
  return cleanFolder === '' ? cleanFilename : `${cleanFolder}/${cleanFilename}`
}

function suffixed(path: string, suffix: number): string {
  const extension = path.toLowerCase().endsWith('.md') ? '.md' : ''
  const stem = extension ? path.slice(0, -3) : path
  return `${stem}-${suffix}${extension}`
}

function hasClipId(markdown: string, id: string): boolean {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^clip_id:\\s*${escaped}\\s*$`, 'm').test(markdown)
}

async function choosePath(vault: VaultPort, folder: string, item: OutboxItem, markdown: string): Promise<{ path: string; existing: boolean }> {
  const original = joinPath(folder, item.suggestedFilename)
  let path = original
  for (let suffix = 0; suffix < 1_000; suffix++) {
    if (!(await vault.exists(path))) return { path, existing: false }
    const current = await vault.read(path)
    if (hasClipId(current, item.id)) {
      if ((await sha256(current)) !== item.sha256) {
        throw new Error(`Existing note ${path} has the matching clip_id but was modified before acknowledgment.`)
      }
      return { path, existing: true }
    }
    path = suffixed(original, suffix + 1)
  }
  throw new Error(`Could not find a free filename for ${item.suggestedFilename}.`)
}

export async function syncOutbox(api: DeliveryApi, vault: VaultPort, folder: string): Promise<SyncResult> {
  const result: SyncResult = { imported: 0, alreadyPresent: 0, errors: [] }
  await vault.ensureFolder(folder)
  const items = await api.outbox()
  for (const item of items) {
    try {
      const markdown = await api.markdown(item)
      const downloadedHash = await sha256(markdown)
      if (downloadedHash !== item.sha256) throw new Error('Downloaded Markdown does not match the server hash.')
      if (!hasClipId(markdown, item.id)) throw new Error('Downloaded Markdown does not contain the expected clip_id.')
      const target = await choosePath(vault, folder, item, markdown)
      if (!target.existing) await vault.create(target.path, markdown)
      const readback = await vault.read(target.path)
      const readbackHash = await sha256(readback)
      if (readbackHash !== item.sha256) throw new Error('Vault readback does not match generated Markdown.')
      await api.acknowledge(item, target.path, readbackHash)
      if (target.existing) result.alreadyPresent++
      else result.imported++
    } catch (error) {
      result.errors.push({ id: item.id, message: (error as Error).message })
    }
  }
  return result
}
