#!/usr/bin/env node
/* @desc 收集上个版本 tag 到当前 HEAD 的 changelog 生成上下文，供任意 agent 生成中英文更新日志。 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const defaultRootDir = path.resolve(__dirname, '..')

const TAG_SELECTION_REQUIRED_EXIT_CODE = 2

/**
 * @typedef {{ base?: string, head: string, json: boolean }} ChangelogContextArgs
 * @typedef {{ name: string, commit: string, description: string }} TagCandidate
 */

/**
 * @param {string[]} argv
 * @returns {ChangelogContextArgs}
 */
export function parseArgs(argv) {
  const args = {
    base: '',
    head: 'HEAD',
    json: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    if (item === '--') {
      continue
    }
    if (item === '--json') {
      args.json = true
      continue
    }
    if (item === '--base') {
      args.base = argv[index + 1] || ''
      index += 1
      continue
    }
    if (item === '--head') {
      args.head = argv[index + 1] || 'HEAD'
      index += 1
      continue
    }
    throw new Error(`[changelog-context] 未知参数: ${item}`)
  }

  return args
}

/**
 * @param {string} tag
 * @returns {{ major: number, minor: number, patch: number } | null}
 */
export function parseSemverTag(tag) {
  const match = tag.match(/^v(\d+)\.(\d+)\.(\d+)$/)
  if (!match) {
    return null
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
export function compareSemverTags(left, right) {
  const a = parseSemverTag(left)
  const b = parseSemverTag(right)
  if (!a || !b) {
    throw new Error(`[changelog-context] 无法比较非语义版本 tag: ${left}, ${right}`)
  }

  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] > b[key]) return 1
    if (a[key] < b[key]) return -1
  }
  return 0
}

/**
 * @param {string[]} tags
 * @returns {string}
 */
export function getHighestSemverTag(tags) {
  return tags
    .filter(tag => parseSemverTag(tag))
    .sort(compareSemverTags)
    .at(-1) || ''
}

/**
 * @param {string[]} args
 * @param {string} cwd
 * @returns {string}
 */
function runGit(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || '').trim()
    throw new Error(message || `[changelog-context] git ${args.join(' ')} failed`)
  }
  return result.stdout.trim()
}

/**
 * @param {string} tag
 * @param {string} cwd
 * @returns {string}
 */
function resolveTagCommit(tag, cwd) {
  return runGit(['rev-parse', '--short', `${tag}^{commit}`], cwd)
}

/**
 * @param {string} head
 * @param {string} cwd
 * @returns {TagCandidate}
 */
