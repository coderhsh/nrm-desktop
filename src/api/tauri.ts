import { invoke } from "@tauri-apps/api/core";
import type { Registry } from "@/types";

/** 系统 PATH 中解析到的 node / npm 版本字符串（不可用则为 null）。 */
export interface NodeNpmVersions {
  node: string | null;
  npm: string | null;
}

/**
 * 获取当前环境下的 Node 与 npm 版本（调用 `node -v`、`npm -v`）。
 */
export async function getNodeNpmVersions(): Promise<NodeNpmVersions> {
  return invoke<NodeNpmVersions>("get_node_npm_versions");
}

export async function getRegistries(): Promise<Registry[]> {
  return invoke<Registry[]>("get_registries");
}

export async function getCurrentRegistry(): Promise<Registry | null> {
  return invoke<Registry | null>("get_current_registry");
}

export async function setRegistry(name: string): Promise<void> {
  return invoke<void>("set_registry", { name });
}

export async function addRegistry(name: string, url: string): Promise<void> {
  return invoke<void>("add_registry", { name, url });
}

export async function deleteRegistry(name: string): Promise<void> {
  return invoke<void>("delete_registry", { name });
}

export async function updateRegistry(
  name: string,
  newName: string,
  newUrl: string
): Promise<void> {
  return invoke<void>("update_registry", { name, newName, newUrl });
}

export interface ExportData {
  version: string;
  exported_at: string;
  presets: Registry[];
  custom: Registry[];
}

export async function exportConfig(): Promise<ExportData> {
  return invoke<ExportData>("export_config");
}

export async function importConfig(jsonData: string): Promise<void> {
  return invoke<void>("import_config", { jsonData });
}

export async function resetDefaults(): Promise<string> {
  return invoke<string>("reset_defaults");
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  return invoke<void>("write_text_file", { path, content });
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

export async function getProjectRegistry(): Promise<[string, string] | null> {
  return invoke<[string, string] | null>("get_project_registry");
}

export interface ProxyConfig {
  http_proxy: string | null;
  https_proxy: string | null;
  enabled: boolean;
}

export async function getProxyConfig(): Promise<ProxyConfig> {
  return invoke<ProxyConfig>("get_proxy_config");
}

export async function detectEnvProxy(): Promise<ProxyConfig> {
  return invoke<ProxyConfig>("detect_env_proxy");
}

export async function setProxyConfig(config: ProxyConfig): Promise<void> {
  return invoke<void>("set_proxy_config", { config });
}
