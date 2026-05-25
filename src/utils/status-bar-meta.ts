export interface StatusBarMetaInput {
  node: string | null | undefined
  npm: string | null | undefined
  pnpm: string | null | undefined
  appName: string | null | undefined
  appVersion: string | null | undefined
}

export interface StatusBarMetaParts {
  appName: string | null
  appVersion: string | null
  nodeVersion: string | null
  npmVersion: string | null
  pnpmVersion: string | null
}

export interface StatusBarRuntimeItem {
  key: 'node' | 'npm' | 'pnpm'
  label: string
  value: string
}

export type StatusBarMetaTranslator = (
  key: 'app.appVersionShort',
  params: Record<string, string>,
) => string

export function resolveStatusBarMetaParts(input: StatusBarMetaInput): StatusBarMetaParts {
  return {
    appName: input.appName ?? null,
    appVersion: input.appVersion ?? null,
    nodeVersion: input.node ?? null,
    npmVersion: input.npm ?? null,
    pnpmVersion: input.pnpm ?? null,
  }
}

export function listStatusBarRuntimeItems(parts: StatusBarMetaParts): StatusBarRuntimeItem[] {
  const items: StatusBarRuntimeItem[] = []
  if (parts.nodeVersion) {
    items.push({ key: 'node', label: 'Node', value: parts.nodeVersion })
  }
  if (parts.npmVersion) {
    items.push({ key: 'npm', label: 'npm', value: parts.npmVersion })
  }
  if (parts.pnpmVersion) {
    items.push({ key: 'pnpm', label: 'pnpm', value: parts.pnpmVersion })
  }
  return items
}

export function hasStatusBarMeta(parts: StatusBarMetaParts): boolean {
  return Boolean(
    (parts.appName && parts.appVersion)
    || parts.nodeVersion
    || parts.npmVersion
    || parts.pnpmVersion,
  )
}

function buildEnvVersionsLabel(parts: StatusBarMetaParts): string | null {
  const segments = listStatusBarRuntimeItems(parts).map(item => `${item.label} ${item.value}`)
  return segments.length > 0 ? segments.join(' · ') : null
}

export function buildStatusBarMetaTitle(
  parts: StatusBarMetaParts,
  t: StatusBarMetaTranslator,
): string {
  const segments: string[] = []

  if (parts.appName && parts.appVersion) {
    segments.push(t('app.appVersionShort', { appName: parts.appName, version: parts.appVersion }))
  }

  const envLabel = buildEnvVersionsLabel(parts)
  if (envLabel) {
    segments.push(envLabel)
  }

  return segments.join(' · ')
}
