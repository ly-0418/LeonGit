use std::path::Path;

use super::command::{output_failure, run_git, run_git_checked, text_output};
use super::error::GitError;
use super::remotes;
use super::repo_state;
use super::repository;
use super::status;
use super::types::{BranchInfo, RemoteBranchInfo, RenameBranchResult, RepositorySnapshot};

const FIELD_SEPARATOR: char = '\u{1f}';

pub(crate) fn list(worktree: &Path) -> Result<Vec<BranchInfo>, GitError> {
    let format = format!(
        "--format=%(refname:short){sep}%(objectname){sep}%(upstream:short){sep}%(HEAD){sep}%(committerdate:unix){sep}%(subject)",
        sep = FIELD_SEPARATOR
    );
    let stdout = run_git_checked(
        worktree,
        [
            "for-each-ref",
            "--sort=-committerdate",
            format.as_str(),
            "refs/heads",
        ],
    )?;
    let text = String::from_utf8_lossy(&stdout);
    let mut branches = Vec::new();

    for line in text.lines() {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if line.is_empty() {
            continue;
        }
        let mut fields = line.splitn(6, FIELD_SEPARATOR);
        let name = required(&mut fields, "分支名")?;
        let oid = required(&mut fields, "分支 SHA")?;
        let upstream_raw = required(&mut fields, "upstream")?;
        let head_marker = required(&mut fields, "HEAD 标记")?;
        let committed_at = required(&mut fields, "提交时间")?;
        let subject = fields.next().unwrap_or_default();

        let upstream = if upstream_raw.is_empty() {
            None
        } else {
            Some(upstream_raw)
        };
        let (ahead, behind) = match &upstream {
            Some(upstream) => ahead_behind(worktree, &name, upstream)?,
            None => (0, 0),
        };
        let is_merged = is_merged(worktree, &name)?;
        let is_current = head_marker.trim() == "*";
        let short_oid: String = oid.chars().take(8).collect();

        branches.push(BranchInfo {
            name,
            oid,
            short_oid,
            is_current,
            upstream,
            ahead,
            behind,
            is_merged,
            last_subject: subject.to_owned(),
            last_committed_at: committed_at.parse().unwrap_or(0),
        });
    }

    branches.sort_by_key(|branch| std::cmp::Reverse(branch.is_current));
    Ok(branches)
}

pub(crate) fn create(
    worktree: &Path,
    name: &str,
    start_point: Option<&str>,
) -> Result<Vec<BranchInfo>, GitError> {
    validate_branch_name(worktree, name)?;
    let start_point = start_point.map(str::trim).filter(|value| !value.is_empty());
    if let Some(start_point) = start_point {
        validate_oid(start_point)?;
    }

    let mut args = vec!["branch", name];
    if let Some(start_point) = start_point {
        args.push(start_point);
    }
    run_git_checked(worktree, args)?;
    list(worktree)
}

pub(crate) fn create_from_detached(worktree: &Path, name: &str) -> Result<(), GitError> {
    if repo_state::detect(worktree)? != super::repo_state::RepoState::DetachedHead {
        return Err(GitError::invalid_input(
            "当前不在 detached HEAD，无法使用该入口创建分支。",
        ));
    }
    validate_branch_name(worktree, name)?;
    let exists = run_git(
        worktree,
        [
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/heads/{name}"),
        ],
    )?;
    if exists.status.success() {
        return Err(GitError::invalid_input(format!("本地分支“{name}”已存在。")));
    }
    if exists.status.code() != Some(1) {
        return Err(output_failure(&exists));
    }
    run_git_checked(worktree, ["switch", "-c", name])?;
    Ok(())
}

pub(crate) fn checkout(worktree: &Path, name: &str) -> Result<RepositorySnapshot, GitError> {
    validate_branch_name(worktree, name)?;
    repo_state::ensure_operation_allowed(worktree, "切换分支")?;
    let data = status::read(worktree)?;

    if data.head.branch.as_deref() == Some(name) {
        return repository::snapshot_at_root(worktree);
    }

    if !data.summary.is_clean {
        let changes = data.summary.staged
            + data.summary.unstaged
            + data.summary.untracked
            + data.summary.conflicted;
        return Err(GitError::worktree_dirty(format!(
            "工作区还有 {changes} 项未提交修改，已阻止切换分支。请先提交、暂存或丢弃这些修改。"
        )));
    }

    let exists = run_git(
        worktree,
        [
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("refs/heads/{name}"),
        ],
    )?;
    if !exists.status.success() {
        return Err(GitError::invalid_input(format!("本地分支“{name}”不存在。")));
    }

    let output = run_git(worktree, ["switch", name])?;
    if !output.status.success() {
        return Err(output_failure(&output));
    }

    repository::snapshot_at_root(worktree)
}

