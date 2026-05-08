<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRegistryStore } from '@/stores/registry'
import { useI18n } from '@/composables/useI18n'
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
const { t } = useI18n()

const formRef = ref()
const name = ref('')
const url = ref('')
const submitting = ref(false)
const nameMaxLength = 20
const categoryLabelMaxLength = 20
const useCustomCategoryInput = ref(false)
const selectedCategoryLabel = ref('')
const categoryInput = ref('')
const isEdit = () => props.registry !== null && props.registry !== undefined

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
</script>

<template>
  <el-dialog :model-value="visible" :title="isEdit() ? t('registryDialog.editTitle') : t('registryDialog.addTitle')" width="420px" :close-on-click-modal="false" class="registry-dialog app-dialog" @update:model-value="(v: boolean) => !v && handleClose()">
    <el-form ref="formRef" :model="{ name, url }" label-width="60px" label-position="left" @submit.prevent="handleSubmit" class="registry-dialog-form">
      <el-form-item :label="t('registryDialog.label.name')" prop="name" :rules="[{ required: true, validator: validateName, trigger: 'blur' }]">
        <el-input v-model="name" :placeholder="t('registryDialog.placeholder.name')" :maxlength="nameMaxLength" show-word-limit />
      </el-form-item>
      <el-form-item :label="t('registryDialog.label.url')" prop="url" :rules="[{ required: true, validator: validateUrl, trigger: 'blur' }]">
        <el-input v-model="url" :placeholder="t('registryDialog.placeholder.url')" />
      </el-form-item>
      <el-form-item :label="t('registryDialog.label.category')">
        <div class="flex items-center gap-2 w-full">
          <el-select v-if="!useCustomCategoryInput" v-model="selectedCategoryLabel" class="flex-1" :placeholder="t('registryDialog.category.selectPlaceholder')" clearable filterable>
            <el-option v-for="label in categoryLabels ?? []" :key="label" :label="label" :value="label" />
          </el-select>
          <el-input v-else v-model="categoryInput" class="flex-1" :placeholder="t('registryDialog.category.inputPlaceholder')" :maxlength="categoryLabelMaxLength" show-word-limit clearable />
          <el-button @click="toggleCategoryInputMode">
            {{ useCustomCategoryInput ? t('registryDialog.category.usePreset') : t('registryDialog.category.useCustom') }}
          </el-button>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="handleClose">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">
        {{ t('common.save') }}
      </el-button>
    </template>
  </el-dialog>
</template>
<style scoped>
.registry-dialog-form {
  padding-top: 24px;
}
</style>
