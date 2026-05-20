<script setup lang="ts">
import type { CheckboxValueType } from 'element-plus'
import { useI18n } from '@/composables/useI18n'

defineProps<{
  visible: boolean
  closeActionDraft: 'minimize' | 'exit'
  rememberCloseChoice: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'update:closeActionDraft', value: 'minimize' | 'exit'): void
  (e: 'update:rememberCloseChoice', value: boolean): void
  (e: 'apply', action: 'minimize' | 'exit'): void
  (e: 'closed'): void
}>()

const { t } = useI18n()

function onRememberChange(value: CheckboxValueType) {
  emit('update:rememberCloseChoice', value === true)
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="t('app.closeDialog.title')"
    class="close-confirm-dialog"
    width="380px"
    :close-on-click-modal="false"
    :show-close="true"
    :destroy-on-close="true"
    @update:model-value="(v: boolean) => emit('update:visible', v)"
    @closed="emit('closed')"
  >
    <div class="close-confirm-content flex flex-col gap-4">
      <p class="close-confirm-desc text-sm leading-relaxed m-0">
        {{ t('app.closeDialog.desc') }}
      </p>
      <div class="close-remember-wrap">
        <el-checkbox
          :model-value="rememberCloseChoice"
          @update:model-value="onRememberChange"
        >
          {{ t('app.closeDialog.remember') }}
        </el-checkbox>
      </div>
    </div>
    <template #footer>
      <div class="close-confirm-footer flex justify-end gap-2">
        <el-button class="close-confirm-exit-btn" @click="emit('apply', 'exit')">
          {{ t('app.closeDialog.exit') }}
        </el-button>
        <el-button class="close-confirm-minimize-btn" @click="emit('apply', 'minimize')">
          {{ t('app.closeDialog.minimize') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>
