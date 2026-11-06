// Profile storage: a single JSON file. Lives in the app's data folder by default, or in a folder
// the user picks (e.g. inside OneDrive) so profiles follow them to other PCs. Nothing leaves the
// PC unless the user chooses a synced folder.

import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { KeyBinding, MouseConfig, Profile, WindowsPointerSettings } from '../shared/types'
import { validateProfile } from '../shared/validation'

interface ProfileFile {
  version: 1
  profiles: Profile[]
}

export class ProfileStore {
  private dir: string

  constructor(private readonly defaultDir: string) {
    this.dir = defaultDir
  }

  get folder(): string {
    return this.dir
  }

  private get file() {
    return path.join(this.dir, 'profiles.json')
  }

  /**
   * Moves profile storage to `dir` (null = default folder). Profiles from the old location are
   * merged in; when both have the same profile, the most recently updated copy wins.
   */
  async setDir(dir: string | null): Promise<void> {
    const next = dir ?? this.defaultDir
    if (path.resolve(next) === path.resolve(this.dir)) return
    const current = await this.list()
    this.dir = next
    const there = await this.list()
    const byId = new Map(there.map((p) => [p.id, p]))
    for (const p of current) {
      const other = byId.get(p.id)
      if (!other || other.updatedAt < p.updatedAt) byId.set(p.id, p)
    }
    await this.write([...byId.values()])
  }

  async list(): Promise<Profile[]> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8')) as ProfileFile
      return Array.isArray(raw.profiles) ? raw.profiles.filter((p) => validateProfile(p).length === 0) : []
    } catch {
      return []
    }
  }

  async save(name: string, config: MouseConfig, buttons: KeyBinding[], id?: string, windows?: WindowsPointerSettings): Promise<Profile> {
    const profiles = await this.list()
    const now = Date.now()
    const existing = id ? profiles.find((p) => p.id === id) : undefined
    const profile: Profile = {
      id: existing?.id ?? randomUUID(),
      name: name.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      config,
      buttons,
      ...(windows ? { windows } : {})
    }
    const errors = validateProfile(profile)
    if (errors.length) throw new Error(errors.join(' '))
    await this.write(existing ? profiles.map((p) => (p.id === profile.id ? profile : p)) : [...profiles, profile])
    return profile
  }

  async remove(id: string): Promise<void> {
    await this.write((await this.list()).filter((p) => p.id !== id))
  }

  async get(id: string): Promise<Profile | undefined> {
    return (await this.list()).find((p) => p.id === id)
  }

  /** Parses an exported profile file and stores it as a new profile. */
  async importFrom(text: string): Promise<Profile> {
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error('The file is not valid JSON.')
    }
    const p = data as Profile
    const errors = validateProfile(p)
    if (errors.length) throw new Error(`Not a valid EvoFox profile: ${errors.join(' ')}`)
    return this.save(p.name, p.config, p.buttons, undefined, p.windows)
  }

  private async write(profiles: Profile[]) {
    await fs.mkdir(this.dir, { recursive: true })
    const tmp = `${this.file}.tmp`
    await fs.writeFile(tmp, JSON.stringify({ version: 1, profiles } satisfies ProfileFile, null, 2), 'utf8')
    await fs.rename(tmp, this.file)
  }
}
