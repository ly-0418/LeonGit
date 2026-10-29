use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::git_engine::GitError;

const MAX_REPOS: usize = 8;
const UI_FILE: &str = "ui.json";
const REPOS_FILE: &str = "repos.json";
const PREFERENCES_VERSION: u32 = 5;
const THEME_LIGHT: &str = "light";
const THEME_DARK: &str = "dark";
const FONT_REFERENCE_PX: f64 = 16.0;
const FONT_MIN_PX: f64 = 18.0;
const FONT_MAX_PX: f64 = 28.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiPreferences {
    #[serde(default)]
    pub version: u32,
    pub theme: String,
    pub font_scale: f64,
}

impl Default for UiPreferences {
    fn default() -> Self {
        Self {
            version: PREFERENCES_VERSION,
            theme: THEME_LIGHT.to_owned(),
            font_scale: 1.25,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepoEntry {
    pub id: String,
    pub path: String,
    pub name: String,
    pub opened_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoEntryInput {
    pub path: String,
    pub name: String,
    pub opened_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiState {
    pub theme: String,
    pub font_scale: f64,
    pub repos: Vec<RepoEntry>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoFile {
    version: u32,
    repos: Vec<RepoEntry>,
}

pub(crate) fn load_at(config_dir: &Path) -> Result<UiState, GitError> {
    let mut prefs = read_json::<UiPreferences>(&config_dir.join(UI_FILE)).unwrap_or_default();
    if prefs.version < PREFERENCES_VERSION {
        // Rebase historical defaults to the current 20px standard. Only the
        // exact prior defaults are migrated; a custom slider value survives.
        if prefs.version < 3 && (prefs.font_scale - 1.0).abs() < f64::EPSILON {
            prefs.font_scale = 1.125;
        }
        if prefs.version < 4 && (prefs.font_scale - 1.125).abs() < f64::EPSILON {
            prefs.font_scale = 1.5;
        }
        if prefs.version < 5 && (prefs.font_scale - 1.5).abs() < f64::EPSILON {
            prefs.font_scale = 1.25;
        }
        prefs.version = PREFERENCES_VERSION;
        let _ = write_json(&config_dir.join(UI_FILE), &prefs);
    }
    let repo_file = read_json::<RepoFile>(&config_dir.join(REPOS_FILE)).unwrap_or_default();
    let mut repos = repo_file.repos;
    repos.retain(|repo| !repo.path.trim().is_empty());
    normalize_repos(&mut repos);

    Ok(UiState {
        theme: normalize_theme(&prefs.theme),
        font_scale: normalize_scale(prefs.font_scale),
        repos,
    })
}

pub(crate) fn save_preferences_at(
    config_dir: &Path,
    theme: &str,
    font_scale: f64,
) -> Result<(), GitError> {
    let prefs = UiPreferences {
        version: PREFERENCES_VERSION,
        theme: normalize_theme(theme),
        font_scale: normalize_scale(font_scale),
    };
    write_json(&config_dir.join(UI_FILE), &prefs)
}

pub(crate) fn save_repos_at(
    config_dir: &Path,
    input: Vec<RepoEntryInput>,
) -> Result<Vec<RepoEntry>, GitError> {
    let mut repos: Vec<RepoEntry> = input
        .into_iter()
        .filter(|repo| !repo.path.trim().is_empty())
        .map(|repo| RepoEntry {
            id: stable_id(&repo.path),
            path: repo.path,
            name: repo.name,
            opened_at: repo.opened_at,
        })
        .collect();
    normalize_repos(&mut repos);
    let file = RepoFile { version: 1, repos };
    write_json(&config_dir.join(REPOS_FILE), &file)?;
    Ok(file.repos)
}

fn normalize_repos(repos: &mut Vec<RepoEntry>) {
    let mut seen = std::collections::HashSet::new();
    repos.retain(|repo| seen.insert(dedup_key(&repo.path)));
    repos.sort_by_key(|repo| std::cmp::Reverse(repo.opened_at));
    repos.truncate(MAX_REPOS);
}

fn dedup_key(path: &str) -> String {
    if cfg!(windows) {
        path.to_lowercase()
    } else {
        path.to_owned()
    }
}

fn stable_id(path: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in dedup_key(path).as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("repo-{hash:016x}")
}

fn normalize_theme(theme: &str) -> String {
    if theme == THEME_DARK {
        THEME_DARK.to_owned()
    } else {
        THEME_LIGHT.to_owned()
    }
}

fn normalize_scale(scale: f64) -> f64 {
    if !scale.is_finite() {
        return 1.25;
    }
    let px = (scale * FONT_REFERENCE_PX)
        .round()
        .clamp(FONT_MIN_PX, FONT_MAX_PX);
    px / FONT_REFERENCE_PX
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &PathBuf) -> Option<T> {
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), GitError> {
    let parent = path
        .parent()
        .ok_or_else(|| GitError::io("UI 配置文件缺少父目录。"))?;
    fs::create_dir_all(parent)
        .map_err(|error| GitError::io(format!("无法创建 UI 配置目录：{error}")))?;
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| GitError::io(format!("无法序列化 UI 配置：{error}")))?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, bytes).map_err(|error| GitError::io(format!("无法写入 UI 配置：{error}")))?;
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| GitError::io(format!("无法替换 UI 配置：{error}")))?;
    }
    fs::rename(&temp, path).map_err(|error| GitError::io(format!("无法提交 UI 配置：{error}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_ids_are_deterministic_and_path_specific() {
        assert_eq!(stable_id("C:\\repo-a"), stable_id("C:\\repo-a"));
        assert_ne!(stable_id("C:\\repo-a"), stable_id("C:\\repo-b"));
    }

    #[test]
    fn normalizes_theme_and_font_scale() {
        assert_eq!(normalize_theme("dark"), "dark");
        assert_eq!(normalize_theme("sepia"), "light");
        assert_eq!(normalize_scale(1.18), 1.1875);
        assert_eq!(normalize_scale(9.0), 1.75);
        assert_eq!(normalize_scale(0.1), 1.125);
        assert_eq!(normalize_scale(1.125), 1.125);
        assert_eq!(normalize_scale(1.75), 1.75);
    }

    #[test]
    fn migrates_legacy_standard_scale_to_20px() {
        let temp = tempfile::tempdir().expect("temp");
        let dir = temp.path().join("config");
        std::fs::create_dir_all(&dir).expect("config dir");
        std::fs::write(dir.join(UI_FILE), br#"{"theme":"light","fontScale":1.0}"#)
            .expect("legacy preferences");
        let state = load_at(&dir).expect("load");
        assert_eq!(state.theme, "light");
        assert_eq!(state.font_scale, 1.25);
    }

    #[test]
    fn migrates_18px_standard_to_20px() {
        let temp = tempfile::tempdir().expect("temp");
        let dir = temp.path().join("config");
        std::fs::create_dir_all(&dir).expect("config dir");
        std::fs::write(
            dir.join(UI_FILE),
            br#"{"theme":"light","fontScale":1.125,"version":3}"#,
        )
        .expect("legacy preferences");
        let state = load_at(&dir).expect("load");
        assert_eq!(state.font_scale, 1.25);
    }

    #[test]
    fn migrates_24px_standard_to_20px() {
        let temp = tempfile::tempdir().expect("temp");
        let dir = temp.path().join("config");
        std::fs::create_dir_all(&dir).expect("config dir");
        std::fs::write(
            dir.join(UI_FILE),
            br#"{"theme":"light","fontScale":1.5,"version":4}"#,
        )
        .expect("legacy preferences");
        let state = load_at(&dir).expect("load");
        assert_eq!(state.font_scale, 1.25);
    }

    #[test]
    fn saves_and_loads_ui_state() {
        let temp = tempfile::tempdir().expect("temp");
        let dir = temp.path().join("config");
        save_preferences_at(&dir, "dark", 1.25).expect("preferences");
        let repos = save_repos_at(
            &dir,
            vec![
                RepoEntryInput {
                    path: "C:\\one".to_owned(),
                    name: "one".to_owned(),
                    opened_at: 1,
                },
                RepoEntryInput {
                    path: "C:\\two".to_owned(),
                    name: "two".to_owned(),
                    opened_at: 2,
                },
            ],
        )
        .expect("repos");
        assert_eq!(repos.len(), 2);
        let state = load_at(&dir).expect("load");
        assert_eq!(state.theme, "dark");
        assert_eq!(state.font_scale, 1.25);
        assert_eq!(state.repos[0].path, "C:\\two");
    }
}
