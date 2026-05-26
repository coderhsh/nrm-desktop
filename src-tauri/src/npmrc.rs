use crate::registry_config::{parse_registry_value, RegistryParseOptions};
use std::fs;
use std::io::{self, Write};
use std::path::PathBuf;

/// Get the user-level .npmrc file path.
pub fn get_npmrc_path() -> PathBuf {
    let home = dirs_fallback();
    home.join(".npmrc")
}

/// Fallback to get the user's home directory.
fn dirs_fallback() -> PathBuf {
    if let Ok(home) = std::env::var("USERPROFILE") {
        PathBuf::from(home)
    } else if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home)
    } else {
        PathBuf::from(".")
    }
}

/// Read the current registry value from .npmrc.
/// Returns `None` if no registry is set or the file doesn't exist.
pub fn read_current_registry() -> io::Result<Option<String>> {
    let path = get_npmrc_path();
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path)?;
    Ok(parse_registry_value(&content, RegistryParseOptions::NPMRC))
}

/// Atomically write content to a file (write to tmp, rename).
pub fn atomic_write(path: &PathBuf, content: &str) -> io::Result<()> {
    let temp_path = path.with_extension("tmp");
    let mut temp = fs::File::create(&temp_path)?;
    temp.write_all(content.as_bytes())?;
    temp.sync_all()?;
    drop(temp);
    do_rename(&temp_path, path)
}

/// Backup the .npmrc file. Creates `.npmrc.nrmbackup`.
pub fn backup_npmrc() -> io::Result<()> {
    let path = get_npmrc_path();
    if !path.exists() {
        return Ok(());
    }
    let backup = path.with_extension("npmrc.nrmbackup");
    copy_with_overwrite(&path, &backup)?;
    Ok(())
}

/// Set the registry in .npmrc using atomic write.
/// Writes to a temporary file first, then renames to .npmrc.
pub fn set_registry(url: &str) -> io::Result<()> {
    let path = get_npmrc_path();
    let backup = path.with_extension("npmrc.nrmbackup");

    // Read existing content
    let existing = if path.exists() {
        fs::read_to_string(&path)?
    } else {
        String::new()
    };

    // Backup original
    if path.exists() {
        copy_with_overwrite(&path, &backup)?;
    }

    // Build new content: update or add registry= line
    let mut has_registry = false;
    let mut new_lines = Vec::new();

    for line in existing.lines() {
        if line.trim().starts_with("registry=") || line.trim().starts_with("registry =") {
            new_lines.push(format!("registry={}", url));
            has_registry = true;
        } else {
            new_lines.push(line.to_string());
        }
    }

    if !has_registry {
        if !new_lines.is_empty() && !new_lines.last().map_or(true, |s| s.is_empty()) {
            new_lines.push(String::new());
        }
        new_lines.push(format!("registry={}", url));
    }

    let new_content = new_lines.join("\n") + "\n";

    // Atomic write: write to a temp file, then rename
    let temp_path = path.with_extension("npmrc.tmp");
    let mut temp_file = fs::File::create(&temp_path)?;
    temp_file.write_all(new_content.as_bytes())?;
    temp_file.sync_all()?;
    drop(temp_file);

    // On Windows, rename cannot replace an existing file directly.
    if path.exists() {
        clear_readonly_if_needed(&path)?;
        fs::remove_file(&path)?;
    }
    fs::rename(&temp_path, &path)?;

    Ok(())
}

/// Copy source file to destination and safely overwrite existing destination.
fn copy_with_overwrite(from: &PathBuf, to: &PathBuf) -> io::Result<()> {
    if to.exists() {
        clear_readonly_if_needed(to)?;
        fs::remove_file(to)?;
    }
    fs::copy(from, to)?;
    Ok(())
}

/// Rename a file, handling Windows restrictions.
fn do_rename(from: &PathBuf, to: &PathBuf) -> io::Result<()> {
    if to.exists() {
        clear_readonly_if_needed(to)?;
        fs::remove_file(to)?;
    }
    fs::rename(from, to)
}

/// Clear readonly attribute for a file when needed.
fn clear_readonly_if_needed(path: &PathBuf) -> io::Result<()> {
    let metadata = fs::metadata(path)?;
    let mut permissions = metadata.permissions();
    if permissions.readonly() {
        permissions.set_readonly(false);
        fs::set_permissions(path, permissions)?;
    }
    Ok(())
}
