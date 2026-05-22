<script setup lang="ts">
import { computed } from 'vue'
import {
  formatUpdateError,
  useAppUpdate,
} from '@/composables/useAppUpdate'
import { useI18n } from '@/composables/useI18n'
import { renderMarkdown } from '@/utils/renderMarkdown'
import { formatUpdatePublishDate } from '@/utils/formatLocaleDate'

const { t, language } = useI18n()
const appUpdate = useAppUpdate()

const update = computed(() => appUpdate.updateInfo.value)
const releaseNotesBody = computed(() => update.value?.body?.trim() ?? '')
const hasReleaseNotes = computed(() => releaseNotesBody.value.length > 0)
const releaseNotesHtml = computed(() => renderMarkdown(releaseNotesBody.value))
const currentVersion = computed(() => update.value?.currentVersion ?? '-')
const newVersion = computed(() => update.value?.version ?? '-')
const updateDate = computed(() => formatUpdatePublishDate(update.value?.date, language.value))
const dialogTitle = computed(() => (
  appUpdate.downloaded.value ? t('app.update.readyTitle') : t('app.update.availableTitle')
))
const primaryButtonText = computed(() => (
  appUpdate.downloaded.value ? t('app.update.installAndRestart') : t('app.update.downloadAndInstall')
))
const secondaryButtonText = computed(() => (
  appUpdate.downloaded.value ? t('app.update.restartLater') : t('common.cancel')
))

function handleBeforeClose(done: () => void) {
  if (appUpdate.downloading.value || appUpdate.installing.value) return
  if (appUpdate.downloaded.value) {
    appUpdate.closeUpdateDialog()
  } else {
    appUpdate.dismissCurrentUpdate()
  }
  done()
}

function handleSecondaryAction() {
  if (appUpdate.downloading.value || appUpdate.installing.value) return
  if (appUpdate.downloaded.value) {
    appUpdate.closeUpdateDialog()
    ElMessage.info(t('app.update.restartLaterHint'))
    return
  }
  appUpdate.dismissCurrentUpdate()
}

async function handlePrimaryAction() {
  try {
    if (appUpdate.downloaded.value) {
      await appUpdate.installAndRestart()
      return
    }

    await appUpdate.downloadUpdate()
    ElMessage.success(t('app.update.downloadComplete'))
  } catch (error) {
    ElMessage.error(t('app.update.operationFailed', { error: formatUpdateError(error) }))
  }
}
</script>

