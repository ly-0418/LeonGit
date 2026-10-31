use std::fs;
use std::path::{Path, PathBuf};

use super::command::{run_git, run_git_checked, text_output};
use super::error::GitError;
use super::repo_state::{self, RepoState};
use super::status;
use super::types::{HeadState, RepositorySnapshot};

pub(crate) fn snapshot(path: &str) -> Result<RepositorySnapshot, GitError> {
    let root = resolve_worktree(path)?;
    snapshot_at_root(&root)
}

/// Initializes a repository in an existing directory. This path is
/// intentionally not resolved through `safe_repo_path`, because the
/// directory is not a repository yet.
pub(crate) fn init(path: &str, initial_branch: Option<&str>) -> Result<(), GitError> {
    if path.is_empty() {
        return Err(GitError::invalid_path("请选择要初始化的目录。"));
    }
    let candidate = PathBuf::from(path);
    let metadata = fs::metadata(&candidate)
        .map_err(|error| GitError::invalid_path(format!("无法读取所选目录：{error}")))?;
    if !metadata.is_dir() {
        return Err(GitError::invalid_path("所选路径不是文件夹。"));
    }
    let target = dunce::canonicalize(&candidate)
        .map_err(|error| GitError::invalid_path(format!("无法解析所选目录：{error}")))?;
    if target.join(".git").exists() {
        return Err(GitError::invalid_input(
            "该目录已经是 Git 仓库，不能重复初始化。",
        ));
    }

    let branch = initial_branch
        .map(str::trim)
        .filter(|branch| !branch.is_empty());
    if let Some(branch) = branch {
        if branch.starts_with('-')
            || branch
                .chars()
                .any(|character| character.is_whitespace() || character.is_control())
        {
            return Err(GitError::invalid_input("初始分支名无效。"));
        }
        let valid = run_git(&target, ["check-ref-format", "--branch", branch])?;
        if !valid.status.success() {
            return Err(GitError::invalid_input(format!(
                "初始分支名“{branch}”不符合 Git 命名规则。"
            )));
        }
    }

    let mut args = vec!["init"];
    if let Some(branch) = branch {
        args.push("--initial-branch");
        args.push(branch);
    }
    run_git_checked(&target, args)?;
    Ok(())
}

pub(crate) fn snapshot_at_root(root: &Path) -> Result<RepositorySnapshot, GitError> {
    let status = status::read(root)?;

    let short_oid = match &status.head.oid {
        Some(_) => {
            let stdout = run_git_checked(root, ["rev-parse", "--short=8", "HEAD"])?;
            let short = text_output(&stdout);
            if short.is_empty() {
                return Err(GitError::invalid_output(
                    "git rev-parse 没有返回 HEAD 短哈希。",
                ));
            }
            Some(short)
        }
        None => None,
    };

    let commit_count = if status.head.oid.is_some() {
        count_commits(root)?
    } else {
        0
    };

    let name = root
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| root.display().to_string());

    let repo_state = repo_state::detect(root)?;
    let detached_unsaved = if repo_state == RepoState::DetachedHead {
        detached_is_unsaved(root)?
    } else {
        false
    };

    let mut squash_source = repo_state::read_squash_source(root)?;
    if squash_source.is_some() {
        // The squash result is committed or was discarded from outside the
        // client; drop the marker so the banner cannot outlive the conflict.
        if status.summary.conflicted == 0 && status.files.staged.is_empty() {
            repo_state::clear_squash_source(root)?;
            squash_source = None;
        }
    }

    Ok(RepositorySnapshot {
        path: root.display().to_string(),
        name,
        head: HeadState {
            short_oid,
            ..status.head
        },
        files: status.files,
        working_tree: status.summary,
        commit_count,
        repo_state,
        detached_unsaved,
        revert_in_progress: repo_state == RepoState::Reverting,
        squash_source,
    })
}

fn detached_is_unsaved(root: &Path) -> Result<bool, GitError> {
    let output = run_git(
        root,
        [
            "for-each-ref",
            "--contains",
            "HEAD",
            "--format=%(refname:short)",
            "refs/heads",
        ],
    )?;
    if !output.status.success() {
        return Err(super::command::output_failure(&output));
    }
    Ok(text_output(&output.stdout).trim().is_empty())
}

