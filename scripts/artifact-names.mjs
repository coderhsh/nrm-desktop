/* @desc 安装包产物统一命名：nrm-desktop_{version}_{platform}_{arch}[-suffix].{ext} */

/**
 * @typedef {'dmg' | 'setup' | 'msi' | 'portable'} ArtifactKind
 */

/**
 * @param {{ version: string, platform: 'macos' | 'windows', arch: 'aarch64' | 'x64', kind: ArtifactKind }} options
 * @returns {string}
 */
export function buildArtifactName(options) {
  const { version, platform, arch, kind } = options
  const base = `nrm-desktop_${version}_${platform}_${arch}`

  switch (kind) {
    case 'dmg':
      return `${base}.dmg`
    case 'setup':
      return `${base}-setup.exe`
    case 'msi':
      return `${base}.msi`
    case 'portable':
      return `${base}-portable.zip`
    default:
      throw new Error(`[artifact-names] 未知产物类型: ${kind}`)
  }
}

/**
 * @returns {'aarch64' | 'x64'}
 */
export function getMacArtifactArch() {
  return process.arch === 'arm64' ? 'aarch64' : 'x64'
}

/**
 * @param {string} version
 * @returns {string}
 */
export function getMacDmgArtifactName(version) {
  return buildArtifactName({
    version,
    platform: 'macos',
    arch: getMacArtifactArch(),
    kind: 'dmg',
  })
}

/**
 * @param {string} version
 * @param {'aarch64' | 'x64'} [arch]
 * @returns {string}
 */
export function getMacUpdaterArchiveArtifactName(version, arch = getMacArtifactArch()) {
  return `nrm-desktop_${version}_macos_${arch}.app.tar.gz`
}

/**
 * @param {string} version
 * @returns {string}
 */
export function getWindowsSetupArtifactName(version) {
  return buildArtifactName({
    version,
    platform: 'windows',
    arch: 'x64',
    kind: 'setup',
  })
}

/**
 * @param {string} filename
 * @returns {string}
 */
export function getUpdaterSignatureArtifactName(filename) {
  return `${filename}.sig`
}

/**
 * @param {string} version
 * @returns {string}
 */
export function getWindowsMsiArtifactName(version) {
  return buildArtifactName({
    version,
    platform: 'windows',
    arch: 'x64',
    kind: 'msi',
  })
}

/**
 * @param {string} version
 * @returns {string}
 */
export function getWindowsPortableArtifactName(version) {
  return buildArtifactName({
    version,
    platform: 'windows',
    arch: 'x64',
    kind: 'portable',
  })
}

/**
 * @typedef {Object} DefaultReleaseArtifact
 * @property {'macos' | 'windows'} platform
 * @property {'aarch64' | 'x64'} arch
 * @property {ArtifactKind} kind
 * @property {string} labelEn
 * @property {string} labelZh
 * @property {string} noteEn
 * @property {string} noteZh
 */

/** @typedef {Object} ReleaseArtifactOptions
 * @property {boolean} [buildWindowsX64]
 * @property {boolean} [buildMacosX64]
 * @property {boolean} [buildMacosArm64]
 * @property {boolean} [windowsSetupExe]
 * @property {boolean} [windowsMsi]
 * @property {boolean} [windowsPortableZip]
 */

/** 与 Release Installers workflow 默认勾选一致。 */
export const DEFAULT_RELEASE_ARTIFACT_OPTIONS = /** @type {const} */ ({
  buildWindowsX64: true,
  buildMacosX64: false,
  buildMacosArm64: true,
  windowsSetupExe: true,
  windowsMsi: true,
  windowsPortableZip: true,
})

/** 与 workflow release 模式默认产物一致。 */
export const DEFAULT_RELEASE_ARTIFACTS = /** @type {const} */ ([
  {
    platform: 'macos',
    arch: 'aarch64',
    kind: 'dmg',
    labelEn: 'macOS (Apple Silicon)',
    labelZh: 'macOS（Apple Silicon）',
    noteEn: 'For M1 / M2 / M3 / M4 Macs',
    noteZh: '适用于 M 系列芯片 Mac',
  },
  {
    platform: 'macos',
    arch: 'x64',
    kind: 'dmg',
    labelEn: 'macOS (Intel)',
    labelZh: 'macOS（Intel）',
    noteEn: 'For Intel-based Macs',
    noteZh: '适用于 Intel 芯片 Mac',
  },
  {
    platform: 'windows',
    arch: 'x64',
    kind: 'setup',
    labelEn: 'Windows (x64) setup.exe',
    labelZh: 'Windows（x64）setup.exe',
    noteEn: 'Recommended for most users',
    noteZh: '推荐大多数用户使用',
  },
  {
    platform: 'windows',
    arch: 'x64',
    kind: 'msi',
    labelEn: 'Windows (x64) .msi',
    labelZh: 'Windows（x64）.msi',
    noteEn: 'For IT / silent deployment',
    noteZh: '适合企业部署或静默安装',
  },
  {
    platform: 'windows',
    arch: 'x64',
    kind: 'portable',
    labelEn: 'Windows (x64) portable.zip',
    labelZh: 'Windows（x64）portable.zip',
    noteEn: 'Extract and run, no installer',
    noteZh: '解压即用，无需安装',
  },
])

