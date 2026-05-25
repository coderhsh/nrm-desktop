export interface StatusBarMetaInput {
  node: string | null | undefined
  npm: string | null | undefined
  appName: string | null | undefined
  appVersion: string | null | undefined
}

export interface StatusBarMetaParts {
  appName: string | null
  appVersion: string | null
  nodeVersion: string | null
  npmVersion: string | null
}

export type StatusBarMetaTranslator = (
  key: 'app.envVersions' | 'app.appVersionShort',
  params: Record<string, string>,
) => string

export function resolveStatusBarMetaParts(input: StatusBarMetaInput): StatusBarMetaParts {
  return {
    appName: input.appName ?? null,
    appVersion: input.appVersion ?? null,
    nodeVersion: input.node ?? null,
    npmVersion: input.npm ?? null,
  }
}

export function hasStatusBarMeta(parts: StatusBarMetaParts): boolean {
  return Boolean(
    (parts.appName && parts.appVersion)
    || parts.nodeVersion
    || parts.npmVersion,
  )
}

export function buildStatusBarMetaTitle(
  parts: StatusBarMetaParts,
  t: StatusBarMetaTranslator,
): string {
  const segments: string[] = []

  if (parts.appName && parts.appVersion) {
    segments.push(t('app.appVersionShort', { appName: parts.appName, version: parts.appVersion }))
  }

  if (parts.nodeVersion || parts.npmVersion) {
    segments.push(
      t('app.envVersions', {
        nodeVersion: parts.nodeVersion ?? '—',
        npmVersion: parts.npmVersion ?? '—',
      }),
    )
  }

  return segments.join(' · ')
}
