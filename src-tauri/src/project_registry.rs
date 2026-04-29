use std::fs;
use std::path::PathBuf;

const MAX_PARENT_SCAN: u32 = 10;

/// Scan upward from CWD for .nrmrc file.
pub fn find_project_nrmrc() -> Option<(PathBuf, String)> {
    let cwd = std::env::current_dir().ok()?;
    let mut dir = Some(cwd.as_path());
    let mut depth = 0;

    while let Some(current) = dir {
        if depth > MAX_PARENT_SCAN {
            break;
        }
        let candidate = current.join(".nrmrc");
        if candidate.exists() {
            if let Some(url) = read_nrmrc(&candidate) {
                return Some((candidate, url));
            }
        }
        dir = current.parent();
        depth += 1;
    }
    None
}

/// Read registry URL from a .nrmrc file.
fn read_nrmrc(path: &PathBuf) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(url) = trimmed.strip_prefix("registry=") {
            let cleaned = url.trim().trim_matches('"').to_string();
            if cleaned.starts_with("http://") || cleaned.starts_with("https://") {
                return Some(cleaned);
            }
        }
    }
    None
}
