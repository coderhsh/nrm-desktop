<script setup lang="ts">
import { useRegistryStore } from "@/stores/registry";
import { storeToRefs } from "pinia";

const store = useRegistryStore();
const { currentRegistry } = storeToRefs(store);
</script>

<template>
  <div
    class="flex items-center justify-between px-6 py-5 rounded-xl text-white"
    style="background: linear-gradient(135deg, #4f6ef7, #6d8aff)"
  >
    <div class="flex flex-col gap-0.5">
      <div class="text-xs opacity-80 uppercase tracking-wide">当前源</div>
      <div class="text-xl font-bold leading-tight">
        {{ currentRegistry?.name ?? "未设置" }}
      </div>
      <div class="text-xs opacity-75 break-all">
        {{ currentRegistry?.url }}
      </div>
    </div>
    <div
      v-if="currentRegistry"
      class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
      style="background: rgba(255, 255, 255, 0.2)"
    >
      <span
        class="w-2 h-2 rounded-full bg-white shadow-md"
        style="box-shadow: 0 0 6px rgba(255, 255, 255, 0.6)"
      ></span>
      使用中
    </div>
  </div>
</template>
