# EvoFox Shadow X Pro — HID Protocol Notes

Source: the official web configurator `https://shadowxpro.yjx2012.com/` (Next.js + WebHID),
bundle `_next/static/chunks/515-a5c8b714ccb6186f.js` (device class) and
`app/detail/page-c721549e7e4260d0.js` (settings UI), model file chunk `187` (`mouse_info_p6.json`).
Hardware-confirmed on 2026-10-19 against a receiver with firmware 2.1.3 (built Mar 20 2026).

Status legend: **HW** = confirmed on hardware · **JS** = read from official code only.

## 1. Device identification

| Item | Value | Status |
|---|---|---|
| Receiver (2.4 GHz) | VID `0xA8A5`, PID `0x2255`, product "USB Receiver" | HW |
| Wired | VID `0xA8A4`, product "USB MOUSE" (PID not yet observed) | JS |
| Config interface | Interface 2, top-level collection usage page `0xFF01`, usage `0x10` | HW |
| Other collections | mouse (1/2), keyboard (1/6), consumer (0x0C/1), system (1/0x80), vendor 0xFFAB, 0xFF03 | HW |
| Connection mode | VID 0xA8A4 → wired, otherwise 2.4 GHz | JS |

## 2. Framing

- All traffic: **output/input report ID `0xF0`**, 63 data bytes (64 with ID).
- WebHID: `sendReport(0xF0, bytes[1..63])`; replies via `inputreport` (data excludes the ID).
  node-hid: write `[0xF0, ...]`, reads return `[0xF0, ...]`.
- Reply byte 1 echoes the command. Byte 3 differs between request and reply (status/checksum?) — ignore.
- One command at a time; the official app waits ≤500 ms per reply. Stale replies can be queued
  in the receiver — match by command byte.
- Macro data reads use **report ID `0x06`** (see §4).

## 3. Commands (offsets include report ID at [0])

### 0x03 Version — HW
Request `F0 03`. Reply: [8..19] ASCII banner (`YJX.co.dongl`), [23..25] ASCII digits → `2.1.3`,
[26..36] build date `Mar 20 2026`, [37..44] time `15:00:17`.
The configurator treats version < 2.0.0 as lacking macro type 4.

### 0x30 Battery — HW
Request `F0 30 A5 0B 2E 01 01 01`. Reply [8] = percent (0x64 = 100), [9] = charging flag (0/1).
The mouse may also send this unsolicited.

### 0x0E Config read — HW / 0x0F Config write — HW
Read request `F0 0E A5 0B 2E 01 01 01`.
Write header `F0 0F AE 0A 2F 01 01 01 00`. Device acks by echoing the full write frame.
Same byte layout in read reply and write request:

| Byte | Field | Notes |
|---|---|---|
| 9 | light_mode | 0 Wave, 1 Neon, 2 Touring flash, 3 Yo-yo ball, 4 Unidirectional flashing, 5 Circular breathing, 6 Off |
| 10 | report_rate + 1 | index 0..3 → 125/250/500/1000 Hz (official model file lists only 125/500/1000 for USB) |
| 11 | dpi_count | P6 default 5 |
| 12 | dpi_index + 1 | active stage |
| 13..24 | dpi1..dpi6 | u16 little-endian; UI range 200–6400 |
| 48 | scroll_flag | 0 normal, 1 reversed |
| 49 | lod_value | UI: 1 = 1 mm, 2 = 2 mm (device showed 0) |
| 50 | sensor_flag | bits: 0x10 ripple control, 0x01 line correction, 0x20 motion sync (one UI panel labels 0x10 "line correction" — ambiguous) |
| 51 | key_respond | debounce ms, UI 0–20 |
| 52 | sleep_light | idle minutes before sleep (2.4 G/BT), UI 0–100, 0 = never |
| 53 | highspeed_mode | bit 0 = eSports mode |
| 54 | wakeup_flag << 4 \| move_light_flag | wake: 0 click, 1 move. move-light: 0 stay on, 1 off while moving |

If bytes 14–16 are all 0x00 or all 0xFF the block is uninitialised (official app falls back to defaults).

