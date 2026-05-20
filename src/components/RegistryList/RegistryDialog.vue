<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import type { FormInstance, InputInstance } from 'element-plus'
import { RefreshRight } from '@element-plus/icons-vue'
import { useRegistryStore } from '@/stores/registry'
import { useI18n } from '@/composables/useI18n'
import { testUrlSpeed } from '@/api/speedtest'
import { formatInvokeErrorMessage } from '@/utils/invoke-error-i18n'
import { latencyBarColor } from '@/utils/latency-bar-color'
import type { Registry } from '@/types'

const props = defineProps<{
  visible: boolean
  registry?: Registry | null
  categoryLabels?: string[]
  currentCategory?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save-category', payload: { oldName: string; newName: string; category: string | null }): void
}>()

const store = useRegistryStore()
const { t, isEnglish } = useI18n()

const formRef = ref<FormInstance | null>(null)
const nameInputRef = ref<InputInstance>()
const categoryCustomInputRef = ref<InputInstance>()
const name = ref('')
const url = ref('')
const submitting = ref(false)
const nameMaxLength = 20
const categoryLabelMaxLength = 20
const useCustomCategoryInput = ref(false)
const selectedCategoryLabel = ref('')
const categoryInput = ref('')
const isEdit = () => props.registry !== null && props.registry !== undefined

// URL 测速
const urlTesting = ref(false)
const urlLatencyMs = ref<number | null>(null)
const urlLatencyError = ref<string | null>(null)

const urlLatencyColor = computed(() => latencyBarColor(urlLatencyMs.value))
const urlLatencyText = computed(() => {
  if (urlLatencyError.value) return urlLatencyError.value
  if (urlLatencyMs.value !== null) return `${urlLatencyMs.value}ms`
  return ''
})

async function handleUrlSpeedTest() {
  const trimmedUrl = url.value.trim()
  if (!trimmedUrl) {
    ElMessage.warning(t('registryDialog.validate.urlRequired'))
    return
  }
  urlTesting.value = true
  urlLatencyMs.value = null
  urlLatencyError.value = null
  try {
    const result = await testUrlSpeed(trimmedUrl)
    if (result.latency_ms !== null) {
      urlLatencyMs.value = result.latency_ms
    } else {
      urlLatencyError.value = result.error ?? 'Unknown error'
    }
  } catch (e: any) {
    urlLatencyError.value = formatInvokeErrorMessage(t, e)
  } finally {
    urlTesting.value = false
  }
}

watch(
  () => props.visible,
  v => {
    if (v) {
      name.value = props.registry?.name ?? ''
      url.value = props.registry?.url ?? ''
      const currentCategory = props.currentCategory ?? ''
      if (!currentCategory) {
        useCustomCategoryInput.value = false
        selectedCategoryLabel.value = ''
        categoryInput.value = ''
      } else if ((props.categoryLabels ?? []).includes(currentCategory)) {
        useCustomCategoryInput.value = false
        selectedCategoryLabel.value = currentCategory
        categoryInput.value = ''
      } else {
        useCustomCategoryInput.value = true
        selectedCategoryLabel.value = ''
        categoryInput.value = currentCategory
      }
      return
    }
    resetFormState()
  }
)

/**
 * 重置弹窗内的表单状态，避免关闭后残留输入和校验提示。
 */
function resetFormState() {
  name.value = ''
  url.value = ''
  useCustomCategoryInput.value = false
  selectedCategoryLabel.value = ''
  categoryInput.value = ''
  submitting.value = false
  urlTesting.value = false
  urlLatencyMs.value = null
  urlLatencyError.value = null
  formRef.value?.resetFields?.()
  formRef.value?.clearValidate?.()
}

/**
 * 统一处理弹窗关闭行为，先重置状态再通知父组件关闭。
 */
function handleClose() {
  resetFormState()
  emit('close')
}

function normalizeCategoryLabel(label: string | null | undefined): string {
  if (!label) return ''
  return label.trim().slice(0, categoryLabelMaxLength)
}

function toggleCategoryInputMode() {
  if (useCustomCategoryInput.value) {
    useCustomCategoryInput.value = false
    selectedCategoryLabel.value = (props.categoryLabels ?? []).includes(categoryInput.value) ? categoryInput.value : ''
    return
  }
  useCustomCategoryInput.value = true
  categoryInput.value = selectedCategoryLabel.value
  nextTick(() => {
    categoryCustomInputRef.value?.focus()
  })
}

async function handleSubmit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (isEdit() && props.registry) {
      const oldName = props.registry.name
      const newName = name.value.trim()
      await store.updateRegistry(oldName, newName, url.value.trim())
      const category = useCustomCategoryInput.value ? normalizeCategoryLabel(categoryInput.value) : normalizeCategoryLabel(selectedCategoryLabel.value)
      emit('save-category', {
        oldName,
        newName,
        category: category || null,
      })
      ElMessage.success(t('registryDialog.success.updated', { name: newName }))
    } else {
      const newName = name.value.trim()
      await store.addRegistry(newName, url.value.trim())
      const category = useCustomCategoryInput.value ? normalizeCategoryLabel(categoryInput.value) : normalizeCategoryLabel(selectedCategoryLabel.value)
      emit('save-category', {
        oldName: newName,
        newName,
        category: category || null,
      })
      ElMessage.success(t('registryDialog.success.added', { name: newName }))
    }
    emit('close')
  } catch {
    // error handled by store
  } finally {
    submitting.value = false
  }
}

