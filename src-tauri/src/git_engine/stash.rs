use std::path::Path;

use super::command::{output_failure, run_git, run_git_checked};
use super::error::GitError;
use super::status;
use super::types::StashEntry;

const FIELD_SEPARATOR: char = '\u{1f}';

pub(crate) fn push(
    worktree: &Path,
    message: Option<&str>,
    include_untracked: bool,
) -> Result<(), GitError> {
    let data = status::read(worktree)?;
    let stashable = data.summary.staged
        + data.summary.unstaged
        + data.summary.conflicted
        + if include_untracked {
            data.summary.untracked
        } else {
            0
        };
    if stashable == 0 {
        return Err(GitError::invalid_input(if include_untracked {
            "工作区没有可保存的修改。"
        } else {
            "工作区没有已跟踪的修改；如需包含未跟踪文件，请勾选对应选项。"
        }));
    }

    let mut args = vec!["stash", "push"];
    if include_untracked {
        args.push("-u");
    }
    if let Some(message) = message.map(str::trim).filter(|message| !message.is_empty()) {
        args.push("-m");
        args.push(message);
    }
    run_git_checked(worktree, args)?;
    Ok(())
}

pub(crate) fn list(worktree: &Path) -> Result<Vec<StashEntry>, GitError> {
    let format = format!(
        "--format=%gd{sep}%H{sep}%h{sep}%ct{sep}%s",
        sep = FIELD_SEPARATOR
    );
    let stdout = run_git_checked(worktree, ["stash", "list", format.as_str()])?;
    let text = String::from_utf8_lossy(&stdout);
    let mut entries = Vec::new();

    for line in text.lines() {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if line.is_empty() {
            continue;
        }
        let mut fields = line.splitn(5, FIELD_SEPARATOR);
        let selector = required(&mut fields, "stash selector")?;
        let oid = required(&mut fields, "stash SHA")?;
        let short_oid = required(&mut fields, "stash 短 SHA")?;
        let timestamp = required(&mut fields, "stash 时间")?;
        let message = fields.next().unwrap_or_default().to_owned();
        let index = parse_index(&selector).ok_or_else(|| {
            GitError::invalid_output(format!("无法解析 stash 选择器“{selector}”。"))
        })?;
        let timestamp = timestamp
            .parse::<i64>()
            .map_err(|_| GitError::invalid_output("stash 时间戳不是有效的 Unix 时间。"))?;

        entries.push(StashEntry {
            index,
            selector,
            oid,
            short_oid,
            message,
            timestamp,
        });
    }

    Ok(entries)
}

pub(crate) fn apply(worktree: &Path, index: usize, restore_index: bool) -> Result<(), GitError> {
    let selector = selector_for(worktree, index)?;
    let mut args = vec!["stash", "apply"];
    if restore_index {
        args.push("--index");
    }
    args.push(selector.as_str());
    let output = run_git(worktree, args)?;
    if !output.status.success() {
        let mut error = output_failure(&output);
        error.message = format!("应用 Stash 失败，条目仍保留：{}", error.message);
        return Err(error);
    }
    Ok(())
}

pub(crate) fn pop(worktree: &Path, index: usize, restore_index: bool) -> Result<(), GitError> {
    let selector = selector_for(worktree, index)?;
    let mut args = vec!["stash", "pop"];
    if restore_index {
        args.push("--index");
    }
    args.push(selector.as_str());
    let output = run_git(worktree, args)?;
    if !output.status.success() {
        let mut error = output_failure(&output);
        error.message = format!(
            "弹出 Stash 失败，条目仍保留在 stash 列表中：{}",
            error.message
        );
        return Err(error);
    }
    Ok(())
}

pub(crate) fn drop(worktree: &Path, index: usize) -> Result<(), GitError> {
    let selector = selector_for(worktree, index)?;
    run_git_checked(worktree, ["stash", "drop", selector.as_str()])?;
    Ok(())
}

fn selector_for(worktree: &Path, index: usize) -> Result<String, GitError> {
    let entries = list(worktree)?;
    if !entries.iter().any(|entry| entry.index == index as u32) {
        return Err(GitError::invalid_input(format!(
            "Stash 条目 stash@{{{index}}} 不存在。"
        )));
    }
    Ok(format!("stash@{{{index}}}"))
}

fn parse_index(selector: &str) -> Option<u32> {
    selector
        .strip_prefix("stash@{")?
        .strip_suffix('}')?
        .parse()
        .ok()
}

fn required<'a>(
    fields: &mut impl Iterator<Item = &'a str>,
    field: &str,
) -> Result<String, GitError> {
    fields
        .next()
        .map(ToOwned::to_owned)
        .ok_or_else(|| GitError::invalid_output(format!("stash 输出缺少{field}。")))
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
            .expect("git");
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
        fs::create_dir(&repo).expect("repo");
        git(&repo, &["init", "-q", "-b", "main"]);
        git(&repo, &["config", "user.name", "Stash Tester"]);
        git(&repo, &["config", "user.email", "stash@example.com"]);
        fs::write(repo.join("file.txt"), "base\n").expect("file");
        git(&repo, &["add", "file.txt"]);
        git(&repo, &["commit", "-q", "-m", "initial"]);
        temp
    }

    #[test]
    fn pushes_lists_applies_and_pops_without_auto_drop_on_apply() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        fs::write(repo.join("file.txt"), "changed\n").expect("changed");
        fs::write(repo.join("untracked.txt"), "new\n").expect("untracked");
        push(&repo, Some("work in progress"), true).expect("push stash");
        assert_eq!(list(&repo).expect("list").len(), 1);
        assert!(status::read(&repo).expect("status").summary.is_clean);

        apply(&repo, 0, true).expect("apply");
        assert_eq!(list(&repo).expect("still there").len(), 1);
        assert_eq!(
            fs::read_to_string(repo.join("untracked.txt"))
                .expect("untracked restored")
                .trim(),
            "new"
        );

        git(&repo, &["reset", "--hard", "HEAD"]);
        git(&repo, &["clean", "-fd"]);
        pop(&repo, 0, true).expect("pop");
        assert!(list(&repo).expect("list after pop").is_empty());
    }

    #[test]
    fn refuses_empty_stash_and_out_of_range_index() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        assert!(push(&repo, None, false).is_err());
        let error = apply(&repo, 9, false).expect_err("missing stash");
        assert_eq!(error.kind, super::super::error::GitErrorKind::InvalidInput);
    }

    #[test]
    fn pop_conflict_keeps_stash_entry() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        fs::write(repo.join("file.txt"), "stashed\n").expect("stashed change");
        push(&repo, Some("conflict"), false).expect("push stash");

        fs::write(repo.join("file.txt"), "committed\n").expect("committed change");
        git(&repo, &["add", "file.txt"]);
        git(&repo, &["commit", "-q", "-m", "conflicting commit"]);

        let error = pop(&repo, 0, false).expect_err("pop should conflict");
        assert!(error.message.contains("条目仍保留"));
        assert_eq!(list(&repo).expect("stash remains").len(), 1);
    }

    #[test]
    fn drops_single_stash_entry() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        fs::write(repo.join("file.txt"), "drop me\n").expect("change");
        push(&repo, None, false).expect("push stash");
        assert_eq!(list(&repo).expect("stash").len(), 1);
        drop(&repo, 0).expect("drop");
        assert!(list(&repo).expect("empty").is_empty());
    }
}
