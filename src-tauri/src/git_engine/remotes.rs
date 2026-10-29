use std::path::Path;

use super::command::{run_git_checked, text_output};
use super::error::GitError;
use super::redact;
use super::types::RemoteInfo;

pub(crate) fn list(worktree: &Path) -> Result<Vec<RemoteInfo>, GitError> {
    let stdout = run_git_checked(worktree, ["remote"])?;
    let names: Vec<String> = text_output(&stdout)
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned)
        .collect();
    let mut remotes = Vec::new();

    for name in names {
        let url = run_git_checked(worktree, ["remote", "get-url", &name])?;
        let (url, _) = redact::redact_url_userinfo(&text_output(&url));
        remotes.push(RemoteInfo { name, url });
    }

    remotes.sort_by(|left, right| {
        let left_origin = left.name != "origin";
        let right_origin = right.name != "origin";
        left_origin.cmp(&right_origin)
    });
    Ok(remotes)
}

pub(crate) fn set(worktree: &Path, name: &str, url: &str) -> Result<Vec<RemoteInfo>, GitError> {
    validate_name(name)?;
    let url = validate_url(url)?;
    let existing = list(worktree)?;
    let is_existing = existing.iter().any(|remote| remote.name == name);

    if is_existing {
        run_git_checked(worktree, ["remote", "set-url", name, url.as_str()])?;
    } else {
        run_git_checked(worktree, ["remote", "add", name, url.as_str()])?;
    }

    list(worktree)
}

pub(crate) fn add(worktree: &Path, name: &str, url: &str) -> Result<Vec<RemoteInfo>, GitError> {
    validate_name(name)?;
    let url = validate_url(url)?;
    let existing = list(worktree)?;
    if existing.iter().any(|remote| remote.name == name) {
        return Err(GitError::invalid_input(format!("远程仓库“{name}”已存在。")));
    }

    run_git_checked(worktree, ["remote", "add", name, url.as_str()])?;
    list(worktree)
}

pub(crate) fn set_url(worktree: &Path, name: &str, url: &str) -> Result<Vec<RemoteInfo>, GitError> {
    validate_name(name)?;
    let url = validate_url(url)?;
    let existing = list(worktree)?;
    if !existing.iter().any(|remote| remote.name == name) {
        return Err(GitError::invalid_input(format!("远程仓库“{name}”不存在。")));
    }

    run_git_checked(worktree, ["remote", "set-url", name, url.as_str()])?;
    list(worktree)
}

fn validate_name(name: &str) -> Result<(), GitError> {
    let name = name.trim();
    if name.is_empty()
        || name.starts_with('-')
        || !name.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
    {
        return Err(GitError::invalid_input(
            "远程名只能包含字母、数字、点、下划线或连字符。",
        ));
    }
    Ok(())
}

fn validate_url(url: &str) -> Result<String, GitError> {
    let url = url.trim();
    if url.is_empty() {
        return Err(GitError::invalid_input("远程 URL 不能为空。"));
    }
    if url.starts_with('-') || url.chars().any(char::is_whitespace) {
        return Err(GitError::invalid_input("远程 URL 格式无效。"));
    }
    if has_embedded_http_credentials(url) {
        return Err(GitError::invalid_input(
            "远程 URL 不能包含内嵌凭据。请使用系统 Git 凭据管理器。",
        ));
    }
    Ok(url.to_owned())
}

fn has_embedded_http_credentials(url: &str) -> bool {
    let rest = match url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
    {
        Some(rest) => rest,
        None => return false,
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or(rest);
    authority.contains('@')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_remote_name_and_url() {
        assert!(validate_name("upstream").is_ok());
        assert!(validate_name("--bad").is_err());
        assert!(validate_url("https://example.com/repo.git").is_ok());
        assert!(validate_url("https://token@example.com/repo.git").is_err());
    }

    #[test]
    fn lists_empty_remotes() {
        let temp = tempfile::tempdir().expect("temp dir");
        let repo = temp.path().join("repo");
        std::fs::create_dir(&repo).expect("repo dir");
        let output = std::process::Command::new("git")
            .current_dir(&repo)
            .args(["init", "-q"])
            .output()
            .expect("git");
        assert!(output.status.success());
        assert!(list(&repo).expect("remotes").is_empty());
    }

    #[test]
    fn adds_and_updates_remote_url_with_existence_checks() {
        let temp = tempfile::tempdir().expect("temp dir");
        let repo = temp.path().join("repo");
        std::fs::create_dir(&repo).expect("repo dir");
        let output = std::process::Command::new("git")
            .current_dir(&repo)
            .args(["init", "-q"])
            .output()
            .expect("git");
        assert!(output.status.success());

        let remotes = add(&repo, "origin", "https://example.com/a.git").expect("add");
        assert_eq!(remotes[0].url, "https://example.com/a.git");
        assert!(add(&repo, "origin", "https://example.com/b.git").is_err());
        assert!(set_url(&repo, "missing", "https://example.com/b.git").is_err());
        let remotes = set_url(&repo, "origin", "https://example.com/b.git").expect("set url");
        assert_eq!(remotes[0].url, "https://example.com/b.git");
    }

    #[test]
    fn redacts_existing_credentials_from_remote_list() {
        let temp = tempfile::tempdir().expect("temp dir");
        let repo = temp.path().join("repo");
        std::fs::create_dir(&repo).expect("repo dir");
        let output = std::process::Command::new("git")
            .current_dir(&repo)
            .args(["init", "-q"])
            .output()
            .expect("git");
        assert!(output.status.success());
        let output = std::process::Command::new("git")
            .current_dir(&repo)
            .args([
                "remote",
                "add",
                "origin",
                "https://token:secret@example.com/repo.git",
            ])
            .output()
            .expect("git");
        assert!(output.status.success());

        let remotes = list(&repo).expect("remotes");
        assert_eq!(remotes[0].url, "https://example.com/repo.git");
    }

    #[test]
    fn sets_and_updates_remote_url() {
        let temp = tempfile::tempdir().expect("temp dir");
        let repo = temp.path().join("repo");
        std::fs::create_dir(&repo).expect("repo dir");
        let output = std::process::Command::new("git")
            .current_dir(&repo)
            .args(["init", "-q"])
            .output()
            .expect("git");
        assert!(output.status.success());

        let remotes = set(&repo, "origin", "https://example.com/a.git").expect("add remote");
        assert_eq!(remotes[0].url, "https://example.com/a.git");
        let remotes = set(&repo, "origin", "https://example.com/b.git").expect("update remote");
        assert_eq!(remotes[0].url, "https://example.com/b.git");
    }
}
