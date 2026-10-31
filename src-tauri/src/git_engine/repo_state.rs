use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::error::GitError;

/// The repository operation that currently owns the worktree/index.
///
/// Detection is intentionally based on Git's marker files instead of parsing
/// localized `git status` text. The order follows Git's own precedence:
/// rebase > merge > cherry-pick > revert > bisect > detached HEAD.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RepoState {
    Normal,
    Merging,
    Rebasing,
    CherryPicking,
    Reverting,
    Bisecting,
    DetachedHead,
    AmInProgress,
}

impl RepoState {
    pub fn label(self) -> &'static str {
        match self {
            RepoState::Normal => "正常",
            RepoState::Merging => "merge 进行中",
            RepoState::Rebasing => "rebase 进行中",
            RepoState::CherryPicking => "cherry-pick 进行中",
            RepoState::Reverting => "revert 进行中",
            RepoState::Bisecting => "bisect 进行中",
            RepoState::DetachedHead => "游离 HEAD",
            RepoState::AmInProgress => "rebase apply 进行中",
        }
    }

    pub fn is_in_progress(self) -> bool {
        !matches!(self, RepoState::Normal | RepoState::DetachedHead)
    }

    pub fn guidance(self) -> &'static str {
        match self {
            RepoState::Normal => "",
            RepoState::Merging => "请先提交合并结果，或执行“中止 merge”。",
            RepoState::Rebasing => {
                "请在命令行执行 `git rebase --continue` 或 `git rebase --abort`。"
            }
            RepoState::CherryPicking => {
                "请在命令行执行 `git cherry-pick --continue` 或 `git cherry-pick --abort`。"
            }
            RepoState::Reverting => "请先完成或中止当前 revert。",
            RepoState::Bisecting => "请在命令行执行 `git bisect reset` 结束 bisect。",
            RepoState::DetachedHead => "请先切换到分支，或创建新分支保存提交。",
            RepoState::AmInProgress => "请先在命令行完成或中止当前的 am/rebase apply 操作。",
        }
    }
}

/// Rejects an operation while another multi-step Git operation owns the
/// worktree. Normal and detached HEAD are allowed; detached commits are
/// handled with a separate UI warning.
pub(crate) fn ensure_operation_allowed(
    worktree: &Path,
    action: &str,
) -> Result<RepoState, GitError> {
    let state = detect(worktree)?;
    if state.is_in_progress() {
        return Err(GitError::invalid_input(format!(
            "{action}已阻止：当前处于 {}。{}",
            state.label(),
            state.guidance()
        )));
    }
    Ok(state)
}

/// Rebasing, cherry-pick, revert and bisect must be concluded with their own
/// Git commands; a plain commit would leave a half-finished operation behind.
/// A merge commit is allowed because it is Git's normal way to conclude a
/// merge after conflicts are resolved.
pub(crate) fn ensure_commit_allowed(worktree: &Path) -> Result<RepoState, GitError> {
    let state = detect(worktree)?;
    match state {
        RepoState::Rebasing
        | RepoState::AmInProgress
        | RepoState::CherryPicking
        | RepoState::Reverting
        | RepoState::Bisecting => Err(GitError::invalid_input(format!(
            "当前处于 {}，不能创建普通提交。{}",
            state.label(),
            state.guidance()
        ))),
        _ => Ok(state),
    }
}

pub(crate) fn detect(worktree: &Path) -> Result<RepoState, GitError> {
    let git_dir = resolve_git_dir(worktree)?;

    let rebase_merge = git_dir.join("rebase-merge");
    let rebase_apply = git_dir.join("rebase-apply");
    if rebase_merge.exists() || rebase_apply.exists() {
        // `git am` and a few rebase variants mark rebase-apply/applying.
        if rebase_apply.join("applying").exists() {
            return Ok(RepoState::AmInProgress);
        }
        return Ok(RepoState::Rebasing);
    }
    if git_dir.join("MERGE_HEAD").exists() {
        return Ok(RepoState::Merging);
    }
    if git_dir.join("CHERRY_PICK_HEAD").exists() {
        return Ok(RepoState::CherryPicking);
    }
    if git_dir.join("REVERT_HEAD").exists() {
        return Ok(RepoState::Reverting);
    }
    if git_dir.join("BISECT_LOG").exists() {
        return Ok(RepoState::Bisecting);
    }

    let head = fs::read_to_string(git_dir.join("HEAD"))
        .map_err(|error| GitError::io(format!("无法读取 HEAD：{error}")))?;
    if head.trim_start().starts_with("ref: refs/heads/") {
        Ok(RepoState::Normal)
    } else {
        Ok(RepoState::DetachedHead)
    }
}

/// Name of the marker file LeonGit writes after `git merge --squash` produced
/// conflicts. Git itself keeps no trace of a squash merge (no `MERGE_HEAD`,
/// no `SQUASH_MSG`), so the source branch has to be remembered by the client.
const SQUASH_MARKER: &str = "leongit-squash";

