<script setup lang="ts">
import { ref, onMounted } from "vue";
import * as api from "@/api/tauri";
import { useI18n } from "@/composables/useI18n";
import { formatInvokeErrorMessage } from "@/utils/invoke-error-i18n";

const emit = defineEmits<{ (e: "close"): void }>();
const visible = defineModel<boolean>("visible", { required: true });
const { t } = useI18n();

const httpProxy = ref("");
const httpsProxy = ref("");
const enabled = ref(false);
const loading = ref(false);

onMounted(async () => {
  try {
    const config = await api.getProxyConfig();
    httpProxy.value = config.http_proxy ?? "";
    httpsProxy.value = config.https_proxy ?? "";
    enabled.value = config.enabled;
  } catch (e) {
    ElMessage.error(t("proxy.loadFailed", { error: formatInvokeErrorMessage(t, e) }));
  }
});

async function detectFromEnv() {
  try {
    const env = await api.detectEnvProxy();
    if (env.http_proxy) httpProxy.value = env.http_proxy;
    if (env.https_proxy) httpsProxy.value = env.https_proxy;
    if (env.http_proxy || env.https_proxy) enabled.value = true;
    ElMessage.success(t("proxy.detectSuccess"));
  } catch (e) {
    ElMessage.error(t("proxy.detectFailed", { error: formatInvokeErrorMessage(t, e) }));
  }
}

async function handleSave() {
  loading.value = true;
  try {
    await api.setProxyConfig({
      http_proxy: httpProxy.value || null,
      https_proxy: httpsProxy.value || null,
      enabled: enabled.value,
    });
    ElMessage.success(t("proxy.saveSuccess"));
    emit("close");
  } catch (e) {
    ElMessage.error(t("proxy.saveFailed", { error: formatInvokeErrorMessage(t, e) }));
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="t('proxy.dialogTitle')"
    width="480px"
    class="app-dialog"
    :close-on-click-modal="false"
    @update:model-value="(v: boolean) => !v && emit('close')"
  >
    <div class="flex flex-col gap-4">
      <el-form label-width="100px" label-position="left">
        <el-form-item :label="t('proxy.enable')">
          <el-switch v-model="enabled" />
        </el-form-item>
        <el-form-item :label="t('proxy.http')">
          <el-input v-model="httpProxy" :placeholder="t('proxy.placeholderExample')" />
        </el-form-item>
        <el-form-item :label="t('proxy.https')">
          <el-input v-model="httpsProxy" :placeholder="t('proxy.placeholderExample')" />
        </el-form-item>
      </el-form>
      <el-button size="small" @click="detectFromEnv">
        {{ t("proxy.detectFromEnv") }}
      </el-button>
    </div>
    <template #footer>
      <el-button @click="emit('close')">{{ t("common.cancel") }}</el-button>
      <el-button type="primary" :loading="loading" @click="handleSave">
        {{ t("common.save") }}
      </el-button>
    </template>
  </el-dialog>
</template>
