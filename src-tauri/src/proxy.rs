use crate::npmrc;
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProxyConfig {
    pub http_proxy: Option<String>,
    pub https_proxy: Option<String>,
    pub enabled: bool,
}

/// Read proxy settings from .npmrc.
pub fn read_npmrc_proxy() -> ProxyConfig {
    let path = npmrc::get_npmrc_path();
    if !path.exists() {
        return ProxyConfig::default();
    }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return ProxyConfig::default(),
    };

    let mut config = ProxyConfig::default();
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(val) = trimmed.strip_prefix("proxy=").or_else(|| trimmed.strip_prefix("proxy =")) {
            let v = val.trim().trim_matches('"').to_string();
            if !v.is_empty() {
                config.http_proxy = Some(v);
                config.enabled = true;
            }
        }
        if let Some(val) = trimmed
            .strip_prefix("https-proxy=")
            .or_else(|| trimmed.strip_prefix("https-proxy ="))
        {
            let v = val.trim().trim_matches('"').to_string();
            if !v.is_empty() {
                config.https_proxy = Some(v);
            }
        }
    }
    config
}

/// Detect proxy from environment variables.
pub fn detect_env_proxy() -> ProxyConfig {
    ProxyConfig {
        http_proxy: std::env::var("HTTP_PROXY")
            .or_else(|_| std::env::var("http_proxy"))
            .ok(),
        https_proxy: std::env::var("HTTPS_PROXY")
            .or_else(|_| std::env::var("https_proxy"))
            .ok(),
        enabled: true,
    }
}

/// Write proxy settings to .npmrc.
pub fn set_npmrc_proxy(config: &ProxyConfig) -> Result<(), String> {
    let path = npmrc::get_npmrc_path();
    let existing = if path.exists() {
        fs::read_to_string(&path).map_err(|e| e.to_string())?
    } else {
        String::new()
    };

    let mut new_lines: Vec<String> = Vec::new();
    let mut proxy_set = false;
    let mut https_proxy_set = false;

    for line in existing.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("proxy=")
            || trimmed.starts_with("proxy =")
            || trimmed.starts_with("#proxy=")
            || trimmed.starts_with("#proxy =")
        {
            if config.enabled {
                if let Some(proxy) = config.http_proxy.as_ref() {
                    new_lines.push(format!("proxy={}", proxy));
                }
            }
            proxy_set = true;
        } else if trimmed.starts_with("https-proxy=")
            || trimmed.starts_with("https-proxy =")
            || trimmed.starts_with("#https-proxy=")
            || trimmed.starts_with("#https-proxy =")
        {
            if config.enabled {
                if let Some(proxy) = config.https_proxy.as_ref() {
                    new_lines.push(format!("https-proxy={}", proxy));
                }
            }
            https_proxy_set = true;
        } else {
            new_lines.push(line.to_string());
        }
    }

    // Add proxy lines if not already present
    if config.enabled {
        if !proxy_set {
            if let Some(ref p) = config.http_proxy {
                new_lines.push(format!("proxy={}", p));
            }
        }
        if !https_proxy_set {
            if let Some(ref p) = config.https_proxy {
                new_lines.push(format!("https-proxy={}", p));
            }
        }
    }

    let new_content = new_lines.join("\n") + "\n";
    npmrc::atomic_write(&path, &new_content).map_err(|e| e.to_string())?;

    Ok(())
}