/// Resolves a user-selected folder to the canonical repository worktree root.
pub(crate) fn resolve_worktree(path: &str) -> Result<PathBuf, GitError> {
    if path.is_empty() {
        return Err(GitError::invalid_path("请选择一个仓库目录。"));
    }

    let candidate = PathBuf::from(path);
    let metadata = fs::metadata(&candidate)
        .map_err(|error| GitError::invalid_path(format!("无法读取所选目录：{error}")))?;
    if !metadata.is_dir() {
        return Err(GitError::invalid_path("所选路径不是文件夹。"));
    }

    let candidate = dunce::canonicalize(&candidate)
        .map_err(|error| GitError::invalid_path(format!("无法解析所选目录：{error}")))?;

    let output = run_git(&candidate, ["rev-parse", "--show-toplevel"])?;
    if !output.status.success() {
        return Err(GitError::not_repository(path));
    }

    let toplevel = text_output(&output.stdout);
    if toplevel.is_empty() {
        return Err(GitError::not_repository(path));
    }

    let root = PathBuf::from(toplevel);
    let root = dunce::canonicalize(&root)
        .map_err(|error| GitError::invalid_path(format!("无法解析仓库根目录：{error}")))?;
    if !root.is_dir() || !root.join(".git").exists() {
        return Err(GitError::not_repository(path));
    }

    Ok(root)
}

fn count_commits(worktree: &std::path::Path) -> Result<u64, GitError> {
    let stdout = run_git_checked(worktree, ["rev-list", "--count", "HEAD"])?;
    text_output(&stdout)
        .parse::<u64>()
        .map_err(|_| GitError::invalid_output("git rev-list 没有返回有效的提交数量。"))
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

    fn commit(repo: &Path, message: &str) {
        git(
            repo,
            &[
                "-c",
                "user.name=Leon Tester",
                "-c",
                "user.email=leon@example.com",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-q",
                "-m",
                message,
            ],
        );
    }

    fn init_repo() -> (tempfile::TempDir, PathBuf) {
        let temp = tempfile::tempdir().expect("temp dir");
        let repo = temp.path().join("repo with space");
        fs::create_dir(&repo).expect("repo dir");
        git(&repo, &["init", "-q", "-b", "main"]);
        (temp, repo)
    }

    #[test]
    fn initializes_directory_and_rejects_existing_git() {
        let temp = tempfile::tempdir().expect("temp dir");
        let repo = temp.path().join("brand new repo");
        fs::create_dir(&repo).expect("repo dir");

        init(repo.to_str().expect("utf-8 path"), Some("trunk")).expect("init");
        assert!(repo.join(".git").is_dir());
        let branch = Command::new("git")
            .current_dir(&repo)
            .args(["symbolic-ref", "--short", "HEAD"])
            .output()
            .expect("git");
        assert_eq!(String::from_utf8_lossy(&branch.stdout).trim(), "trunk");

        let error =
            init(repo.to_str().expect("utf-8 path"), None).expect_err("already initialized");
        assert_eq!(error.kind, super::super::error::GitErrorKind::InvalidInput);
    }

    #[test]
    fn opens_repository_and_pages_commits() {
        let (_temp, repo) = init_repo();

        for (index, subject) in ["Initial commit", "Add history", "Polish UI"]
            .iter()
            .enumerate()
        {
            fs::write(repo.join("notes.txt"), format!("revision {index}"))
                .expect("write fixture file");
            git(&repo, &["add", "notes.txt"]);
            commit(&repo, subject);
        }

        let snapshot = snapshot(repo.to_str().expect("utf-8 path")).expect("snapshot");
        assert_eq!(snapshot.name, "repo with space");
        assert_eq!(snapshot.commit_count, 3);
        assert_eq!(snapshot.head.branch.as_deref(), Some("main"));
        assert!(!snapshot.head.detached);
        assert!(snapshot.head.short_oid.is_some());
        assert!(snapshot.working_tree.is_clean);

        let first = super::super::log::list(&repo, 0, 2).expect("first page");
        assert_eq!(first.commits.len(), 2);
        assert!(first.has_more);
        assert_eq!(first.commits[0].subject, "Polish UI");
        assert_eq!(first.commits[1].subject, "Add history");
        assert!(first.commits[0].is_head);
        assert!(first.commits[0].refs.iter().any(|item| item.name == "main"));

        let second = super::super::log::list(&repo, 2, 2).expect("second page");
        assert_eq!(second.commits.len(), 1);
        assert!(!second.has_more);
        assert_eq!(second.commits[0].subject, "Initial commit");
    }

    #[test]
    fn handles_unborn_repository() {
        let (_temp, repo) = init_repo();

        let snapshot = snapshot(repo.to_str().expect("utf-8 path")).expect("snapshot");
        assert_eq!(snapshot.commit_count, 0);
        assert_eq!(snapshot.head.oid, None);
        assert_eq!(snapshot.head.branch.as_deref(), Some("main"));
        assert!(snapshot.working_tree.is_clean);

        let page = super::super::log::list(&repo, 0, 100).expect("empty page");
        assert!(page.commits.is_empty());
        assert!(!page.has_more);
    }

    #[test]
    fn rejects_plain_folder() {
        let temp = tempfile::tempdir().expect("temp dir");
        let error = snapshot(temp.path().to_str().expect("utf-8 path")).expect_err("not a repo");
        assert_eq!(error.kind, super::super::error::GitErrorKind::NotRepository);
    }
}
