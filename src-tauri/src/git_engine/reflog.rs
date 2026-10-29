use std::path::Path;

use super::command::run_git_checked;
use super::error::GitError;
use super::types::ReflogEntry;

const MAX_RELOG_ENTRIES: u32 = 200;

pub(crate) fn list(worktree: &Path, limit: u32) -> Result<Vec<ReflogEntry>, GitError> {
    let limit = limit.clamp(1, MAX_RELOG_ENTRIES);
    let pretty = "--format=%H%x1f%h%x1f%gd%x1f%gs%x1f%ct%x1f%an";
    let stdout = run_git_checked(
        worktree,
        ["reflog", "show", pretty, "-n", &limit.to_string(), "HEAD"],
    )?;
    let text = String::from_utf8_lossy(&stdout);
    let mut entries = Vec::new();

    for line in text.lines() {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if line.is_empty() {
            continue;
        }
        let mut fields = line.splitn(6, '\u{1f}');
        let oid = required(&mut fields, "SHA")?;
        let short_oid = required(&mut fields, "短 SHA")?;
        let selector = required(&mut fields, "reflog selector")?;
        let action = required(&mut fields, "reflog action")?;
        let timestamp = required(&mut fields, "reflog 时间")?
            .parse::<i64>()
            .map_err(|_| GitError::invalid_output("reflog 时间戳无效。"))?;
        let author = required(&mut fields, "reflog 作者")?;

        entries.push(ReflogEntry {
            oid,
            short_oid,
            selector,
            action,
            timestamp,
            author,
        });
    }

    Ok(entries)
}

fn required<'a>(
    fields: &mut impl Iterator<Item = &'a str>,
    field: &str,
) -> Result<String, GitError> {
    fields
        .next()
        .map(ToOwned::to_owned)
        .ok_or_else(|| GitError::invalid_output(format!("reflog 输出缺少{field}。")))
}
