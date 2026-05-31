#[derive(Clone, Copy)]
pub(crate) struct RegistryParseOptions {
    allow_spaced_assignment: bool,
    require_http_url: bool,
}

impl RegistryParseOptions {
    pub(crate) const NPMRC: Self = Self {
        allow_spaced_assignment: true,
        require_http_url: false,
    };

    pub(crate) const PROJECT_NRMRC: Self = Self {
        allow_spaced_assignment: false,
        require_http_url: true,
    };
}

pub(crate) fn normalize_registry_url_key(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

pub(crate) fn parse_registry_value(content: &str, options: RegistryParseOptions) -> Option<String> {
    for line in content.lines() {
        if let Some(value) = parse_registry_line(line, options) {
            return Some(value);
        }
    }
    None
}

fn parse_registry_line(line: &str, options: RegistryParseOptions) -> Option<String> {
    let trimmed = line.trim();

    if let Some(value) = trimmed.strip_prefix("registry=") {
        return clean_registry_value(value, options);
    }

    if options.allow_spaced_assignment {
        if let Some(rest) = trimmed.strip_prefix("registry") {
            let rest = rest.trim_start();
            if let Some(value) = rest.strip_prefix('=') {
                return clean_registry_value(value, options);
            }
        }
    }

    None
}

fn clean_registry_value(value: &str, options: RegistryParseOptions) -> Option<String> {
    let cleaned = value.trim().trim_matches('"').to_string();
    if options.require_http_url && !is_http_registry_url(&cleaned) {
        return None;
    }
    Some(cleaned)
}

fn is_http_registry_url(value: &str) -> bool {
    value.starts_with("http://") || value.starts_with("https://")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_npmrc_registry_with_spaced_assignment_without_url_validation() {
        let content = r#"
@scope:registry=https://scope.example/
registry = "file:../local-registry"
"#;

        let parsed = parse_registry_value(content, RegistryParseOptions::NPMRC);

        assert_eq!(parsed.as_deref(), Some("file:../local-registry"));
    }

    #[test]
    fn parses_project_nrmrc_registry_with_strict_assignment_and_http_validation() {
        let content = r#"
registry = https://ignored.example/
registry=file:../local-registry
registry="https://project.example/"
"#;

        let parsed = parse_registry_value(content, RegistryParseOptions::PROJECT_NRMRC);

        assert_eq!(parsed.as_deref(), Some("https://project.example/"));
    }

    #[test]
    fn normalizes_registry_url_key_by_trimming_and_dropping_trailing_slash() {
        assert_eq!(
            normalize_registry_url_key(" https://registry.example.com/path/ "),
            "https://registry.example.com/path"
        );
    }
}