### 0x08 Keys read — HW / 0x09 Keys write — JS only
Read request `F0 08 A5 0B 2C 00 00 00`. Write header `F0 09 A5 22 2C 00 00 00`.
8 slots × 4 bytes starting at [8]: `type, code1, code2, code3`.
Slots 0–4 = left, right, middle, back, forward. Slots 5–7 = DPI (21 55), wheel up (21 38 01),
wheel down (21 38 FF) — the official app always writes these fixed values.

| type | meaning | codes |
|---|---|---|
| 0x10 | keyboard | code1 = modifier mask (1 Ctrl, 2 Shift, 4 Alt, 8 Win), code2 = HID usage |
| 0x20 | mouse button | code1 = mask (1 L, 2 R, 4 M, 8 back, 16 fwd, 0 disabled) |
| 0x21 | special | 55 = DPI cycle, 38 01 = wheel up, 38 FF = wheel down |
| 0x30 | consumer | code1/code2 = 16-bit usage LE (e.g. CD 00 play/pause, 23 02 browser home) |
| 0x70 | macro | code1 = macro index |

Note: the official "reset all keys" sends only slots 0–4 and leaves 5–7 zero — we don't copy that.

### Macros — JS only (not implemented)
Read: report `06 0C <len> <addrLo> <addrHi>` in 56-byte chunks over 4096 bytes; data from reply [8].
Write: `F0 0D 00 <checksum> <len> <addrLo> <addrHi> 00 <56 bytes>` where checksum = low byte of
sum of `[len, addrLo, addrHi, 0, ...data]`; region `2048 × slot`. Commit: `F0 10 A5 22 00 00 00 05`.
Reset: `06 0F 04`. Event format: 4 bytes `delayLo delayHi flags code`.

### Unsolicited events — JS
- byte1 `0xFA` (and byte9 ≠ 0xD0): DPI stage = [9] − 1, polling index = [10] − 1 (button on mouse).
- byte1 `0x30`: battery update.
- byte1 `0xF0`, byte2 `0xED`: "mouse_status" = [9] (meaning unknown).

## 4. Model defaults ("P6", from `mouse_info_p6.json`)
DPI 800/1200/1600/3200/6400, active stage 2, light 0, polling index 2, debounce 8, sleep 10,
lod 1, sensor 0, highspeed 0, wake 0.

## 5. Real captures (2026-10-19, receiver)

```
TX f0 03
RX f0 03 00 16 38 00 00 00 59 4a 58 2e 63 6f 2e 64 6f 6e 67 6c aa 02 03 32 31 33 4d 61 72 20 32 30 20 32 30 32 36 31 35 3a 30 30 3a 31 37 4d 61 72 20 32 30 20 32 30 32 36 31 35 3a 30 30 3a 31 37

TX f0 30 a5 0b 2e 01 01 01
RX f0 30 a5 95 2e 01 01 01 64 00 (rest 00)

TX f0 0e a5 0b 2e 01 01 01
RX f0 0e a5 74 2e 01 01 01 00 06 03 05 05 20 03 b0 04 40 06 80 0c 00 19 40 1f 00×27 0f 00 11 00×9

TX f0 08 a5 0b 2c 00 00 00
RX f0 08 a5 07 20 00 00 00 20 01 00 00 20 02 00 00 20 04 00 00 20 08 00 00 20 10 00 00 21 55 00 00 21 38 01 00 21 38 ff 00 (rest 00)

TX f0 0f ae 0a 2f 01 01 01 00 06 03 05 05 20 03 b0 04 40 06 80 0c 00 19 40 1f 00×27 0f 00 11 00×9
RX f0 0f ae 86 2f 01 01 01 00 06 03 05 05 20 03 b0 04 40 06 80 0c 00 19 40 1f 00×27 0f 00 11 00×9
```

Decoded: light 6 (off), 500 Hz, 5 stages, active stage 5 (6400), DPI 800/1200/1600/3200/6400(/8000),
lod 0, debounce 0, sleep 15 min, wake on move, light off while moving, battery 100 %, not charging.
