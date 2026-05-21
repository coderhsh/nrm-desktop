use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Registry {
    pub name: String,
    pub url: String,
}

/// 初次安装或恢复默认时的初始源列表。
pub fn default_registries() -> Vec<Registry> {
    vec![
        Registry {
            name: "npm".to_string(),
            url: "https://registry.npmjs.org/".to_string(),
        },
        Registry {
            name: "yarn".to_string(),
            url: "https://registry.yarnpkg.com/".to_string(),
        },
        Registry {
            name: "taobao".to_string(),
            url: "https://registry.npmmirror.com/".to_string(),
        },
    ]
}
