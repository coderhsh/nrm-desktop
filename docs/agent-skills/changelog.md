# Changelog Agent Workflow

Use this workflow when a user asks any agent to generate, fill, refresh, or update version changelog content for this repository.

## Fact Collection

1. Run the repository helper:

   ```bash
   pnpm changelog:context
   ```

2. If the command exits with code `2`, the historical nearest release tag and highest visible semver tag differ. Do not choose automatically. Ask the user which base tag to use:
   - historical nearest tag
   - highest semver tag
   - another explicit tag

3. After the user chooses, rerun:

   ```bash
   pnpm changelog:context -- --base <chosen-tag>
   ```

4. Use the script output as factual input. Do not invent changes that are not supported by commits or changed files.

## Existing Unreleased Content

Before editing, inspect:

- `CHANGELOG.md` under `## [Unreleased]`
- `CHANGELOG.zh-CN.md` under `## [未发布]`

If either section already contains release content, ask the user how to handle it before writing:

- Overwrite: replace the existing Unreleased content with newly generated content.
- Complete: merge existing and generated entries, dedupe, recategorize, and keep English/Chinese aligned.
- Keep both: keep existing entries first, then append generated entries under `### Generated` / `### 自动生成`.

If both sections are empty, write the generated content directly.

## Writing Rules

- Write English content to `CHANGELOG.md`.
- Write Simplified Chinese content to `CHANGELOG.zh-CN.md`.
- Use Keep a Changelog categories:
  - `Added` / `新增`
  - `Changed` / `变更`
  - `Fixed` / `修复`
- Do not translate commits one by one. Merge related commits into concise, user-readable release notes.
- Keep English and Chinese semantically aligned; exact word-for-word translation is not required.
- Prefer user-visible changes, release/build process changes, and maintenance changes that affect contributors.
- Omit noisy internal churn when it has no clear release-note value.
- Do not modify historical version sections or bottom reference links.

## Release Flow Boundary

This workflow only fills `Unreleased` / `未发布`. The existing `scripts/prepare-release.mjs` script remains responsible for archiving Unreleased content into a concrete version section during release preparation.
