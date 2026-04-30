use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Registry {
    pub name: String,
    pub url: String,
    pub is_custom: bool,
}

pub fn preset_registries() -> Vec<Registry> {
    vec![
        Registry {
            name: "npm".to_string(),
            url: "https://registry.npmjs.org/".to_string(),
            is_custom: false,
        },
        Registry {
            name: "yarn".to_string(),
            url: "https://registry.yarnpkg.com/".to_string(),
            is_custom: false,
        },
        Registry {
            name: "taobao".to_string(),
            url: "https://registry.npmmirror.com/".to_string(),
            is_custom: false,
        },
    ]
}
