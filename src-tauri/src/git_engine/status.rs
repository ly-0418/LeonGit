use std::path::Path;

use super::command::run_git_checked;
use super::error::GitError;
use super::types::{FileChangeKind, HeadState, StatusFile, WorkingTreeFiles, WorkingTreeSummary};

#[derive(Debug)]
pub(crate) struct StatusData {
    pub head: HeadState,
    pub summary: WorkingTreeSummary,
    pub files: WorkingTreeFiles,
}

#[derive(Debug, Default, PartialEq, Eq)]
struct BranchHeaders {
    oid: Option<String>,
    branch: Option<String>,
    detached: bool,
    upstream: Option<String>,
    ahead: u32,
    behind: u32,
}

pub(crate) fn read(worktree: &Path) -> Result<StatusData, GitError> {
    let stdout = run_git_checked(
        worktree,
        [
            "status",
            "--porcelain=v2",
            "--branch",
            "--untracked-files=normal",
            "-z",
        ],
    )?;
    parse(&stdout)
}

fn parse(bytes: &[u8]) -> Result<StatusData, GitError> {
    let records: Vec<&[u8]> = bytes
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
        .collect();

    let mut headers = BranchHeaders::default();
    let mut files = WorkingTreeFiles::default();
    let mut index = 0;

    while index < records.len() {
        let record = records[index];

        if let Some(header) = record.strip_prefix(b"# ") {
            parse_branch_header(header, &mut headers);
        } else if record.starts_with(b"1 ") {
            let fields = split_record(record, 9, "普通变更")?;
            let xy = fields[1];
            ensure_xy(xy)?;
            let path = path_string(fields[8])?;
            push_index_change(&mut files.staged, xy[0], &path, None);
            push_worktree_change(&mut files.unstaged, xy[1], &path, None);
        } else if record.starts_with(b"2 ") {
            let fields = split_record(record, 10, "重命名变更")?;
            let xy = fields[1];
            ensure_xy(xy)?;
            let path = path_string(fields[9])?;
            let original = records
                .get(index + 1)
                .ok_or_else(|| GitError::invalid_output("git status 的重命名记录缺少原路径。"))?;
            let original_path = path_string(original)?;

            push_index_change(&mut files.staged, xy[0], &path, Some(original_path.clone()));
            push_worktree_change(&mut files.unstaged, xy[1], &path, Some(original_path));

            // Rename/copy records own a second NUL-delimited field (the old path).
            index += 1;
        } else if record.starts_with(b"u ") {
            let fields = split_record(record, 11, "冲突变更")?;
            files.conflicted.push(StatusFile {
                path: path_string(fields[10])?,
                original_path: None,
                change: FileChangeKind::Conflicted,
            });
        } else if record.starts_with(b"? ") {
            files.untracked.push(StatusFile {
                path: path_string(&record[2..])?,
                original_path: None,
                change: FileChangeKind::Untracked,
            });
        } else if record.starts_with(b"! ") {
            // Ignored paths do not affect the working tree summary.
        } else {
            return Err(GitError::invalid_output(format!(
                "无法识别的 git status 记录：{}",
                String::from_utf8_lossy(&record[..record.len().min(48)])
            )));
        }

        index += 1;
    }

    files
        .staged
        .sort_by(|left, right| left.path.cmp(&right.path));
    files
        .unstaged
        .sort_by(|left, right| left.path.cmp(&right.path));
    files
        .untracked
        .sort_by(|left, right| left.path.cmp(&right.path));
    files
        .conflicted
        .sort_by(|left, right| left.path.cmp(&right.path));

    let summary = files.summary();
    let head = HeadState {
        branch: headers.branch,
        detached: headers.detached,
        oid: headers.oid,
        short_oid: None,
        upstream: headers.upstream,
        ahead: headers.ahead,
        behind: headers.behind,
    };

    Ok(StatusData {
        head,
        summary,
        files,
    })
}

fn parse_branch_header(header: &[u8], headers: &mut BranchHeaders) {
    let header = String::from_utf8_lossy(header);
    let mut parts = header.split_whitespace();

    match parts.next() {
        Some("branch.oid") => {
            if let Some(value) = parts.next() {
                if value != "(initial)" && !value.is_empty() {
                    headers.oid = Some(value.to_owned());
                }
            }
        }
        Some("branch.head") => {
            if let Some(value) = parts.next() {
                if value == "(detached)" {
                    headers.detached = true;
                    headers.branch = None;
                } else {
                    headers.branch = Some(value.to_owned());
                }
            }
        }
        Some("branch.upstream") => {
            if let Some(value) = parts.next() {
                headers.upstream = Some(value.to_owned());
            }
        }
        Some("branch.ab") => {
            if let (Some(ahead), Some(behind)) = (parts.next(), parts.next()) {
                headers.ahead = ahead
                    .strip_prefix('+')
                    .and_then(|value| value.parse().ok())
                    .unwrap_or(0);
                headers.behind = behind
                    .strip_prefix('-')
                    .and_then(|value| value.parse().ok())
                    .unwrap_or(0);
            }
        }
        _ => {}
    }
}

fn split_record<'a>(
    record: &'a [u8],
    field_count: usize,
    record_kind: &str,
) -> Result<Vec<&'a [u8]>, GitError> {
    let fields: Vec<&[u8]> = record.splitn(field_count, |byte| *byte == b' ').collect();
    if fields.len() != field_count {
        return Err(GitError::invalid_output(format!(
            "git status 的{record_kind}记录字段不完整。"
        )));
    }
    Ok(fields)
}