pub(crate) fn set_upstream(
    worktree: &Path,
    branch: &str,
    remote: &str,
    remote_branch: &str,
) -> Result<(), GitError> {
    validate_branch_name(worktree, branch)?;
    let remote = remote.trim();
    let remote_branch = remote_branch.trim();
    if remote.is_empty() || remote_branch.is_empty() {
        return Err(GitError::invalid_input("远程名称和目标分支不能为空。"));
    }
    if remote_branch.starts_with('-')
        || remote_branch
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
    {
        return Err(GitError::invalid_input("远程分支名无效。"));
    }

    let remotes = remotes::list(worktree)?;
    if !remotes.iter().any(|item| item.name == remote) {
        return Err(GitError::invalid_input(format!("远程“{remote}”不存在。")));
    }

    let local_ref = format!("refs/heads/{branch}");
    let local = run_git(
        worktree,
        ["show-ref", "--verify", "--quiet", local_ref.as_str()],
    )?;
    if !local.status.success() {
        return Err(GitError::invalid_input(format!(
            "本地分支“{branch}”不存在。"
        )));
    }

    let target_ref = ["refs/remotes", remote, remote_branch].join("/");
    let target = run_git(
        worktree,
        ["show-ref", "--verify", "--quiet", target_ref.as_str()],
    )?;
    if target.status.code() == Some(1) {
        return Err(GitError::invalid_input(format!(
            "远程分支“{remote}/{remote_branch}”不存在，未创建任何引用。"
        )));
    }
    if !target.status.success() {
        return Err(output_failure(&target));
    }

    let upstream = [remote, remote_branch].join("/");
    let option = ["--set-upstream-to", upstream.as_str()].join("=");
    let output = run_git(worktree, ["branch", option.as_str(), branch])?;
    if !output.status.success() {
        return Err(output_failure(&output));
    }
    Ok(())
}

pub(crate) fn delete(
    worktree: &Path,
    name: &str,
    force: bool,
) -> Result<Vec<BranchInfo>, GitError> {
    validate_branch_name(worktree, name)?;
    repo_state::ensure_operation_allowed(worktree, "删除分支")?;
    let data = status::read(worktree)?;
    if data.head.branch.as_deref() == Some(name) {
        return Err(GitError::invalid_input(
            "不能删除当前检出的分支，请先切换到其他分支。",
        ));
    }

    run_git_checked(worktree, ["branch", if force { "-D" } else { "-d" }, name])?;
    list(worktree)
}

pub(crate) fn rename(
    worktree: &Path,
    old_name: &str,
    new_name: &str,
) -> Result<RenameBranchResult, GitError> {
    validate_branch_name(worktree, old_name)?;
    validate_branch_name(worktree, new_name)?;
    if old_name == new_name {
        return Err(GitError::invalid_input("新分支名不能与旧分支名相同。"));
    }

    let data = status::read(worktree)?;
    let needs_upstream_note = data.head.branch.as_deref() == Some(old_name);
    let old_ref = format!("refs/heads/{old_name}");
    let old_exists = run_git(
        worktree,
        ["rev-parse", "--verify", "--quiet", old_ref.as_str()],
    )?;
    if !old_exists.status.success() {
        return Err(GitError::invalid_input(format!(
            "本地分支“{old_name}”不存在。"
        )));
    }

    let new_ref = format!("refs/heads/{new_name}");
    let new_exists = run_git(
        worktree,
        ["rev-parse", "--verify", "--quiet", new_ref.as_str()],
    )?;
    if new_exists.status.success() {
        return Err(GitError::invalid_input(format!(
            "本地分支“{new_name}”已存在。"
        )));
    }

    let output = run_git(worktree, ["branch", "-m", old_name, new_name])?;
    if !output.status.success() {
        return Err(output_failure(&output));
    }

    Ok(RenameBranchResult {
        old_name: old_name.to_owned(),
        new_name: new_name.to_owned(),
        needs_upstream_note,
    })
}

