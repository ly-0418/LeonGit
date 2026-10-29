use std::collections::HashSet;
use std::path::Path;

use super::command::{run_git, run_git_checked};
use super::diff;
use super::error::GitError;
use super::types::{CommitPage, CommitRef, CommitRefKind, CommitSummary};

const FIELD_SEPARATOR: char = '\u{1f}';
const MAX_PAGE_SIZE: u32 = 500;

pub(crate) fn list(worktree: &Path, offset: u32, limit: u32) -> Result<CommitPage, GitError> {
    let limit = limit.clamp(1, MAX_PAGE_SIZE);

    if !has_head(worktree)? {
        return Ok(CommitPage {
            commits: Vec::new(),
            offset,
            limit,
            has_more: false,
        });
    }

    let fetch_count = limit.saturating_add(1);
    let pretty = commit_pretty_format();
    let args = vec![
        "log".to_owned(),
        "--no-color".to_owned(),
        "--decorate=full".to_owned(),
        "--date=unix".to_owned(),
        format!("--max-count={fetch_count}"),
        format!("--skip={offset}"),
        pretty,
    ];

    let stdout = run_git_checked(worktree, args)?;
    parse(&stdout, offset, limit)
}

pub(crate) fn search(
    worktree: &Path,
    pattern: &str,
    page: u32,
    page_size: u32,
) -> Result<CommitPage, GitError> {
    let pattern = pattern.trim();
    if pattern.is_empty() {
        return Err(GitError::invalid_input("搜索关键词不能为空。"));
    }
    if pattern.chars().count() > 512 {
        return Err(GitError::invalid_input(
            "搜索关键词过长，请缩短到 512 个字符以内。",
        ));
    }
    let limit = page_size.clamp(1, MAX_PAGE_SIZE);
    let offset = page.saturating_mul(limit);

    if !has_head(worktree)? {
        return Ok(CommitPage {
            commits: Vec::new(),
            offset,
            limit,
            has_more: false,
        });
    }

    let fetch_count = limit.saturating_add(1);
    let pretty = commit_pretty_format();
    let args = vec![
        "log".to_owned(),
        "--no-color".to_owned(),
        "--no-decorate".to_owned(),
        "--date=unix".to_owned(),
        "--grep".to_owned(),
        pattern.to_owned(),
        "--max-count".to_owned(),
        fetch_count.to_string(),
        "--skip".to_owned(),
        offset.to_string(),
        pretty,
    ];
    let stdout = run_git_checked(worktree, args)?;
    parse(&stdout, offset, limit)
}

fn commit_pretty_format() -> String {
    format!(
        "--pretty=format:%H{sep}%h{sep}%P{sep}%an{sep}%ae{sep}%at{sep}%D{sep}%s",
        sep = FIELD_SEPARATOR
    )
}

fn has_head(worktree: &Path) -> Result<bool, GitError> {
    let output = run_git(worktree, ["rev-parse", "--verify", "--quiet", "HEAD"])?;
    Ok(output.status.success())
}

pub(crate) fn file_history(
    worktree: &Path,
    file_path: &str,
    page: u32,
    page_size: u32,
) -> Result<CommitPage, GitError> {
    let path = diff::validate_relative_path(file_path, "文件路径")?;
    let limit = page_size.clamp(1, MAX_PAGE_SIZE);
    let offset = page.saturating_mul(limit);
    if !has_head(worktree)? {
        return Ok(CommitPage {
            commits: Vec::new(),
            offset,
            limit,
            has_more: false,
        });
    }

    let fetch_count = limit.saturating_add(1);
    let pretty = commit_pretty_format();
    let args = vec![
        "log".to_owned(),
        "--follow".to_owned(),
        "-M".to_owned(),
        "--no-decorate".to_owned(),
        "--no-color".to_owned(),
        "--date=unix".to_owned(),
        "-m".to_owned(),
        "-z".to_owned(),
        "--name-status".to_owned(),
        "--max-count".to_owned(),
        fetch_count.to_string(),
        "--skip".to_owned(),
        offset.to_string(),
        pretty,
        "--".to_owned(),
        path,
    ];
    let stdout = run_git_checked(worktree, args)?;
    parse_file_history(&stdout, offset, limit)
}

