use std::path::Path;

use super::diff;
use super::error::GitError;

const MAX_TEXT_BYTES: u64 = 5 * 1024 * 1024;

pub(crate) fn read_lines(worktree: &Path, file_path: &str) -> Result<Vec<String>, GitError> {
    let path = diff::validate_relative_path(file_path, "文件路径")?;
    let root = dunce::canonicalize(worktree)
        .map_err(|error| GitError::invalid_path(format!("无法解析仓库路径：{error}")))?;
    let target = root.join(&path);
    let canonical = dunce::canonicalize(&target)
        .map_err(|error| GitError::invalid_path(format!("无法读取文件路径：{error}")))?;
    if !canonical.starts_with(&root) {
        return Err(GitError::invalid_path("文件路径超出仓库范围。"));
    }
    let metadata = std::fs::metadata(&canonical)
        .map_err(|error| GitError::invalid_path(format!("无法读取文件：{error}")))?;
    if !metadata.is_file() {
        return Err(GitError::invalid_path("该路径不是文件。"));
    }
    if metadata.len() > MAX_TEXT_BYTES {
        return Err(GitError::invalid_input(
            "文件超过 5 MiB，无法在 Blame 视图中打开。",
        ));
    }
    let bytes = std::fs::read(&canonical)
        .map_err(|error| GitError::io(format!("无法读取文件：{error}")))?;
    let text = String::from_utf8(bytes)
        .map_err(|_| GitError::invalid_output("文件包含非 UTF-8 内容，无法显示 Blame。"))?;
    Ok(text
        .lines()
        .map(|line| line.strip_suffix('\r').unwrap_or(line).to_owned())
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_text_lines_and_rejects_escape() {
        let temp = tempfile::tempdir().expect("temp");
        std::fs::write(temp.path().join("file.txt"), "one\r\ntwo\n").expect("write");
        let lines = read_lines(temp.path(), "file.txt").expect("read");
        assert_eq!(lines, vec!["one", "two"]);
        assert!(read_lines(temp.path(), "../secret").is_err());
    }
}
