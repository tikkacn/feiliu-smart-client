use super::CmdResult;
use crate::core::autostart;
use crate::{cmd::StringifyErr as _, feat, utils::dirs};
use smartstring::alias::String;
use std::path::PathBuf;
use tauri::{AppHandle, Manager as _};

#[tauri::command]
pub async fn open_app_dir() -> CmdResult<()> {
    let app_dir = dirs::app_home_dir().stringify_err()?;
    open::that(app_dir).stringify_err()
}

#[tauri::command]
pub async fn open_core_dir() -> CmdResult<()> {
    let core_dir = tauri::utils::platform::current_exe().stringify_err()?;
    let core_dir = core_dir.parent().ok_or("failed to get core dir")?;
    open::that(core_dir).stringify_err()
}

#[tauri::command]
pub async fn open_logs_dir() -> CmdResult<()> {
    let log_dir = dirs::app_logs_dir().stringify_err()?;
    open::that(log_dir).stringify_err()
}

#[tauri::command]
pub fn open_devtools(app_handle: AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        if !window.is_devtools_open() {
            window.open_devtools();
        } else {
            window.close_devtools();
        }
    }
}

#[tauri::command]
pub async fn exit_app() {
    feat::quit().await;
}

#[tauri::command]
pub async fn restart_app() -> CmdResult<()> {
    feat::restart_app().await;
    Ok(())
}

#[tauri::command]
pub fn get_portable_flag() -> bool {
    *dirs::PORTABLE_FLAG.get().unwrap_or(&false)
}

#[tauri::command]
pub fn get_app_dir() -> CmdResult<String> {
    let app_home_dir = dirs::app_home_dir().stringify_err()?.to_string_lossy().into();
    Ok(app_home_dir)
}

/// Copies a user-selected rule file into Mihomo's application-owned safe path.
///
/// Mihomo restricts local rule-provider paths to its home directory by default,
/// so keeping the original Downloads/Desktop path would make a valid-looking
/// rule source fail when the generated runtime config is loaded.
#[tauri::command]
pub async fn import_rule_file(path: String, rule_id: String) -> CmdResult<String> {
    let source = PathBuf::from(path.trim());
    if source.as_os_str().is_empty() {
        return Err("rule file path is empty".into());
    }

    let metadata = tokio::fs::metadata(&source).await.stringify_err()?;
    if !metadata.is_file() {
        return Err("selected rule source is not a file".into());
    }

    let safe_id = rule_id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || *character == '-' || *character == '_')
        .collect::<std::string::String>();
    if safe_id.is_empty() {
        return Err("rule id is empty".into());
    }

    let extension = source
        .extension()
        .and_then(|extension| extension.to_str())
        .filter(|extension| matches!(extension.to_ascii_lowercase().as_str(), "yaml" | "yml" | "txt" | "mrs"))
        .unwrap_or("yaml");
    let target_dir = dirs::app_home_dir().stringify_err()?.join("rule-providers");
    tokio::fs::create_dir_all(&target_dir).await.stringify_err()?;
    let target = target_dir.join(format!("feiliu-custom-{safe_id}.{extension}"));
    tokio::fs::copy(&source, &target).await.stringify_err()?;

    Ok(target.to_string_lossy().into())
}

#[tauri::command]
pub fn get_auto_launch_status() -> CmdResult<bool> {
    autostart::get_launch_status().stringify_err()
}

#[tauri::command]
pub async fn download_icon_cache(url: String, name: String) -> CmdResult<String> {
    feat::download_icon_cache(url, name).await
}

#[tauri::command]
pub async fn copy_icon_file(path: String, icon_info: feat::IconInfo) -> CmdResult<String> {
    feat::copy_icon_file(path, icon_info).await
}
