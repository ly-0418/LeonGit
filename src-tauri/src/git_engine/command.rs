use std::ffi::OsStr;
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Child, Command, Output, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use super::error::GitError;
use super::redact;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// A network command with no stdout/stderr activity for this long is treated
/// as a dead connection. Git's HTTP low-speed guard is also enabled at 30s.
const REMOTE_IDLE_TIMEOUT: Duration = Duration::from_secs(30);
/// Absolute ceiling for very large transfers that keep making progress.
const REMOTE_MAX_TIMEOUT: Duration = Duration::from_secs(600);

fn git_command(cwd: &Path) -> Command {
    let mut command = Command::new("git");
    command
        .current_dir(cwd)
        .arg("--no-pager")
        .arg("-c")
        .arg("core.quotepath=false")
        .arg("-c")
        .arg("http.lowSpeedLimit=1")
        .arg("-c")
        .arg("http.lowSpeedTime=30")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_MERGE_AUTOEDIT", "no")
        .env("GIT_EDITOR", "true")
        .env("GIT_PAGER", "cat")
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    command
}

/// Runs git without interpreting a non-zero exit code.
pub(crate) fn run_git<I, S>(cwd: &Path, args: I) -> Result<Output, GitError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    git_command(cwd).args(args).output().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            GitError::git_not_found()
        } else {
            GitError::io(format!("无法启动 Git：{error}"))
        }
    })
}

/// Runs a local Git command with bytes supplied on stdin. Used by hunk
/// staging; the patch never passes through a shell.
pub(crate) fn run_git_with_input<I, S>(
    cwd: &Path,
    args: I,
    input: &[u8],
) -> Result<Output, GitError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = git_command(cwd);
    command
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            GitError::git_not_found()
        } else {
            GitError::io(format!("无法启动 Git：{error}"))
        }
    })?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(input);
    }
    child
        .wait_with_output()
        .map_err(|error| GitError::io(format!("等待 Git 进程失败：{error}")))
}

/// Runs a network-facing Git command with a hard timeout. On timeout the
/// whole process tree is terminated so SSH/HTTP helpers cannot linger.
pub(crate) fn run_git_remote<I, S>(cwd: &Path, args: I) -> Result<Output, GitError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = git_command(cwd);
    command.args(args);
    run_command_with_timeout(command, REMOTE_IDLE_TIMEOUT, REMOTE_MAX_TIMEOUT)
}

/// Runs a network-facing Git command and turns failures into a typed error.
pub(crate) fn run_git_remote_checked<I, S>(cwd: &Path, args: I) -> Result<Vec<u8>, GitError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let output = run_git_remote(cwd, args)?;
    if output.status.success() {
        return Ok(output.stdout);
    }

    Err(command_failure(&output))
}

/// Runs git and turns failures into a concise, typed error.
pub(crate) fn run_git_checked<I, S>(cwd: &Path, args: I) -> Result<Vec<u8>, GitError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let output = run_git(cwd, args)?;
    if output.status.success() {
        return Ok(output.stdout);
    }

    Err(command_failure(&output))
}

