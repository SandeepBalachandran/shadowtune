// System-tray icon: battery % on the icon (optional), connection + battery in the tooltip,
// low-battery and fully-charged alerts, a quick menu (DPI / lights / profile — one write per
// click), and keeps the app running when the window is closed.

import { Menu, MenuItemConstructorOptions, nativeImage, NativeImage, Notification, Tray } from 'electron'
import { DeviceState, OperationResult } from '../shared/types'
import { batteryTrayIcon } from './trayIcon'

const LOW_BATTERY = 15

export interface TrayOptions {
  batteryIcon: boolean
  notifyFullyCharged: boolean
}

/** Quick actions offered in the right-click menu (each is one write to the mouse). */
export interface TrayQuickMenu {
  profiles(): { id: string; name: string }[]
  applyProfile(id: string): Promise<OperationResult>
  setDpiStage(stage: number): Promise<OperationResult>
  toggleLights(): Promise<OperationResult>
}

export class AppTray {
  private tray: Tray
  private readonly appIcon: NativeImage
  private warnedLowBattery = false
  private announcedFull = false
  private hintShown = false
  private options: TrayOptions = { batteryIcon: true, notifyFullyCharged: true }
  private last: DeviceState | null = null
  private iconKey = ''

  constructor(
    iconPath: string,
    private readonly showWindow: () => void,
    private readonly quit: () => void,
    private readonly quick: TrayQuickMenu
  ) {
    this.appIcon = nativeImage.createFromPath(iconPath)
    this.tray = new Tray(this.appIcon)
    this.tray.setToolTip('ShadowTune')
    this.tray.on('click', showWindow)
    this.tray.on('double-click', showWindow)
    this.setMenu('Looking for mouse…')
  }

  /** Rebuilds the menu (e.g. after profiles changed). */
  refreshMenu() {
    if (this.last) this.setMenu(describe(this.last))
  }

  setOptions(options: TrayOptions) {
    this.options = options
    this.iconKey = ''
    if (this.last) this.update(this.last)
  }

  update(s: DeviceState) {
    this.last = s
    const status = describe(s)
    this.tray.setToolTip(`ShadowTune\n${status}`)
    this.setMenu(status)
    this.updateIcon(s)

    const b = s.battery
    if (!b || !s.mouseResponding) return

    if (!b.charging && b.percent > 0 && b.percent <= LOW_BATTERY) {
      if (!this.warnedLowBattery) notify('EvoFox mouse battery low', `${b.percent}% left — plug in the cable to charge.`)
      this.warnedLowBattery = true
    } else if (b.charging || b.percent > LOW_BATTERY + 5) {
      this.warnedLowBattery = false
    }

    if (b.charging && b.percent >= 100) {
      if (!this.announcedFull && this.options.notifyFullyCharged) notify('EvoFox mouse fully charged', 'You can unplug the cable now.')
      this.announcedFull = true
    } else if (!b.charging || b.percent < 95) {
      this.announcedFull = false
    }
  }

  /** Called the first time the window is hidden to the tray, so the user knows where it went. */
  showBackgroundHint() {
    if (this.hintShown) return
    this.hintShown = true
    this.tray.displayBalloon({
      title: 'ShadowTune is still running',
      content: 'It keeps watching your mouse from the tray. Right-click the icon and choose Quit to exit.',
      iconType: 'none'
    })
  }

  destroy() {
    this.tray.destroy()
  }

  private updateIcon(s: DeviceState) {
    const b = s.battery
    const showBattery = this.options.batteryIcon && b && s.status === 'connected' && s.mouseResponding
    const key = showBattery ? `${b!.percent}-${b!.charging}` : 'app'
    if (key === this.iconKey) return
    this.iconKey = key
    this.tray.setImage(showBattery ? batteryTrayIcon(b!.percent, b!.charging) : this.appIcon)
  }

  private setMenu(status: string) {
    const s = this.last
    const c = s?.status === 'connected' && s.mouseResponding && !s.busy ? s.config : null
    const run = (op: () => Promise<OperationResult>) => () =>
      void op().then((r) => {
        if (!r.ok && !r.message.startsWith('Ignored')) notify('ShadowTune', r.message)
      })
    const profiles = this.quick.profiles()

    const items: MenuItemConstructorOptions[] = [
      { label: status, enabled: false },
      { type: 'separator' },
      {
        label: 'DPI',
        enabled: !!c,
        submenu: c
          ? c.dpiStages.slice(0, c.dpiCount).map((dpi, i) => ({
              label: `${dpi} DPI`,
              type: 'radio' as const,
              checked: i === c.activeDpiStage,
              click: run(() => this.quick.setDpiStage(i))
            }))
          : [{ label: 'Mouse not available', enabled: false }]
      },
      { label: 'Lights on', type: 'checkbox', enabled: !!c, checked: !!c && c.lightMode !== 6, click: run(() => this.quick.toggleLights()) },
      {
        label: 'Apply profile',
        enabled: !!c && profiles.length > 0,
        submenu: profiles.length
          ? profiles.map((p) => ({ label: p.name, click: run(() => this.quick.applyProfile(p.id)) }))
          : [{ label: 'No profiles saved', enabled: false }]
      },
      { type: 'separator' },
      { label: 'Open ShadowTune', click: this.showWindow },
      { label: 'Quit', click: this.quit }
    ]
    this.tray.setContextMenu(Menu.buildFromTemplate(items))
  }
}

function notify(title: string, body: string) {
  if (Notification.isSupported()) new Notification({ title, body }).show()
}

function describe(s: DeviceState): string {
  if (s.status !== 'connected' || !s.identity) return 'Mouse not connected'
  if (!s.mouseResponding) return 'Mouse asleep or off'
  const via = s.identity.source === 'mock' ? 'demo device' : s.identity.mode === 'wired' ? 'cable' : 'receiver'
  const battery = s.battery ? ` · battery ${s.battery.percent}%${s.battery.charging ? ' (charging)' : ''}` : ''
  return `Connected via ${via}${battery}`
}
