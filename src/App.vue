<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Setting } from '@element-plus/icons-vue'
import { useLocalStorage } from '@vueuse/core'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import { save, open } from '@tauri-apps/plugin-dialog'
import { useRegistryStore } from '@/stores/registry'
import RegistryList from '@/components/RegistryList.vue'
import CurrentSource from '@/components/CurrentSource.vue'
import SpeedTest from '@/components/SpeedTest.vue'
import ProxySettings from '@/components/ProxySettings.vue'
import * as api from '@/api/tauri'
import { useTheme } from '@/composables/useTheme'
import { useI18n } from '@/composables/useI18n'

const store = useRegistryStore()
const theme = useTheme()
const { t } = useI18n()
const showProxySettings = ref(false)
const showSettingsDialog = ref(false)
const isProxyFeatureVisible = false
const language = useLocalStorage<'zh-CN' | 'en'>('nrm-desktop-language', 'zh-CN')
const draftLanguage = ref<'zh-CN' | 'en'>('zh-CN')
const draftTheme = ref<'light' | 'dark' | 'auto'>('auto')
const languageOptions = [
  { label: '简体中文', value: 'zh-CN' as const },
  { label: 'English', value: 'en' as const },
]
const themeOptions = computed(() => [
  { label: t('app.settings.themeAuto'), value: 'auto' as const },
  { label: t('app.settings.themeLight'), value: 'light' as const },
  { label: t('app.settings.themeDark'), value: 'dark' as const },
])
const elementLocale = computed(() => (language.value === 'en' ? en : zhCn))

watch(
  language,
  (value) => {
    document.documentElement.lang = value
  },
  { immediate: true }
)

watch(showSettingsDialog, (visible) => {
  if (!visible) return
  draftLanguage.value = language.value
  draftTheme.value = theme.theme.value
})

function handleSaveSettings() {
  const nextLanguage = draftLanguage.value
  language.value = draftLanguage.value
  theme.theme.value = draftTheme.value
  showSettingsDialog.value = false
  ElMessage.success(nextLanguage === 'en' ? 'Settings saved' : '设置已保存')
}

onMounted(async () => {
  await store.fetchRegistries()
  // 初始化时静默测速，在左侧源列表展示延迟
  store.fetchLatency()
})

async function handleExport() {
  try {
    const data = await api.exportConfig()
    const json = JSON.stringify(data, null, 2)
    const path = await save({
      defaultPath: 'nrm-registries.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (!path) return
    await api.writeTextFile(path, json)
    ElMessage.success('配置已导出')
  } catch (e) {
    ElMessage.error(`导出失败: ${e}`)
  }
}

async function handleImport() {
  try {
    const path = await open({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      multiple: false,
    })
    if (!path) return
    const json = await api.readTextFile(path as string)
    await api.importConfig(json)
    ElMessage.success('配置已导入')
    store.fetchRegistries()
  } catch (e) {
    ElMessage.error(`导入失败: ${e}`)
  }
}

async function handleReset() {
  try {
    await ElMessageBox.confirm('确定要恢复默认设置吗？这将删除所有自定义源。', '确认恢复', { confirmButtonText: '恢复', cancelButtonText: '取消', type: 'warning' })
    await api.resetDefaults()
    ElMessage.success('已恢复默认设置')
    store.fetchRegistries()
  } catch {
    // cancelled
  }
}
</script>

<template>
  <el-config-provider :locale="elementLocale">
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
              {{ t('app.currentSourceLabel', { name: store.currentRegistry.name }) }}
            </template>
            <template v-else>{{ t('app.currentSourceUnset') }}</template>
          </span>

          <span class="flex-1"></span>

          <el-button text size="small" @click="theme.toggle()" :title="'主题: ' + theme.nextLabel.value">
            {{ theme.icon.value }}
          </el-button>

          <el-button text size="small" :title="t('common.settings')" @click="showSettingsDialog = true">
            <el-icon class="mr-1"><Setting /></el-icon>
            {{ t('common.settings') }}
          </el-button>

          <el-button v-if="isProxyFeatureVisible" text size="small" @click="showProxySettings = true" title="代理设置">
            {{ t('app.proxy') }}
          </el-button>

          <el-button text size="small" @click="handleExport" :title="t('app.exportConfig')">
            {{ t('common.export') }}
          </el-button>

          <el-button text size="small" @click="handleImport" :title="t('app.importConfig')">
            {{ t('common.import') }}
          </el-button>

          <el-button text size="small" type="danger" @click="handleReset" :title="t('app.resetDefaults')">
            {{ t('common.reset') }}
          </el-button>
        </div>
      </main>

      <!-- Proxy Settings Dialog -->
      <ProxySettings v-if="isProxyFeatureVisible" v-model:visible="showProxySettings" @close="showProxySettings = false" />

      <el-dialog
        v-model="showSettingsDialog"
        :title="t('app.settingsDialogTitle')"
        width="420px"
        :close-on-click-modal="true"
      >
        <div class="flex flex-col gap-3">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {{ t('app.settings.general') }}
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-500 min-w-14">{{ t('app.settings.language') }}</span>
            <el-select v-model="draftLanguage" class="flex-1" :placeholder="t('app.settings.language')">
              <el-option
                v-for="item in languageOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-500 min-w-14">{{ t('app.settings.theme') }}</span>
            <el-select v-model="draftTheme" class="flex-1" :placeholder="t('app.settings.theme')">
              <el-option
                v-for="item in themeOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </div>
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">
            {{ t('app.settings.data') }}
          </div>
          <div class="flex items-center gap-2">
            <el-button class="flex-1" @click="handleExport">{{ t('common.export') }}</el-button>
            <el-button class="flex-1" @click="handleImport">{{ t('common.import') }}</el-button>
          </div>
          <el-button type="danger" plain @click="handleReset">
            {{ t('app.resetDefaults') }}
          </el-button>
        </div>
        <template #footer>
          <el-button type="primary" @click="handleSaveSettings">{{ t('common.save') }}</el-button>
        </template>
      </el-dialog>
    </div>
  </el-config-provider>
</template>
