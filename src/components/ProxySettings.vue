<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import * as api from "@/api/tauri";

const emit = defineEmits<{ (e: "close"): void }>();
const visible = defineModel<boolean>("visible", { required: true });

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
    ElMessage.error(`加载代理配置失败: ${e}`);
  }
});

async function detectFromEnv() {
  try {
    const env = await api.detectEnvProxy();
    if (env.http_proxy) httpProxy.value = env.http_proxy;
    if (env.https_proxy) httpsProxy.value = env.https_proxy;
    if (env.http_proxy || env.https_proxy) enabled.value = true;
    ElMessage.success("已从环境变量检测到代理配置");
  } catch (e) {
    ElMessage.error(`检测失败: ${e}`);
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
    ElMessage.success("代理配置已保存");
    emit("close");
  } catch (e) {
    ElMessage.error(`保存失败: ${e}`);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="代理设置"
    width="480px"
    :close-on-click-modal="false"
    @update:model-value="(v: boolean) => !v && emit('close')"
  >
    <div class="flex flex-col gap-4">
      <el-form label-width="100px" label-position="left">
        <el-form-item label="启用代理">
          <el-switch v-model="enabled" />
        </el-form-item>
        <el-form-item label="HTTP 代理">
          <el-input
            v-model="httpProxy"
            placeholder="如: http://127.0.0.1:1080"
          />
        </el-form-item>
        <el-form-item label="HTTPS 代理">
          <el-input
            v-model="httpsProxy"
            placeholder="如: http://127.0.0.1:1080"
          />
        </el-form-item>
      </el-form>
      <el-button size="small" @click="detectFromEnv">
        从环境变量检测
      </el-button>
    </div>
    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleSave">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>
