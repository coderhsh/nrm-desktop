<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { save, open } from "@tauri-apps/plugin-dialog";
import { useRegistryStore } from "@/stores/registry";
import RegistryList from "@/components/RegistryList.vue";
import CurrentSource from "@/components/CurrentSource.vue";
import SpeedTest from "@/components/SpeedTest.vue";
import ProxySettings from "@/components/ProxySettings.vue";
import * as api from "@/api/tauri";
import { useTheme } from "@/composables/useTheme";

const store = useRegistryStore();
const theme = useTheme();
const showProxySettings = ref(false);
const isProxyFeatureVisible = false;

onMounted(async () => {
  await store.fetchRegistries();
  // 初始化时静默测速，在左侧源列表展示延迟
  store.fetchLatency();
});

async function handleExport() {
  try {
    const data = await api.exportConfig();
    const json = JSON.stringify(data, null, 2);
    const path = await save({
      defaultPath: "nrm-registries.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    await api.writeTextFile(path, json);
    ElMessage.success("配置已导出");
  } catch (e) {
    ElMessage.error(`导出失败: ${e}`);
  }
}

async function handleImport() {
  try {
    const path = await open({
      filters: [{ name: "JSON", extensions: ["json"] }],
      multiple: false,
    });
    if (!path) return;
    const json = await api.readTextFile(path as string);
    await api.importConfig(json);
    ElMessage.success("配置已导入");
    store.fetchRegistries();
  } catch (e) {
    ElMessage.error(`导入失败: ${e}`);
  }
}

async function handleReset() {
  try {
    await ElMessageBox.confirm(
      "确定要恢复默认设置吗？这将删除所有自定义源。",
      "确认恢复",
      { confirmButtonText: "恢复", cancelButtonText: "取消", type: "warning" }
    );
    await api.resetDefaults();
    ElMessage.success("已恢复默认设置");
    store.fetchRegistries();
  } catch {
    // cancelled
  }
}
</script>

<template>
  <div class="h-full flex">
    <!-- Sidebar -->
    <aside class="w-80 min-w-80 bg-white border-r border-gray-200 flex flex-col">
      <RegistryList />
    </aside>

    <!-- Main Content -->
    <main class="flex-1 flex flex-col min-w-0">
      <div class="flex-1 p-6 overflow-y-auto">
        <CurrentSource />
        <SpeedTest />
      </div>

      <!-- Status Bar -->
      <div class="h-10 px-3 border-t border-gray-200 bg-white flex items-center gap-0.5">
        <span class="text-xs text-gray-400 truncate mr-2">
          <template v-if="store.currentRegistry">
            当前源：{{ store.currentRegistry.name }}
          </template>
          <template v-else>未设置 registry</template>
        </span>

        <span class="flex-1"></span>

        <el-button text size="small" @click="theme.toggle()" :title="'主题: ' + theme.nextLabel.value">
          {{ theme.icon.value }}
        </el-button>

        <el-button
          v-if="isProxyFeatureVisible"
          text
          size="small"
          @click="showProxySettings = true"
          title="代理设置"
        >
          代理
        </el-button>

        <el-button text size="small" @click="handleExport" title="导出配置">
          导出
        </el-button>

        <el-button text size="small" @click="handleImport" title="导入配置">
          导入
        </el-button>

        <el-button text size="small" type="danger" @click="handleReset" title="恢复默认">
          重置
        </el-button>
      </div>
    </main>

    <!-- Proxy Settings Dialog -->
    <ProxySettings
      v-if="isProxyFeatureVisible"
      v-model:visible="showProxySettings"
      @close="showProxySettings = false"
    />
  </div>
</template>
