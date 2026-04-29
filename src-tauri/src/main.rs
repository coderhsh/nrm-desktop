// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Check if another instance is already running
    if !nrm_desktop_lib::try_lock_single_instance() {
        // Another instance may be running; try to activate it.
        if nrm_desktop_lib::activate_existing_window() {
            return;
        }

        // If activation fails, lock might be stale. Clear once and retry.
        nrm_desktop_lib::clear_single_instance_lock();
        if !nrm_desktop_lib::try_lock_single_instance() {
            return;
        }
    }

    nrm_desktop_lib::run();
}
