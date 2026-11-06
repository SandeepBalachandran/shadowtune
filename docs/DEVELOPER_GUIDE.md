# ShadowTune — Developer Guide (for beginners)

This guide explains how this Windows app is built, run, changed and shipped. It assumes you know a
little JavaScript, but nothing about desktop apps. Read it top to bottom once; later, use the
table of contents to jump around.

1. [The big picture](#1-the-big-picture)
2. [One-time setup on a new PC](#2-one-time-setup-on-a-new-pc)
3. [Daily commands](#3-daily-commands)
4. [Building the installer (.exe)](#4-building-the-installer-exe)
5. [Folder map — what every file does](#5-folder-map--what-every-file-does)
6. [How a setting travels from a click to the mouse](#6-how-a-setting-travels-from-a-click-to-the-mouse)
7. [How the app talks to the mouse (HID)](#7-how-the-app-talks-to-the-mouse-hid)
8. [Recipes: common changes](#8-recipes-common-changes)
9. [Testing](#9-testing)
10. [Debugging](#10-debugging)
11. [Releasing a new version](#11-releasing-a-new-version)
12. [Troubleshooting](#12-troubleshooting)
13. [Glossary](#13-glossary)

---

## 1. The big picture

### What kind of app is this?

It's an **Electron** app. Electron lets you build a desktop app with web technology: the window
is a built-in Chrome browser showing a web page (HTML/CSS/React), and behind it runs **Node.js**,
which can do things a web page can't — read files, talk to USB devices, show a tray icon.
VS Code, Discord and Slack are built the same way.

### The three parts of an Electron app

| Part | Runs in | Can do | In this project |
|---|---|---|---|
| **Main process** | Node.js (one per app) | Everything: files, USB, windows, tray | `src/main/` |
| **Renderer** | Chrome (one per window) | Only draw the UI — no files, no USB (for security) | `src/renderer/` |
| **Preload** | The bridge between them | Exposes a small, safe set of functions to the UI | `src/preload/` |

```
┌───────────────────────── ShadowTune.exe ─────────────────────────┐
│                                                                      │
│  Renderer (React UI)          Preload             Main process        │
│  "Apply to mouse" clicked ─▶ window.evofox ─IPC─▶ DeviceService ─USB─┼─▶ mouse
│  shows result toast      ◀── .applyConfig() ◀──── verify + reply      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**IPC** ("inter-process communication") is how the UI and the main process send messages to each
other. The UI never touches USB directly — it asks the main process, which checks the request
and does the work.

### The tools used

| Tool | What it is | Why we use it |
|---|---|---|
| **Node.js / npm** | JavaScript runtime + package manager | Installs libraries, runs scripts |
| **TypeScript** | JavaScript with types | Catches mistakes before running |
| **React** | UI library | Builds the screens from components |
| **Tailwind CSS** | Styling with class names (`bg-panel px-4`) | Fast, consistent styling |
| **electron-vite** | Build tool | Compiles main, preload and UI in one go |
| **node-hid** | USB HID library | Sends/receives bytes to/from the mouse |
| **Vitest** | Test runner | Automated tests |
| **electron-builder** | Packager | Turns the app into a Windows installer `.exe` |

---

## 2. One-time setup on a new PC

1. Install **Node.js** (LTS version) from https://nodejs.org — this also installs `npm`.
2. Install **Git** (optional, for version control) from https://git-scm.com.
3. Open a terminal (Windows Terminal / PowerShell / VS Code terminal) in the project folder:
   ```powershell
   cd "C:\My Files\Tutorials\evofox"
   npm install
   ```
   This downloads all libraries into `node_modules\` (large; never edit or commit it).
4. If `npm run dev` later says Electron failed to install, run:
   ```powershell
   node node_modules/electron/install.js
   ```
   (It downloads the Electron program itself. Retry if you see a network/TLS error.)

> **Why "allowScripts" in package.json?** Newer npm versions block packages from running setup
> scripts unless you approve them. We approved four that need it: electron, esbuild, node-hid,
> @tailwindcss/oxide. To approve another: `npm install-scripts approve <package>`.

---

## 3. Daily commands

Run these in the project folder.

| Command | What it does | When to use |
|---|---|---|
| `npm run dev` | Starts the app in **development mode**: UI changes appear instantly when you save a file | While writing code |
| `npm test` | Runs all automated tests (~2 s) | Before building / after changes |
| `npm run typecheck` | Checks TypeScript for errors without running anything | Before building |
| `npm run build` | Compiles code into `out\` (no installer) | Rarely needed by itself |
| `npm start` | Runs the compiled app from `out\` | To try a production-like build |
| `npm run probe` | Read-only check that prints what the mouse reports | Is the mouse visible? |
| `npm run dist` | Builds the **installer** into `dist\` | When you want an .exe to install/share |

**Demo mode:** no mouse? Toggle **Demo device** in the app's top bar, or start with
`$env:EVOFOX_MOCK=1; npm run dev` (PowerShell). A simulated mouse answers instead.

**Dev mode tips**
- Changing a file in `src/renderer/` → the window updates by itself.
- Changing a file in `src/main/` or `src/preload/` → electron-vite restarts the app.
- Press `Ctrl+Shift+I` in the dev window to open Chrome DevTools (console, elements).

---

## 4. Building the installer (.exe)

```powershell
npm run dist
```

What happens, step by step:

1. **electron-vite build** compiles TypeScript/React into plain JavaScript in `out\`.
2. **electron-builder** (settings in `electron-builder.yml`):
   - copies `out\` + `node-hid` + the Electron runtime into `dist\win-unpacked\`,
   - runs `scripts/after-pack.cjs`, which stamps our icon and version onto `ShadowTune.exe`,
   - wraps everything into an NSIS installer: `dist\ShadowTune-Setup-<version>.exe`.

| Output | Meaning |
|---|---|
| `dist\ShadowTune-Setup-0.1.0.exe` | **The installer** — this is what you share or run to install |
| `dist\win-unpacked\ShadowTune.exe` | The app without installing (handy for quick tests) |
| `dist\*.blockmap`, `latest.yml` | Used by auto-updaters; ignore |

**Before building:** quit the running app (tray icon → Quit) — Windows locks the files of a running
program and the build fails with "file in use".

**Installing:** double-click the Setup exe. Because the app is **not code-signed**, Windows
SmartScreen says "unknown publisher" → *More info → Run anyway*. It installs per-user (no admin)
to `%LOCALAPPDATA%\Programs\shadowtune\` and appears as **ShadowTune** in Start menu and
*Settings → Apps → Installed apps* (uninstall from there).

**Where user data lives:** `%APPDATA%\shadowtune\profiles.json` (saved profiles). Uninstalling
keeps it on purpose.

### Packaging settings we had to change (and why)

| Setting in `electron-builder.yml` | Why |
|---|---|
| `npmRebuild: false` | electron-builder tries to recompile node-hid from C++ source, which needs Visual Studio. node-hid already ships ready-made binaries that work in Electron. |
| `asarUnpack: **/*.node` | The app's files are packed into one archive (`app.asar`); native `.node` binaries can't load from inside it, so they're kept outside. |
| `signAndEditExecutable: false` | The signing toolkit electron-builder downloads contains Mac symlinks that Windows can't extract without admin rights. We stamp the icon ourselves in `after-pack.cjs` instead. |
| `nsis.perMachine: false` | Install for the current user only → no admin prompt. |

### The app icon

- Source images: `build/icons/icon-16.png … icon-256.png` (drawn by a PowerShell script during
  development).
- Packed into `build/icon.ico` (installer + exe) and copied to `resources/icon.ico` (window +
  tray at runtime).
- To change the icon: replace the PNGs, rebuild the `.ico` (any online "PNG to ICO" tool or the
  Node snippet in git history), copy it to both places, then `npm run dist`.

---

## 5. Folder map — what every file does

```
evofox/
├─ package.json            Project name, version, dependencies, npm scripts
├─ electron.vite.config.ts Build config for main / preload / renderer
├─ electron-builder.yml    Installer settings
├─ tsconfig.node.json      TypeScript settings for main/preload/shared/tests
├─ tsconfig.web.json       TypeScript settings for the UI
├─ vitest.config.ts        Test settings
├─ README.md               User-facing readme
├─ project.md              Specification: goals, architecture, what's verified
├─ plan.md                 Work log + to-do list + gotchas
├─ docs/
│  ├─ PROTOCOL.md          Byte-by-byte description of the mouse protocol
│  └─ DEVELOPER_GUIDE.md   This file
├─ build/                  Icon files used by the installer
├─ resources/              Icon files used by the running app
├─ scripts/
│  ├─ probe.mjs            `npm run probe` — read-only mouse check
│  └─ after-pack.cjs       Stamps icon/version on the exe during `npm run dist`
├─ src/
│  ├─ shared/              Code used by BOTH main and UI
│  │  ├─ types.ts          Data shapes (MouseConfig, KeyBinding…), limits, defaults, labels
│  │  ├─ validation.ts     Rules: what values are allowed (checked in UI and again in main)
│  │  ├─ keymap.ts         The list of button actions + how to describe a binding
│  │  └─ api.ts            The list of IPC calls the UI may make
│  ├─ main/                Main process (Node.js)
│  │  ├─ index.ts          App start: window, IPC handlers, tray, startup, single-instance lock
│  │  ├─ tray.ts           Tray icon, tooltip, low-battery notification
│  │  ├─ profiles.ts       Save/load profiles to profiles.json
│  │  ├─ settings.ts       Save/load PC-side settings to settings.json
│  │  ├─ powerKeys.ts      F13–F24 and keyboard shortcuts → actions (open, website, type text, lock…)
│  │  ├─ quickActions.ts   DPI / lights / profile actions shared by shortcuts and tray (throttled)
│  │  ├─ autoSwitch.ts     Per-program profile switching (+ memory-wear safeguards)
│  │  ├─ win32.ts          Windows API calls via koffi (front window, lock, Ctrl+V, mic mute, pointer settings)
│  │  ├─ trayIcon.ts       Draws the battery % tray icon
│  │  ├─ batteryHistory.ts Battery samples + time-left estimate
│  │  ├─ dpiPopup.ts       "DPI 1600" popup near the cursor
│  │  └─ device/
│  │     ├─ protocol.ts       Turns settings ⇄ 64-byte USB frames (pure functions, no I/O)
│  │     ├─ transport.ts      Interface: "something that can send/receive frames"
│  │     ├─ nodeHidBackend.ts Real USB implementation using node-hid
│  │     ├─ mockBackend.ts    Fake mouse for demo mode and tests
│  │     └─ deviceService.ts  The brain: finds the mouse, queues commands, verifies writes
│  ├─ preload/index.ts     Exposes `window.evofox` to the UI
│  └─ renderer/            The UI (React)
│     ├─ index.html
│     └─ src/
│        ├─ main.tsx       React entry point
│        ├─ App.tsx        Layout: header, sidebar tabs, apply bar, toasts
│        ├─ useDevice.ts   Holds device state + your unsaved edits ("draft")
│        ├─ index.css      Tailwind + colour theme
│        └─ components/    One file per tab + shared widgets (ui.tsx)
├─ tests/                  Automated tests
├─ out/                    (generated) compiled code — don't edit
├─ dist/                   (generated) installer output — don't edit
└─ node_modules/           (generated) libraries — don't edit
```

---

## 6. How a setting travels from a click to the mouse

Example: you change **Polling rate** to 1000 Hz and click **Apply to mouse**.

1. **UI edit** — `PerformanceTab.tsx` calls `update({ pollingRate: 3 })`. This only changes the
   **draft** in `useDevice.ts`; nothing is sent yet. Because the draft differs from what the mouse
   reported, the orange **Apply** bar appears.
2. **Apply** — `useDevice.apply()` calls `window.evofox.device.applyConfig(draft)`.
3. **Preload** — `src/preload/index.ts` forwards it over IPC (`ipcRenderer.invoke('device:applyConfig', …)`).
4. **Main** — `src/main/index.ts` receives it and calls `service.applyConfig(config)`.
5. **Validation** — `deviceService.ts` runs `validateConfig()` (from `shared/validation.ts`).
   Bad values are rejected here even if the UI let them through.
6. **Encoding** — `protocol.ts` `configWrite()` builds a 64-byte frame:
   `F0 0F AE 0A 2F 01 01 01 00 <light> <rate+1> <count> …`
7. **Sending** — `nodeHidBackend.ts` writes the frame to the mouse's receiver via node-hid.
8. **Acknowledgement** — the receiver echoes the frame back; the service matches it by its
   command byte (`0x0F`).
9. **Verification** — the service immediately **reads the settings back** (`0x0E`) and compares.
   Only if they match does it answer `{ ok: true, message: 'Saved to mouse and verified.' }`.
10. **Back in the UI** — a green toast appears; the state update (sent by main on every change)
    refreshes the screen.

Every step is logged in **Diagnostics → Communication log** (TX = sent, RX = received).

---

## 7. How the app talks to the mouse (HID)

- **HID** (Human Interface Device) is the USB standard for mice and keyboards. Windows already has
  the driver, so **no driver install is needed**.
- The receiver exposes several HID "collections". The normal mouse/keyboard ones are used by
  Windows; one **vendor collection** (usage page `0xFF01`, usage `0x10`) is for configuration.
  That's the one we open.
- We send and receive **64-byte frames**. Byte 0 is the report ID `0xF0`, byte 1 is the command.

| Command | Meaning |
|---|---|
| `0x03` | Read firmware version |
| `0x30` | Read battery |
| `0x0E` / `0x0F` | Read / write settings (DPI, polling, lighting, …) |
| `0x08` / `0x09` | Read / write button assignments |

- Settings are stored **on the mouse**, so they work on any PC, even without this app.
- Profiles are stored **on the PC** (the mouse holds only one active setup).
- Only one config tool should be open at a time — the official web configurator keeps its own
  copy of the settings and will overwrite ours. Our app warns when it sees another program write.

Full details: `docs/PROTOCOL.md`. How we found all this: the official web configurator is a web
page using WebHID; we read its JavaScript and confirmed every command on a real mouse.

---

### PC-side features (don't touch the mouse unless noted)

| Feature | How it works | Files |
|---|---|---|
| **Power keys** | A mouse button is mapped to F13–F24 (keys no keyboard has). The app registers those keys system-wide (`globalShortcut`) and runs the chosen action. Only works while the app runs (tray). | `powerKeys.ts`, `ShortcutsTab.tsx` |
| **Automatic profile switching** | Every second, `win32.ts` asks Windows which program is in front. If a rule matches and the program stays in front 3 s, the profile is applied. Off by default. Writes to the mouse → safeguards in `autoSwitch.ts`. | `autoSwitch.ts`, `SettingsTab.tsx` |
| **Start with Windows** | `app.setLoginItemSettings` adds a Windows startup entry that launches the exe with `--hidden` (tray only). Only in the installed app. | `index.ts`, `SettingsTab.tsx` |
| **Keyboard shortcuts** | Same mechanism as power keys, but any modifier+key combo (e.g. Ctrl+Alt+D). Mouse-changing actions go through `QuickActions`, which allows at most one write every 400 ms. | `powerKeys.ts`, `quickActions.ts`, `ShortcutsTab.tsx` |
| **Tray quick menu** | Right-click the tray icon: DPI stage, Lights on/off, Apply profile (one write per click). | `tray.ts` |
| **Battery history** | Every battery reading is sampled (max one per 10 min) into `battery-history.json`; drain rate over unplugged stretches gives the time-left estimate. | `batteryHistory.ts`, `BatteryTab.tsx` |
| **Tray battery icon & alerts** | Draws the % as pixels into a bitmap; low (≤15 %) and fully-charged notifications. | `trayIcon.ts`, `tray.ts` |
| **DPI popup** | When the mouse reports a DPI-button press, a tiny always-on-top window shows the new DPI near the cursor. | `dpiPopup.ts` |
| **Windows pointer settings** | Reads/writes Windows' own mouse settings with `SystemParametersInfo`; profiles can include them. | `win32.ts`, `SettingsTab.tsx` |
| **Mic mute** | Calls Windows Core Audio (COM) through koffi to toggle the default microphone. | `win32.ts` |
| **Profiles folder** | `ProfileStore.setDir()` moves `profiles.json` to a chosen folder (e.g. OneDrive) and merges. | `profiles.ts` |

Data files (all in `%APPDATA%\ShadowTune\`): `settings.json`, `profiles.json` (unless moved),
`battery-history.json`.

**koffi** is a library that lets JavaScript call Windows DLL functions directly (here: `user32.dll`,
`kernel32.dll`). It ships ready-made binaries, so no compiler is needed.

## 8. Recipes: common changes

### Add a new power-key action
1. Add a variant to `PowerAction` in `shared/types.ts` and a check in `validatePowerAction`
   (`shared/validation.ts`).
2. Describe it in `describePowerAction` (`shared/keymap.ts`).
3. Implement it in `perform()` in `src/main/powerKeys.ts`.
4. Add it to the `KINDS` list (and any input field) in `ShortcutsTab.tsx`.

### Change a label or text in the UI
Find the text in `src/renderer/src/components/*.tsx` (VS Code: `Ctrl+Shift+F`), edit it, save.
With `npm run dev` running, the window updates immediately.

### Change colours / theme
Edit the `@theme` block in `src/renderer/src/index.css` (e.g. `--color-accent`).

### Add a new button action (e.g. "Ctrl+Shift+T")
Add a line to the right group in `ACTION_GROUPS` in `src/shared/keymap.ts`:
```ts
{ label: 'Reopen tab (Ctrl+Shift+T)', binding: combo(0x01 | 0x02, 0x17) },
```
Modifier bits: Ctrl `0x01`, Shift `0x02`, Alt `0x04`, Win `0x08`. Key codes: see `KEYBOARD_KEYS`
in the same file (they are standard USB HID usage codes).

### Change an allowed range (e.g. DPI max)
Edit the limits in `src/shared/types.ts` (`DPI_LIMITS`, `SLEEP_LIMITS`, …). Validation and UI both
read from there. Run `npm test` afterwards.

### Add a new setting to the UI
1. Make sure the field exists in `MouseConfig` (`shared/types.ts`) and in `protocol.ts`
   (`CFG` offsets, `configWrite`, `parseConfig`).
2. Add a range check in `shared/validation.ts`.
3. Add a control in the right tab component, calling `update({ yourField: value })`.
4. Add a test in `tests/protocol.test.ts`.

### Add a new IPC call (UI → main)
1. Add the channel name to `IPC` and the method to `EvofoxApi` in `src/shared/api.ts`.
2. Implement it in `src/preload/index.ts` (`ipcRenderer.invoke(...)`).
3. Handle it in `registerIpc()` in `src/main/index.ts` (`ipcMain.handle(...)`).
4. Call it from the UI as `window.evofox.<group>.<method>()`.

---

## 9. Testing

```powershell
npm test                                   # all automated tests
npx vitest                                 # watch mode: re-runs on save
$env:HW=1; npx vitest run tests/hardware.test.ts   # real-mouse test (changes lighting, then restores it)
```

| Test file | What it checks |
|---|---|
| `tests/protocol.test.ts` | Encoding/decoding against **real frames captured from the mouse** |
| `tests/deviceService.test.ts` | Connect, read, write+verify, sleeping mouse, unplug, other-app detection — using the fake mouse |
| `tests/validationAndProfiles.test.ts` | Value rules, profile save/import/export |
| `tests/hardware.test.ts` | Skipped unless `HW=1`; runs against the real mouse |

The fake mouse (`mockBackend.ts`) answers exactly like the real one, so most logic can be tested
without hardware.

---

## 10. Debugging

| Problem area | Where to look |
|---|---|
| UI errors | In dev mode: `Ctrl+Shift+I` → Console tab |
| Main-process errors | The terminal where `npm run dev` runs |
| What was sent to the mouse | App → **Diagnostics** → Communication log (Copy log button) |
| Is the mouse visible at all? | `npm run probe` |
| Which HID devices Windows sees | PowerShell: `Get-PnpDevice -PresentOnly \| ? InstanceId -match 'VID_A8A5\|VID_A8A4'` |

**Driving the real app from scripts:** start it with
`"dist\win-unpacked\ShadowTune.exe" --remote-debugging-port=9333`, then open
`http://127.0.0.1:9333` in Chrome to inspect it, or script it over the Chrome DevTools Protocol.

---

## 11. Releasing a new version

1. Change `"version"` in `package.json` (e.g. `0.1.0` → `0.2.0`). Windows uses this to decide
   that the new installer is an upgrade.
2. `npm run typecheck && npm test`
3. Quit the running app (tray → Quit).
4. `npm run dist`
5. Test: run the new `dist\ShadowTune-Setup-0.2.0.exe` over the installed old version; check
   the version under *Settings → Apps*; check your profiles are still there.
6. Share the Setup exe (e.g. GitHub Releases). Mention it's unsigned (SmartScreen warning).

**Optional: code signing.** Buying a code-signing certificate removes the SmartScreen warning.
You'd then set `signAndEditExecutable: true` and the certificate settings in
`electron-builder.yml`.

---

## 12. Troubleshooting

| Symptom | Cause → fix |
|---|---|
| `electron.app` is undefined / app exits immediately | The env var `ELECTRON_RUN_AS_NODE=1` is set (happens inside VS Code extension/Claude Code shells). Run `Remove-Item Env:ELECTRON_RUN_AS_NODE` (PowerShell) or `env -u ELECTRON_RUN_AS_NODE npm run dev` (bash). |
| "Electron failed to install correctly" | `node node_modules/electron/install.js` |
| Build: "node-gyp failed to rebuild node-hid" | `npmRebuild: false` missing from `electron-builder.yml` |
| Build: "Cannot create symbolic link … winCodeSign" | `signAndEditExecutable: false` missing |
| Build: file in use / EBUSY | Quit the running app first (tray → Quit) |
| Build: Tailwind "Cannot convert undefined or null to object" | Tailwind 4.0.0 bug; keep `tailwindcss` / `@tailwindcss/vite` at 4.1.x |
| App says "Looking for your mouse…" forever | Receiver unplugged, or mouse in Bluetooth mode (not supported). Try `npm run probe`. |
| "Windows refused access to the mouse" | Close the official web configurator tab, click Refresh |
| Settings "revert" | Another configurator (web tab) is writing old values. Close it. |
| "Mouse asleep or off" | Move/click the mouse; the app retries automatically |
| Second launch does nothing | Only one copy may run — it's already in the tray; click the tray icon |

---

## 13. Glossary

| Term | Meaning |
|---|---|
| **Electron** | Framework: Chrome + Node.js packaged as a desktop app |
| **Main process** | The Node.js side of an Electron app (USB, files, windows) |
| **Renderer** | The Chrome side that shows the UI |
| **Preload** | Small script that safely connects renderer and main |
| **IPC** | Messages between renderer and main |
| **HID** | USB standard for input devices; needs no custom driver |
| **Report / frame** | One packet of bytes sent to or from a HID device (64 bytes here) |
| **VID / PID** | USB vendor ID / product ID (receiver: `A8A5` / `2255`) |
| **Native module** | A library compiled to machine code (`.node` file), e.g. node-hid |
| **asar** | Archive file that holds the app's JavaScript inside the installed app |
| **NSIS** | The tool that makes the Windows installer |
| **Code signing** | Digital signature on the exe; without it Windows shows "unknown publisher" |
| **Mock** | A fake device used for demos and tests |
| **Draft** | Your unsaved edits in the UI, sent only when you click Apply |
