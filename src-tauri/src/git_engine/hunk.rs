use std::path::Path;

use super::command::run_git_with_input;
use super::diff::validate_relative_path;
use super::error::GitError;
use super::redact;

pub(crate) fn stage(worktree: &Path, file_path: &str, hunk_patch: &str) -> Result<(), GitError> {
    apply(worktree, file_path, hunk_patch, false, true)
}

pub(crate) fn unstage(worktree: &Path, file_path: &str, hunk_patch: &str) -> Result<(), GitError> {
    apply(worktree, file_path, hunk_patch, true, true)
}

pub(crate) fn discard_lines(
    worktree: &Path,
    file_path: &str,
    reverse_patch: &str,
) -> Result<(), GitError> {
    apply(worktree, file_path, reverse_patch, true, false)
}

fn apply(
    worktree: &Path,
    file_path: &str,
    hunk_patch: &str,
    reverse: bool,
    cached: bool,
) -> Result<(), GitError> {
    let path = validate_relative_path(file_path, "文件路径")?;
    if path.chars().any(char::is_control) {
        return Err(GitError::invalid_input("文件路径包含控制字符。"));
    }
    validate_hunk_patch(hunk_patch)?;

    let header = format!(
        "diff --git {a} {b}\n--- {a}\n+++ {b}\n",
        a = quote_path(&format!("a/{path}")),
        b = quote_path(&format!("b/{path}")),
    );
    let mut patch = header;
    patch.push_str(hunk_patch.trim_end_matches(['\r', '\n']));
    patch.push('\n');

    let mut args = vec!["apply", "--whitespace=nowarn"];
    if cached {
        args.push("--cached");
    }
    if reverse {
        args.push("--reverse");
    }
    args.push("-");
    let output = run_git_with_input(worktree, args, patch.as_bytes())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr)
            .trim_matches(|value| value == '\r' || value == '\n')
            .to_owned();
        let stderr = redact::redact_text(&stderr);
        return Err(GitError::command_failed(if stderr.is_empty() {
            "patch 应用失败，Git 没有返回错误信息。".to_owned()
        } else {
            stderr
        }));
    }
    Ok(())
}

fn validate_hunk_patch(hunk_patch: &str) -> Result<(), GitError> {
    let patch = hunk_patch.trim();
    if patch.is_empty() {
        return Err(GitError::invalid_input("hunk patch 不能为空。"));
    }
    if patch.len() > 2_000_000 {
        return Err(GitError::invalid_input("hunk patch 过大。"));
    }
    if patch.contains('\0') {
        return Err(GitError::invalid_input("hunk patch 包含非法字符。"));
    }

    let mut has_hunk = false;
    for line in patch.lines() {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if line.starts_with("@@ ") {
            has_hunk = true;
            continue;
        }
        if !(line.starts_with(' ')
            || line.starts_with('+')
            || line.starts_with('-')
            || line.starts_with('\\'))
        {
            return Err(GitError::invalid_input(
                "hunk patch 只能包含 hunk 头与 diff 行，不能包含文件头或额外文件。",
            ));
        }
    }
    if !has_hunk {
        return Err(GitError::invalid_input("hunk patch 缺少 @@ hunk 头。"));
    }
    Ok(())
}

