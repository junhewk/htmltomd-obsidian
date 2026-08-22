import { requestUrl } from 'obsidian'
import { normalizeServerUrl, type ProvisioningApi, type VaultConnection } from './provision.js'
import type { DeliveryApi, DestinationSummary, OutboxItem } from './types.js'

interface ErrorPayload { error?: unknown }

async function requestJson<T>(url: string, token: string, method = 'GET', body?: object): Promise<T> {
  const response = await requestUrl({
    url,
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    throw: false,
  })
  if (response.status >= 400) {
    const payload = response.json as ErrorPayload | undefined
    throw new Error(typeof payload?.error === 'string' ? payload.error : `htmltomd returned ${response.status}.`)
  }
  return response.json as T
}

export class HtmlToMdProvisioningApi implements ProvisioningApi {
  private readonly root: string

  constructor(serverUrl: string, private readonly adminToken: string) {
    this.root = normalizeServerUrl(serverUrl)
  }

  async listDestinations(): Promise<DestinationSummary[]> {
    const response = await requestJson<{ destinations: DestinationSummary[] }>(`${this.root}/api/v1/admin/destinations`, this.adminToken)
    return response.destinations
  }

  async connectVault(destinationId: string, vaultName: string): Promise<VaultConnection> {
    return requestJson(`${this.root}/api/v1/admin/destinations/${destinationId}/vault-connection`, this.adminToken, 'POST', { vaultName })
  }
}

export class HtmlToMdApi implements DeliveryApi {
  private readonly root: string

  constructor(
    serverUrl: string,
    private readonly destinationId: string,
    private readonly token: string,
  ) {
    this.root = serverUrl.replace(/\/+$/, '')
  }

  private async json<T>(path: string, method = 'GET', body?: object): Promise<T> {
    return requestJson(`${this.root}${path}`, this.token, method, body)
  }

  async summary(): Promise<DestinationSummary> {
    return this.json(`/api/v1/destinations/${this.destinationId}/summary`)
  }

  async outbox(): Promise<OutboxItem[]> {
    const response = await this.json<{ items: OutboxItem[] }>(`/api/v1/destinations/${this.destinationId}/outbox`)
    return response.items
  }

  async markdown(item: OutboxItem): Promise<string> {
    const response = await requestUrl({
      url: `${this.root}${item.markdownUrl}`,
      headers: { Authorization: `Bearer ${this.token}` },
      throw: false,
    })
    if (response.status >= 400) throw new Error(`Markdown download returned ${response.status}.`)
    return response.text
  }

  async acknowledge(item: OutboxItem, path: string, sha256: string): Promise<void> {
    await this.json(`/api/v1/destinations/${this.destinationId}/captures/${item.id}/delivery`, 'POST', { path, sha256 })
  }
}
