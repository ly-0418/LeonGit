use std::ffi::OsString;
use std::fs;
use std::path::PathBuf;

use super::command::run_git_remote;
use super::error::GitError;
use super::remote_auth;
use super::repository;
use super::types::RepositorySnapshot;

pub(crate) fn clone_repository(url: &str, target: &str) -> Result<RepositorySnapshot, GitError> {
    let url = validate_url(url)?;
    let target = resolve_target(target)?;
    let parent = target
        .parent()
        .ok_or_else(|| GitError::invalid_path("克隆目标缺少父目录。"))?;

    let args: Vec<OsString> = vec![
        "clone".into(),
        "--progress".into(),
        "--".into(),
        url.as_str().into(),
        target.as_os_str().to_owned(),
    ];
    let output = run_git_remote(parent, args)?;
    if !output.status.success() {
        return Err(remote_auth::failure_with_url(parent, &output, &url));
    }

    let target = target.to_str().ok_or_else(|| {
        GitError::invalid_path("克隆目标路径包含当前系统无法表示的字符，无法打开。")
    })?;
    repository::snapshot(target)
}

fn validate_url(raw_url: &str) -> Result<String, GitError> {
    let url = raw_url.trim();
    if url.is_empty() {
        return Err(GitError::invalid_input("请输入远程仓库 URL。"));
    }
    if url.starts_with('-') {
        return Err(GitError::invalid_input("远程仓库 URL 不能以 - 开头。"));
    }
    if url.chars().any(char::is_whitespace) {
        return Err(GitError::invalid_input("远程仓库 URL 不能包含空白字符。"));
    }
    if has_embedded_http_credentials(url) {
        return Err(GitError::invalid_input(
            "远程 URL 不能包含内嵌凭据。请使用系统 Git 凭据管理器完成认证。",
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

fn resolve_target(raw_target: &str) -> Result<PathBuf, GitError> {
    if raw_target.is_empty() {
        return Err(GitError::invalid_input("请选择克隆目标目录。"));
    }

    let target = PathBuf::from(raw_target);
    if !target.is_absolute() {
        return Err(GitError::invalid_input("克隆目标必须是绝对路径。"));
    }
    let name = target
        .file_name()
        .filter(|name| !name.is_empty())
        .ok_or_else(|| GitError::invalid_input("克隆目标必须是文件夹路径。"))?;
    let parent = target
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| GitError::invalid_input("克隆目标缺少父目录。"))?;

    let parent = dunce::canonicalize(parent)
        .map_err(|error| GitError::invalid_path(format!("克隆目标的父目录不存在：{error}")))?;
    if !parent.is_dir() {
        return Err(GitError::invalid_path("克隆目标的父目录不是文件夹。"));
    }

    let target = parent.join(name);
    if target.exists() {
        let metadata = fs::metadata(&target)
            .map_err(|error| GitError::invalid_path(format!("无法读取克隆目标：{error}")))?;
        if !metadata.is_dir() {
            return Err(GitError::invalid_path("克隆目标已存在且不是文件夹。"));
        }
        let mut entries = fs::read_dir(&target)
            .map_err(|error| GitError::invalid_path(format!("无法读取克隆目标：{error}")))?;
        if entries.next().is_some() {
            return Err(GitError::invalid_input("克隆目标目录必须为空。"));
        }
    }

    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::process::Command;

    fn git(repo: &Path, args: &[&str]) {
        let output = Command::new("git")
            .current_dir(repo)
            .args(args)
            .env("GIT_TERMINAL_PROMPT", "0")
            .output()
            .expect("git should be available for integration tests");
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn source_repo(temp: &Path) -> PathBuf {
        let source = temp.join("source-repo");
        fs::create_dir(&source).expect("source repo");
        git(&source, &["init", "-q", "-b", "main"]);
        fs::write(source.join("README.md"), "hello\n").expect("fixture file");
        git(&source, &["add", "README.md"]);
        git(
            &source,
            &[
                "-c",
                "user.name=Clone Tester",
                "-c",
                "user.email=clone@example.com",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-q",
                "-m",
                "initial commit",
            ],
        );
        source
    }

    #[test]
    fn clones_local_repository_and_opens_it() {
        let temp = tempfile::tempdir().expect("temp directory");
        let source = source_repo(temp.path());
        let target = temp.path().join("cloned repo");

        let snapshot = clone_repository(
            source.to_str().expect("utf-8 source path"),
            target.to_str().expect("utf-8 target path"),
        )
        .expect("clone should succeed");

        assert_eq!(snapshot.name, "cloned repo");
        assert!(target.join(".git").exists());
        assert_eq!(snapshot.commit_count, 1);
        assert!(snapshot.working_tree.is_clean);
    }

    #[test]
    fn rejects_embedded_http_credentials() {
        let error = validate_url("https://token:secret@github.com/team/repo.git")
            .expect_err("credentials should be rejected");
        assert_eq!(error.kind, super::super::error::GitErrorKind::InvalidInput);
    }

    #[test]
    fn rejects_non_empty_target() {
        let temp = tempfile::tempdir().expect("temp directory");
        let target = temp.path().join("occupied");
        fs::create_dir(&target).expect("target directory");
        fs::write(target.join("file.txt"), "occupied").expect("file");
        let error = resolve_target(target.to_str().expect("utf-8 path"))
            .expect_err("non-empty target should be rejected");
        assert_eq!(error.kind, super::super::error::GitErrorKind::InvalidInput);
    }
}
