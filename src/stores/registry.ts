import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import type { Registry } from "@/types";
import * as api from "@/api/tauri";
import { testAllSpeed, testSingleSpeed } from "@/api/speedtest";
import type { LatencyResult } from "@/api/speedtest";
import { useI18n } from "@/composables/useI18n";
import { formatInvokeErrorMessage } from "@/utils/invoke-error-i18n";

export const useRegistryStore = defineStore("registry", () => {
  const { t } = useI18n();
  const registries = ref<Registry[]>([]);
  const currentRegistry = ref<Registry | null>(null);
  const loading = ref(false);
  const searchQuery = ref("");
  const latencyResults = ref<Record<string, LatencyResult>>({});
  const latencyLoading = ref(false);

  /**
   * Replace all latency results with the latest test snapshot.
   */
  function setLatencyResults(results: LatencyResult[]) {
    const map: Record<string, LatencyResult> = {};
    for (const result of results) {
      map[result.name] = result;
    }
    latencyResults.value = map;
  }

  /**
   * Upsert one latency result after single-source re-test.
   */
  function setSingleLatencyResult(result: LatencyResult) {
    latencyResults.value = {
      ...latencyResults.value,
      [result.name]: result,
    };
  }

  const filteredRegistries = computed(() => {
    const q = searchQuery.value.toLowerCase();
    if (!q) return registries.value;
    return registries.value.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || r.url.toLowerCase().includes(q)
    );
  });

  function getLatencyClass(name: string): string {
    const r = latencyResults.value[name];
    if (!r || r.latency_ms === null) return "";
    if (r.latency_ms < 200) return "latency-fast";
    if (r.latency_ms < 1000) return "latency-medium";
    return "latency-slow";
  }

  function getLatencyMs(name: string): number | null {
    return latencyResults.value[name]?.latency_ms ?? null;
  }

  async function fetchRegistries() {
    loading.value = true;
    try {
      const [allRegs, current] = await Promise.all([
        api.getRegistries(),
        api.getCurrentRegistry(),
      ]);
      registries.value = allRegs;
      currentRegistry.value = current;
    } catch (e) {
      ElMessage.error(
        t("registryStore.fetchFailed", { error: formatInvokeErrorMessage(t, e) }),
      );
    } finally {
      loading.value = false;
    }
  }

  async function fetchLatency() {
    latencyLoading.value = true;
    try {
      const results = await testAllSpeed();
      setLatencyResults(results);
    } catch {
      // silent — latency is best-effort
    } finally {
      latencyLoading.value = false;
    }
  }

  /** 由测速面板驱动左侧列表的「延迟加载中」指示，与全量测速生命周期对齐 */
  function setLatencyLoading(next: boolean) {
    latencyLoading.value = next;
  }

  async function switchRegistry(name: string) {
    try {
      await api.setRegistry(name);
      currentRegistry.value =
        registries.value.find((r) => r.name === name) || null;
    } catch (e) {
      ElMessage.error(
        t("registryStore.switchFailed", { error: formatInvokeErrorMessage(t, e) }),
      );
    }
  }

  /**
   * 仅根据已缓存的源列表更新当前源（不请求接口、不触发 loading），用于托盘切换后的界面同步。
   */
  function syncCurrentRegistryByName(name: string) {
    currentRegistry.value =
      registries.value.find((r) => r.name === name) ?? null;
  }

  /**
   * 对指定源执行单次延迟测试并写入结果；失败时静默（与 `fetchLatency` 一致）。
   * 返回测速结果，便于调用方决定是否等待测速完成后再继续流程。
   */
  async function measureRegistryLatency(name: string): Promise<LatencyResult | null> {
    try {
      const result = await testSingleSpeed(name);
      setSingleLatencyResult(result);
      return result;
    } catch {
      // best-effort
      return null;
    }
  }

  /**
   * 添加自定义源；成功后立即同步测速一次，确保列表可直接显示延迟结果。
   */
  async function addRegistry(name: string, url: string) {
    try {
      await api.addRegistry(name, url);
      await measureRegistryLatency(name);
      registries.value.push({ name, url, is_custom: true });
    } catch (e) {
      ElMessage.error(
        t("registryStore.addFailed", { error: formatInvokeErrorMessage(t, e) }),
      );
      throw e;
    }
  }

  /**
   * 删除源；若删除的是当前正在使用的源，后端会测速并自动切换到延迟最低（测速失败则用列表首项）的源。
   */
  async function deleteRegistry(name: string) {
    const prevCurrentName = currentRegistry.value?.name ?? null;
    try {
      await api.deleteRegistry(name);
      registries.value = registries.value.filter((r) => r.name !== name);
      const current = await api.getCurrentRegistry();
      currentRegistry.value = current;
      const autoSwitched =
        prevCurrentName === name &&
        current !== null &&
        current.name !== name;
      if (autoSwitched) {
        ElMessage.success(
          t("registryStore.deleteSuccessWithAutoSwitch", {
            deleted: name,
            current: current.name,
          })
        );
      } else {
        ElMessage.success(t("registryStore.deleteSuccess", { name }));
      }
    } catch (e) {
      ElMessage.error(
        t("registryStore.deleteFailed", { error: formatInvokeErrorMessage(t, e) }),
      );
      throw e;
    }
  }

  async function updateRegistry(
    name: string,
    newName: string,
    newUrl: string
  ) {
    try {
      const idx = registries.value.findIndex((r) => r.name === name);
      const previous = idx !== -1 ? registries.value[idx] : null;
      const previousUrl = previous?.url ?? "";

      await api.updateRegistry(name, newName, newUrl);

      /**
       * 必须先迁移 latency 再改 registries，否则 SpeedTest 等对 registries 的 watch
       * 会用新名去读仍为旧键的 latencyResults，把该行写成 null，侧栏/测速都会丢延迟。
       */
      const lr = latencyResults.value;
      if (name !== newName) {
        let hit = lr[name];
        const keysToDelete = new Set<string>([name]);
        if (!hit && previousUrl) {
          const found = Object.entries(lr).find(([, v]) => v.url === previousUrl);
          if (found) {
            hit = found[1];
            keysToDelete.add(found[0]);
          }
        }
        const next = { ...lr };
        for (const k of keysToDelete) delete next[k];
        if (hit) {
          next[newName] = {
            ...hit,
            name: newName,
            url: newUrl,
            is_custom: true,
          };
        }
        latencyResults.value = next;
      } else {
        const hit = lr[name];
        if (hit) {
          latencyResults.value = {
            ...lr,
            [name]: {
              ...hit,
              url: newUrl,
              is_custom: true,
            },
          };
        }
      }

      if (idx !== -1) {
        registries.value[idx] = { name: newName, url: newUrl, is_custom: true };
      }
      if (currentRegistry.value?.name === name) {
        currentRegistry.value = { name: newName, url: newUrl, is_custom: true };
      }
    } catch (e) {
      ElMessage.error(
        t("registryStore.updateFailed", { error: formatInvokeErrorMessage(t, e) }),
      );
      throw e;
    }
  }

  return {
    registries,
    currentRegistry,
    loading,
    searchQuery,
    filteredRegistries,
    latencyResults,
    latencyLoading,
    getLatencyClass,
    getLatencyMs,
    setLatencyResults,
    setSingleLatencyResult,
    fetchRegistries,
    fetchLatency,
    setLatencyLoading,
    syncCurrentRegistryByName,
    switchRegistry,
    addRegistry,
    deleteRegistry,
    updateRegistry,
  };
});
