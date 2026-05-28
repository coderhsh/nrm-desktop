use crate::models::Registry;
use crate::registries;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, LazyLock};
use std::time::{Duration, Instant};
use tokio::sync::Semaphore;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatencyResult {
    pub name: String,
    pub url: String,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
}

const TIMEOUT: Duration = Duration::from_secs(5);
const MAX_CONCURRENT: usize = 6;

static HTTP_CLIENT: LazyLock<Result<reqwest::Client, String>> = LazyLock::new(build_http_client);

fn build_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))
}

fn http_client() -> Result<&'static reqwest::Client, String> {
    match &*HTTP_CLIENT {
        Ok(client) => Ok(client),
        Err(e) => Err(e.clone()),
    }
}

pub async fn test_all() -> Result<Vec<LatencyResult>, String> {
    let registries = registries::get_all().map_err(|e| e.to_string())?;
    if registries.is_empty() {
        return Ok(Vec::new());
    }

    let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT));
    let client = http_client()?;
    let handles = spawn_registry_tests(client, registries, semaphore);

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

fn spawn_registry_tests(
    client: &'static reqwest::Client,
    registries: Vec<Registry>,
    semaphore: Arc<Semaphore>,
) -> Vec<tokio::task::JoinHandle<LatencyResult>> {
    let mut handles = Vec::new();

    for reg in registries {
        let semaphore = semaphore.clone();
        handles.push(tokio::spawn(async move {
            let _permit = match semaphore.acquire_owned().await {
                Ok(permit) => permit,
                Err(_) => {
                    return LatencyResult {
                        name: reg.name.clone(),
                        url: reg.url.clone(),
                        latency_ms: None,
                        error: Some("任务失败: 并发控制已关闭".to_string()),
                    };
                }
            };
            test_registry(client, &reg).await
        }));
    }

    handles
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

    let client = http_client()?;
    let result = test_registry(client, &registry).await;
    Ok(result)
}

/// 测试任意 URL 的延迟（不依赖已保存的源列表）
pub async fn test_url(url: &str) -> Result<LatencyResult, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("URL 不能为空".to_string());
    }

    let client = http_client()?;
    let start = Instant::now();
    let request_url = trimmed.trim_end_matches('/');

    let result = try_request(client, request_url).await;
    match result {
        Ok(()) => {
            let elapsed = start.elapsed().as_millis() as u64;
            Ok(LatencyResult {
                name: String::new(),
                url: trimmed.to_string(),
                latency_ms: Some(elapsed),
                error: None,
            })
        }
        Err(e) => Ok(LatencyResult {
            name: String::new(),
            url: trimmed.to_string(),
            latency_ms: None,
            error: Some(e),
        }),
    }
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
            }
        }
        Err(e) => LatencyResult {
            name: registry.name.clone(),
            url: registry.url.clone(),
            latency_ms: None,
            error: Some(e),
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

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::Semaphore;

    fn registry(name: &str) -> Registry {
        Registry {
            name: name.to_string(),
            url: format!("https://{name}.example/"),
        }
    }

    #[test]
    fn http_client_reuses_global_instance() {
        let first = http_client().expect("create http client");
        let second = http_client().expect("reuse http client");

        assert!(std::ptr::eq(first, second));
    }

    #[test]
    fn spawn_registry_tests_does_not_wait_for_permits_before_spawning() {
        tauri::async_runtime::block_on(async {
            let semaphore = Arc::new(Semaphore::new(0));
            let client = http_client().expect("create http client");
            let registries = vec![registry("one"), registry("two"), registry("three")];

            let handles = spawn_registry_tests(client, registries, semaphore);

            assert_eq!(handles.len(), 3);
            for handle in handles {
                handle.abort();
            }
        });
    }

    #[test]
    fn spawn_registry_tests_returns_error_when_semaphore_is_closed() {
        tauri::async_runtime::block_on(async {
            let semaphore = Arc::new(Semaphore::new(1));
            semaphore.close();
            let client = http_client().expect("create http client");
            let registries = vec![registry("one")];

            let handles = spawn_registry_tests(client, registries, semaphore);
            let result = handles
                .into_iter()
                .next()
                .expect("spawned handle")
                .await
                .expect("task completed");

            assert_eq!(result.name, "one");
            assert_eq!(result.latency_ms, None);
            assert_eq!(result.error.as_deref(), Some("任务失败: 并发控制已关闭"));
        });
    }
}
