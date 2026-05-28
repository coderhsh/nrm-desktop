use std::path::PathBuf;

/// Try to acquire single instance lock.
/// Returns true if this is the first instance.
pub fn try_lock_single_instance() -> bool {
    let lock = lock_file_path();
    // Ensure config dir exists
    if let Some(parent) = lock.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    match std::fs::File::create_new(&lock) {
        Ok(_) => {
            let _ = std::fs::write(&lock, std::process::id().to_string());
            true
        }
        Err(_) => false,
    }
}

/// Activate existing window by finding and bringing it to front.
/// Returns `true` if a window was found and activated.
pub fn activate_existing_window() -> bool {
    #[cfg(windows)]
    {
        extern "system" {
            fn FindWindowW(
                lpClassName: *const u16,
                lpWindowName: *const u16,
            ) -> isize;
            fn SetForegroundWindow(hWnd: isize) -> i32;
            fn ShowWindow(hWnd: isize, nCmdShow: i32) -> i32;
        }

        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        let title: Vec<u16> = OsStr::new("nrm-desktop")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        const SW_RESTORE: i32 = 9;

        unsafe {
            let hwnd = FindWindowW(std::ptr::null(), title.as_ptr());
            if hwnd != 0 {
                SetForegroundWindow(hwnd);
                ShowWindow(hwnd, SW_RESTORE);
                return true;
            }
        }
    }
    false
}

fn lock_file_path() -> PathBuf {
    crate::paths::config_dir().join(".instance.lock")
}

/// Remove single instance lock file when app exits.
pub(crate) fn cleanup_single_instance_lock() {
    let lock = lock_file_path();
    if lock.exists() {
        let _ = std::fs::remove_file(lock);
    }
}

/// Clear single instance lock file manually.
pub fn clear_single_instance_lock() {
    cleanup_single_instance_lock();
}
