use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use super::command::run_git;
use super::diff::validate_relative_path;
use super::error::GitError;

const ROOT_GITIGNORE: &str = ".gitignore";

/// Appends one ignore pattern to an existing target (or creates the root
/// `.gitignore`). The operation never stages, commits, or removes tracked
/// files.
pub(crate) fn add(
    worktree: &Path,
    pattern: &str,
    target_gitignore: Option<&str>,
) -> Result<(), GitError> {
    let pattern = validate_pattern(pattern)?;
    let target = resolve_target(worktree, target_gitignore)?;

    let existing = match fs::read(&target) {
        Ok(bytes) => String::from_utf8_lossy(&bytes).into_owned(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => {
            return Err(GitError::io(format!(
                "无法读取 {}：{error}",
                target.display()
            )))
        }
    };

    if existing
        .lines()
        .any(|line| line.trim_end_matches('\r') == pattern)
    {
        return Ok(());
    }

    let needs_newline = !existing.is_empty() && !existing.ends_with('\n');
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&target)
        .map_err(|error| GitError::io(format!("无法写入 {}：{error}", target.display())))?;
    if needs_newline {
        file.write_all(b"\n")
            .map_err(|error| GitError::io(format!("无法写入 {}：{error}", target.display())))?;
    }
    file.write_all(pattern.as_bytes())
        .and_then(|_| file.write_all(b"\n"))
        .map_err(|error| GitError::io(format!("无法写入 {}：{error}", target.display())))?;

    Ok(())
}

/// Uses Git's exit code, not localized stderr, to answer the question.
pub(crate) fn is_ignored(worktree: &Path, path: &str) -> Result<bool, GitError> {
    let path = validate_relative_path(path, "文件路径")?;
    let output = run_git(worktree, ["check-ignore", "-q", "--", path.as_str()])?;
    match output.status.code() {
        Some(0) => Ok(true),
        Some(1) => Ok(false),
        _ => Err(super::command::output_failure(&output)),
    }
}

/// Lists every existing `.gitignore` in the worktree, root first. The root
/// entry is included even when it does not exist yet, so the default target
/// is always selectable.
pub(crate) fn list(worktree: &Path) -> Result<Vec<String>, GitError> {
    let mut paths = Vec::new();
    collect(worktree, worktree, &mut paths, 0)?;
    paths.sort_by(|left, right| {
        if left == ROOT_GITIGNORE {
            std::cmp::Ordering::Less
        } else if right == ROOT_GITIGNORE {
            std::cmp::Ordering::Greater
        } else {
            left.cmp(right)
        }
    });
    if !paths.iter().any(|path| path == ROOT_GITIGNORE) {
        paths.insert(0, ROOT_GITIGNORE.to_owned());
    }
    Ok(paths)
}

fn collect(
    worktree: &Path,
    directory: &Path,
    paths: &mut Vec<String>,
    depth: usize,
) -> Result<(), GitError> {
    if depth > 16 || paths.len() >= 100 {
        return Ok(());
    }
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return Ok(()),
        Err(error) => {
            return Err(GitError::io(format!(
                "无法读取目录 {}：{error}",
                directory.display()
            )))
        }
    };
    for entry in entries {
        let entry = entry.map_err(|error| GitError::io(format!("无法读取目录项：{error}")))?;
        let file_type = entry
            .file_type()
            .map_err(|error| GitError::io(format!("无法读取文件类型：{error}")))?;
        if file_type.is_dir() {
            if entry.file_name() == ".git" {
                continue;
            }
            collect(worktree, &entry.path(), paths, depth + 1)?;
            continue;
        }
        if !file_type.is_file() || entry.file_name() != ".gitignore" {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(worktree)
            .map_err(|_| GitError::invalid_path("无法解析 .gitignore 路径。"))?
            .to_string_lossy()
            .replace('\\', "/");
        paths.push(relative);
    }
    Ok(())
}