pub(crate) fn list_remote(worktree: &Path) -> Result<Vec<RemoteBranchInfo>, GitError> {
    let remotes = remotes::list(worktree)?;
    if remotes.is_empty() {
        return Ok(Vec::new());
    }

    let format = format!(
        "--format=%(refname:short){sep}%(objectname){sep}%(symref){sep}%(committerdate:unix){sep}%(subject)",
        sep = FIELD_SEPARATOR
    );
    let stdout = run_git_checked(
        worktree,
        [
            "for-each-ref",
            "--sort=-committerdate",
            format.as_str(),
            "refs/remotes",
        ],
    )?;
    let text = String::from_utf8_lossy(&stdout);
    let mut branches = Vec::new();

    for line in text.lines() {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if line.is_empty() {
            continue;
        }
        let mut fields = line.splitn(5, FIELD_SEPARATOR);
        let full_name = required(&mut fields, "远程分支名")?;
        let oid = required(&mut fields, "分支 SHA")?;
        let symref = required(&mut fields, "符号引用")?;
        let committed_at = required(&mut fields, "提交时间")?;
        let subject = fields.next().unwrap_or_default();
        if !symref.is_empty() || full_name.ends_with("/HEAD") {
            continue;
        }

        let Some(remote) = remotes
            .iter()
            .filter(|remote| full_name.starts_with(&format!("{}/", remote.name)))
            .max_by_key(|remote| remote.name.len())
        else {
            continue;
        };
        let name = full_name
            .strip_prefix(&format!("{}/", remote.name))
            .unwrap_or_default();
        if name.is_empty() || name == "HEAD" {
            continue;
        }

        branches.push(RemoteBranchInfo {
            remote: remote.name.clone(),
            name: name.to_owned(),
            full_name: full_name.clone(),
            short_oid: oid.chars().take(8).collect(),
            oid,
            last_subject: subject.to_owned(),
            last_committed_at: committed_at.parse().unwrap_or(0),
        });
    }

    Ok(branches)
}

pub(crate) fn restore_remote(
    worktree: &Path,
    remote: &str,
    branch: &str,
) -> Result<RepositorySnapshot, GitError> {
    let remote = remote.trim();
    let branch = branch.trim();
    if remote.is_empty()
        || remote.starts_with('-')
        || remote
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
    {
        return Err(GitError::invalid_input("远程仓库名称无效。"));
    }
    validate_branch_name(worktree, branch)?;
    if !remotes::list(worktree)?
        .iter()
        .any(|item| item.name == remote)
    {
        return Err(GitError::invalid_input(format!(
            "远程仓库“{remote}”不存在，请先配置远程地址。"
        )));
    }

    let full_name = format!("{remote}/{branch}");
    let remote_ref = format!("refs/remotes/{full_name}");
    let exists = run_git(
        worktree,
        ["rev-parse", "--verify", "--quiet", remote_ref.as_str()],
    )?;
    if !exists.status.success() {
        return Err(GitError::invalid_input(format!(
            "远程分支“{full_name}”不在本地缓存中，请先在远程区执行 Fetch。"
        )));
    }

    let local_ref = format!("refs/heads/{branch}");
    let local_exists = run_git(
        worktree,
        ["rev-parse", "--verify", "--quiet", local_ref.as_str()],
    )?;
    if local_exists.status.success() {
        return Err(GitError::invalid_input(format!(
            "本地分支“{branch}”已存在，无需从远程恢复。"
        )));
    }

    let data = status::read(worktree)?;
    if !data.summary.is_clean {
        let changes = data.summary.staged
            + data.summary.unstaged
            + data.summary.untracked
            + data.summary.conflicted;
        return Err(GitError::worktree_dirty(format!(
            "工作区还有 {changes} 项未提交修改，无法检出远程分支。请先提交、暂存或丢弃这些修改。"
        )));
    }

    run_git_checked(
        worktree,
        ["switch", "--create", branch, "--track", full_name.as_str()],
    )?;
    repository::snapshot_at_root(worktree)
}

