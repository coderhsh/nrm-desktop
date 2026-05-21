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
 * @param {string} version
 * @returns {Array<DefaultReleaseArtifact & { filename: string }>}
 */
export function listDefaultReleaseArtifactNames(version) {
  return DEFAULT_RELEASE_ARTIFACTS.map(item => ({
    ...item,
    filename: buildArtifactName({
      version,
      platform: item.platform,
      arch: item.arch,
      kind: item.kind,
    }),
  }))
}
