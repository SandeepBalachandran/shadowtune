# ShadowTune — Work Plan & Handoff

> Handoff notes for whoever continues this work (human or a new Claude session).
> Read this first, then `project.md` (spec) and `docs/PROTOCOL.md` (byte-level protocol).
> **New to Electron/Windows apps?** Start with `docs/DEVELOPER_GUIDE.md` — setup, run, build,
> install, how everything works, recipes and troubleshooting.
> Last updated: 2026-10-19 (session 2).

## 1. Where things stand

**The app works end to end on the real mouse.** `npm run dev` / installed app → detects the
2.4 GHz receiver, reads firmware 2.1.3, battery, DPI stages, polling rate and buttons, and shows them in
the UI (screenshot verified).

Hardware-confirmed protocol paths (all idempotent tests, nothing changed on the mouse):
- Reads: version 0x03, battery 0x30, config 0x0E, buttons 0x08
- Writes: config 0x0F (ack echoes frame, byte 3 = 0x86) and buttons 0x09 (ack echoes, byte 3 = 0x13),
  both verified by read-back

**Stack:** Electron 33 + React 18 + TypeScript + Tailwind 4.1 + node-hid 3.1.2 (main process) +
electron-vite + Vitest + electron-builder. (Changed from Tauri: Rust not installed; node-hid proven.)

## 2. Done ✅

- [x] Protocol reverse-engineered from official configurator; documented in `docs/PROTOCOL.md`
- [x] Device layer: `src/main/device/*` (protocol, transport, node-hid backend, mock, DeviceService)
- [x] Shared: `src/shared/*` (types, validation, keymap, IPC api)
- [x] Main process, IPC, profiles store, preload bridge
- [x] Renderer UI: Header, Performance, Buttons, Lighting & power, Profiles, Diagnostics,
      draft + "Apply to mouse" bar, toasts, empty states
- [x] Tests: 27 passing (`tests/protocol.test.ts` uses real captured frames,
      `tests/deviceService.test.ts` uses MockBackend, `tests/validationAndProfiles.test.ts`)
- [x] Typecheck clean (`npm run typecheck`)
- [x] `scripts/probe.mjs` read-only diagnostic (`npm run probe`) — works, even alongside the app
- [x] `electron-builder.yml` (NSIS, per-user, asarUnpack *.node), `README.md`, `.gitignore`
- [x] Ran the built app against the real receiver — connected and read correctly

## 3. To do

### C. Hardware checks that need a human at the mouse
- [ ] Change each setting in the app → Apply → confirm the physical effect:
      DPI (cursor speed), polling (use a polling-rate tester website), lighting effect,
      debounce, scroll direction, lift-off
- [ ] Remap a button (e.g. Forward → Play/Pause), test it, then restore defaults
- [ ] Sleep: set 1 min, leave idle, confirm the app shows "Mouse asleep or off"; test wake on
      click vs move
- [ ] Press the DPI button on the mouse → the active stage in the app should follow
      (unsolicited 0xFA event — not yet observed on hardware)
- [ ] Wired mode: plug in the cable (VID 0xA8A4) → note PID, confirm reads/writes, charging flag
- [ ] Record results in `project.md` §4 (capability status table)

### D. Packaging
- [x] `npm run dist` → `dist/ShadowTune-Setup-0.1.0.exe` (83 MB). Needed `npmRebuild: false`
      (no C++ toolchain; node-hid prebuilds are fine) and `signAndEditExecutable: false`
      (winCodeSign symlink extraction needs admin). Packaged app (`dist/win-unpacked`) verified
      connecting to the real receiver.
- [ ] Run the installer: install / upgrade / uninstall test
- [x] App icon: `build/icons/icon-*.png` (drawn with System.Drawing) → `build/icon.ico` and
      `resources/icon.ico`. Used for window/taskbar (runtime, `?asset` import), tray, installer,
      and the exe (stamped by `scripts/after-pack.cjs` via rcedit, since signAndEditExecutable is off)
