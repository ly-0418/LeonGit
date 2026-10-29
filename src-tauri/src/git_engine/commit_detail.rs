use std::path::Path;

use super::command::run_git_checked;
use super::diff;
use super::error::GitError;
use super::log;
use super::types::{CommitDetail, CommitFileChange, FileChangeKind, FileDiff};

pub(crate) fn read(worktree: &Path, oid: &str) -> Result<CommitDetail, GitError> {
    validate_oid(oid)?;

    let pretty = format!(
        "--pretty=format:%H{sep}%h{sep}%an{sep}%ae{sep}%at{sep}%D{sep}%s{sep}%B",
        sep = '\u{1f}'
    );
    let stdout = run_git_checked(
        worktree,
        [
            "show",
            "--no-color",
            "--decorate=full",
            "--date=unix",
            "--no-patch",
            pretty.as_str(),
            oid,
        ],
    )?;
    let text = String::from_utf8_lossy(&stdout);
    let mut fields = text.splitn(8, '\u{1f}');
    let full_oid = required(&mut fields, "提交 SHA")?;
    let short_oid = required(&mut fields, "短 SHA")?;
    let author_name = required(&mut fields, "作者名")?;
    let author_email = required(&mut fields, "作者邮箱")?;
    let authored_at = required(&mut fields, "作者时间")?
        .parse::<i64>()
        .map_err(|_| GitError::invalid_output("提交时间戳不是有效的 Unix 时间。"))?;
    let decorations = required(&mut fields, "分支标记")?;
    let subject = required(&mut fields, "提交标题")?;
    let message = fields
        .next()
        .unwrap_or_default()
        .trim_end_matches(['\r', '\n'])
        .to_owned();
    let (is_head, refs) = log::parse_decorations(&decorations);

    Ok(CommitDetail {
        oid: full_oid,
        short_oid,
        subject,
        message,
        author_name,
        author_email,
        authored_at,
        refs,
        is_head,
        files: read_files(worktree, oid)?,
    })
}

pub(crate) fn file_diff(
    worktree: &Path,
    oid: &str,
    path: &str,
    original_path: Option<&str>,
) -> Result<FileDiff, GitError> {
    validate_oid(oid)?;
    diff::read_commit(worktree, oid, path, original_path)
}

fn read_files(worktree: &Path, oid: &str) -> Result<Vec<CommitFileChange>, GitError> {
    let stdout = run_git_checked(
        worktree,
        [
            "diff-tree",
            "--no-commit-id",
            "--name-status",
            "-r",
            "-z",
            "--root",
            "-M",
            oid,
        ],
    )?;
    let mut files = parse_name_status(&stdout)?;
    files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(files)
}

fn parse_name_status(bytes: &[u8]) -> Result<Vec<CommitFileChange>, GitError> {
    let records: Vec<&[u8]> = bytes
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
        .collect();
    let mut files = Vec::new();
    let mut index = 0;

    while index < records.len() {
        let status = records[index];
        let change = match status.first().copied() {
            Some(b'A') => FileChangeKind::Added,
            Some(b'M') => FileChangeKind::Modified,
            Some(b'D') => FileChangeKind::Deleted,
            Some(b'R') => FileChangeKind::Renamed,
            Some(b'C') => FileChangeKind::Copied,
            Some(b'T') => FileChangeKind::TypeChanged,
            _ => FileChangeKind::Other,
        };

        if matches!(change, FileChangeKind::Renamed | FileChangeKind::Copied) {
            let original = records
                .get(index + 1)
                .ok_or_else(|| GitError::invalid_output("提交文件列表缺少重命名原路径。"))?;
            let path = records
                .get(index + 2)
                .ok_or_else(|| GitError::invalid_output("提交文件列表缺少重命名新路径。"))?;
            files.push(CommitFileChange {
                path: path_string(path),
                original_path: Some(path_string(original)),
                change,
            });
            index += 3;
        } else {
            let path = records
                .get(index + 1)
                .ok_or_else(|| GitError::invalid_output("提交文件列表缺少文件路径。"))?;
            files.push(CommitFileChange {
                path: path_string(path),
                original_path: None,
                change,
            });
            index += 2;
        }
    }

    Ok(files)
}

fn path_string(path: &[u8]) -> String {
    String::from_utf8_lossy(path).into_owned()
}

fn required<'a>(
    fields: &mut impl Iterator<Item = &'a str>,
    field: &str,
) -> Result<String, GitError> {
    fields
        .next()
        .map(ToOwned::to_owned)
        .ok_or_else(|| GitError::invalid_output(format!("提交详情缺少{field}。")))
}

fn validate_oid(oid: &str) -> Result<(), GitError> {
    let oid = oid.trim();
    if oid.len() < 7
        || oid.len() > 64
        || !oid.chars().all(|character| character.is_ascii_hexdigit())
    {
        return Err(GitError::invalid_input("提交 SHA 无效。"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_rename_and_file_statuses() {
        let bytes = b"D\0deleted.txt\0R100\0old.txt\0new.txt\0A\0added.txt\0";
        let files = parse_name_status(bytes).expect("name status");
        assert_eq!(files.len(), 3);
        assert_eq!(files[0].path, "deleted.txt");
        assert_eq!(files[0].change, FileChangeKind::Deleted);
        assert_eq!(files[1].path, "new.txt");
        assert_eq!(files[1].original_path.as_deref(), Some("old.txt"));
        assert_eq!(files[1].change, FileChangeKind::Renamed);
        assert_eq!(files[2].change, FileChangeKind::Added);
    }

    #[test]
    fn validates_commit_sha() {
        assert!(validate_oid("--help").is_err());
        assert!(validate_oid("abc").is_err());
        assert!(validate_oid("d4216b2494660dc72376b83f17eef0cb81a40ca6").is_ok());
    }
}
