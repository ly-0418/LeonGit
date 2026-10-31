use std::path::{Component, Path};

use super::command::run_git_checked;
use super::error::GitError;
use super::types::{DiffLine, DiffLineKind, DiffScope, FileDiff};

const DEFAULT_DIFF_LINES: u32 = 5_000;
const MAX_DIFF_PAGE: u32 = 10_000;

pub(crate) fn read(
    worktree: &Path,
    path: &str,
    original_path: Option<&str>,
    scope: DiffScope,
) -> Result<FileDiff, GitError> {
    read_window(worktree, path, original_path, scope, 0, DEFAULT_DIFF_LINES)
}

pub(crate) fn read_window(
    worktree: &Path,
    path: &str,
    original_path: Option<&str>,
    scope: DiffScope,
    offset: u32,
    limit: u32,
) -> Result<FileDiff, GitError> {
    let path = validate_relative_path(path, "文件路径")?;
    let original_path = original_path
        .map(|value| validate_relative_path(value, "原文件路径"))
        .transpose()?;

    let mut args = vec![
        "diff".to_owned(),
        "--no-color".to_owned(),
        "--no-ext-diff".to_owned(),
        "--no-textconv".to_owned(),
        "--unified=3".to_owned(),
    ];
    match scope {
        DiffScope::Worktree => {}
        DiffScope::Staged => args.push("--cached".to_owned()),
        DiffScope::Head => args.push("HEAD".to_owned()),
    }
    args.push("--".to_owned());
    args.push(path.clone());
    if let Some(original_path) = &original_path {
        args.push(original_path.clone());
    }

    let stdout = run_git_checked(worktree, args)?;
    finish(path, original_path, stdout, offset, limit)
}

pub(crate) fn read_commit(
    worktree: &Path,
    oid: &str,
    path: &str,
    original_path: Option<&str>,
) -> Result<FileDiff, GitError> {
    read_commit_window(worktree, oid, path, original_path, 0, DEFAULT_DIFF_LINES)
}

pub(crate) fn read_commit_window(
    worktree: &Path,
    oid: &str,
    path: &str,
    original_path: Option<&str>,
    offset: u32,
    limit: u32,
) -> Result<FileDiff, GitError> {
    if oid.is_empty()
        || oid.len() > 64
        || !oid.chars().all(|character| character.is_ascii_hexdigit())
    {
        return Err(GitError::invalid_input("提交 SHA 无效。"));
    }

    let path = validate_relative_path(path, "文件路径")?;
    let original_path = original_path
        .map(|value| validate_relative_path(value, "原文件路径"))
        .transpose()?;

    let mut args = vec![
        "show".to_owned(),
        "--format=".to_owned(),
        "--no-color".to_owned(),
        "--no-ext-diff".to_owned(),
        "--no-textconv".to_owned(),
        "--unified=3".to_owned(),
        oid.to_owned(),
        "--".to_owned(),
        path.clone(),
    ];
    if let Some(original_path) = &original_path {
        args.push(original_path.clone());
    }

    let stdout = run_git_checked(worktree, args)?;
    finish(path, original_path, stdout, offset, limit)
}

fn finish(
    path: String,
    original_path: Option<String>,
    stdout: Vec<u8>,
    offset: u32,
    limit: u32,
) -> Result<FileDiff, GitError> {
    let text = String::from_utf8_lossy(&stdout);
    let has_invalid_utf8 = std::str::from_utf8(&stdout).is_err();
    let offset = offset as usize;
    let limit = (limit as usize).clamp(1, MAX_DIFF_PAGE as usize);
    let (lines, is_binary, total_lines) = parse_window(&text, offset, limit);
    let truncated = offset.saturating_add(lines.len()) < total_lines;

    Ok(FileDiff {
        path,
        original_path,
        lines,
        is_binary,
        truncated,
        has_invalid_utf8,
        total_lines: total_lines.min(u32::MAX as usize) as u32,
    })
}