- [x] Tray icon (`src/main/tray.ts`): tooltip with connection + battery, Open/Quit menu,
      low-battery notification (≤15 %). Closing the window hides to tray; Quit exits.
- [x] Lighting labels clarified: "While moving → Dim while moving" is NOT lights-off; "Effect → Off"
      is (user confusion 2026-10-19)
- [ ] `git init` + first commit (repo is not under version control yet)

### F. Daily-use features (done 2026-10-19)
- [x] **Power keys** (`src/main/powerKeys.ts`, Shortcuts tab): mouse button → F13–F24 → globalShortcut →
      open program/file/folder, website, type text (clipboard + Ctrl+V via koffi), switch profile, next DPI,
      lights on/off, screenshot (`ms-screenclip:`), lock PC. Verified: simulated F24 press triggered action.
- [x] **Automatic profile switching** (`src/main/autoSwitch.ts`, Settings tab) — **off by default**
      (user request). Foreground app via koffi (`src/main/win32.ts`, 1 s poll). Flash-wear safeguards:
      skip if identical, 3 s dwell, 200 automatic writes/day cap then pause, same profile → no write.
- [x] **Start with Windows** (Settings tab, off by default): `setLoginItemSettings` with `--hidden`
      → starts in tray. Only in the installed app (`app.isPackaged`).
- [x] PC-side settings stored in `%APPDATA%/shadowtune/settings.json` (`src/main/settings.ts`).
- [x] Installer trimmed: only Windows x64 binaries of koffi/node-hid packed.

### G. "Safe" features — never write to the mouse (done 2026-10-21)
- [x] Mic mute power-key action (Windows Core Audio via koffi COM calls; tested mute→unmute on this PC)
- [x] Per-program power-key actions (`powerKeyOverrides`, Shortcuts tab)
- [x] "Fully charged" notification (tray.ts; charging && 100 %)
- [x] Battery % drawn on the tray icon (`trayIcon.ts`, pixel font, colour by level)
- [x] Battery history + time-left estimate (`batteryHistory.ts`, Battery tab with chart)
- [x] On-screen DPI popup (`dpiPopup.ts`) — **depends on the unsolicited 0xFA event, not yet seen on
      hardware**: press the mouse's DPI button to confirm
- [x] Windows pointer settings (speed / enhance precision / scroll lines) in Settings and saved in
      profiles (SystemParametersInfo; tested write-back of identical values)
- [x] Profiles folder for sync (OneDrive etc.), merges on switch (`ProfileStore.setDir`)

### H. Quick controls — one write per use (done 2026-10-21)
- [x] Tray quick menu (`tray.ts`): DPI stage (radio list), Lights on/off, Apply profile
- [x] Global keyboard shortcuts (`hotkeys` setting, Shortcuts tab with key recorder + quick-add
      Ctrl+Alt+D/L/M); any PowerAction. F13–F24 excluded (reserved for power keys).
- [x] `src/main/quickActions.ts`: shared DPI/lights/profile actions, **throttled to 1 write / 400 ms**
      (held keys auto-repeat). Verified on hardware: 3 rapid presses → 1 write.