fn ensure_xy(xy: &[u8]) -> Result<(), GitError> {
    if xy.len() != 2 {
        return Err(GitError::invalid_output(
            "git status 返回了无效的文件状态码。",
        ));
    }
    Ok(())
}

fn path_string(path: &[u8]) -> Result<String, GitError> {
    String::from_utf8(path.to_vec()).map_err(|_| {
        GitError::invalid_output(
            "仓库中存在当前系统无法以 UTF-8 表示的路径，已停止操作以避免误写文件。",
        )
    })
}

fn push_index_change(
    target: &mut Vec<StatusFile>,
    code: u8,
    path: &str,
    original_path: Option<String>,
) {
    if let Some(change) = change_for_code(code) {
        target.push(StatusFile {
            path: path.to_owned(),
            original_path,
            change,
        });
    }
}

fn push_worktree_change(
    target: &mut Vec<StatusFile>,
    code: u8,
    path: &str,
    original_path: Option<String>,
) {
    if let Some(change) = change_for_code(code) {
        target.push(StatusFile {
            path: path.to_owned(),
            original_path,
            change,
        });
    }
}

fn change_for_code(code: u8) -> Option<FileChangeKind> {
    match code {
        b'.' => None,
        b'M' => Some(FileChangeKind::Modified),
        b'A' => Some(FileChangeKind::Added),
        b'D' => Some(FileChangeKind::Deleted),
        b'R' => Some(FileChangeKind::Renamed),
        b'C' => Some(FileChangeKind::Copied),
        b'T' => Some(FileChangeKind::TypeChanged),
        b'U' => Some(FileChangeKind::Conflicted),
        b'?' => Some(FileChangeKind::Untracked),
        _ => Some(FileChangeKind::Other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"# branch.oid abcdef1234567890\0");
        bytes.extend_from_slice(b"# branch.head feature/offline\0");
        bytes.extend_from_slice(b"# branch.upstream origin/feature/offline\0");
        bytes.extend_from_slice(b"# branch.ab +2 -1\0");
        bytes.extend_from_slice(b"1 M. N... 100644 100644 100644 aaa bbb src/staged file.ts\0");
        bytes.extend_from_slice(b"1 .M N... 100644 100644 100644 aaa bbb src/unstaged.ts\0");
        bytes.extend_from_slice(b"2 R. N... 100644 100644 100644 aaa bbb R100 src/new name.ts\0");
        bytes.extend_from_slice(b"src/old name.ts\0");
        bytes.extend_from_slice(b"? notes with spaces.txt\0");
        bytes.extend_from_slice(b"u UU N... 100644 100644 100644 100644 aaa bbb ccc conflict.ts\0");
        bytes
    }

    #[test]
    fn parses_branch_headers_and_file_groups() {
        let data = parse(&fixture()).expect("status should parse");

        assert_eq!(data.head.branch.as_deref(), Some("feature/offline"));
        assert!(!data.head.detached);
        assert_eq!(data.head.oid.as_deref(), Some("abcdef1234567890"));
        assert_eq!(
            data.head.upstream.as_deref(),
            Some("origin/feature/offline")
        );
        assert_eq!(data.head.ahead, 2);
        assert_eq!(data.head.behind, 1);

        assert_eq!(data.summary.staged, 2);
        assert_eq!(data.summary.unstaged, 1);
        assert_eq!(data.summary.untracked, 1);
        assert_eq!(data.summary.conflicted, 1);
        assert!(!data.summary.is_clean);

        assert_eq!(data.files.staged[0].path, "src/new name.ts");
        assert_eq!(
            data.files.staged[0].original_path.as_deref(),
            Some("src/old name.ts")
        );
        assert_eq!(data.files.staged[0].change, FileChangeKind::Renamed);
        assert_eq!(data.files.staged[1].path, "src/staged file.ts");
        assert_eq!(data.files.staged[1].change, FileChangeKind::Modified);

        assert_eq!(data.files.unstaged[0].path, "src/unstaged.ts");
        assert_eq!(data.files.unstaged[0].change, FileChangeKind::Modified);
        assert_eq!(data.files.untracked[0].path, "notes with spaces.txt");
        assert_eq!(data.files.untracked[0].change, FileChangeKind::Untracked);
        assert_eq!(data.files.conflicted[0].path, "conflict.ts");
        assert_eq!(data.files.conflicted[0].change, FileChangeKind::Conflicted);
    }

    #[test]
    fn parses_detached_clean_repository() {
        let bytes = b"# branch.oid abcdef\0# branch.head (detached)\0# branch.ab +0 -0\0".to_vec();
        let data = parse(&bytes).expect("status should parse");

        assert!(data.head.detached);
        assert_eq!(data.head.branch, None);
        assert!(data.summary.is_clean);
        assert!(data.files.staged.is_empty());
        assert!(data.files.unstaged.is_empty());
        assert!(data.files.untracked.is_empty());
        assert!(data.files.conflicted.is_empty());
    }

    #[test]
    fn parses_unborn_repository() {
        let bytes = b"# branch.oid (initial)\0# branch.head main\0".to_vec();
        let data = parse(&bytes).expect("status should parse");

        assert_eq!(data.head.oid, None);
        assert_eq!(data.head.branch.as_deref(), Some("main"));
        assert!(data.summary.is_clean);
    }

    #[test]
    fn rejects_non_utf8_file_paths() {
        assert!(path_string(b"valid.txt").is_ok());
        assert!(path_string(&[0xff, 0xfe]).is_err());
    }
}