function resolveNearestHistoryTag(head, cwd) {
  const name = runGit(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', head], cwd)
  return {
    name,
    commit: resolveTagCommit(name, cwd),
    description: '历史最近 tag：当前分支从该发布点继续演进',
  }
}

/**
 * @param {string} cwd
 * @returns {TagCandidate}
 */
function resolveHighestSemverTag(cwd) {
  const tags = runGit(['tag', '--list', 'v[0-9]*'], cwd)
    .split(/\r?\n/)
    .map(tag => tag.trim())
    .filter(Boolean)
  const name = getHighestSemverTag(tags)
  if (!name) {
    throw new Error('[changelog-context] 未找到可用版本 tag（格式 vX.Y.Z）')
  }
  return {
    name,
    commit: resolveTagCommit(name, cwd),
    description: '最高版本 tag：当前仓库可见版本 tag 中语义版本最大者',
  }
}

/**
 * @param {string} filePath
 * @returns {'app-ui' | 'tauri-backend' | 'release-ci' | 'docs' | 'tests' | 'scripts' | 'config' | 'other'}
 */
export function classifyFilePath(filePath) {
  if (/(^|\/)([^/]+\.)?(test|spec)\.[cm]?[jt]s$/.test(filePath) || filePath.includes('__tests__/')) {
    return 'tests'
  }
  if (filePath.startsWith('.github/workflows/')) {
    return 'release-ci'
  }
  if (/^scripts\/.*(release|updater|artifact|ci|timing|changelog|version|tag)/.test(filePath)) {
    return 'release-ci'
  }
  if (filePath.startsWith('src-tauri/')) {
    return 'tauri-backend'
  }
  if (filePath.startsWith('src/')) {
    return 'app-ui'
  }
  if (filePath.startsWith('docs/') || /^README(\.|$)/.test(filePath) || /^CHANGELOG(\.|$)/.test(filePath)) {
    return 'docs'
  }
  if (filePath.startsWith('scripts/')) {
    return 'scripts'
  }
  if (/^(package.json|pnpm-lock.yaml|vite\.config\.|tsconfig|eslint\.config\.|uno\.config\.)/.test(filePath)) {
    return 'config'
  }
  return 'other'
}

/**
 * @param {string} subject
 * @returns {'Added' | 'Changed' | 'Fixed'}
 */
export function classifyCommitSubject(subject) {
  const normalized = subject.trim().toLowerCase()
  if (/^(feat|feature)(\(.+\))?!?:/.test(normalized)) {
    return 'Added'
  }
  if (/^(fix|bugfix)(\(.+\))?!?:/.test(normalized)) {
    return 'Fixed'
  }
  return 'Changed'
}

/**
 * @param {string[]} files
 * @returns {Record<string, string[]>}
 */
export function groupFilesByArea(files) {
  /** @type {Record<string, string[]>} */
  const groups = {
    'app-ui': [],
    'tauri-backend': [],
    'release-ci': [],
    docs: [],
    tests: [],
    scripts: [],
    config: [],
    other: [],
  }

  for (const filePath of files) {
    groups[classifyFilePath(filePath)].push(filePath)
  }

  return Object.fromEntries(
    Object.entries(groups).filter(([, items]) => items.length > 0),
  )
}

/**
 * @param {string} base
 * @param {string} head
 * @param {string} cwd
 * @returns {Array<{ hash: string, shortHash: string, subject: string, author: string, date: string }>}
 */
function collectCommits(base, head, cwd) {
  const output = runGit([
    'log',
    '--no-merges',
    '--date=short',
    '--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ad',
    `${base}..${head}`,
  ], cwd)

  if (!output) {
    return []
  }

  return output.split(/\r?\n/).map((line) => {
    const [hash, shortHash, subject, author, date] = line.split('\x1f')
    return { hash, shortHash, subject, author, date }
  })
}

/**
 * @param {string} base
 * @param {string} head
 * @param {string} cwd
 * @returns {string[]}
 */
function collectChangedFiles(base, head, cwd) {
  const output = runGit(['diff', '--name-only', `${base}...${head}`], cwd)
  return output
    ? output.split(/\r?\n/).map(filePath => filePath.trim()).filter(Boolean)
    : []
}

/**
 * @param {Array<{ subject: string }>} commits
 * @returns {Record<'Added' | 'Changed' | 'Fixed', string[]>}
 */
export function buildSuggestedSections(commits) {
  return commits.reduce((sections, commit) => {
    sections[classifyCommitSubject(commit.subject)].push(commit.subject)
    return sections
  }, { Added: [], Changed: [], Fixed: [] })
}

/**
 * @param {ChangelogContextArgs} args
 * @param {string} cwd
 * @returns {object}
 */
export function buildChangelogContext(args, cwd = defaultRootDir) {
  const nearestHistoryTag = resolveNearestHistoryTag(args.head, cwd)
  const highestSemverTag = resolveHighestSemverTag(cwd)

  if (!args.base && nearestHistoryTag.name !== highestSemverTag.name) {
    return {
      status: 'tag-selection-required',
      message: '历史最近 tag 与最高版本 tag 不一致，需要用户选择 changelog 起点。',
      nearestHistoryTag,
      highestSemverTag,
      head: args.head,
    }
  }

  const baseTag = args.base || nearestHistoryTag.name
  const commits = collectCommits(baseTag, args.head, cwd)
  const changedFiles = collectChangedFiles(baseTag, args.head, cwd)

  return {
    status: 'ok',
    baseTag,
    baseCommit: resolveTagCommit(baseTag, cwd),
    head: args.head,
    headCommit: runGit(['rev-parse', '--short', args.head], cwd),
    nearestHistoryTag,
    highestSemverTag,
    commits,
    changedFiles,
    fileGroups: groupFilesByArea(changedFiles),
    suggestedSections: buildSuggestedSections(commits),
  }
}

/**
 * @param {unknown} payload
 * @returns {string}
 */
function renderJson(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`
}

/**
 * @param {ReturnType<typeof buildChangelogContext>} context
 * @returns {string}
 */
export function renderMarkdown(context) {
  if (context.status === 'tag-selection-required') {
    return `# Changelog Context: tag selection required

历史最近 tag 与最高版本 tag 不一致，不能自动选择 changelog 起点。

| Candidate | Tag | Commit | Meaning |
| --- | --- | --- | --- |
| nearestHistoryTag | ${context.nearestHistoryTag.name} | ${context.nearestHistoryTag.commit} | ${context.nearestHistoryTag.description} |
| highestSemverTag | ${context.highestSemverTag.name} | ${context.highestSemverTag.commit} | ${context.highestSemverTag.description} |

请询问用户选择一个 tag，然后重新运行：

\`\`\`bash
pnpm changelog:context -- --base <chosen-tag>
\`\`\`
`
  }

  const sections = ['Added', 'Changed', 'Fixed']
    .map((section) => {
      const items = context.suggestedSections[section]
      if (items.length === 0) {
        return `### ${section}\n\n- (none)`
      }
      return `### ${section}\n\n${items.map(item => `- ${item}`).join('\n')}`
    })
    .join('\n\n')

  const files = Object.entries(context.fileGroups)
    .map(([group, items]) => `### ${group}\n\n${items.map(item => `- ${item}`).join('\n')}`)
    .join('\n\n') || '- (none)'

  const commits = context.commits
    .map(commit => `- ${commit.shortHash} ${commit.subject} (${commit.author}, ${commit.date})`)
    .join('\n') || '- (none)'

  return `# Changelog Context

- Base: ${context.baseTag} (${context.baseCommit})
- Head: ${context.head} (${context.headCommit})
- Commit range: ${context.baseTag}..${context.head}
- File range: ${context.baseTag}...${context.head}

## Suggested Sections

${sections}

## Changed Files by Area

${files}

## Commits

${commits}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const rootDir = process.env.CHANGELOG_CONTEXT_ROOT || defaultRootDir
  const context = buildChangelogContext(args, rootDir)
  const output = args.json ? renderJson(context) : renderMarkdown(context)
  process.stdout.write(output)

  if (context.status === 'tag-selection-required') {
    process.exit(TAG_SELECTION_REQUIRED_EXIT_CODE)
  }
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename)

if (invokedDirectly) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
