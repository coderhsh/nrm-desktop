use std::path::PathBuf;

pub(crate) fn home_dir() -> PathBuf {
    let userprofile = std::env::var("USERPROFILE").ok();
    let home = std::env::var("HOME").ok();
    home_dir_from_env(userprofile.as_deref(), home.as_deref())
}

pub(crate) fn config_dir() -> PathBuf {
    home_dir().join(".nrm-desktop")
}

pub(crate) fn ensure_config_dir() -> std::io::Result<PathBuf> {
    let dir = config_dir();
    if !dir.exists() {
        std::fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

fn home_dir_from_env(userprofile: Option<&str>, home: Option<&str>) -> PathBuf {
    if let Some(userprofile) = userprofile {
        PathBuf::from(userprofile)
    } else if let Some(home) = home {
        PathBuf::from(home)
    } else {
        PathBuf::from(".")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn home_dir_prefers_userprofile_then_home_then_current_dir() {
        assert_eq!(
            home_dir_from_env(Some("C:/Users/alice"), Some("/Users/alice")),
            std::path::PathBuf::from("C:/Users/alice")
        );
        assert_eq!(
            home_dir_from_env(None, Some("/Users/alice")),
            std::path::PathBuf::from("/Users/alice")
        );
        assert_eq!(home_dir_from_env(None, None), std::path::PathBuf::from("."));
    }

    #[test]
    fn config_dir_appends_nrm_desktop_to_home_dir() {
        assert_eq!(
            home_dir_from_env(Some("C:/Users/alice"), Some("/Users/alice")).join(".nrm-desktop"),
            std::path::PathBuf::from("C:/Users/alice").join(".nrm-desktop")
        );
        assert_eq!(
            home_dir_from_env(None, Some("/Users/alice")).join(".nrm-desktop"),
            std::path::PathBuf::from("/Users/alice").join(".nrm-desktop")
        );
        assert_eq!(
            home_dir_from_env(None, None).join(".nrm-desktop"),
            std::path::PathBuf::from(".").join(".nrm-desktop")
        );
    }
}
