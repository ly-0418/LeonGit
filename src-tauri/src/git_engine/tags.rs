use std::path::Path;

use super::command::{run_git, run_git_checked, text_output};
use super::error::GitError;
use super::types::TagEntry;

const FIELD_SEPARATOR: char = '\u{1f}';

pub(crate) fn list(worktree: &Path) -> Result<Vec<TagEntry>, GitError> {
    let format = format!(
        "--format=%(refname:short){sep}%(objecttype){sep}%(objectname){sep}%(*objectname){sep}%(taggerdate:unix){sep}%(committerdate:unix){sep}%(contents:subject)",
        sep = FIELD_SEPARATOR
    );
    let stdout = run_git_checked(worktree, ["for-each-ref", format.as_str(), "refs/tags"])?;
    let text = String::from_utf8_lossy(&stdout);
    let mut tags = Vec::new();

    for line in text.lines() {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if line.is_empty() {
            continue;
        }
        let mut fields = line.splitn(7, FIELD_SEPARATOR);
        let name = required(&mut fields, "标签名")?;
        let object_type = required(&mut fields, "对象类型")?;
        let object_name = required(&mut fields, "对象 SHA")?;
        let peeled_name = fields.next().unwrap_or_default().to_owned();
        let tagger_date = fields.next().unwrap_or_default().to_owned();
        let commit_date = fields.next().unwrap_or_default().to_owned();
        let message = fields.next().unwrap_or_default().to_owned();
        let annotated = object_type == "tag";
        let target_sha = if peeled_name.is_empty() {
            object_name
        } else {
            peeled_name
        };
        let timestamp = if annotated { tagger_date } else { commit_date }
            .parse::<i64>()
            .unwrap_or(0);

        tags.push(TagEntry {
            name,
            target_sha,
            annotated,
            message: if annotated { message } else { String::new() },
            timestamp,
        });
    }

    Ok(tags)
}

pub(crate) fn create(
    worktree: &Path,
    name: &str,
    target_sha: &str,
    annotated: bool,
    message: Option<&str>,
) -> Result<Vec<TagEntry>, GitError> {
    let name = validate_name(worktree, name)?;
    let target = resolve_target(worktree, target_sha)?;
    let message = message.map(str::trim).filter(|value| !value.is_empty());
    if annotated && message.is_none() {
        return Err(GitError::invalid_input("附注标签需要填写消息。"));
    }

    let mut args = vec!["tag"];
    if annotated {
        args.push("-a");
        args.push(name.as_str());
        args.push("-m");
        args.push(message.unwrap_or_default());
    } else {
        args.push(name.as_str());
    }
    args.push(target.as_str());
    run_git_checked(worktree, args)?;
    list(worktree)
}

pub(crate) fn delete(worktree: &Path, name: &str) -> Result<Vec<TagEntry>, GitError> {
    let name = validate_name(worktree, name)?;
    let exists = run_git(
        worktree,
        [
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("refs/tags/{name}"),
        ],
    )?;
    if !exists.status.success() {
        return Err(GitError::invalid_input(format!("标签“{name}”不存在。")));
    }
    run_git_checked(worktree, ["tag", "-d", name.as_str()])?;
    list(worktree)
}

fn validate_name(worktree: &Path, raw_name: &str) -> Result<String, GitError> {
    let name = raw_name.trim();
    if name.is_empty()
        || name.starts_with('-')
        || name
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
    {
        return Err(GitError::invalid_input("标签名无效。"));
    }
    let valid = run_git(worktree, ["check-ref-format", &format!("refs/tags/{name}")])?;
    if !valid.status.success() {
        return Err(GitError::invalid_input("标签名不符合 Git 命名规则。"));
    }
    Ok(name.to_owned())
}

fn resolve_target(worktree: &Path, raw_target: &str) -> Result<String, GitError> {
    let target = raw_target.trim();
    if target.is_empty()
        || (target.len() != 40 && target.len() != 64)
        || !target
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err(GitError::invalid_input("目标必须是完整的 commit SHA。"));
    }
    let output = run_git(
        worktree,
        ["rev-parse", "--verify", &format!("{target}^{{commit}}")],
    )?;
    if !output.status.success() {
        return Err(GitError::invalid_input("目标 commit 不存在。"));
    }
    let resolved = text_output(&output.stdout);
    if resolved.is_empty() {
        return Err(GitError::invalid_output("无法解析目标 commit。"));
    }
    Ok(resolved)
}

fn required<'a>(
    fields: &mut impl Iterator<Item = &'a str>,
    field: &str,
) -> Result<String, GitError> {
    fields
        .next()
        .map(ToOwned::to_owned)
        .ok_or_else(|| GitError::invalid_output(format!("git tag 输出缺少{field}。")))
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

    fn setup() -> (tempfile::TempDir, std::path::PathBuf, String) {
        let temp = tempfile::tempdir().expect("temp");
        let repo = temp.path().join("repo");
        fs::create_dir(&repo).expect("repo");
        assert!(git(&repo, &["init", "-q", "-b", "main"]).status.success());
        assert!(git(&repo, &["config", "user.name", "Tag Tester"])
            .status
            .success());
        assert!(git(&repo, &["config", "user.email", "tag@example.com"])
            .status
            .success());
        fs::write(repo.join("file.txt"), "tag\n").expect("file");
        assert!(git(&repo, &["add", "file.txt"]).status.success());
        assert!(git(&repo, &["commit", "-q", "-m", "base"]).status.success());
        let sha = String::from_utf8_lossy(&git(&repo, &["rev-parse", "HEAD"]).stdout)
            .trim()
            .to_owned();
        (temp, repo, sha)
    }

    #[test]
    fn creates_lists_and_deletes_annotated_and_lightweight_tags() {
        let (_temp, repo, sha) = setup();
        let tags = create(&repo, "v1.0.0", &sha, true, Some("release")).expect("annotated");
        assert!(tags[0].annotated);
        assert_eq!(tags[0].message, "release");
        create(&repo, "nightly", &sha, false, None).expect("lightweight");
        let tags = list(&repo).expect("list");
        assert_eq!(tags.len(), 2);
        assert!(tags
            .iter()
            .any(|tag| tag.name == "nightly" && !tag.annotated));
        let tags = delete(&repo, "nightly").expect("delete");
        assert_eq!(tags.len(), 1);
    }
}