- [x] Text typing waits for Ctrl/Alt/Shift/Win release (GetAsyncKeyState) so hotkeys don't corrupt the paste.
- [x] Buttons tab "Your mouse" card (`MouseDiagram.tsx`): our own SVG drawing with callouts showing each
      button's current action; click a part → scrolls to and focuses its row; hover links row ↔ part.
      (The official app only shows a static product photo `/products/mouse_p6.png` — not copied, it's theirs.)
- [ ] Still to do (automatic writes, need a daily cap like auto-switch): lighting schedule,
      auto-restore after reconnect. Macro editor deliberately skipped.

### E. Later / optional
- [ ] Macro editor (protocol in `docs/PROTOCOL.md` — risky multi-chunk writes, do last)
- [ ] Tray icon with battery %, low-battery notification
- [ ] Auto-apply profile per foreground app
- [ ] Bluetooth mode — probably not configurable

## 4. Gotchas

- **Audit vs official app (2026-10-19).** The official configurator picks its settings panel per model:
  `ty(name)` (G7 Pro / G3 V2 Pro) → panel `tx`, everything else incl. Shadow X Pro → panel `tr`.
  Panel `tr` renders ONLY: lighting effect, polling (wired = fixed "1000", not selectable), scroll
  direction. It defines sensor bit 0x10 as "line correction". Sleep, wake, move-light, debounce, LOD,
  eSports, ripple, motion sync are panel-`tx` (other models) → moved to our **Advanced** tab with a
  warning. Also fixed: DPI accepts any integer 200–6400 (official slider step 1; we previously
  required ×50 and would refuse to apply if a stage was e.g. 1234); left button locked to left click
  (official refuses to change it). The official DPI editor also re-sorts stages ascending — we don't
  (harmless).

- **Don't run the official web configurator at the same time.** It keeps its own copy of the
  settings (browser localStorage) and writes it back, so changes made in our app look like they
  "revert". Diagnosed 2026-10-19 (user report: side buttons reverted after Refresh). Our UI path
  was verified via CDP: change → Apply → Refresh persists. The app now detects foreign write echoes
  (0x0F/0x09 frames it didn't request), follows those values and shows a warning.
- Hardware test: `HW=1 npx vitest run tests/hardware.test.ts` (toggles light mode, restores it).
- UI can be driven for debugging: launch `dist/win-unpacked/ShadowTune.exe
  --remote-debugging-port=9333` and evaluate JS over CDP (`window.evofox.*`, DOM clicks).

- **`ELECTRON_RUN_AS_NODE=1`** is set inside the VS Code extension host / Claude Code shell →
  Electron starts as plain Node (`electron.app` undefined). Launch with
  `env -u ELECTRON_RUN_AS_NODE npm run dev`. Normal terminals are fine.
- npm 12 blocks install scripts: `allowScripts` in package.json covers electron, esbuild,
  node-hid, @tailwindcss/oxide. If the Electron binary is missing:
  `node node_modules/electron/install.js` (retry on TLS errors).
- Tailwind **4.0.0** Vite plugin crashes ("Cannot convert undefined or null to object") — use 4.1.x.
- Windows foreground-lock blocks screenshots of the app; capture with `PrintWindow(hwnd, hdc, 2)`.
- `npm run dist` may fail with EBUSY / rcedit "Unable to commit changes" right after closing the app —
  antivirus scanning the new exe. `after-pack.cjs` retries; otherwise wait a few seconds and rerun.
- koffi's install script is blocked by npm 12 but not needed (prebuilt binaries are in the package).

## 5. Key protocol facts (don't re-derive)

- Vendor collection **usage page 0xFF01 / usage 0x10**. Receiver VID 0xA8A5 PID 0x2255; wired VID 0xA8A4.
- 64-byte frames, report ID **0xF0** at byte 0 (node-hid includes it). Reply echoes command at byte 1.
  Byte 3 of replies varies — ignore it. Match replies by command byte (stale frames happen).
- Profiles are NOT on the mouse (official app uses browser localStorage) — ours are local JSON.
- 5 programmable buttons; slots 6–8 = DPI cycle, wheel up, wheel down (kept as-is).
- Polling index 0..3 = 125/250/500/1000 Hz, stored as index + 1.
- Official app reads wake/move-light both from the high nibble (bug); we split nibbles.

## 6. Commands

```bash
npm install
npm run dev            # from VS Code tooling: env -u ELECTRON_RUN_AS_NODE npm run dev
npm test
npm run typecheck
npm run probe
npm run dist
```