function validateName(_rule: any, value: string, callback: any) {
  const trimmedName = value.trim()
  if (!trimmedName) return callback(new Error(t('registryDialog.validate.nameRequired')))
  if (trimmedName.length > nameMaxLength) {
    return callback(new Error(t('registryDialog.validate.nameMax', { max: nameMaxLength })))
  }
  if (store.registries.some(r => r.name === trimmedName && r.name !== props.registry?.name)) {
    return callback(new Error(t('registryDialog.validate.nameExists')))
  }
  callback()
}

function validateUrl(_rule: any, value: string, callback: any) {
  if (!value.trim()) return callback(new Error(t('registryDialog.validate.urlRequired')))
  try {
    const u = new URL(value)
    if (!['http:', 'https:'].includes(u.protocol)) {
      return callback(new Error(t('registryDialog.validate.urlProtocol')))
    }
  } catch {
    return callback(new Error(t('registryDialog.validate.urlInvalid')))
  }
  if (!isEdit() && store.registries.some(r => r.url === value.trim())) {
    return callback(new Error(t('registryDialog.validate.urlExists')))
  }
  callback()
}

/** 弹窗打开后再聚焦，编辑模式下光标置于末尾 */
function focusNameInput() {
  nextTick(() => {
    nameInputRef.value?.focus()
    if (isEdit()) {
      const len = name.value.length
      nameInputRef.value?.input?.setSelectionRange(len, len)
    }
  })
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="isEdit() ? t('registryDialog.editTitle') : t('registryDialog.addTitle')"
    :width="isEnglish ? '500px' : '420px'"
    :close-on-click-modal="false"
    class="registry-dialog category-manage-dialog app-dialog"
    modal-class="category-manage-modal"
    append-to-body
    align-center
    @opened="focusNameInput"
    @update:model-value="(v: boolean) => !v && handleClose()"
  >
    <div class="category-manage-content registry-dialog-content">
      <el-form ref="formRef" :model="{ name, url }" :label-width="isEnglish ? '80px' : '72px'" label-position="left" @submit.prevent="handleSubmit" class="registry-dialog-form">
        <el-form-item :label="t('registryDialog.label.name')" prop="name" :rules="[{ required: true, validator: validateName, trigger: 'blur' }]">
          <el-input
            ref="nameInputRef"
            v-model="name"
            class="category-input registry-dialog-input"
            :placeholder="t('registryDialog.placeholder.name')"
            :maxlength="nameMaxLength"
            show-word-limit
          />
        </el-form-item>
        <el-form-item :label="t('registryDialog.label.url')" prop="url" :rules="[{ required: true, validator: validateUrl, trigger: 'blur' }]">
          <el-input v-model="url" class="category-input registry-dialog-input" :placeholder="t('registryDialog.placeholder.url')">
            <template #suffix>
              <div class="registry-dialog-url-suffix" @click.stop="handleUrlSpeedTest">
                <span v-if="urlLatencyText" class="registry-dialog-url-latency" :style="{ color: urlLatencyColor }">{{ urlLatencyText }}</span>
                <el-icon class="registry-dialog-url-test-btn" :class="{ 'is-loading': urlTesting }">
                  <RefreshRight />
                </el-icon>
              </div>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item :label="t('registryDialog.label.category')">
          <div class="registry-dialog-category-row">
            <el-select
              v-if="!useCustomCategoryInput"
              v-model="selectedCategoryLabel"
              class="category-input registry-dialog-input flex-1 min-w-0"
              :placeholder="t('registryDialog.category.selectPlaceholder')"
              clearable
              filterable
            >
              <el-option v-for="label in categoryLabels ?? []" :key="label" :label="label" :value="label" />
            </el-select>
            <el-input
              v-else
              ref="categoryCustomInputRef"
              v-model="categoryInput"
              class="category-input registry-dialog-input flex-1 min-w-0"
              :placeholder="t('registryDialog.category.inputPlaceholder')"
              :maxlength="categoryLabelMaxLength"
              show-word-limit
              clearable
            />
            <el-button class="registry-dialog-category-toggle" @click="toggleCategoryInputMode">
              {{ useCustomCategoryInput ? t('registryDialog.category.usePreset') : t('registryDialog.category.useCustom') }}
            </el-button>
          </div>
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <div class="category-manage-dialog-footer">
        <el-button class="category-manage-dialog-footer__close" @click="handleClose">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ t('common.save') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>
<style scoped>
.registry-dialog-form {
  padding-top: 0;
}

.registry-dialog-content {
  gap: 1.25rem !important;
}

.registry-dialog-form :deep(.el-form-item) {
  margin-bottom: 1.15rem;
}

.registry-dialog-form :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}

.registry-dialog-category-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.registry-dialog-url-suffix {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  padding-right: 0.15rem;
}

.registry-dialog-url-latency {
  font-size: 0.75rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.registry-dialog-url-test-btn {
  font-size: 0.875rem;
  color: var(--el-text-color-placeholder);
  transition: color 0.15s var(--app-ease-out);
  flex-shrink: 0;
}

.registry-dialog-url-suffix:hover .registry-dialog-url-test-btn {
  color: var(--el-color-primary);
}

.registry-dialog-url-test-btn.is-loading {
  animation: registry-dialog-url-spin 0.8s linear infinite;
}

@keyframes registry-dialog-url-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
