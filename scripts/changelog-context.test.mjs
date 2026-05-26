import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const scriptPath = path.join(__dirname, 'changelog-context.mjs')

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} ${args.join(' ')} failed`)
  }
  return result.stdout.trim()
}

function git(repo, args) {
  return run('git', args, repo)
}

function createRepo(name = 'nrm-changelog-context-') {
  const repo = mkdtempSync(path.join(tmpdir(), name))
  git(repo, ['init', '--quiet'])
  git(repo, ['config', 'user.name', 'Test User'])
  git(repo, ['config', 'user.email', 'test@example.com'])
  return repo
}

function write(repo, filePath, content) {
  const fullPath = path.join(repo, filePath)
  mkdirSync(path.dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content, 'utf8')
}

function commit(repo, message) {
  git(repo, ['add', '.'])
  git(repo, ['commit', '--quiet', '-m', message])
  return git(repo, ['rev-parse', '--short', 'HEAD'])
}

function runContext(repo, args = []) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      CHANGELOG_CONTEXT_ROOT: repo,
    },
  })
}

describe('changelog-context', () => {
  it('requires user tag selection when nearest history tag differs from highest semver tag', () => {
    const repo = createRepo()
    write(repo, 'README.md', '# test\n')
    commit(repo, 'chore: initial commit')
    git(repo, ['tag', 'v1.0.0'])

    git(repo, ['checkout', '--quiet', '-b', 'future'])
    write(repo, 'future.txt', 'future\n')
    commit(repo, 'feat: future release')
    const highestCommit = git(repo, ['rev-parse', '--short', 'HEAD'])
    git(repo, ['tag', 'v9.9.9'])

    git(repo, ['checkout', '--quiet', 'master'])
    write(repo, 'src/App.vue', '<template />\n')
    commit(repo, 'feat: current branch work')
    const nearestCommit = git(repo, ['rev-parse', '--short', 'v1.0.0'])

    const result = runContext(repo, ['--json'])

    expect(result.status).toBe(2)
    const payload = JSON.parse(result.stdout)
    expect(payload.status).toBe('tag-selection-required')
    expect(payload.nearestHistoryTag.name).toBe('v1.0.0')
    expect(payload.nearestHistoryTag.commit).toBe(nearestCommit)
    expect(payload.highestSemverTag.name).toBe('v9.9.9')
    expect(payload.highestSemverTag.commit).toBe(highestCommit)
  })

  it('uses an explicit base tag and emits stable JSON context', () => {
    const repo = createRepo()
    write(repo, 'README.md', '# test\n')
    commit(repo, 'chore: initial commit')
    git(repo, ['tag', 'v1.0.0'])

    write(repo, 'src/App.vue', '<template>status</template>\n')
    commit(repo, 'feat: add status bar metadata')

    write(repo, '.github/workflows/release-installers.yml', 'name: release\n')
    commit(repo, 'chore: add release timing summary')

    write(repo, 'scripts/changelog-context.test.mjs', 'test\n')
    commit(repo, 'fix: handle changelog tag mismatch')

    const result = runContext(repo, ['--base', 'v1.0.0', '--json'])

    expect(result.status).toBe(0)
    const payload = JSON.parse(result.stdout)
    expect(payload.status).toBe('ok')
    expect(payload.baseTag).toBe('v1.0.0')
    expect(payload.head).toBe('HEAD')
    expect(payload.commits.map(commit => commit.subject)).toEqual([
      'fix: handle changelog tag mismatch',
      'chore: add release timing summary',
      'feat: add status bar metadata',
    ])
    expect(payload.fileGroups['app-ui']).toContain('src/App.vue')
    expect(payload.fileGroups['release-ci']).toContain('.github/workflows/release-installers.yml')
    expect(payload.fileGroups.tests).toContain('scripts/changelog-context.test.mjs')
    expect(payload.suggestedSections.Added).toContain('feat: add status bar metadata')
    expect(payload.suggestedSections.Changed).toContain('chore: add release timing summary')
    expect(payload.suggestedSections.Fixed).toContain('fix: handle changelog tag mismatch')
  })

  it('accepts a pnpm-style argument separator before script flags', () => {
    const repo = createRepo()
    write(repo, 'README.md', '# test\n')
    commit(repo, 'chore: initial commit')
    git(repo, ['tag', 'v1.0.0'])

    write(repo, 'src/App.vue', '<template>change</template>\n')
    commit(repo, 'feat: add UI polish')

    const result = runContext(repo, ['--', '--base', 'v1.0.0', '--json'])

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).baseTag).toBe('v1.0.0')
  })
})
