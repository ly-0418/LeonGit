use std::path::{Component, Path};

use super::command::run_git_checked;
use super::error::GitError;
use super::types::{DiffLine, DiffLineKind, DiffScope, FileDiff};

const MAX_DIFF_BYTES: usize = 1_500_000;
const MAX_DIFF_LINES: usize = 6_000;

pub(crate) fn read(
    worktree: &Path,
    path: &str,
    original_path: Option<&str>,
    scope: DiffScope,
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
    finish(path, original_path, stdout)
}

pub(crate) fn read_commit(
    worktree: &Path,
    oid: &str,
    path: &str,
    original_path: Option<&str>,
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
    finish(path, original_path, stdout)
}

fn finish(
    path: String,
    original_path: Option<String>,
    stdout: Vec<u8>,
) -> Result<FileDiff, GitError> {
    let truncated_by_bytes = stdout.len() > MAX_DIFF_BYTES;
    let visible = if truncated_by_bytes {
        &stdout[..MAX_DIFF_BYTES]
    } else {
        stdout.as_slice()
    };

    if !truncated_by_bytes && std::str::from_utf8(visible).is_err() {
        return Ok(FileDiff {
            path,
            original_path,
            lines: vec![DiffLine {
                kind: DiffLineKind::Meta,
                content: "文件包含非 UTF-8 字节，已禁用 hunk 操作以避免误写。".to_owned(),
                old_line: None,
                new_line: None,
            }],
            is_binary: true,
            truncated: false,
        });
    }

    let (mut lines, is_binary) = parse(&String::from_utf8_lossy(visible));
    let mut truncated = truncated_by_bytes;
    if lines.len() > MAX_DIFF_LINES {
        lines.truncate(MAX_DIFF_LINES);
        truncated = true;
    }
    if truncated {
        lines.push(DiffLine {
            kind: DiffLineKind::Meta,
            content: "… diff 输出过长，已截断。".to_owned(),
            old_line: None,
            new_line: None,
        });
    }

    Ok(FileDiff {
        path,
        original_path,
        lines,
        is_binary,
        truncated,
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

fn parse(text: &str) -> (Vec<DiffLine>, bool) {
    let mut lines = Vec::new();
    let mut in_hunk = false;
    let mut is_binary = false;
    let mut old_cursor = 0u32;
    let mut new_cursor = 0u32;

    for raw in text.lines() {
        let line = raw.strip_suffix('\r').unwrap_or(raw);

        if line.starts_with("@@") {
            in_hunk = true;
            if let Some((old_start, new_start)) = parse_hunk_ranges(line) {
                old_cursor = old_start;
                new_cursor = new_start;
            }
            lines.push(DiffLine {
                kind: DiffLineKind::Hunk,
                content: line.to_owned(),
                old_line: None,
                new_line: None,
            });
            continue;
        }

        if in_hunk {
            match line.chars().next() {
                Some('+') => {
                    lines.push(DiffLine {
                        kind: DiffLineKind::Addition,
                        content: line[1..].to_owned(),
                        old_line: None,
                        new_line: Some(new_cursor),
                    });
                    new_cursor = new_cursor.saturating_add(1);
                    continue;
                }
                Some('-') => {
                    lines.push(DiffLine {
                        kind: DiffLineKind::Deletion,
                        content: line[1..].to_owned(),
                        old_line: Some(old_cursor),
                        new_line: None,
                    });
                    old_cursor = old_cursor.saturating_add(1);
                    continue;
                }
                Some(' ') => {
                    lines.push(DiffLine {
                        kind: DiffLineKind::Context,
                        content: line[1..].to_owned(),
                        old_line: Some(old_cursor),
                        new_line: Some(new_cursor),
                    });
                    old_cursor = old_cursor.saturating_add(1);
                    new_cursor = new_cursor.saturating_add(1);
                    continue;
                }
                Some('\\') => {
                    lines.push(meta_line(line));
                    continue;
                }
                _ => {
                    in_hunk = false;
                }
            }
        }

        if line.starts_with("Binary files ") || line.starts_with("GIT binary patch") {
            is_binary = true;
        }
        lines.push(meta_line(line));
    }

    (lines, is_binary)
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
    fn marks_invalid_utf8_diff_as_binary() {
        let diff = finish(
            "binary-ish.txt".to_owned(),
            None,
            b"diff --git a/x b/x\n\xff\xfe".to_vec(),
        )
        .expect("diff");
        assert!(diff.is_binary);
        assert!(diff
            .lines
            .iter()
            .any(|line| line.content.contains("非 UTF-8")));
    }
}
