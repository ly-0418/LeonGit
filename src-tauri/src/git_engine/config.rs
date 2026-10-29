use std::path::Path;

use super::command::{run_git, run_git_checked, text_output};
use super::error::GitError;
use super::redact;
use super::types::{ConfigSource, ConfigValue, RepositoryConfig};

pub(crate) fn read(worktree: &Path) -> Result<RepositoryConfig, GitError> {
    let user_name = read_value(worktree, "user.name")?;
    let user_email = read_value(worktree, "user.email")?;
    let origin = read_origin_url(worktree)?;
    let (origin_url, origin_url_redacted) = origin
        .map(redact_origin_url)
        .map(|(url, redacted)| (Some(url), redacted))
        .unwrap_or((None, false));

    Ok(RepositoryConfig {
        user_name,
        user_email,
        origin_url,
        origin_url_redacted,
    })
}

pub(crate) fn write_identity(
    worktree: &Path,
    name: &str,
    email: &str,
) -> Result<RepositoryConfig, GitError> {
    let name = validate_identity_value("用户名", name)?;
    let email = validate_identity_value("邮箱", email)?;

    run_git_checked(
        worktree,
        [
            "config",
            "--local",
            "--replace-all",
            "user.name",
            name.as_str(),
        ],
    )?;
    run_git_checked(
        worktree,
        [
            "config",
            "--local",
            "--replace-all",
            "user.email",
            email.as_str(),
        ],
    )?;

    read(worktree)
}

fn read_value(worktree: &Path, key: &str) -> Result<Option<ConfigValue>, GitError> {
    let local = run_git(worktree, ["config", "--local", "--get", key])?;
    if local.status.success() {
        return Ok(Some(ConfigValue {
            value: text_output(&local.stdout),
            source: ConfigSource::Local,
        }));
    }
    if local.status.code() != Some(1) {
        return Err(GitError::command_failed(format!(
            "读取仓库配置 {key} 失败。"
        )));
    }

    let inherited = run_git(worktree, ["config", "--get", key])?;
    if inherited.status.success() {
        return Ok(Some(ConfigValue {
            value: text_output(&inherited.stdout),
            source: ConfigSource::Inherited,
        }));
    }
    if inherited.status.code() != Some(1) {
        return Err(GitError::command_failed(format!(
            "读取 Git 配置 {key} 失败。"
        )));
    }

    Ok(None)
}

fn read_origin_url(worktree: &Path) -> Result<Option<String>, GitError> {
    let output = run_git(
        worktree,
        ["config", "--local", "--get", "remote.origin.url"],
    )?;
    if output.status.success() {
        let url = text_output(&output.stdout);
        return Ok(if url.is_empty() { None } else { Some(url) });
    }
    if output.status.code() == Some(1) {
        return Ok(None);
    }

    Err(GitError::command_failed("读取 origin URL 失败。"))
}

fn validate_identity_value(label: &str, value: &str) -> Result<String, GitError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(GitError::invalid_input(format!("{label}不能为空。")));
    }
    if value
        .chars()
        .any(|character| character == '\0' || character == '\n' || character == '\r')
    {
        return Err(GitError::invalid_input(format!(
            "{label}不能包含换行或控制字符。"
        )));
    }

    Ok(value.to_owned())
}

/// HTTPS remotes may contain a token in the userinfo segment. Never forward it to the UI.
fn redact_origin_url(url: String) -> (String, bool) {
    redact::redact_url_userinfo(&url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_http_userinfo() {
        let (url, redacted) =
            redact_origin_url("https://token:secret@github.com/team/repo.git".to_owned());
        assert_eq!(url, "https://github.com/team/repo.git");
        assert!(redacted);
    }

    #[test]
    fn keeps_ssh_origin_untouched() {
        let (url, redacted) = redact_origin_url("git@github.com:team/repo.git".to_owned());
        assert_eq!(url, "git@github.com:team/repo.git");
        assert!(!redacted);
    }

    #[test]
    fn rejects_empty_identity() {
        assert!(validate_identity_value("用户名", "   ").is_err());
        assert!(validate_identity_value("用户名", "Leon\nChen").is_err());
        assert_eq!(
            validate_identity_value("用户名", "Leon Chen").expect("valid identity"),
            "Leon Chen"
        );
    }
}
