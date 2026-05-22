import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { buildUpdaterManifest } from './generate-updater-manifest.mjs'
import {
  getMacUpdaterArchiveArtifactName,
  getUpdaterSignatureArtifactName,
  getWindowsSetupArtifactName,
} from './artifact-names.mjs'

async function withTempDir(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nrm-updater-manifest-'))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function writeAssetPair(dir, filename, signature = `sig-${filename}`) {
  await writeFile(path.join(dir, filename), 'asset', 'utf8')
  await writeFile(path.join(dir, getUpdaterSignatureArtifactName(filename)), signature, 'utf8')
}

describe('buildUpdaterManifest', () => {
  it('generates Windows and macOS updater platforms from release assets', async () => {
    await withTempDir(async dir => {
      const version = '1.2.3'
      const windowsSetup = getWindowsSetupArtifactName(version)
      const macosArm = getMacUpdaterArchiveArtifactName(version, 'aarch64')

      await writeAssetPair(dir, windowsSetup, 'windows-signature')
      await writeAssetPair(dir, macosArm, 'macos-signature')

      const manifest = await buildUpdaterManifest({
        version,
        assetsDir: dir,
        repository: 'coderhsh/nrm-desktop',
        releaseTag: 'v1.2.3',
        notes: 'Release notes',
        pubDate: '2026-05-22T00:00:00.000Z',
        artifactOptions: {
          buildWindowsX64: true,
          buildMacosArm64: true,
          buildMacosX64: false,
          windowsSetupExe: true,
          windowsMsi: true,
          windowsPortableZip: true,
        },
      })

      expect(manifest).toEqual({
        version,
        notes: 'Release notes',
        pub_date: '2026-05-22T00:00:00.000Z',
        platforms: {
          'windows-x86_64': {
            signature: 'windows-signature',
            url: `https://github.com/coderhsh/nrm-desktop/releases/download/v1.2.3/${windowsSetup}`,
          },
          'darwin-aarch64': {
            signature: 'macos-signature',
            url: `https://github.com/coderhsh/nrm-desktop/releases/download/v1.2.3/${macosArm}`,
          },
        },
      })
    })
  })

  it('omits macOS Intel when that platform is not built', async () => {
    await withTempDir(async dir => {
      const version = '1.2.3'
      const windowsSetup = getWindowsSetupArtifactName(version)
      await writeAssetPair(dir, windowsSetup)

      const manifest = await buildUpdaterManifest({
        version,
        assetsDir: dir,
        repository: 'coderhsh/nrm-desktop',
        releaseTag: 'v1.2.3',
        notes: '',
        pubDate: '2026-05-22T00:00:00.000Z',
        artifactOptions: {
          buildWindowsX64: true,
          buildMacosArm64: false,
          buildMacosX64: false,
          windowsSetupExe: true,
          windowsMsi: false,
          windowsPortableZip: false,
        },
      })

      expect(Object.keys(manifest.platforms)).toEqual(['windows-x86_64'])
    })
  })

  it('fails when a required signature is missing', async () => {
    await withTempDir(async dir => {
      const version = '1.2.3'
      const windowsSetup = getWindowsSetupArtifactName(version)
      await writeFile(path.join(dir, windowsSetup), 'asset', 'utf8')

      await expect(buildUpdaterManifest({
        version,
        assetsDir: dir,
        repository: 'coderhsh/nrm-desktop',
        releaseTag: 'v1.2.3',
        notes: '',
        pubDate: '2026-05-22T00:00:00.000Z',
        artifactOptions: {
          buildWindowsX64: true,
          buildMacosArm64: false,
          buildMacosX64: false,
          windowsSetupExe: true,
          windowsMsi: false,
          windowsPortableZip: false,
        },
      })).rejects.toThrow('无法读取')
    })
  })
})