fn run_command_with_timeout(
    mut command: Command,
    idle_timeout: Duration,
    max_timeout: Duration,
) -> Result<Output, GitError> {
    let mut child = command.spawn().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            GitError::git_not_found()
        } else {
            GitError::io(format!("无法启动 Git：{error}"))
        }
    })?;

    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| GitError::io("无法读取 Git 标准输出。"))?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| GitError::io("无法读取 Git 错误输出。"))?;
    let last_activity = Arc::new(Mutex::new(Instant::now()));

    let stdout_activity = Arc::clone(&last_activity);
    let stdout_thread = thread::spawn(move || {
        let mut bytes = Vec::new();
        let mut buffer = [0_u8; 8192];
        loop {
            match stdout.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(count) => {
                    bytes.extend_from_slice(&buffer[..count]);
                    if let Ok(mut last) = stdout_activity.lock() {
                        *last = Instant::now();
                    }
                }
            }
        }
        bytes
    });
    let stderr_activity = Arc::clone(&last_activity);
    let stderr_thread = thread::spawn(move || {
        let mut bytes = Vec::new();
        let mut buffer = [0_u8; 8192];
        loop {
            match stderr.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(count) => {
                    bytes.extend_from_slice(&buffer[..count]);
                    if let Ok(mut last) = stderr_activity.lock() {
                        *last = Instant::now();
                    }
                }
            }
        }
        bytes
    });

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = stdout_thread.join().unwrap_or_default();
                let stderr = stderr_thread.join().unwrap_or_default();
                return Ok(Output {
                    status,
                    stdout,
                    stderr,
                });
            }
            Ok(None) => {
                let idle = last_activity
                    .lock()
                    .map(|last| last.elapsed())
                    .unwrap_or_default();
                if idle >= idle_timeout {
                    terminate_process_tree(&mut child);
                    let _ = child.wait();
                    let _ = stdout_thread.join();
                    let _ = stderr_thread.join();
                    return Err(GitError::timeout(format!(
                        "远端连接或传输已连续 {} 秒无响应，已自动断开 Git 进程。请检查网络、代理或远程地址后重试。",
                        idle_timeout.as_secs()
                    )));
                }
                if started.elapsed() >= max_timeout {
                    terminate_process_tree(&mut child);
                    let _ = child.wait();
                    let _ = stdout_thread.join();
                    let _ = stderr_thread.join();
                    return Err(GitError::timeout(format!(
                        "远端操作超过 {} 秒，已自动断开 Git 进程。",
                        max_timeout.as_secs()
                    )));
                }
                thread::sleep(Duration::from_millis(50));
            }
            Err(error) => {
                terminate_process_tree(&mut child);
                let _ = child.wait();
                let _ = stdout_thread.join();
                let _ = stderr_thread.join();
                return Err(GitError::io(format!("等待 Git 进程失败：{error}")));
            }
        }
    }
}

fn terminate_process_tree(child: &mut Child) {
    #[cfg(windows)]
    {
        let pid = child.id().to_string();
        let mut taskkill = Command::new("taskkill");
        taskkill
            .args(["/PID", pid.as_str(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW);
        let _ = taskkill.status();
    }
    let _ = child.kill();
}

fn command_failure(output: &Output) -> GitError {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let lower = stderr.to_lowercase();
    if lower.contains("operation too slow") || lower.contains("low speed limit") {
        return GitError::timeout(
            "远端连接速度过低，已自动断开 Git 传输。请检查网络、代理或远程地址后重试。",
        );
    }
    let detail = stderr
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("Git 返回了非零退出码。");
    let detail = detail.strip_prefix("fatal: ").unwrap_or(detail);
    let mut detail: String = detail.chars().take(240).collect();
    if detail.is_empty() {
        detail = "Git 返回了非零退出码。".to_owned();
    }
    detail = redact::redact_text(&detail);

    GitError::command_failed(format!("Git 命令执行失败：{detail}"))
}

pub(crate) fn output_failure(output: &Output) -> GitError {
    command_failure(output)
}

/// Trims Git's text output; only used for path/hash style values, never bulk output.
pub(crate) fn text_output(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes)
        .trim_matches(|character| character == '\n' || character == '\r')
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_output_trims_only_line_endings() {
        assert_eq!(text_output(b"  main  \r\n"), "  main  ");
        assert_eq!(text_output(b"/tmp/repo\n"), "/tmp/repo");
    }

    #[cfg(windows)]
    #[test]
    fn aborts_timed_out_process_tree() {
        use super::super::error::GitErrorKind;
        use std::os::windows::process::CommandExt;

        let mut command = Command::new("cmd");
        command
            .args(["/C", "ping", "-n", "8", "127.0.0.1"])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW);
        let started = Instant::now();
        let error =
            run_command_with_timeout(command, Duration::from_millis(150), Duration::from_secs(5))
                .expect_err("ping should exceed the timeout");
        assert_eq!(error.kind, GitErrorKind::Timeout);
        assert!(started.elapsed() < Duration::from_secs(5));
    }
}
