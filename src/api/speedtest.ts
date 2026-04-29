import { invoke } from "@tauri-apps/api/core";

export interface LatencyResult {
  name: string;
  url: string;
  latency_ms: number | null;
  error: string | null;
  is_custom: boolean;
}

export async function testAllSpeed(): Promise<LatencyResult[]> {
  return invoke<LatencyResult[]>("test_all_speed");
}

export async function testSingleSpeed(name: string): Promise<LatencyResult> {
  return invoke<LatencyResult>("test_single_speed", { name });
}