fn ahead_behind(worktree: &Path, branch: &str, upstream: &str) -> Result<(u32, u32), GitError> {
    let range = format!("{branch}...{upstream}");
    let stdout = match run_git_checked(
        worktree,
        ["rev-list", "--left-right", "--count", range.as_str()],
    ) {
        Ok(stdout) => stdout,
        Err(_) => return Ok((0, 0)),
    };
    let counts = text_output(&stdout);
    let mut parts = counts.split_whitespace();
    let ahead = parts
        .next()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    let behind = parts
        .next()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    Ok((ahead, behind))
}

fn is_merged(worktree: &Path, branch: &str) -> Result<bool, GitError> {
    let output = run_git(worktree, ["merge-base", "--is-ancestor", branch, "HEAD"])?;
    match output.status.code() {
        Some(0) => Ok(true),
        Some(1) => Ok(false),
        _ => Err(output_failure(&output)),
    }
}

fn validate_branch_name(worktree: &Path, name: &str) -> Result<(), GitError> {
    let name = name.trim();
    if name.is_empty()
        || name.starts_with('-')
        || name
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
    {
        return Err(GitError::invalid_input("请输入有效的分支名。"));
    }

    let output = run_git(worktree, ["check-ref-format", "--branch", name])?;
    if !output.status.success() {
        return Err(GitError::invalid_input(format!(
            "分支名“{name}”不符合 Git 命名规则。"
        )));
    }
    Ok(())
}

fn validate_oid(oid: &str) -> Result<(), GitError> {
    if oid.len() < 7
        || oid.len() > 64
        || !oid.chars().all(|character| character.is_ascii_hexdigit())
    {
        return Err(GitError::invalid_input("起始提交 SHA 无效。"));
    }
    Ok(())
}