<template>
  <el-dialog
    v-model="appUpdate.dialogVisible.value"
    :title="dialogTitle"
    width="460px"
    class="app-update-dialog category-manage-dialog app-dialog"
    modal-class="category-manage-modal"
    align-center
    append-to-body
    :close-on-click-modal="!appUpdate.downloading.value && !appUpdate.installing.value"
    :close-on-press-escape="!appUpdate.downloading.value && !appUpdate.installing.value"
    :before-close="handleBeforeClose"
  >
    <div class="app-update-dialog-inner">
      <div class="app-update-version-row">
        <div class="app-update-version-card">
          <span>{{ t('app.update.currentVersion') }}</span>
          <strong>{{ currentVersion }}</strong>
        </div>
        <div class="app-update-version-arrow">→</div>
        <div class="app-update-version-card app-update-version-card--new">
          <span>{{ t('app.update.newVersion') }}</span>
          <strong>{{ newVersion }}</strong>
        </div>
      </div>

      <div class="app-update-meta text-xs text-app-muted">
        {{ t('app.update.publishDate', { date: updateDate }) }}
      </div>

      <section class="app-update-notes">
        <h4>{{ t('app.update.releaseNotes') }}</h4>
        <!-- eslint-disable vue/no-v-html -- Release notes are rendered with markdown-it (html disabled). -->
        <div
          v-if="hasReleaseNotes"
          class="app-update-notes-content"
          v-html="releaseNotesHtml"
        />
        <!-- eslint-enable vue/no-v-html -->
        <p v-else class="app-update-notes-empty">
          {{ t('app.update.noReleaseNotes') }}
        </p>
      </section>

      <section
        v-if="appUpdate.downloading.value || appUpdate.downloaded.value"
        class="app-update-progress"
      >
        <div class="app-update-progress__label">
          <span>{{ t('app.update.downloadProgress') }}</span>
          <span>{{ appUpdate.downloadStatusText.value }}</span>
        </div>
        <el-progress
          :percentage="appUpdate.downloadProgress.value ?? 0"
          :indeterminate="appUpdate.downloading.value && appUpdate.downloadProgress.value === null"
          :status="appUpdate.downloaded.value ? 'success' : undefined"
        />
        <p v-if="appUpdate.downloaded.value" class="app-update-ready-hint">
          {{ t('app.update.readyHint') }}
        </p>
      </section>
    </div>

    <template #footer>
      <div class="category-manage-dialog-footer">
        <el-button
          :disabled="appUpdate.downloading.value || appUpdate.installing.value"
          @click="handleSecondaryAction"
        >
          {{ secondaryButtonText }}
        </el-button>
        <el-button
          type="primary"
          :loading="appUpdate.downloading.value || appUpdate.installing.value"
          @click="handlePrimaryAction"
        >
          {{ primaryButtonText }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.app-update-dialog-inner {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.app-update-version-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.app-update-version-card {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
}

.app-update-version-card span {
  display: block;
  margin-bottom: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.app-update-version-card strong {
  display: block;
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-update-version-card--new {
  border-color: rgba(37, 99, 235, 0.22);
  background: rgba(37, 99, 235, 0.08);
}

.app-update-version-arrow {
  color: var(--el-text-color-secondary);
  font-weight: 600;
}

.app-update-meta {
  line-height: 1.4;
}

.app-update-notes h4 {
  margin: 0 0 8px;
  color: var(--el-text-color-primary);
  font-size: 13px;
  font-weight: 600;
}

.app-update-notes-content,
.app-update-notes-empty {
  max-height: 180px;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.6;
  cursor: default;
  user-select: text;
}

.app-update-notes-empty {
  color: var(--el-text-color-secondary);
}

.app-update-notes-content :deep(p),
.app-update-notes-content :deep(ul),
.app-update-notes-content :deep(ol),
.app-update-notes-content :deep(blockquote) {
  margin: 0 0 8px;
}

.app-update-notes-content :deep(p:last-child),
.app-update-notes-content :deep(ul:last-child),
.app-update-notes-content :deep(ol:last-child),
.app-update-notes-content :deep(blockquote:last-child) {
  margin-bottom: 0;
}

.app-update-notes-content :deep(h1),
.app-update-notes-content :deep(h2),
.app-update-notes-content :deep(h3),
.app-update-notes-content :deep(h4),
.app-update-notes-content :deep(h5),
.app-update-notes-content :deep(h6) {
  margin: 0 0 8px;
  color: var(--el-text-color-primary);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.app-update-notes-content :deep(ul),
.app-update-notes-content :deep(ol) {
  padding-left: 1.25rem;
}

.app-update-notes-content :deep(li + li) {
  margin-top: 4px;
}

.app-update-notes-content :deep(code) {
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 0.92em;
}

.app-update-notes-content :deep(pre) {
  margin: 0 0 8px;
  padding: 8px 10px;
  overflow: auto;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}

.app-update-notes-content :deep(pre code) {
  padding: 0;
  background: transparent;
}

.app-update-notes-content :deep(a) {
  color: var(--el-color-primary);
  text-decoration: none;
}

.app-update-notes-content :deep(a:hover) {
  text-decoration: underline;
}

.app-update-notes-content :deep(blockquote) {
  padding-left: 10px;
  border-left: 3px solid var(--el-border-color);
  color: var(--el-text-color-secondary);
}

.app-update-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.app-update-progress__label {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.app-update-ready-hint {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
</style>
