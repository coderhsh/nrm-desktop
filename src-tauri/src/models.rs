use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Registry {
    pub name: String,
    pub url: String,
    pub is_custom: bool,
}

/// 应用初次安装或恢复默认时的三个内置源（与自定义源同等对待，仅存于配置列表）。
pub fn default_registries() -> Vec<Registry> {
    vec![
        Registry {
            name: "npm".to_string(),
            url: "https://registry.npmjs.org/".to_string(),
            is_custom: true,
        },
        Registry {
            name: "yarn".to_string(),
            url: "https://registry.yarnpkg.com/".to_string(),
            is_custom: true,
        },
        Registry {
            name: "taobao".to_string(),
            url: "https://registry.npmmirror.com/".to_string(),
            is_custom: true,
        },
    ]
}