fn required<'a>(
    fields: &mut impl Iterator<Item = &'a str>,
    field: &str,
) -> Result<String, GitError> {
    fields
        .next()
        .map(ToOwned::to_owned)
        .ok_or_else(|| GitError::invalid_output(format!("分支列表缺少{field}。")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
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

    fn init_repo() -> tempfile::TempDir {
        let temp = tempfile::tempdir().expect("temp dir");
        let repo = temp.path().join("repo");
        fs::create_dir(&repo).expect("repo dir");
        git(&repo, &["init", "-q", "-b", "main"]);
        git(&repo, &["config", "--local", "user.name", "Branch Tester"]);
        git(
            &repo,
            &["config", "--local", "user.email", "branches@example.com"],
        );
        fs::write(repo.join("file.txt"), "base\n").expect("file");
        git(&repo, &["add", "file.txt"]);
        git(&repo, &["commit", "-q", "-m", "initial"]);
        temp
    }

    #[test]
    fn creates_branch_from_detached_and_saves_commit() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        git(&repo, &["checkout", "--detach", "HEAD"]);
        fs::write(repo.join("detached.txt"), "saved\n").expect("detached file");
        git(&repo, &["add", "detached.txt"]);
        git(&repo, &["commit", "-q", "-m", "detached commit"]);
        let snapshot = repository::snapshot_at_root(&repo).expect("detached snapshot");
        assert!(snapshot.head.detached);
        assert!(snapshot.detached_unsaved);

        create_from_detached(&repo, "saved-work").expect("create from detached");
        let snapshot = repository::snapshot_at_root(&repo).expect("normal snapshot");
        assert_eq!(
            snapshot.repo_state,
            crate::git_engine::repo_state::RepoState::Normal
        );
        assert_eq!(snapshot.head.branch.as_deref(), Some("saved-work"));
        assert!(!snapshot.detached_unsaved);
        assert!(list(&repo)
            .expect("branches")
            .iter()
            .any(|branch| branch.name == "saved-work"));
        assert!(create_from_detached(&repo, "another").is_err());
    }

    #[test]
    fn sets_existing_upstream_and_rejects_missing_target() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        git(
            &repo,
            &["remote", "add", "origin", "https://example.com/repo.git"],
        );
        git(&repo, &["update-ref", "refs/remotes/origin/dev", "HEAD"]);
        create(&repo, "feature", None).expect("create feature");

        set_upstream(&repo, "feature", "origin", "dev").expect("set upstream");
        let output = Command::new("git")
            .current_dir(&repo)
            .args(["rev-parse", "--abbrev-ref", "feature@{upstream}"])
            .output()
            .expect("upstream query");
        assert!(output.status.success());
        assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), "origin/dev");

        let error =
            set_upstream(&repo, "feature", "origin", "missing").expect_err("missing remote branch");
        assert_eq!(error.kind, super::super::error::GitErrorKind::InvalidInput);
        assert!(error.message.contains("不存在"));
    }

    #[test]
    fn creates_lists_checks_out_and_deletes_branch() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        let branches = create(&repo, "feature/test", None).expect("create branch");
        assert!(branches.iter().any(|branch| branch.name == "feature/test"));
        assert!(branches.iter().any(|branch| branch.is_current));

        let snapshot = checkout(&repo, "feature/test").expect("checkout clean");
        assert_eq!(snapshot.head.branch.as_deref(), Some("feature/test"));

        let deleted = delete(&repo, "feature/test", false);
        assert!(deleted.is_err(), "cannot delete current branch");
        checkout(&repo, "main").expect("back to main");
        let branches = delete(&repo, "feature/test", false).expect("delete merged");
        assert!(!branches.iter().any(|branch| branch.name == "feature/test"));
    }

    #[test]
    fn blocks_checkout_with_uncommitted_changes() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        create(&repo, "feature/dirty", None).expect("create branch");
        fs::write(repo.join("file.txt"), "changed\n").expect("dirty file");
        let error = checkout(&repo, "feature/dirty").expect_err("dirty checkout");
        assert_eq!(error.kind, super::super::error::GitErrorKind::WorktreeDirty);
    }

    #[test]
    fn unmerged_branch_requires_force_delete() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        create(&repo, "feature/unmerged", None).expect("create branch");
        checkout(&repo, "feature/unmerged").expect("checkout");
        fs::write(repo.join("branch-only.txt"), "branch\n").expect("branch file");
        git(&repo, &["add", "branch-only.txt"]);
        git(&repo, &["commit", "-q", "-m", "branch only"]);
        checkout(&repo, "main").expect("back");
        assert!(delete(&repo, "feature/unmerged", false).is_err());
        delete(&repo, "feature/unmerged", true).expect("force delete");
    }

    #[test]
    fn renames_branch_and_reports_current_upstream_note() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        create(&repo, "feature/old", None).expect("create old");
        let result = rename(&repo, "feature/old", "feature/new").expect("rename other");
        assert!(!result.needs_upstream_note);
        assert!(list(&repo)
            .expect("branches")
            .iter()
            .any(|branch| branch.name == "feature/new"));

        checkout(&repo, "feature/new").expect("checkout new");
        let result = rename(&repo, "feature/new", "feature/current").expect("rename current");
        assert!(result.needs_upstream_note);

        create(&repo, "feature/occupied", None).expect("create occupied");
        assert!(rename(&repo, "feature/current", "feature/occupied").is_err());
    }

    #[test]
    fn restores_deleted_branch_from_remote_tracking_ref() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        let remote = temp.path().join("remote.git");
        git(
            temp.path(),
            &[
                "init",
                "--bare",
                "--quiet",
                remote.to_str().expect("remote path"),
            ],
        );
        git(
            &repo,
            &[
                "remote",
                "add",
                "origin",
                remote.to_str().expect("remote path"),
            ],
        );
        create(&repo, "feature/restore", None).expect("create branch");
        checkout(&repo, "feature/restore").expect("checkout");
        fs::write(repo.join("restore.txt"), "restore\n").expect("branch file");
        git(&repo, &["add", "restore.txt"]);
        git(&repo, &["commit", "-q", "-m", "restore me"]);
        git(&repo, &["push", "-q", "-u", "origin", "feature/restore"]);
        git(&repo, &["fetch", "-q", "origin"]);
        checkout(&repo, "main").expect("back");
        delete(&repo, "feature/restore", true).expect("delete local");

        let remote_branches = list_remote(&repo).expect("remote branches");
        assert!(remote_branches
            .iter()
            .any(|branch| branch.full_name == "origin/feature/restore"));
        let snapshot = restore_remote(&repo, "origin", "feature/restore").expect("restore branch");
        assert_eq!(snapshot.head.branch.as_deref(), Some("feature/restore"));
        assert_eq!(
            snapshot.head.upstream.as_deref(),
            Some("origin/feature/restore")
        );
    }
}
