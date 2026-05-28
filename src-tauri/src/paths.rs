use std::path::PathBuf;

pub(crate) fn config_dir() -> PathBuf {
    let userprofile = std::env::var("USERPROFILE").ok();
    let home = std::env::var("HOME").ok();
    config_dir_from_env(userprofile.as_deref(), home.as_deref())
}

fn config_dir_from_env(userprofile: Option<&str>, home: Option<&str>) -> PathBuf {
    let home = if let Some(userprofile) = userprofile {
        PathBuf::from(userprofile)
    } else if let Some(home) = home {
        PathBuf::from(home)
    } else {
        PathBuf::from(".")
    };
    home.join(".nrm-desktop")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_dir_prefers_userprofile_then_home_then_current_dir() {
        assert_eq!(
            config_dir_from_env(Some("C:/Users/alice"), Some("/Users/alice")),
            std::path::PathBuf::from("C:/Users/alice").join(".nrm-desktop")
        );
        assert_eq!(
            config_dir_from_env(None, Some("/Users/alice")),
            std::path::PathBuf::from("/Users/alice").join(".nrm-desktop")
        );
        assert_eq!(
            config_dir_from_env(None, None),
            std::path::PathBuf::from(".").join(".nrm-desktop")
        );
    }
}
