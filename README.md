# ShadowTune

An unofficial Windows app for configuring the **EvoFox Shadow X Pro** wireless gaming mouse, so you
don't need to use the browser-based configurator.

> Not affiliated with Amkette or EvoFox. It sends only the commands the official web configurator
> uses, and checks every change by reading it back from the mouse.

## What you can change

- **DPI:** 1–5 stages (200–6400 in steps of 50), plus which stage is active
- **Polling rate:** 125, 250, 500 or 1000 Hz
- **Key debounce, eSports mode, lift-off distance and scroll direction**
- **Sensor options:** ripple control, angle snapping and motion sync (experimental)
- **Lighting:** 7 effects, and whether the lights turn off while the mouse is moving
- **Sleep timer:** 1–100 minutes or never, and whether clicking or moving wakes the mouse
- **Buttons:** an interactive drawing of the mouse shows what each button does (click a part to change it); reassign the 5 programmable buttons to mouse, media, browser or system actions, or to any key combination
- **Profiles:** saved on your PC, with export and import
- **Battery level, charging status and firmware version**, plus a low-battery alert from the tray
- **Power keys:** make a side button open a program or website, type text, switch profile, cycle DPI, toggle lights, take a screenshot or lock the PC (Shortcuts tab)
- **Keyboard shortcuts** that work in any program, e.g. Ctrl+Alt+D for the next DPI stage (Shortcuts tab)
- **Tray quick menu:** right-click the tray icon to change the DPI stage, toggle the lights or apply a profile
- **Battery tab:** history chart and time-left estimate; battery % on the tray icon; low-battery and fully-charged alerts
- **DPI popup** near the cursor when you press the DPI button
- **Windows pointer settings** (speed, enhance pointer precision, scroll lines), optionally saved in profiles
- **Profiles folder** you can put in OneDrive so profiles follow you to other PCs
- **Automatic profile switching** per program (off by default, Settings tab)
- **Start with Windows**, running quietly in the tray (Settings tab)

Settings are stored on the mouse itself, so they still apply on other PCs.

## Install

Run `ShadowTune-Setup-<version>.exe` from the `dist` folder. It installs for your user account only, so no administrator rights are needed.

## Use

1. Plug in the USB receiver, or connect the mouse with its cable. The app finds it automatically.
2. Change settings. They aren't sent to the mouse until you click **Apply to mouse**.
3. If the app says the mouse isn't responding, move or click it to wake it up.

No mouse to hand? Turn on **Demo device** in the top bar to try the app with a simulated mouse.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Windows refused access to the mouse" | Close any browser tab that has the official configurator open, then click **Refresh** |
| The app keeps looking for the mouse | Try a different USB port. Bluetooth mode can't be configured, so use the receiver or the cable |
| "Mouse asleep or off" | Move or click the mouse. You can change the sleep timer under **Lighting & power** |
| A setting doesn't seem to take effect | Open **Diagnostics**, click **Copy log**, and include the log in your bug report |

To restore the factory settings, go to **Diagnostics → Restore factory settings**.

## Development

```bash
npm install          # if Electron fails to start: node node_modules/electron/install.js
npm run dev          # run with hot reload  (EVOFOX_MOCK=1 starts with the demo device)
npm test             # unit and service tests (they use frames captured from a real mouse)
npm run typecheck
npm run probe        # read-only check of the connected mouse
npm run dist         # build the installer into dist/
```

> If you launch the app from inside VS Code tooling and Electron starts as plain Node, unset
> `ELECTRON_RUN_AS_NODE` first.

Further reading:
- `docs/DEVELOPER_GUIDE.md`: beginner's guide to running, building, changing and releasing the app
- `project.md`: specification, architecture, and which features are verified
- `docs/PROTOCOL.md`: the HID protocol, byte by byte
- `plan.md`: work plan and status