fn parse_file_history(bytes: &[u8], offset: u32, limit: u32) -> Result<CommitPage, GitError> {
    let text = String::from_utf8_lossy(bytes);
    let mut commits: Vec<CommitSummary> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut has_more = false;
    let mut current: Option<CommitSummary> = None;
    let mut status: Option<String> = None;
    let mut awaiting_new_path = false;

    // `-z` keeps paths verbatim and separate from status fields. A commit
    // header is followed by `\n` plus the first status; each path is then its
    // own NUL-separated field and an empty field closes the commit record.
    for field in text.split('\0') {
        if field.is_empty() {
            status = None;
            awaiting_new_path = false;
            continue;
        }

        if let Some(header) = commit_header(field) {
            if let Some(commit) = current.take() {
                push_file_commit(commit, &mut commits, &mut seen, limit, &mut has_more);
                if has_more {
                    break;
                }
            }
            current = Some(parse_commit_fields(header, offset, limit)?);
            status = header_status(field);
            awaiting_new_path = false;
            continue;
        }

        let Some(commit) = current.as_mut() else {
            continue;
        };

        if status.is_none() {
            if is_file_status(field) {
                status = Some(field.to_owned());
            }
            continue;
        }

        if awaiting_new_path {
            awaiting_new_path = false;
            status = None;
            continue;
        }

        let current_status = status.as_deref().unwrap_or_default();
        if current_status.starts_with('R') || current_status.starts_with('C') {
            if commit.renamed_from.is_none() {
                commit.renamed_from = Some(field.to_owned());
            }
            awaiting_new_path = true;
        } else {
            status = None;
        }
    }

    if !has_more {
        if let Some(commit) = current {
            push_file_commit(commit, &mut commits, &mut seen, limit, &mut has_more);
        }
    }

    Ok(CommitPage {
        commits,
        offset,
        limit,
        has_more,
    })
}

/// `git log -m` repeats a merge header once per parent. Keep one row per oid
/// and preserve the rename information found in the first section.
fn push_file_commit(
    commit: CommitSummary,
    commits: &mut Vec<CommitSummary>,
    seen: &mut HashSet<String>,
    limit: u32,
    has_more: &mut bool,
) {
    if !seen.insert(commit.oid.clone()) {
        if let Some(existing) = commits.iter_mut().find(|item| item.oid == commit.oid) {
            if existing.renamed_from.is_none() {
                existing.renamed_from = commit.renamed_from;
            }
        }
        return;
    }

    commits.push(commit);
    if commits.len() > limit as usize {
        commits.truncate(limit as usize);
        *has_more = true;
    }
}

fn commit_header(field: &str) -> Option<&str> {
    let header = field
        .split_once('\n')
        .map(|(header, _)| header)
        .unwrap_or(field);
    if is_commit_line(header) {
        Some(header)
    } else {
        None
    }
}

fn header_status(field: &str) -> Option<String> {
    field
        .split_once('\n')
        .map(|(_, rest)| rest.trim())
        .filter(|rest| !rest.is_empty())
        .map(ToOwned::to_owned)
}

fn is_file_status(field: &str) -> bool {
    let bytes = field.as_bytes();
    if bytes.is_empty() || bytes.len() > 4 {
        return false;
    }

    match bytes[0] {
        b'M' | b'A' | b'D' | b'T' | b'U' | b'X' | b'B' => bytes.len() == 1,
        b'R' | b'C' => bytes.len() >= 2 && bytes[1..].iter().all(u8::is_ascii_digit),
        _ => false,
    }
}

fn is_commit_line(line: &str) -> bool {
    let oid = line.split(FIELD_SEPARATOR).next().unwrap_or_default();
    (oid.len() == 40 || oid.len() == 64)
        && oid.chars().all(|character| character.is_ascii_hexdigit())
}