/**
 * @param {DefaultReleaseArtifact} item
 * @param {Required<ReleaseArtifactOptions>} options
 * @returns {boolean}
 */
function shouldIncludeReleaseArtifact(item, options) {
  if (item.platform === 'macos' && item.arch === 'aarch64') {
    return options.buildMacosArm64
  }
  if (item.platform === 'macos' && item.arch === 'x64') {
    return options.buildMacosX64
  }
  if (item.platform === 'windows') {
    if (!options.buildWindowsX64) {
      return false
    }
    if (item.kind === 'setup') {
      return options.windowsSetupExe
    }
    if (item.kind === 'msi') {
      return options.windowsMsi
    }
    if (item.kind === 'portable') {
      return options.windowsPortableZip
    }
  }
  return false
}

/**
 * @param {ReleaseArtifactOptions} [options]
 * @returns {Required<ReleaseArtifactOptions>}
 */
export function normalizeReleaseArtifactOptions(options = {}) {
  return {
    buildWindowsX64: options.buildWindowsX64 ?? DEFAULT_RELEASE_ARTIFACT_OPTIONS.buildWindowsX64,
    buildMacosX64: options.buildMacosX64 ?? DEFAULT_RELEASE_ARTIFACT_OPTIONS.buildMacosX64,
    buildMacosArm64: options.buildMacosArm64 ?? DEFAULT_RELEASE_ARTIFACT_OPTIONS.buildMacosArm64,
    windowsSetupExe: options.windowsSetupExe ?? DEFAULT_RELEASE_ARTIFACT_OPTIONS.windowsSetupExe,
    windowsMsi: options.windowsMsi ?? DEFAULT_RELEASE_ARTIFACT_OPTIONS.windowsMsi,
    windowsPortableZip: options.windowsPortableZip ?? DEFAULT_RELEASE_ARTIFACT_OPTIONS.windowsPortableZip,
  }
}

/**
 * @param {string} version
 * @param {ReleaseArtifactOptions} [options]
 * @returns {Array<DefaultReleaseArtifact & { filename: string }>}
 */
export function listReleaseArtifactNames(version, options = DEFAULT_RELEASE_ARTIFACT_OPTIONS) {
  const normalized = normalizeReleaseArtifactOptions(options)
  return DEFAULT_RELEASE_ARTIFACTS
    .filter(item => shouldIncludeReleaseArtifact(item, normalized))
    .map(item => ({
      ...item,
      filename: buildArtifactName({
        version,
        platform: item.platform,
        arch: item.arch,
        kind: item.kind,
      }),
    }))
}

/**
 * @typedef {Object} ReleaseUpdaterPlatform
 * @property {'windows-x86_64' | 'darwin-aarch64' | 'darwin-x86_64'} platform
 * @property {string} urlFilename
 * @property {string} signatureFilename
 */

/**
 * @param {string} version
 * @param {ReleaseArtifactOptions} [options]
 * @returns {ReleaseUpdaterPlatform[]}
 */
export function listReleaseUpdaterPlatforms(version, options = DEFAULT_RELEASE_ARTIFACT_OPTIONS) {
  const normalized = normalizeReleaseArtifactOptions(options)
  /** @type {ReleaseUpdaterPlatform[]} */
  const platforms = []

  if (normalized.buildWindowsX64 && normalized.windowsSetupExe) {
    const setupFilename = getWindowsSetupArtifactName(version)
    platforms.push({
      platform: 'windows-x86_64',
      urlFilename: setupFilename,
      signatureFilename: getUpdaterSignatureArtifactName(setupFilename),
    })
  }

  if (normalized.buildMacosArm64) {
    const archiveFilename = getMacUpdaterArchiveArtifactName(version, 'aarch64')
    platforms.push({
      platform: 'darwin-aarch64',
      urlFilename: archiveFilename,
      signatureFilename: getUpdaterSignatureArtifactName(archiveFilename),
    })
  }

  if (normalized.buildMacosX64) {
    const archiveFilename = getMacUpdaterArchiveArtifactName(version, 'x64')
    platforms.push({
      platform: 'darwin-x86_64',
      urlFilename: archiveFilename,
      signatureFilename: getUpdaterSignatureArtifactName(archiveFilename),
    })
  }

  return platforms
}

/**
 * @param {string} version
 * @param {ReleaseArtifactOptions} [options]
 * @returns {string[]}
 */
export function listReleaseUpdaterAssetNames(version, options = DEFAULT_RELEASE_ARTIFACT_OPTIONS) {
  const names = new Set()
  for (const item of listReleaseUpdaterPlatforms(version, options)) {
    names.add(item.urlFilename)
    names.add(item.signatureFilename)
  }
  return [...names]
}

/**
 * @param {string} version
 * @returns {Array<DefaultReleaseArtifact & { filename: string }>}
 */
export function listDefaultReleaseArtifactNames(version) {
  return listReleaseArtifactNames(version, DEFAULT_RELEASE_ARTIFACT_OPTIONS)
}
