use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use tauri::utils::config::{AppDirectoriesOverride, AppDirectoryOverrides};

pub(crate) const DATA_FOLDER: &str = "Data";
pub(crate) const WEBVIEW_DATA_FOLDER: &str = "WebView2Data";

const CONFIG_FOLDER: &str = "config";
const DATA_SUBFOLDER: &str = "data";
const LOCAL_DATA_SUBFOLDER: &str = "local-data";
const CACHE_FOLDER: &str = "cache";
const LOG_FOLDER: &str = "logs";

/// All writable application state lives next to the executable.
#[derive(Debug, Clone)]
pub(crate) struct PortablePaths {
    data_dir: PathBuf,
    webview_data_dir: PathBuf,
}

impl PortablePaths {
    pub(crate) fn from_current_exe() -> io::Result<Self> {
        let executable = std::env::current_exe().map_err(|error| {
            io::Error::new(
                error.kind(),
                format!("无法确定 LeonGit 可执行文件路径：{error}"),
            )
        })?;

        let install_dir = executable
            .parent()
            .filter(|path| !path.as_os_str().is_empty())
            .ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::NotFound,
                    format!("无法从可执行文件路径确定安装目录：{}", executable.display()),
                )
            })?
            .to_path_buf();

        Ok(Self::new(install_dir))
    }

    fn new(install_dir: PathBuf) -> Self {
        let data_dir = install_dir.join(DATA_FOLDER);
        let webview_data_dir = install_dir.join(WEBVIEW_DATA_FOLDER);

        Self {
            data_dir,
            webview_data_dir,
        }
    }

    pub(crate) fn directory_overrides(&self) -> AppDirectoriesOverride {
        AppDirectoriesOverride::Directories(AppDirectoryOverrides {
            config: Some(self.data_dir.join(CONFIG_FOLDER)),
            data: Some(self.data_dir.join(DATA_SUBFOLDER)),
            local_data: Some(self.data_dir.join(LOCAL_DATA_SUBFOLDER)),
            cache: Some(self.data_dir.join(CACHE_FOLDER)),
            log: Some(self.data_dir.join(LOG_FOLDER)),
        })
    }

    /// Creates every directory required before the first window is opened.
    pub(crate) fn prepare(&self) -> io::Result<()> {
        for path in self.required_directories() {
            fs::create_dir_all(&path).map_err(|error| {
                io::Error::new(
                    error.kind(),
                    format!(
                        "无法创建便携数据目录“{}”：{error}。请确认安装目录可写。",
                        path.display()
                    ),
                )
            })?;
        }

        Ok(())
    }

    pub(crate) fn webview_data_dir(&self) -> &Path {
        &self.webview_data_dir
    }

    fn required_directories(&self) -> [PathBuf; 7] {
        [
            self.data_dir.clone(),
            self.data_dir.join(CONFIG_FOLDER),
            self.data_dir.join(DATA_SUBFOLDER),
            self.data_dir.join(LOCAL_DATA_SUBFOLDER),
            self.data_dir.join(CACHE_FOLDER),
            self.data_dir.join(LOG_FOLDER),
            self.webview_data_dir.clone(),
        ]
    }
}

/// Shows a native startup error before Tauri has created any window.
pub(crate) fn show_fatal_error(message: &str) {
    #[cfg(windows)]
    {
        use std::ffi::c_void;

        type Hwnd = *mut c_void;

        const MB_OK: u32 = 0x0000_0000;
        const MB_ICONERROR: u32 = 0x0000_0010;

        #[link(name = "user32")]
        extern "system" {
            fn MessageBoxW(
                window: Hwnd,
                text: *const u16,
                caption: *const u16,
                message_type: u32,
            ) -> i32;
        }

        let text: Vec<u16> = message.encode_utf16().chain(std::iter::once(0)).collect();
        let caption: Vec<u16> = "LeonGit 启动失败"
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        // SAFETY: both buffers are null-terminated and stay alive for the duration
        // of the call. The window handle is intentionally null (owned by the thread).
        unsafe {
            MessageBoxW(
                std::ptr::null_mut(),
                text.as_ptr(),
                caption.as_ptr(),
                MB_OK | MB_ICONERROR,
            );
        }
    }

    #[cfg(not(windows))]
    eprintln!("{message}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_all_portable_directories() {
        let temp = tempfile::tempdir().expect("temp directory");
        let paths = PortablePaths::new(temp.path().to_path_buf());

        paths.prepare().expect("portable directories");

        for relative in [
            DATA_FOLDER,
            "Data/config",
            "Data/data",
            "Data/local-data",
            "Data/cache",
            "Data/logs",
            WEBVIEW_DATA_FOLDER,
        ] {
            assert!(
                temp.path().join(relative).is_dir(),
                "{relative} should exist"
            );
        }
    }

    #[test]
    fn directory_overrides_stay_inside_install_directory() {
        let temp = tempfile::tempdir().expect("temp directory");
        let paths = PortablePaths::new(temp.path().to_path_buf());

        let AppDirectoriesOverride::Directories(overrides) = paths.directory_overrides() else {
            panic!("expected per-directory overrides");
        };

        for path in [
            overrides.config,
            overrides.data,
            overrides.local_data,
            overrides.cache,
            overrides.log,
        ]
        .into_iter()
        .flatten()
        {
            assert!(path.starts_with(temp.path()));
        }
    }
}