fn parse_commit_fields(line: &str, offset: u32, limit: u32) -> Result<CommitSummary, GitError> {
    let mut fields = line.splitn(8, FIELD_SEPARATOR);
    let oid = required_field(&mut fields, "commit oid")?;
    let short_oid = required_field(&mut fields, "short oid")?;
    let parents = required_field(&mut fields, "parents")?;
    let author_name = required_field(&mut fields, "author name")?;
    let author_email = required_field(&mut fields, "author email")?;
    let authored_at = required_field(&mut fields, "author timestamp")?;
    let decorations = required_field(&mut fields, "decorations")?;
    let subject = fields.next().map(ToOwned::to_owned).unwrap_or_default();

    let authored_at = authored_at
        .parse::<i64>()
        .map_err(|_| GitError::invalid_output("提交时间戳不是有效的 Unix 时间。".to_owned()))?;
    let (is_head, refs) = parse_decorations(&decorations);
    let _ = (offset, limit);

    Ok(CommitSummary {
        oid,
        short_oid,
        parents: parents.split_whitespace().map(ToOwned::to_owned).collect(),
        author_name,
        author_email,
        authored_at,
        refs,
        is_head,
        subject,
        renamed_from: None,
    })
}

fn parse(bytes: &[u8], offset: u32, limit: u32) -> Result<CommitPage, GitError> {
    let text = String::from_utf8_lossy(bytes);
    let mut commits = Vec::with_capacity((limit as usize).min(128));
    let mut has_more = false;

    for line in text.lines() {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if line.is_empty() {
            continue;
        }

        commits.push(parse_commit_fields(line, offset, limit)?);

        if commits.len() > limit as usize {
            has_more = true;
            commits.truncate(limit as usize);
            break;
        }
    }

    Ok(CommitPage {
        commits,
        offset,
        limit,
        has_more,
    })
}

fn required_field<'a>(
    fields: &mut impl Iterator<Item = &'a str>,
    field: &str,
) -> Result<String, GitError> {
    fields
        .next()
        .map(ToOwned::to_owned)
        .ok_or_else(|| GitError::invalid_output(format!("git log 输出缺少 {field} 字段。")))
}

