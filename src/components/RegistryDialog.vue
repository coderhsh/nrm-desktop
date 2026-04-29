<script setup lang="ts">
import { ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { useRegistryStore } from "@/stores/registry";
import type { Registry } from "@/types";

const props = defineProps<{
  visible: boolean;
  registry?: Registry | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const store = useRegistryStore();

const formRef = ref();
const name = ref("");
const url = ref("");
const submitting = ref(false);
const nameMaxLength = 20;
const isEdit = () => props.registry !== null && props.registry !== undefined;
const isPresetEdit = () => isEdit() && !props.registry?.is_custom;

watch(
  () => props.visible,
  (v) => {
    if (v) {
      name.value = props.registry?.name ?? "";
      url.value = props.registry?.url ?? "";
    }
  }
);

async function handleSubmit() {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    if (isEdit() && props.registry) {
      await store.updateRegistry(
        props.registry.name,
        name.value.trim(),
        url.value.trim()
      );
      ElMessage.success(`已更新源: ${name.value.trim()}`);
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
  if (isPresetEdit() && trimmedName !== props.registry?.name) {
    return callback(new Error("预设源暂不支持修改名称"));
  }
  if (
    !isEdit() &&
    store.registries.some((r) => r.name === trimmedName)
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
    @update:model-value="(v: boolean) => !v && emit('close')"
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
          :disabled="isPresetEdit()"
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
        预设源支持修改 URL，不支持修改名称
      </div>
    </el-form>
    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>
