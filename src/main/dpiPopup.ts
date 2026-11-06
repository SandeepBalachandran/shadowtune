// Small "DPI 1600" badge near the cursor when the DPI button on the mouse is pressed.
// Listens to what the mouse reports — never writes to it.

import { BrowserWindow, screen } from 'electron'

const WIDTH = 190
const HEIGHT = 62
const VISIBLE_MS = 1300

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
  html,body{margin:0;height:100%;background:transparent;overflow:hidden;font-family:'Segoe UI Variable','Segoe UI',sans-serif}
  .b{box-sizing:border-box;height:100%;display:flex;align-items:center;gap:12px;padding:0 16px;border-radius:12px;
     background:rgba(23,26,33,.94);border:1px solid #2a2f3a;color:#e8eaef;opacity:0;transform:translateY(4px);transition:all .14s}
  .b.on{opacity:1;transform:none}
  .l{font-size:11px;color:#8b93a3;letter-spacing:.06em}
  .v{font-size:24px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1}
  .d{display:flex;gap:4px;margin-top:6px}
  .d i{width:14px;height:4px;border-radius:2px;background:#2a2f3a}
  .d i.a{background:#ff5a1f}
</style></head><body><div class="b" id="b"><div><div class="l">DPI</div><div class="v" id="v"></div></div><div><div class="l" id="s"></div><div class="d" id="d"></div></div></div>
<script>
  function show(dpi, stage, count){
    document.getElementById('v').textContent = dpi;
    document.getElementById('s').textContent = 'STAGE ' + (stage + 1) + '/' + count;
    document.getElementById('d').innerHTML = Array.from({length: count}, (_, i) => '<i class="' + (i === stage ? 'a' : '') + '"></i>').join('');
    const b = document.getElementById('b'); b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
  }
  function hide(){ document.getElementById('b').classList.remove('on') }
</script></body></html>`

export class DpiPopup {
  private win: BrowserWindow | null = null
  private ready: Promise<void> | null = null
  private hideTimer: ReturnType<typeof setTimeout> | null = null

  async show(dpi: number, stage: number, count: number) {
    const win = this.ensure()
    await this.ready
    const cursor = screen.getCursorScreenPoint()
    const area = screen.getDisplayNearestPoint(cursor).workArea
    const x = Math.min(Math.max(cursor.x + 18, area.x), area.x + area.width - WIDTH)
    const y = Math.min(Math.max(cursor.y + 22, area.y), area.y + area.height - HEIGHT)
    win.setBounds({ x, y, width: WIDTH, height: HEIGHT })
    await win.webContents.executeJavaScript(`show(${Number(dpi)}, ${Number(stage)}, ${Number(count)})`)
    win.showInactive()
    if (this.hideTimer) clearTimeout(this.hideTimer)
    this.hideTimer = setTimeout(() => {
      void win.webContents.executeJavaScript('hide()').catch(() => undefined)
      setTimeout(() => win.hide(), 160)
    }, VISIBLE_MS)
  }

  dispose() {
    this.win?.destroy()
    this.win = null
  }

  private ensure(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win
    this.win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    this.win.setAlwaysOnTop(true, 'screen-saver')
    this.win.setIgnoreMouseEvents(true)
    this.ready = this.win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`)
    return this.win
  }
}
