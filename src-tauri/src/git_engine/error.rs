use std::fmt;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitErrorKind {
    GitNotFound,
    NotRepository,
    InvalidPath,
    InvalidInput,
    IdentityMissing,
    WorktreeDirty,
    CommandFailed,
    Timeout,
    InvalidOutput,
    Io,
}

/// A typed, UI-safe failure. Raw process output never crosses the IPC boundary.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitError {
    pub kind: GitErrorKind,
    pub message: String,
}

impl GitError {
    pub fn new(kind: GitErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub fn git_not_found() -> Self {
        Self::new(
            GitErrorKind::GitNotFound,
            "未找到 Git。请安装 Git，并确认 git 命令位于 PATH 中。",
        )
    }

    pub fn not_repository(path: &str) -> Self {
        Self::new(
            GitErrorKind::NotRepository,
            format!("“{path}”不是 Git 仓库：未找到 .git，或其工作区无法读取。"),
        )
    }

    pub fn invalid_path(message: impl Into<String>) -> Self {
        Self::new(GitErrorKind::InvalidPath, message)
    }

    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new(GitErrorKind::InvalidInput, message)
    }

    pub fn worktree_dirty(message: impl Into<String>) -> Self {
        Self::new(GitErrorKind::WorktreeDirty, message)
    }

    pub fn identity_missing(message: impl Into<String>) -> Self {
        Self::new(GitErrorKind::IdentityMissing, message)
    }

    pub fn command_failed(message: impl Into<String>) -> Self {
        Self::new(GitErrorKind::CommandFailed, message)
    }

    pub fn timeout(message: impl Into<String>) -> Self {
        Self::new(GitErrorKind::Timeout, message)
    }

    pub fn invalid_output(message: impl Into<String>) -> Self {
        Self::new(GitErrorKind::InvalidOutput, message)
    }

    pub fn io(message: impl Into<String>) -> Self {
        Self::new(GitErrorKind::Io, message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(GitErrorKind::Io, message)
    }
}

impl fmt::Display for GitError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for GitError {}