pub(crate) fn parse_decorations(raw: &str) -> (bool, Vec<CommitRef>) {
    let mut is_head = false;
    let mut refs: Vec<CommitRef> = Vec::new();

    for decoration in raw
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
    {
        let reference = if let Some(reference) = decoration.strip_prefix("HEAD -> ") {
            is_head = true;
            reference
        } else if decoration == "HEAD" {
            is_head = true;
            continue;
        } else {
            decoration
        };

        // Symbolic remote refs look like `refs/remotes/origin/HEAD -> refs/remotes/origin/main`.
        let reference = if let Some((left, right)) = reference.split_once(" -> ") {
            if left.ends_with("/HEAD") {
                right
            } else {
                left
            }
        } else {
            reference
        };

        let (name, kind) = if let Some(name) = reference.strip_prefix("refs/heads/") {
            (name, CommitRefKind::Branch)
        } else if let Some(name) = reference.strip_prefix("refs/remotes/") {
            (name, CommitRefKind::Remote)
        } else if let Some(name) = reference.strip_prefix("refs/tags/") {
            (name, CommitRefKind::Tag)
        } else if let Some(name) = reference
            .strip_prefix("tag: ")
            .and_then(|value| value.strip_prefix("refs/tags/"))
        {
            (name, CommitRefKind::Tag)
        } else {
            continue;
        };

        if name.is_empty() || refs.iter().any(|existing| existing.name == name) {
            continue;
        }

        refs.push(CommitRef {
            name: name.to_owned(),
            kind,
        });
    }

    (is_head, refs)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Vec<u8> {
        let sep = FIELD_SEPARATOR;
        format!(
            "aaa111{sep}aaa{sep}bbb222{sep}Leon{sep}leon@example.com{sep}1700000000{sep}HEAD -> refs/heads/main, tag: refs/tags/v0.1.0{sep}Initial commit\n\
             bbb222{sep}bbb{sep}{sep}Lin Chen{sep}lin@example.com{sep}1690000000{sep}refs/remotes/origin/main{sep}feat: 支持中文提交\n"
        )
        .into_bytes()
    }

    #[test]
    fn parses_typed_commit_page() {
        let page = parse(&fixture(), 0, 100).expect("log should parse");

        assert_eq!(page.commits.len(), 2);
        assert!(!page.has_more);
        assert_eq!(page.commits[0].subject, "Initial commit");
        assert!(page.commits[0].is_head);
        assert_eq!(page.commits[0].parents, vec!["bbb222"]);
        assert_eq!(page.commits[0].refs.len(), 2);
        assert_eq!(page.commits[0].refs[0].kind, CommitRefKind::Branch);
        assert_eq!(page.commits[0].refs[1].kind, CommitRefKind::Tag);
        assert_eq!(page.commits[1].subject, "feat: 支持中文提交");
        assert_eq!(page.commits[1].refs[0].kind, CommitRefKind::Remote);
        assert!(!page.commits[1].is_head);
    }

    #[test]
    fn marks_extra_commit_as_has_more() {
        let page = parse(&fixture(), 0, 1).expect("log should parse");

        assert_eq!(page.commits.len(), 1);
        assert!(page.has_more);
        assert_eq!(page.offset, 0);
        assert_eq!(page.limit, 1);
    }

    #[test]
    fn parses_detached_head_decoration() {
        let (is_head, refs) = parse_decorations("HEAD, tag: refs/tags/v1.0.0");
        assert!(is_head);
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].kind, CommitRefKind::Tag);
    }

    #[test]
    fn ignores_unsupported_refs() {
        let (_, refs) = parse_decorations("refs/stash, refs/notes/commits");
        assert!(refs.is_empty());
    }

    #[test]
    fn parses_z_name_status_and_dedupes_merge_headers() {
        let sep = FIELD_SEPARATOR;
        let oid = "a".repeat(40);
        let header = format!(
            "{oid}{sep}aaaaaaa{sep}{sep}QA{sep}qa@example.com{sep}1700000000{sep}{sep}rename"
        );
        let text = format!(
            "{header}\nR100\0old\tname\0new name\0\0{header}\nR100\0old\tname\0new name\0\0"
        );

        let page = parse_file_history(text.as_bytes(), 0, 10).expect("parse");
        assert_eq!(page.commits.len(), 1);
        assert_eq!(page.commits[0].renamed_from.as_deref(), Some("old\tname"));
        assert!(!page.has_more);
    }

    #[test]
    fn z_file_history_marks_more_commits() {
        let sep = FIELD_SEPARATOR;
        let header = |oid: &str| {
            format!(
                "{oid}{sep}aaaaaaa{sep}{sep}QA{sep}qa@example.com{sep}1700000000{sep}{sep}change"
            )
        };
        let first = "1".repeat(40);
        let second = "2".repeat(40);
        let text = format!(
            "{}\nM\0a.txt\0\0{}\nM\0b.txt\0\0",
            header(&first),
            header(&second)
        );

        let page = parse_file_history(text.as_bytes(), 0, 1).expect("parse");
        assert_eq!(page.commits.len(), 1);
        assert!(page.has_more);
    }

    #[test]
    fn follows_renames_and_includes_merge_commits() {
        use std::fs;
        use std::process::Command;

        let temp = tempfile::tempdir().expect("temp dir");
        let repo = temp.path().join("history repo");
        fs::create_dir(&repo).expect("repo");
        let git = |args: &[&str]| {
            let output = Command::new("git")
                .current_dir(&repo)
                .args(args)
                .env("GIT_MERGE_AUTOEDIT", "no")
                .output()
                .expect("git");
            assert!(
                output.status.success(),
                "git {:?}: {}",
                args,
                String::from_utf8_lossy(&output.stderr)
            );
        };
        git(&["init", "-q", "-b", "main"]);
        git(&["config", "user.name", "History Tester"]);
        git(&["config", "user.email", "history@example.com"]);
        fs::write(repo.join("old.txt"), "one\ntwo\nthree\n").expect("old");
        git(&["add", "old.txt"]);
        git(&["commit", "-q", "-m", "create old"]);
        git(&["mv", "old.txt", "new.txt"]);
        git(&["commit", "-q", "-m", "rename file"]);
        fs::write(repo.join("new.txt"), "one\ntwo changed\nthree\n").expect("modify");
        git(&["add", "new.txt"]);
        git(&["commit", "-q", "-m", "modify new"]);

        let page = file_history(&repo, "new.txt", 0, 20).expect("history");
        let subjects: Vec<&str> = page.commits.iter().map(|c| c.subject.as_str()).collect();
        assert!(subjects.contains(&"create old"));
        assert!(subjects.contains(&"rename file"));
        assert!(subjects.contains(&"modify new"));
        let rename = page
            .commits
            .iter()
            .find(|commit| commit.subject == "rename file")
            .expect("rename commit");
        assert_eq!(rename.renamed_from.as_deref(), Some("old.txt"));

        git(&["checkout", "-q", "-b", "feature"]);
        fs::write(repo.join("feature.txt"), "feature\n").expect("feature");
        git(&["add", "feature.txt"]);
        git(&["commit", "-q", "-m", "feature work"]);
        git(&["checkout", "-q", "main"]);
        fs::write(repo.join("main.txt"), "main\n").expect("main");
        git(&["add", "main.txt"]);
        git(&["commit", "-q", "-m", "main work"]);
        git(&["merge", "--no-edit", "feature"]);

        let page = file_history(&repo, "feature.txt", 0, 10).expect("merge history");
        assert!(page
            .commits
            .iter()
            .any(|commit| commit.subject == "feature work"));
        assert!(page.commits.iter().any(|commit| commit.parents.len() > 1));
        assert_eq!(
            page.commits
                .iter()
                .filter(|commit| commit.parents.len() > 1)
                .count(),
            1,
            "merge commits must not be duplicated by -m"
        );
    }

    #[test]
    fn searches_commits_with_pagination_and_rejects_empty_pattern() {
        use std::fs;
        use std::process::Command;

        let temp = tempfile::tempdir().expect("temp dir");
        let repo = temp.path().join("search repo");
        fs::create_dir(&repo).expect("repo");
        let git = |args: &[&str]| {
            let output = Command::new("git")
                .current_dir(&repo)
                .args(args)
                .output()
                .expect("git");
            assert!(
                output.status.success(),
                "git {:?}: {}",
                args,
                String::from_utf8_lossy(&output.stderr)
            );
        };
        git(&["init", "-q", "-b", "main"]);
        git(&["config", "user.name", "Search Tester"]);
        git(&["config", "user.email", "search@example.com"]);
        for index in 0..5 {
            let subject = if index % 2 == 0 {
                format!("alpha change {index}")
            } else {
                format!("beta change {index}")
            };
            fs::write(repo.join("file.txt"), format!("{index}\n")).expect("file");
            git(&["add", "file.txt"]);
            git(&["commit", "-q", "-m", subject.as_str()]);
        }

        let first = search(&repo, "alpha", 0, 2).expect("first page");
        assert_eq!(first.commits.len(), 2);
        assert!(first.has_more);
        let second = search(&repo, "alpha", 1, 2).expect("second page");
        assert_eq!(second.commits.len(), 1);
        assert!(!second.has_more);
        assert!(search(&repo, "does-not-exist", 0, 10)
            .expect("empty result")
            .commits
            .is_empty());
        assert!(search(&repo, "  ", 0, 10).is_err());
    }
}