/// Source branch of the squash merge that currently owns the conflicted index.
pub(crate) fn read_squash_source(worktree: &Path) -> Result<Option<String>, GitError> {
    let git_dir = resolve_git_dir(worktree)?;
    match fs::read_to_string(git_dir.join(SQUASH_MARKER)) {
        Ok(value) => {
            let value = value.trim();
            Ok((!value.is_empty()).then(|| value.to_owned()))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(GitError::io(format!("无法读取 Squash 标记：{error}"))),
    }
}

pub(crate) fn write_squash_source(worktree: &Path, source: &str) -> Result<(), GitError> {
    let git_dir = resolve_git_dir(worktree)?;
    fs::write(git_dir.join(SQUASH_MARKER), format!("{source}\n"))
        .map_err(|error| GitError::io(format!("无法写入 Squash 标记：{error}")))
}

pub(crate) fn clear_squash_source(worktree: &Path) -> Result<(), GitError> {
    let git_dir = resolve_git_dir(worktree)?;
    match fs::remove_file(git_dir.join(SQUASH_MARKER)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(GitError::io(format!("无法删除 Squash 标记：{error}"))),
    }
}

fn resolve_git_dir(worktree: &Path) -> Result<PathBuf, GitError> {
    let dot_git = worktree.join(".git");
    if dot_git.is_dir() {
        return Ok(dot_git);
    }

    if dot_git.is_file() {
        let content = fs::read_to_string(&dot_git)
            .map_err(|error| GitError::io(format!("无法读取 .git 文件：{error}")))?;
        if let Some(raw) = content
            .lines()
            .next()
            .and_then(|line| line.strip_prefix("gitdir:").map(str::trim))
        {
            let path = PathBuf::from(raw);
            return Ok(if path.is_absolute() {
                path
            } else {
                worktree.join(path)
            });
        }
        return Err(GitError::invalid_output(
            ".git 文件缺少有效的 gitdir 路径。",
        ));
    }

    let display = worktree.to_string_lossy();
    Err(GitError::not_repository(&display))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> (tempfile::TempDir, PathBuf) {
        let temp = tempfile::tempdir().expect("temp dir");
        let root = temp.path().join("repo");
        fs::create_dir(&root).expect("repo dir");
        fs::create_dir(root.join(".git")).expect("git dir");
        fs::write(root.join(".git/HEAD"), "ref: refs/heads/main\n").expect("HEAD");
        (temp, root)
    }

    #[test]
    fn detects_marker_priority() {
        let (_temp, root) = fixture();
        let git = root.join(".git");

        assert_eq!(detect(&root).expect("normal"), RepoState::Normal);

        fs::write(git.join("MERGE_HEAD"), "a\n").expect("MERGE_HEAD");
        assert_eq!(detect(&root).expect("merge"), RepoState::Merging);
        fs::remove_file(git.join("MERGE_HEAD")).expect("remove MERGE_HEAD");

        fs::write(git.join("CHERRY_PICK_HEAD"), "a\n").expect("CHERRY_PICK_HEAD");
        assert_eq!(
            detect(&root).expect("cherry-pick"),
            RepoState::CherryPicking
        );
        fs::remove_file(git.join("CHERRY_PICK_HEAD")).expect("remove CHERRY_PICK_HEAD");

        fs::write(git.join("REVERT_HEAD"), "a\n").expect("REVERT_HEAD");
        assert_eq!(detect(&root).expect("revert"), RepoState::Reverting);
        fs::remove_file(git.join("REVERT_HEAD")).expect("remove REVERT_HEAD");

        fs::write(git.join("BISECT_LOG"), "a\n").expect("BISECT_LOG");
        assert_eq!(detect(&root).expect("bisect"), RepoState::Bisecting);
        fs::remove_file(git.join("BISECT_LOG")).expect("remove BISECT_LOG");

        fs::create_dir(git.join("rebase-merge")).expect("rebase-merge");
        assert_eq!(detect(&root).expect("rebase"), RepoState::Rebasing);

        fs::create_dir_all(git.join("rebase-apply/applying")).expect("applying");
        assert_eq!(detect(&root).expect("am"), RepoState::AmInProgress);
    }

    #[test]
    fn detects_detached_head() {
        let (_temp, root) = fixture();
        fs::write(
            root.join(".git/HEAD"),
            "0123456789012345678901234567890123456789\n",
        )
        .expect("detached HEAD");

        assert_eq!(detect(&root).expect("detached"), RepoState::DetachedHead);
    }

    #[test]
    fn stores_and_clears_squash_marker() {
        let (_temp, root) = fixture();

        assert_eq!(read_squash_source(&root).expect("no marker"), None);
        write_squash_source(&root, "feature/x").expect("write marker");
        assert_eq!(
            read_squash_source(&root).expect("marker").as_deref(),
            Some("feature/x")
        );

        clear_squash_source(&root).expect("clear marker");
        assert_eq!(read_squash_source(&root).expect("cleared"), None);
        // Clearing twice is not an error.
        clear_squash_source(&root).expect("clear missing marker");
    }

    #[test]
    fn resolves_git_dir_file_for_worktrees() {
        let temp = tempfile::tempdir().expect("temp dir");
        let worktree = temp.path().join("repo");
        let git_dir = temp.path().join("actual-git");
        fs::create_dir(&worktree).expect("worktree");
        fs::create_dir(&git_dir).expect("git dir");
        fs::write(git_dir.join("HEAD"), "ref: refs/heads/main\n").expect("HEAD");
        fs::write(
            worktree.join(".git"),
            format!("gitdir: {}\n", git_dir.display()),
        )
        .expect(".git file");

        assert_eq!(
            detect(&worktree).expect("worktree state"),
            RepoState::Normal
        );
    }
}
