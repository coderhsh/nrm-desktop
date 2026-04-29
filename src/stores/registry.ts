import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import type { Registry } from "@/types";
import * as api from "@/api/tauri";
import { testAllSpeed } from "@/api/speedtest";
import type { LatencyResult } from "@/api/speedtest";

export const useRegistryStore = defineStore("registry", () => {
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
      ElMessage.error(`加载源列表失败: ${e}`);
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

  async function switchRegistry(name: string) {
    try {
      await api.setRegistry(name);
      currentRegistry.value =
        registries.value.find((r) => r.name === name) || null;
      ElMessage.success(`已切换到源: ${name}`);
    } catch (e) {
      ElMessage.error(`切换源失败: ${e}`);
    }
  }

  async function addRegistry(name: string, url: string) {
    try {
      await api.addRegistry(name, url);
      registries.value.push({ name, url, is_custom: true });
    } catch (e) {
      ElMessage.error(`添加源失败: ${e}`);
      throw e;
    }
  }

  async function deleteRegistry(name: string) {
    try {
      await api.deleteRegistry(name);
      registries.value = registries.value.filter((r) => r.name !== name);
      if (currentRegistry.value?.name === name) {
        currentRegistry.value = null;
      }
    } catch (e) {
      ElMessage.error(`删除源失败: ${e}`);
      throw e;
    }
  }

  async function updateRegistry(
    name: string,
    newName: string,
    newUrl: string
  ) {
    try {
      await api.updateRegistry(name, newName, newUrl);
      const idx = registries.value.findIndex((r) => r.name === name);
      if (idx !== -1) {
        registries.value[idx] = { name: newName, url: newUrl, is_custom: true };
      }
      if (currentRegistry.value?.name === name) {
        currentRegistry.value = { name: newName, url: newUrl, is_custom: true };
      }
    } catch (e) {
      ElMessage.error(`更新源失败: ${e}`);
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
    switchRegistry,
    addRegistry,
    deleteRegistry,
    updateRegistry,
  };
});
