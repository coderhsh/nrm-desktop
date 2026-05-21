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
