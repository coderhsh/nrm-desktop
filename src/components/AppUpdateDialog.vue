<script setup lang="ts">
import { computed } from 'vue'
import {
  formatUpdateError,
  useAppUpdate,
} from '@/composables/useAppUpdate'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
const appUpdate = useAppUpdate()

const update = computed(() => appUpdate.updateInfo.value)
const releaseNotes = computed(() => {
  const body = update.value?.body?.trim()
  return body || t('app.update.noReleaseNotes')
})
const currentVersion = computed(() => update.value?.currentVersion ?? '-')
const newVersion = computed(() => update.value?.version ?? '-')
const updateDate = computed(() => update.value?.date ?? '-')
const dialogTitle = computed(() => (
  appUpdate.downloaded.value ? t('app.update.readyTitle') : t('app.update.availableTitle')
))
const primaryButtonText = computed(() => (
  appUpdate.downloaded.value ? t('app.update.installAndRestart') : t('app.update.downloadAndInstall')
))

function handleBeforeClose(done: () => void) {
  if (appUpdate.downloading.value || appUpdate.installing.value) return
  appUpdate.dismissCurrentUpdate()
  done()
}

function handleCancel() {
  if (appUpdate.downloading.value || appUpdate.installing.value) return
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
        <pre>{{ releaseNotes }}</pre>
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
      </section>
    </div>

    <template #footer>
      <div class="category-manage-dialog-footer">
        <el-button
          :disabled="appUpdate.downloading.value || appUpdate.installing.value"
          @click="handleCancel"
        >
          {{ t('common.cancel') }}
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

.app-update-notes pre {
  max-height: 180px;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-regular);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
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
</style>