pub(crate) fn validate_relative_path(path: &str, label: &str) -> Result<String, GitError> {
    if path.is_empty() {
        return Err(GitError::invalid_input(format!("{label}不能为空。")));
    }
    if path.chars().any(char::is_control) {
        return Err(GitError::invalid_input(format!(
            "{label}不能包含换行或控制字符。"
        )));
    }

    let candidate = Path::new(path);
    if candidate.is_absolute()
        || candidate.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(GitError::invalid_input(format!(
            "{label}必须是仓库内的相对路径。"
        )));
    }

    Ok(path.replace('\\', "/"))
}

#[cfg(test)]
fn parse(text: &str) -> (Vec<DiffLine>, bool) {
    let (lines, binary, _) = parse_window(text, 0, usize::MAX);
    (lines, binary)
}

fn parse_window(text: &str, offset: usize, limit: usize) -> (Vec<DiffLine>, bool, usize) {
    let total_lines = text.lines().count();
    let end = offset.saturating_add(limit);
    let mut lines = Vec::new();
    let mut in_hunk = false;
    let mut is_binary = false;
    let mut old_cursor = 0u32;
    let mut new_cursor = 0u32;

    for (index, raw) in text.lines().enumerate() {
        let visible = index >= offset && index < end;
        let line = raw.strip_suffix('\r').unwrap_or(raw);

        if line.starts_with("@@") {
            in_hunk = true;
            if let Some((old_start, new_start)) = parse_hunk_ranges(line) {
                old_cursor = old_start;
                new_cursor = new_start;
            }
            if visible {
                lines.push(DiffLine {
                    kind: DiffLineKind::Hunk,
                    content: line.to_owned(),
                    old_line: None,
                    new_line: None,
                });
            }
            continue;
        }

        if in_hunk {
            match line.chars().next() {
                Some('+') => {
                    if visible {
                        lines.push(DiffLine {
                            kind: DiffLineKind::Addition,
                            content: line[1..].to_owned(),
                            old_line: None,
                            new_line: Some(new_cursor),
                        });
                    }
                    new_cursor = new_cursor.saturating_add(1);
                    continue;
                }
                Some('-') => {
                    if visible {
                        lines.push(DiffLine {
                            kind: DiffLineKind::Deletion,
                            content: line[1..].to_owned(),
                            old_line: Some(old_cursor),
                            new_line: None,
                        });
                    }
                    old_cursor = old_cursor.saturating_add(1);
                    continue;
                }
                Some(' ') => {
                    if visible {
                        lines.push(DiffLine {
                            kind: DiffLineKind::Context,
                            content: line[1..].to_owned(),
                            old_line: Some(old_cursor),
                            new_line: Some(new_cursor),
                        });
                    }
                    old_cursor = old_cursor.saturating_add(1);
                    new_cursor = new_cursor.saturating_add(1);
                    continue;
                }
                Some('\\') => {
                    if visible {
                        lines.push(meta_line(line));
                    }
                    continue;
                }
                _ => {
                    in_hunk = false;
                }
            }
        }

        if line.starts_with("Binary files ")
            || line.starts_with("GIT binary patch")
            || line == "-\t-"
        {
            is_binary = true;
        }
        if visible {
            lines.push(meta_line(line));
        }
    }

    (lines, is_binary, total_lines)
}

fn parse_hunk_ranges(line: &str) -> Option<(u32, u32)> {
    let mut parts = line.split_whitespace();
    parts.next()?; // "@@"
    let old = parts.next()?;
    let new = parts.next()?;
    Some((parse_range_start(old)?, parse_range_start(new)?))
}

fn parse_range_start(field: &str) -> Option<u32> {
    let mut chars = field.chars();
    let sign = chars.next()?;
    if sign != '-' && sign != '+' {
        return None;
    }
    chars.as_str().split(',').next()?.parse().ok()
}

