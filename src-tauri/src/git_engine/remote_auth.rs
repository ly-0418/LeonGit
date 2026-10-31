use std::path::Path;
use std::process::Output;

use super::command::{output_failure, run_git, text_output};
use super::error::GitError;
use super::types::{FetchOutcome, RemoteAuthInfo};

/// Classifies a failed remote command after its exit code has already been
/// checked. The raw stderr remains the user-facing detail; this enum only
/// selects the appropriate credential guidance in the UI.
pub(crate) fn failure(worktree: &Path, output: &Output, remote: Option<&str>) -> GitError {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let helper = credential_helper(worktree).ok().flatten();
    let url = remote.and_then(|name| remote_url(worktree, name).ok().flatten());
    let outcome = classify(&stderr, url.as_deref(), helper.as_deref());
    remote_error(output, outcome, &stderr)
}

/// Clone has no repository yet; pass the URL being cloned directly.
pub(crate) fn failure_with_url(cwd: &Path, output: &Output, url: &str) -> GitError {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let helper = credential_helper(cwd).ok().flatten();
    let outcome = classify(&stderr, Some(url), helper.as_deref());
    remote_error(output, outcome, &stderr)
}

fn remote_error(output: &Output, outcome: FetchOutcome, stderr: &str) -> GitError {
    let mut error = output_failure(output);
    if matches!(
        outcome,
        FetchOutcome::AuthFailed
            | FetchOutcome::CredentialHelperMissing
            | FetchOutcome::SshKeyNotLoaded
            | FetchOutcome::HostKeyUnknown
    ) {
        let detail = stderr.trim();
        if !detail.is_empty() {
            let detail = super::redact::redact_text(detail);
            error.message = detail.chars().take(900).collect();
        }
    }
    error.with_fetch_outcome(outcome)
}

pub(crate) fn info(worktree: &Path) -> Result<RemoteAuthInfo, GitError> {
    let config = super::config::read(worktree)?;
    let credential_helper = credential_helper(worktree)?;
    let remote_url = config.origin_url.clone();
    let url_kind = remote_url
        .as_deref()
        .map(url_kind)
        .unwrap_or("other")
        .to_owned();

    Ok(RemoteAuthInfo {
        credential_helper,
        remote_url,
        remote_url_redacted: config.origin_url_redacted,
        url_kind,
    })
}

fn credential_helper(worktree: &Path) -> Result<Option<String>, GitError> {
    let output = run_git(worktree, ["config", "--get", "credential.helper"])?;
    if !output.status.success() {
        return Ok(None);
    }
    let value = text_output(&output.stdout);
    Ok((!value.is_empty()).then_some(value))
}

fn remote_url(worktree: &Path, remote: &str) -> Result<Option<String>, GitError> {
    let key = format!("remote.{remote}.url");
    let output = run_git(worktree, ["config", "--get", key.as_str()])?;
    if !output.status.success() {
        return Ok(None);
    }
    let value = text_output(&output.stdout);
    Ok((!value.is_empty()).then_some(super::redact::redact_url_userinfo(&value).0))
}

fn classify(stderr: &str, url: Option<&str>, helper: Option<&str>) -> FetchOutcome {
    let lower = stderr.to_ascii_lowercase();

    let host_key_markers = [
        "host key verification failed",
        "remote host identification has changed",
        "no rsa host key is known",
        "no ed25519 host key is known",
        "no ecdsa host key is known",
        "offending key in",
    ];
    if host_key_markers.iter().any(|marker| lower.contains(marker)) {
        return FetchOutcome::HostKeyUnknown;
    }

    let ssh_key_markers = [
        "permission denied (publickey)",
        "could not open a connection to your authentication agent",
        "error connecting to agent",
        "communication with agent failed",
        "no such identity",
        "load key",
        "agent admitted failure",
    ];
    if ssh_key_markers.iter().any(|marker| lower.contains(marker)) {
        return FetchOutcome::SshKeyNotLoaded;
    }

    let auth_markers = [
        "authentication failed",
        "invalid username or password",
        "could not read username",
        "could not read password",
        "terminal prompts disabled",
        "support for password authentication",
        "permission denied",
        "access denied",
        "remote: http basic: access denied",
        "401",
        "403",
    ];
    let auth_failure = auth_markers.iter().any(|marker| lower.contains(marker));
    let https_context = url
        .map(url_kind)
        .map(|kind| kind == "https" || kind == "http")
        .unwrap_or_else(|| lower.contains("https://") || lower.contains("http://"));

    if auth_failure && https_context && helper.map(str::trim).unwrap_or("").is_empty() {
        return FetchOutcome::CredentialHelperMissing;
    }
    if auth_failure {
        return FetchOutcome::AuthFailed;
    }

    let network_markers = [
        "could not resolve host",
        "unable to access",
        "connection refused",
        "connection reset",
        "timed out",
        "operation too slow",
        "network is unreachable",
        "failed to connect",
        "could not read from remote repository",
        "ssl",
        "proxy",
    ];
    if network_markers.iter().any(|marker| lower.contains(marker)) {
        return FetchOutcome::NetworkError;
    }

    FetchOutcome::Other
}

fn url_kind(url: &str) -> &'static str {
    let lower = url.to_ascii_lowercase();
    if lower.starts_with("https://") {
        "https"
    } else if lower.starts_with("http://") {
        "http"
    } else if lower.starts_with("ssh://")
        || (lower.contains('@') && lower.contains(':') && !lower.contains("://"))
    {
        "ssh"
    } else {
        "other"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_https_auth_failure_without_helper() {
        assert_eq!(
            classify(
                "fatal: Authentication failed for 'https://example.com/repo.git'",
                Some("https://example.com/repo.git"),
                None
            ),
            FetchOutcome::CredentialHelperMissing
        );
        assert_eq!(
            classify(
                "fatal: Authentication failed for 'https://example.com/repo.git'",
                Some("https://example.com/repo.git"),
                Some("manager")
            ),
            FetchOutcome::AuthFailed
        );
    }

    #[test]
    fn classifies_ssh_failures() {
        assert_eq!(
            classify(
                "git@github.com: Permission denied (publickey).",
                Some("git@github.com:owner/repo.git"),
                None
            ),
            FetchOutcome::SshKeyNotLoaded
        );
        assert_eq!(
            classify(
                "Host key verification failed.",
                Some("git@github.com:owner/repo.git"),
                None
            ),
            FetchOutcome::HostKeyUnknown
        );
    }

    #[test]
    fn classifies_network_failure() {
        assert_eq!(
            classify(
                "fatal: unable to access 'https://github.com/': Failed to connect",
                Some("https://github.com/owner/repo.git"),
                Some("manager")
            ),
            FetchOutcome::NetworkError
        );
    }

    #[test]
    fn detects_url_kind() {
        assert_eq!(url_kind("https://example.com/repo.git"), "https");
        assert_eq!(url_kind("git@github.com:owner/repo.git"), "ssh");
        assert_eq!(url_kind("ssh://git@example.com/repo.git"), "ssh");
    }
}
