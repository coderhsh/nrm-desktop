<script setup lang="ts">
import { ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { useRegistryStore } from "@/stores/registry";
import type { Registry } from "@/types";

const props = defineProps<{
  visible: boolean;
  registry?: Registry | null;
  categoryLabels?: string[];
  currentCategory?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "save-category", payload: { oldName: string; newName: string; category: string | null }): void;
}>();

const store = useRegistryStore();

const formRef = ref();
const name = ref("");
const url = ref("");
const submitting = ref(false);
const nameMaxLength = 20;
const categoryLabelMaxLength = 20;
const useCustomCategoryInput = ref(false);
const selectedCategoryLabel = ref("");
const categoryInput = ref("");
const isEdit = () => props.registry !== null && props.registry !== undefined;
const isPresetEdit = () => isEdit() && !props.registry?.is_custom;
const isCustomEdit = () => isEdit() && !!props.registry?.is_custom;

watch(
  () => props.visible,
  (v) => {
    if (v) {
      name.value = props.registry?.name ?? "";
      url.value = props.registry?.url ?? "";
      const currentCategory = props.currentCategory ?? "";
      if (!currentCategory) {
        useCustomCategoryInput.value = false;
        selectedCategoryLabel.value = "";
        categoryInput.value = "";
      } else if ((props.categoryLabels ?? []).includes(currentCategory)) {
        useCustomCategoryInput.value = false;
        selectedCategoryLabel.value = currentCategory;
        categoryInput.value = "";
      } else {
        useCustomCategoryInput.value = true;
        selectedCategoryLabel.value = "";
        categoryInput.value = currentCategory;
      }
      return;
    }
    resetFormState();
  }
);

/**
 * 重置弹窗内的表单状态，避免关闭后残留输入和校验提示。
 */
function resetFormState() {
  name.value = "";
  url.value = "";
  useCustomCategoryInput.value = false;
  selectedCategoryLabel.value = "";
  categoryInput.value = "";
  submitting.value = false;
  formRef.value?.resetFields?.();
  formRef.value?.clearValidate?.();
}

/**
 * 统一处理弹窗关闭行为，先重置状态再通知父组件关闭。
 */
function handleClose() {
  resetFormState();
  emit("close");
}

function normalizeCategoryLabel(label: string | null | undefined): string {
  if (!label) return "";
  return label.trim().slice(0, categoryLabelMaxLength);
}

function toggleCategoryInputMode() {
  if (useCustomCategoryInput.value) {
    useCustomCategoryInput.value = false;
    selectedCategoryLabel.value = (props.categoryLabels ?? []).includes(categoryInput.value)
      ? categoryInput.value
      : "";
    return;
  }
  useCustomCategoryInput.value = true;
  categoryInput.value = selectedCategoryLabel.value;
}

async function handleSubmit() {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    if (isEdit() && props.registry) {
      const oldName = props.registry.name;
      const newName = name.value.trim();
      await store.updateRegistry(
        oldName,
        newName,
        url.value.trim()
      );
      if (isCustomEdit()) {
        const category = useCustomCategoryInput.value
          ? normalizeCategoryLabel(categoryInput.value)
          : normalizeCategoryLabel(selectedCategoryLabel.value);
        emit("save-category", {
          oldName,
          newName,
          category: category || null,
        });
      }
      ElMessage.success(`已更新源: ${newName}`);
    } else {
      await store.addRegistry(name.value.trim(), url.value.trim());
      ElMessage.success(`已添加源: ${name.value.trim()}`);
    }
    emit("close");
  } catch {
    // error handled by store
  } finally {
    submitting.value = false;
  }
}

function validateName(_rule: any, value: string, callback: any) {
  const trimmedName = value.trim();
  if (!trimmedName) return callback(new Error("请输入源名称"));
  if (trimmedName.length > nameMaxLength) {
    return callback(new Error(`名称长度不能超过 ${nameMaxLength} 个字符`));
  }
  if (
    store.registries.some((r) => r.name === trimmedName && r.name !== props.registry?.name)
  ) {
    return callback(new Error("该名称已存在"));
  }
  callback();
}

function validateUrl(_rule: any, value: string, callback: any) {
  if (!value.trim()) return callback(new Error("请输入源 URL"));
  try {
    const u = new URL(value);
    if (!["http:", "https:"].includes(u.protocol)) {
      return callback(new Error("仅支持 http/https 协议"));
    }
  } catch {
    return callback(new Error("URL 格式不正确"));
  }
  if (
    !isEdit() &&
    store.registries.some((r) => r.url === value.trim())
  ) {
    return callback(new Error("该 URL 已存在"));
  }
  callback();
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="isEdit() ? '编辑源' : '添加源'"
    width="420px"
    :close-on-click-modal="false"
    @update:model-value="(v: boolean) => !v && handleClose()"
  >
    <el-form
      ref="formRef"
      :model="{ name, url }"
      label-width="60px"
      label-position="left"
      @submit.prevent="handleSubmit"
    >
      <el-form-item
        label="名称"
        prop="name"
        :rules="[{ required: true, validator: validateName, trigger: 'blur' }]"
      >
        <el-input
          v-model="name"
          placeholder="如: my-registry"
          :maxlength="nameMaxLength"
          show-word-limit
        />
      </el-form-item>
      <el-form-item
        label="URL"
        prop="url"
        :rules="[{ required: true, validator: validateUrl, trigger: 'blur' }]"
      >
        <el-input v-model="url" placeholder="如: https://registry.example.com/" />
      </el-form-item>
      <div v-if="isPresetEdit()" class="text-xs text-gray-400 -mt-1 mb-2">
        预设源支持修改名称与 URL
      </div>
      <template v-if="isCustomEdit()">
        <el-form-item label="分类">
          <div class="flex items-center gap-2 w-full">
            <el-select
              v-if="!useCustomCategoryInput"
              v-model="selectedCategoryLabel"
              class="flex-1"
              placeholder="选择已有分类（留空为未分类）"
              clearable
              filterable
            >
              <el-option
                v-for="label in categoryLabels ?? []"
                :key="label"
                :label="label"
                :value="label"
              />
            </el-select>
            <el-input
              v-else
              v-model="categoryInput"
              class="flex-1"
              placeholder="输入分类名称，留空则设为未分类"
              :maxlength="categoryLabelMaxLength"
              show-word-limit
              clearable
            />
            <el-button @click="toggleCategoryInputMode">
              {{ useCustomCategoryInput ? "使用已有分类" : "使用自定义分类" }}
            </el-button>
          </div>
        </el-form-item>
      </template>
    </el-form>
    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>
