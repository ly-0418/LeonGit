use std::path::Path;

use super::command::run_git_checked;
use super::diff;
use super::error::GitError;
use super::types::BlameLineMeta;

pub(crate) fn blame_file(worktree: &Path, file_path: &str) -> Result<Vec<BlameLineMeta>, GitError> {
    let path = diff::validate_relative_path(file_path, "文件路径")?;
    let stdout = run_git_checked(worktree, ["blame", "--line-porcelain", "--", path.as_str()])?;
    parse(&String::from_utf8_lossy(&stdout))
}

fn parse(text: &str) -> Result<Vec<BlameLineMeta>, GitError> {
    let mut groups: Vec<BlameLineMeta> = Vec::new();
    let mut current: Option<BlameLineMeta> = None;

    for line in text.lines() {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if let Some(header) = parse_header(line) {
            if let Some(previous) = current.take() {
                push_group(&mut groups, previous);
            }
            current = Some(header);
            continue;
        }
        if line.starts_with('\t') {
            continue;
        }
        if let Some(meta) = current.as_mut() {
            if let Some(author) = line.strip_prefix("author ") {
                meta.author = author.to_owned();
            } else if let Some(time) = line.strip_prefix("author-time ") {
                meta.time = time.parse::<i64>().map_err(|_| {
                    GitError::invalid_output("git blame 的 author-time 不是有效时间。")
                })?;
            } else if let Some(tz) = line.strip_prefix("author-tz ") {
                meta.author_tz = tz.to_owned();
            }
        }
    }

    if let Some(previous) = current {
        push_group(&mut groups, previous);
    }
    Ok(groups)
}

fn parse_header(line: &str) -> Option<BlameLineMeta> {
    let mut fields = line.split(' ');
    let sha = fields.next()?;
    if (sha.len() != 40 && sha.len() != 64)
        || !sha.chars().all(|character| character.is_ascii_hexdigit())
    {
        return None;
    }
    let _original_line = fields.next()?;
    let final_line = fields.next()?.parse::<u32>().ok()?;
    let line_count = fields
        .next()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(1);

    Some(BlameLineMeta {
        sha: sha.to_owned(),
        author: String::new(),
        time: 0,
        author_tz: String::new(),
        start_line: final_line,
        line_count,
    })
}

fn push_group(groups: &mut Vec<BlameLineMeta>, next: BlameLineMeta) {
    if let Some(previous) = groups.last_mut() {
        if previous.sha == next.sha
            && previous.author == next.author
            && previous.time == next.time
            && previous.author_tz == next.author_tz
            && previous.start_line.saturating_add(previous.line_count) == next.start_line
        {
            previous.line_count = previous.line_count.saturating_add(next.line_count);
            return;
        }
    }
    groups.push(next);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_merges_consecutive_porcelain_lines() {
        let text = "\
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1 1 1\n\
author Alice\n\
author-time 1700000000\n\
author-tz +0800\n\
\tfirst\n\
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 2 2 1\n\
author Alice\n\
author-time 1700000000\n\
author-tz +0800\n\
\tsecond\n\
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 3 3 1\n\
author Bob\n\
author-time 1700000100\n\
author-tz +0800\n\
\tthird\n";
        let groups = parse(text).expect("blame");
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].start_line, 1);
        assert_eq!(groups[0].line_count, 2);
        assert_eq!(groups[0].author, "Alice");
        assert_eq!(groups[1].sha, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
        assert_eq!(groups[1].start_line, 3);
    }

    #[test]
    fn rejects_header_with_invalid_sha() {
        assert!(parse_header("not-a-sha 1 1 1").is_none());
    }
}