fn resolve_target(worktree: &Path, target: Option<&str>) -> Result<PathBuf, GitError> {
    let relative = target
        .map(|value| validate_relative_path(value, "目标 .gitignore"))
        .transpose()?
        .unwrap_or_else(|| ROOT_GITIGNORE.to_owned());
    if relative.rsplit('/').next() != Some(ROOT_GITIGNORE) {
        return Err(GitError::invalid_input("目标文件必须是 .gitignore。"));
    }
    let target = worktree.join(&relative);
    if relative != ROOT_GITIGNORE && !target.is_file() {
        return Err(GitError::invalid_input(format!(
            "目标 .gitignore 不存在：{relative}"
        )));
    }
    Ok(target)
}

fn validate_pattern(pattern: &str) -> Result<String, GitError> {
    let pattern = pattern.trim();
    if pattern.is_empty() {
        return Err(GitError::invalid_input("忽略规则不能为空。"));
    }
    if pattern.chars().any(char::is_control) {
        return Err(GitError::invalid_input("忽略规则不能包含换行或控制字符。"));
    }
    if pattern == ".." || pattern.contains("../") {
        return Err(GitError::invalid_input("忽略规则不能指向仓库外。"));
    }
    Ok(pattern.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn git(repo: &Path, args: &[&str]) -> std::process::Output {
        Command::new("git")
            .current_dir(repo)
            .args(args)
            .env("GIT_TERMINAL_PROMPT", "0")
            .output()
            .expect("git")
    }

    fn must(repo: &Path, args: &[&str]) {
        let output = git(repo, args);
        assert!(
            output.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn init_repo() -> tempfile::TempDir {
        let temp = tempfile::tempdir().expect("temp");
        let repo = temp.path().join("repo");
        fs::create_dir(&repo).expect("repo");
        must(&repo, &["init", "-q", "-b", "main"]);
        must(&repo, &["config", "user.name", "Ignore Tester"]);
        must(&repo, &["config", "user.email", "ignore@example.com"]);
        fs::write(repo.join("tracked.txt"), "base\n").expect("tracked");
        must(&repo, &["add", "tracked.txt"]);
        must(&repo, &["commit", "-q", "-m", "base"]);
        temp
    }

    #[test]
    fn appends_patterns_without_duplicates() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        add(&repo, "*.log", None).expect("add pattern");
        add(&repo, "*.log", None).expect("duplicate");
        let content = fs::read_to_string(repo.join(".gitignore")).expect("read");
        assert_eq!(content.lines().filter(|line| *line == "*.log").count(), 1);
    }

    #[test]
    fn appends_to_existing_nested_gitignore() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        fs::create_dir(repo.join("sub")).expect("sub");
        fs::write(repo.join("sub/.gitignore"), "existing\n").expect("gitignore");
        add(&repo, "*.tmp", Some("sub/.gitignore")).expect("add nested");
        let content = fs::read_to_string(repo.join("sub/.gitignore")).expect("read");
        assert!(content.contains("existing\n"));
        assert!(content.contains("*.tmp\n"));
        assert!(add(&repo, "*.tmp", Some("missing/.gitignore")).is_err());
    }

    #[test]
    fn checks_ignored_via_git_exit_code() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        fs::write(repo.join("debug.log"), "x\n").expect("file");
        add(&repo, "*.log", None).expect("add pattern");
        assert!(is_ignored(&repo, "debug.log").expect("ignored"));
        fs::write(repo.join("visible.txt"), "x\n").expect("file");
        assert!(!is_ignored(&repo, "visible.txt").expect("visible"));
    }

    #[test]
    fn lists_root_even_when_missing_and_nested_files() {
        let temp = init_repo();
        let repo = temp.path().join("repo");
        assert_eq!(list(&repo).expect("list"), vec![".gitignore".to_owned()]);
        fs::create_dir(repo.join("sub")).expect("sub");
        fs::write(repo.join(".gitignore"), "").expect("root");
        fs::write(repo.join("sub/.gitignore"), "").expect("nested");
        assert_eq!(
            list(&repo).expect("list"),
            vec![".gitignore".to_owned(), "sub/.gitignore".to_owned()]
        );
    }
}