fn meta_line(line: &str) -> DiffLine {
    DiffLine {
        kind: DiffLineKind::Meta,
        content: line.to_owned(),
        old_line: None,
        new_line: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_add_delete_context_and_line_numbers() {
        let diff = "\
diff --git a/a.txt b/a.txt
index 111..222 100644
--- a/a.txt
+++ b/a.txt
@@ -1,3 +1,4 @@
 one
-two
+three
+four
 three
";
        let (lines, binary) = parse(diff);
        assert!(!binary);
        assert_eq!(lines[4].kind, DiffLineKind::Hunk);
        assert_eq!(lines[5].kind, DiffLineKind::Context);
        assert_eq!(lines[5].old_line, Some(1));
        assert_eq!(lines[5].new_line, Some(1));
        assert_eq!(lines[6].kind, DiffLineKind::Deletion);
        assert_eq!(lines[6].old_line, Some(2));
        assert_eq!(lines[7].kind, DiffLineKind::Addition);
        assert_eq!(lines[7].new_line, Some(2));
        assert_eq!(lines[9].old_line, Some(3));
        assert_eq!(lines[9].new_line, Some(4));
    }

    #[test]
    fn detects_binary_diff() {
        let (lines, binary) = parse("Binary files a/logo.png and b/logo.png differ\n");
        assert!(binary);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].kind, DiffLineKind::Meta);
    }

    #[test]
    fn rejects_paths_outside_worktree() {
        assert!(validate_relative_path("../secret", "路径").is_err());
        assert!(validate_relative_path("C:\\secret", "路径").is_err());
        assert_eq!(
            validate_relative_path("src/App.tsx", "路径").expect("relative path"),
            "src/App.tsx"
        );
        assert_eq!(
            validate_relative_path(" leading-space.txt", "路径").expect("space path"),
            " leading-space.txt"
        );
        assert!(validate_relative_path("bad\nname", "路径").is_err());
    }

    #[test]
    fn keeps_invalid_utf8_visible_with_replacement_characters() {
        let diff = finish(
            "binary-ish.txt".to_owned(),
            None,
            b"diff --git a/x b/x\n\xff\xfe\n".to_vec(),
            0,
            DEFAULT_DIFF_LINES,
        )
        .expect("diff");
        assert!(!diff.is_binary);
        assert!(diff.has_invalid_utf8);
        assert!(diff
            .lines
            .iter()
            .any(|line| line.content.contains('\u{FFFD}')));
    }

    #[test]
    fn truncates_large_diffs_and_reports_total_lines() {
        let mut text = String::from("diff --git a/big.txt b/big.txt\n@@ -1 +1 @@\n");
        for _ in 0..5_100 {
            text.push_str("+line\n");
        }
        let diff = finish(
            "big.txt".to_owned(),
            None,
            text.into_bytes(),
            0,
            DEFAULT_DIFF_LINES,
        )
        .expect("diff");
        assert!(diff.truncated);
        assert_eq!(diff.lines.len(), DEFAULT_DIFF_LINES as usize);
        assert!(diff.total_lines > DEFAULT_DIFF_LINES);
    }

    #[test]
    fn page_offset_preserves_hunk_line_numbers() {
        let text = "\
diff --git a/a.txt b/a.txt
@@ -1 +1,3 @@
 one
+two
+three
";
        let (first, _, total) = parse_window(text, 0, 3);
        let (context, _, _) = parse_window(text, 2, 1);
        let (second, _, _) = parse_window(text, 3, 3);
        assert_eq!(total, 5);
        assert_eq!(first.len(), 3);
        assert_eq!(context.len(), 1);
        assert_eq!(context[0].kind, DiffLineKind::Context);
        assert_eq!(context[0].old_line, Some(1));
        assert_eq!(context[0].new_line, Some(1));
        assert_eq!(second.len(), 2);
        assert_eq!(second[0].kind, DiffLineKind::Addition);
        assert_eq!(second[0].new_line, Some(2));
        assert_eq!(second[1].kind, DiffLineKind::Addition);
        assert_eq!(second[1].new_line, Some(3));
    }
}
