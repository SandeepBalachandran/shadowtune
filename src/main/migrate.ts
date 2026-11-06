// One-time move from the app's old name ("EvoFox Control") to ShadowTune.
// The name decides the data folder (%APPDATA%\<name>) and the "Start with Windows" entry,
// so without this the renamed app would start with no profiles or settings.

import { app } from 'electron'
import { constants, promises as fs } from 'node:fs'
import path from 'node:path'

const OLD_NAME = 'EvoFox Control'
const OLD_LOGIN_ITEM = 'com.evofox.control'
const DATA_FILES = ['settings.json', 'profiles.json', 'battery-history.json']

/** Copies data files from the old folder (never overwriting) and removes the old startup entry. */
export async function migrateFromOldName(log: (msg: string) => void): Promise<void> {
  const oldDir = path.join(app.getPath('appData'), OLD_NAME)
  const newDir = app.getPath('userData')
  if (oldDir === newDir) return
  try {
    await fs.access(oldDir)
  } catch {
    return // nothing to migrate
  }

  await fs.mkdir(newDir, { recursive: true })
  for (const file of DATA_FILES) {
    const from = path.join(oldDir, file)
    const to = path.join(newDir, file)
    try {
      await fs.copyFile(from, to, constants.COPYFILE_EXCL)
      log(`Copied ${file} from the old "${OLD_NAME}" folder.`)
    } catch {
      // missing in the old folder, or already present in the new one
    }
  }

  if (app.isPackaged) {
    // The old entry points at the old exe; the current one is re-registered from settings.
    app.setLoginItemSettings({ openAtLogin: false, name: OLD_LOGIN_ITEM })
  }
}
