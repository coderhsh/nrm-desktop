use crate::models::Registry;
use crate::registries;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use std::sync::Arc;
use tokio::sync::Semaphore;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatencyResult {
    pub name: String,
    pub url: String,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
    pub is_custom: bool,
}

const TIMEOUT: Duration = Duration::from_secs(5);
const MAX_CONCURRENT: usize = 6;

pub async fn test_all() -> Result<Vec<LatencyResult>, String> {
    let registries = registries::get_all().map_err(|e| e.to_string())?;
    if registries.is_empty() {
        return Ok(Vec::new());
    }

    let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT));
    let client = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let mut handles = Vec::new();
    for reg in registries {
        let client = client.clone();
        let permit = semaphore.clone().acquire_owned().await.unwrap();

        handles.push(tokio::spawn(async move {
            let _permit = permit;
            let result = test_registry(&client, &reg).await;
            result
        }));
    }

    let mut results = Vec::new();
    for handle in handles {
        match handle.await {
            Ok(result) => results.push(result),
            Err(e) => {
                results.push(LatencyResult {
                    name: "unknown".to_string(),
                    url: "".to_string(),
                    latency_ms: None,
                    error: Some(format!("任务失败: {}", e)),
                    is_custom: false,
                });
            }
        }
    }

    // Sort: successful by latency asc, then failed/timeout at end
    results.sort_by(|a, b| {
        match (&a.latency_ms, &b.latency_ms) {
            (Some(la), Some(lb)) => la.cmp(lb),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => std::cmp::Ordering::Equal,
        }
    });

    Ok(results)
}

/// 测速后返回延迟最低且测通的一个源名称；全部失败时退回列表中的第一个源。
pub async fn fastest_registry_name_with_fallback() -> Result<String, String> {
    let all = registries::get_all().map_err(|e| e.to_string())?;
    if all.is_empty() {
        return Err("无可用源".to_string());
    }
    let results = test_all().await?;
    if let Some(r) = results.iter().find(|r| r.latency_ms.is_some()) {
        return Ok(r.name.clone());
    }
    Ok(all[0].name.clone())
}

pub async fn test_single(name: &str) -> Result<LatencyResult, String> {
    let all = registries::get_all().map_err(|e| e.to_string())?;
    let registry = all
        .iter()
        .find(|r| r.name == name)
        .ok_or_else(|| format!("未找到源: {}", name))?
        .clone();

    let client = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let result = test_registry(&client, &registry).await;
    Ok(result)
}

async fn test_registry(client: &reqwest::Client, registry: &Registry) -> LatencyResult {
    let start = Instant::now();

    // Try HEAD request first, fall back to GET
    let request_url = format!("{}", registry.url.trim_end_matches('/'));

    let result = try_request(client, &request_url).await;

    match result {
        Ok(()) => {
            let elapsed = start.elapsed().as_millis() as u64;
            LatencyResult {
                name: registry.name.clone(),
                url: registry.url.clone(),
                latency_ms: Some(elapsed),
                error: None,
                is_custom: registry.is_custom,
            }
        }
        Err(e) => LatencyResult {
            name: registry.name.clone(),
            url: registry.url.clone(),
            latency_ms: None,
            error: Some(e),
            is_custom: registry.is_custom,
        },
    }
}

async fn try_request(client: &reqwest::Client, url: &str) -> Result<(), String> {
    // Try HEAD first
    match client.head(url).send().await {
        Ok(resp) if resp.status().is_success() => return Ok(()),
        Ok(_) => { /* fall through to GET */ }
        Err(_) => { /* fall through to GET */ }
    }

    // Fallback to GET
    match client.get(url).send().await {
        Ok(resp) if resp.status().is_success() => Ok(()),
        Ok(resp) => Err(format!("HTTP {}", resp.status().as_u16())),
        Err(e) => {
            if e.is_timeout() {
                Err("超时".to_string())
            } else if e.is_connect() {
                Err("连接失败".to_string())
            } else {
                Err(format!("请求错误: {}", e))
            }
        }
    }
}