fn quote_path(path: &str) -> String {
    if path
        .chars()
        .any(|character| character.is_whitespace() || matches!(character, '"' | '\\'))
    {
        format!("\"{}\"", path.replace('\\', "\\\\").replace('"', "\\\""))
    } else {
        path.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command;

    fn git(repo: &Path, args: &[&str]) -> std::process::Output {
        Command::new("git")
            .current_dir(repo)
            .args(args)
            .env("GIT_TERMINAL_PROMPT", "0")
            .output()
            .expect("git")
    }

    #[test]
    fn stages_only_the_selected_hunk_and_leaves_the_other() {
        let temp = tempfile::tempdir().expect("temp");
        let repo = temp.path().join("repo");
        fs::create_dir(&repo).expect("repo");
        assert!(git(&repo, &["init", "-q", "-b", "main"]).status.success());
        assert!(git(&repo, &["config", "user.name", "Hunk Tester"])
            .status
            .success());
        assert!(git(&repo, &["config", "user.email", "hunk@example.com"])
            .status
            .success());
        let original: String = (1..=30).map(|line| format!("line {line}\n")).collect();
        fs::write(repo.join("large file.txt"), &original).expect("file");
        assert!(git(&repo, &["add", "large file.txt"]).status.success());
        assert!(git(&repo, &["commit", "-q", "-m", "base"]).status.success());

        let changed = original
            .replace("line 2\n", "line 2 changed\n")
            .replace("line 28\n", "line 28 changed\n");
        fs::write(repo.join("large file.txt"), changed).expect("changed");
        let diff = git(&repo, &["diff", "--unified=3", "--", "large file.txt"]);
        assert!(diff.status.success());
        let diff = String::from_utf8_lossy(&diff.stdout);
        let hunks: Vec<String> = diff
            .split("\n@@ ")
            .skip(1)
            .map(|hunk| {
                let mut value = format!("@@ {hunk}");
                if !value.ends_with('\n') {
                    value.push('\n');
                }
                value
            })
            .collect();
        assert_eq!(hunks.len(), 2);

        let read_diff =
            |args: &[&str]| String::from_utf8_lossy(&git(&repo, args).stdout).into_owned();

        stage(&repo, "large file.txt", &hunks[0]).expect("stage first hunk");
        let cached = read_diff(&["diff", "--cached", "--", "large file.txt"]);
        assert!(cached.contains("line 2 changed"));
        assert!(!cached.contains("line 28 changed"));
        let unstaged = read_diff(&["diff", "--", "large file.txt"]);
        assert!(!unstaged.contains("line 2 changed"));
        assert!(unstaged.contains("line 28 changed"));

        unstage(&repo, "large file.txt", &hunks[0]).expect("unstage first hunk");
        let cached = read_diff(&["diff", "--cached", "--", "large file.txt"]);
        assert!(cached.trim().is_empty());
        let unstaged = read_diff(&["diff", "--", "large file.txt"]);
        assert!(unstaged.contains("line 2 changed"));
        assert!(unstaged.contains("line 28 changed"));
    }

    #[test]
    fn discards_lines_from_worktree_without_touching_index() {
        let temp = tempfile::tempdir().expect("temp");
        let repo = temp.path().join("repo");
        fs::create_dir(&repo).expect("repo");
        assert!(git(&repo, &["init", "-q", "-b", "main"]).status.success());
        assert!(git(&repo, &["config", "user.name", "Discard Tester"])
            .status
            .success());
        assert!(git(&repo, &["config", "user.email", "discard@example.com"])
            .status
            .success());
        fs::write(repo.join("file.txt"), "one\ntwo\nthree\n").expect("file");
        assert!(git(&repo, &["add", "file.txt"]).status.success());
        assert!(git(&repo, &["commit", "-q", "-m", "base"]).status.success());
        fs::write(repo.join("file.txt"), "one\nchanged\nthree\n").expect("changed");

        let diff = git(&repo, &["diff", "--unified=3", "--", "file.txt"]);
        let text = String::from_utf8_lossy(&diff.stdout);
        let hunk = text
            .split("\n@@ ")
            .nth(1)
            .map(|value| format!("@@ {value}"))
            .expect("hunk");
        discard_lines(&repo, "file.txt", &hunk).expect("discard");
        assert_eq!(
            fs::read_to_string(repo.join("file.txt"))
                .expect("content")
                .replace("\r\n", "\n"),
            "one\ntwo\nthree\n"
        );
        let cached = git(&repo, &["diff", "--cached", "--", "file.txt"]);
        assert!(String::from_utf8_lossy(&cached.stdout).trim().is_empty());
    }

    #[test]
    fn rejects_file_headers_in_hunk_patch() {
        assert!(validate_hunk_patch("diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b\n").is_err());
        assert!(validate_hunk_patch("@@ -1 +1 @@\n-a\n+b\n").is_ok());
    }
}
