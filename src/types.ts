export interface OutboxItem {
  id: string
  title: string
  suggestedFilename: string
  sha256: string
  markdownUrl: string
  createdAt: string
}

export interface DestinationSummary {
  id: string
  name: string
  counts: {
    queued: number
    processing: number
    ready: number
    review: number
    delivered: number
    dismissed: number
  }
}

export interface DeliveryApi {
  summary(): Promise<DestinationSummary>
  outbox(): Promise<OutboxItem[]>
  markdown(item: OutboxItem): Promise<string>
  acknowledge(item: OutboxItem, path: string, sha256: string): Promise<void>
}

export interface VaultPort {
  ensureFolder(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  read(path: string): Promise<string>
  create(path: string, content: string): Promise<void>
}
