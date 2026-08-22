import {
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  normalizePath,
  type App,
} from 'obsidian'
import { HtmlToMdApi, HtmlToMdProvisioningApi } from './api.js'
import { captureEndpoint, normalizeServerUrl, provisionVault } from './provision.js'
import { syncOutbox } from './sync.js'
import type { VaultPort } from './types.js'

interface HtmlToMdSettings {
  serverUrl: string
  destinationId: string
  destinationName: string
  secretName: string
  captureSecretName: string
  targetFolder: string
  pollSeconds: number
}

const DEFAULT_SETTINGS: HtmlToMdSettings = {
  serverUrl: 'http://192.0.2.10:8787',
  destinationId: '',
  destinationName: '',
  secretName: '',
  captureSecretName: '',
  targetFolder: 'Clippings',
  pollSeconds: 60,
}

class ObsidianVaultPort implements VaultPort {
  constructor(private readonly app: App) {}

  async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(path)
    if (normalized === '/' || normalized === '') return
    let current = ''
    for (const segment of normalized.split('/').filter(Boolean)) {
      current = current === '' ? segment : `${current}/${segment}`
      if (this.app.vault.getFolderByPath(current) === null) await this.app.vault.createFolder(current)
    }
  }

  async exists(path: string): Promise<boolean> {
    return this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null
  }

  async read(path: string): Promise<string> {
    const file = this.app.vault.getFileByPath(normalizePath(path))
    if (file === null) throw new Error(`Vault file not found: ${path}`)
    return this.app.vault.read(file)
  }

  async create(path: string, content: string): Promise<void> {
    await this.app.vault.create(normalizePath(path), content)
  }
}

export default class HtmlToMdPlugin extends Plugin {
  settings: HtmlToMdSettings = DEFAULT_SETTINGS
  private status: HTMLElement | null = null
  private syncing = false
  private provisioning = false
  private lastReviewCount = 0

  async onload(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<HtmlToMdSettings> | null) }
    this.status = this.addStatusBarItem()
    this.status.setText('htmltomd: not configured')
    this.addSettingTab(new HtmlToMdSettingTab(this.app, this))
    this.addCommand({ id: 'sync-now', name: 'Sync captures now', callback: () => void this.syncNow(true) })
    this.addCommand({ id: 'copy-capture-endpoint', name: 'Copy Shortcut capture endpoint', callback: () => void this.copyCaptureEndpoint() })
    this.addCommand({ id: 'copy-capture-token', name: 'Copy Shortcut capture token', callback: () => void this.copyCaptureToken() })
    this.app.workspace.onLayoutReady(() => void this.syncNow(false))
    this.registerInterval(window.setInterval(() => void this.syncNow(false), this.settings.pollSeconds * 1_000))
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }

  configured(): boolean {
    return this.settings.serverUrl !== '' && this.settings.destinationId !== '' && this.settings.secretName !== ''
  }

  async registerVault(adminToken: string): Promise<void> {
    if (this.provisioning) throw new Error('Vault registration is already in progress.')
    if (adminToken.trim() === '') throw new Error('Enter the server administration token.')
    this.provisioning = true
    const previous = this.settings
    let references: Awaited<ReturnType<typeof provisionVault>> | null = null
    try {
      const serverUrl = normalizeServerUrl(this.settings.serverUrl)
      const api = new HtmlToMdProvisioningApi(serverUrl, adminToken.trim())
      references = await provisionVault(api, this.app.secretStorage, this.app.vault.getName())
      this.settings = {
        ...this.settings,
        serverUrl,
        destinationId: references.destinationId,
        destinationName: references.destinationName,
        secretName: references.syncSecretName,
        captureSecretName: references.captureSecretName,
      }
      await this.saveSettings()
      this.status?.setText('htmltomd: configured')
      new Notice(`htmltomd registered ${references.destinationName}.`)
      await this.syncNow(false)
    } catch (error) {
      this.settings = previous
      if (references !== null) {
        this.app.secretStorage.setSecret(references.syncSecretName, '')
        this.app.secretStorage.setSecret(references.captureSecretName, '')
      }
      throw error
    } finally {
      this.provisioning = false
    }
  }

  async copyCaptureEndpoint(): Promise<void> {
    if (this.settings.serverUrl === '' || this.settings.destinationId === '') {
      new Notice('Register this vault first.')
      return
    }
    const endpoint = captureEndpoint(this.settings.serverUrl, this.settings.destinationId)
    await navigator.clipboard.writeText(endpoint)
    new Notice('Shortcut capture endpoint copied.')
  }

  async copyCaptureToken(): Promise<void> {
    const token = this.app.secretStorage.getSecret(this.settings.captureSecretName)
    if (!token) {
      new Notice('The stored capture token is missing. Rotate it from the server admin console.')
      return
    }
    await navigator.clipboard.writeText(token)
    new Notice('Shortcut capture token copied. Treat the clipboard contents as a password.')
  }

  async syncNow(showNotice: boolean): Promise<void> {
    if (this.syncing || !this.configured()) return
    const token = this.app.secretStorage.getSecret(this.settings.secretName)
    if (!token) {
      this.status?.setText('htmltomd: missing secret')
      if (showNotice) new Notice('The selected htmltomd sync secret is missing.')
      return
    }
    this.syncing = true
    this.status?.setText('htmltomd: syncing…')
    try {
      const api = new HtmlToMdApi(this.settings.serverUrl, this.settings.destinationId, token)
      const result = await syncOutbox(api, new ObsidianVaultPort(this.app), this.settings.targetFolder)
      const summary = await api.summary()
      this.status?.setText(`htmltomd: ${summary.counts.ready} ready · ${summary.counts.review} review`)
      if (summary.counts.review > this.lastReviewCount) {
        new Notice(`htmltomd: ${summary.counts.review} capture(s) need extraction review on the server.`)
      }
      this.lastReviewCount = summary.counts.review
      if (showNotice || result.imported + result.alreadyPresent > 0 || result.errors.length > 0) {
        const details = result.errors.slice(0, 3).map((entry) => `\n${entry.id}: ${entry.message}`).join('')
        new Notice(`htmltomd: ${result.imported} imported, ${result.alreadyPresent} already present, ${result.errors.length} failed.${details}`)
      }
    } catch (error) {
      this.status?.setText('htmltomd: sync failed')
      if (showNotice) new Notice(`htmltomd sync failed: ${(error as Error).message}`)
    } finally {
      this.syncing = false
    }
  }
}

class HtmlToMdSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: HtmlToMdPlugin) {
    super(app, plugin)
  }

  display(): void {
    this.containerEl.empty()
    new Setting(this.containerEl).setName('Server URL').addText((text) =>
      text.setPlaceholder('http://192.0.2.10:8787').setValue(this.plugin.settings.serverUrl).onChange(async (value) => {
        this.plugin.settings.serverUrl = value.trim()
        await this.plugin.saveSettings()
      }),
    )
    if (!this.plugin.configured()) {
      this.displayRegistration()
      return
    }
    new Setting(this.containerEl)
      .setName('Registered vault')
      .setDesc(`${this.plugin.settings.destinationName || this.app.vault.getName()} · Destination ID: ${this.plugin.settings.destinationId}`)
    new Setting(this.containerEl).setName('iPhone capture endpoint').setDesc('Use as the Get Contents of URL address in Shortcuts.').addButton((button) =>
      button.setButtonText('Copy endpoint').onClick(() => void this.plugin.copyCaptureEndpoint()),
    )
    new Setting(this.containerEl).setName('iPhone capture token').setDesc('Use as the Bearer authorization value in Shortcuts.').addButton((button) =>
      button.setButtonText('Copy token').onClick(() => void this.plugin.copyCaptureToken()),
    )
    new Setting(this.containerEl).setName('Destination folder').addText((text) =>
      text.setValue(this.plugin.settings.targetFolder).onChange(async (value) => {
        this.plugin.settings.targetFolder = normalizePath(value.trim() || 'Clippings')
        await this.plugin.saveSettings()
      }),
    )
    new Setting(this.containerEl).setName('Poll interval').setDesc('Seconds between checks while Obsidian is open.').addText((text) =>
      text.setValue(String(this.plugin.settings.pollSeconds)).onChange(async (value) => {
        const seconds = Number(value)
        if (Number.isFinite(seconds) && seconds >= 15) {
          this.plugin.settings.pollSeconds = Math.round(seconds)
          await this.plugin.saveSettings()
        }
      }),
    )
  }

  private displayRegistration(): void {
    let adminToken = ''
    new Setting(this.containerEl)
      .setName('Register this vault')
      .setDesc(`Create a private server destination for “${this.app.vault.getName()}”. The admin token is used once and is not saved.`)
      .addText((text) => {
        text.setPlaceholder('ADMIN_TOKEN').onChange((value) => { adminToken = value })
        text.inputEl.type = 'password'
      })
      .addButton((button) => button.setButtonText('Register this vault').setCta().onClick(async () => {
        button.setDisabled(true)
        try {
          await this.plugin.registerVault(adminToken)
          adminToken = ''
          this.display()
        } catch (error) {
          new Notice(`htmltomd registration failed: ${(error as Error).message}`)
          button.setDisabled(false)
        }
      }))
  }
}
