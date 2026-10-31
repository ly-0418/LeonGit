mod commands;
mod git_engine;
mod portable;
mod ui_state;

use std::error::Error;
use std::io;

pub fn run() {
    if let Err(error) = run_app() {
        let message = format!("LeonGit 无法启动。\n\n{error}");
        eprintln!("{message}");
        portable::show_fatal_error(&message);
    }
}

fn run_app() -> Result<(), Box<dyn Error>> {
    let paths = portable::PortablePaths::from_current_exe()?;
    let mut context = tauri::generate_context!();
    context.config_mut().app.app_directories_override = Some(paths.directory_overrides());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            paths.prepare()?;
            create_main_window(app, &paths)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_repository,
            commands::remote_auth_info,
            commands::init_repository,
            commands::clone_repository,
            commands::get_repository_config,
            commands::save_repository_identity,
            commands::get_file_diff,
            commands::get_file_diff_window,
            commands::list_commits,
            commands::search_commits,
            commands::file_history,
            commands::blame_file,
            commands::read_file_lines,
            commands::list_tags,
            commands::create_tag,
            commands::delete_tag,
            commands::stage_file,
            commands::add_to_gitignore,
            commands::check_ignored,
            commands::list_gitignore_files,
            commands::stage_hunk,
            commands::unstage_hunk,
            commands::discard_lines,
            commands::unstage_file,
            commands::discard_file,
            commands::get_staged_diffs,
            commands::commit_staged,
            commands::commit_empty,
            commands::commit_staged_with_author,
            commands::commit_and_push,
            commands::commit_and_push_with_author,
            commands::reset_soft,
            commands::count_soft_reset,
            commands::revert_commit,
            commands::revert_continue,
            commands::revert_abort,
            commands::amend_commit,
            commands::get_commit_detail,
            commands::get_commit_file_diff,
            commands::get_commit_file_diff_window,
            commands::list_branches,
            commands::create_branch,
            commands::create_branch_from_detached,
            commands::set_upstream,
            commands::checkout_branch,
            commands::delete_branch,
            commands::rename_branch,
            commands::list_remotes,
            commands::list_remote_branches,
            commands::restore_remote_branch,
            commands::add_remote,
            commands::set_remote_url,
            commands::set_remote,
            commands::fetch_remote,
            commands::pull_current_branch,
            commands::push_current_branch,
            commands::merge_branch,
            commands::merge_branch_squash,
            commands::merge_abort,
            commands::squash_merge_abort,
            commands::open_merge_tool,
            commands::mark_conflict_resolved,
            commands::list_reflog,
            commands::stash_push,
            commands::stash_list,
            commands::stash_apply,
            commands::stash_pop,
            commands::stash_drop,
            commands::load_ui_state,
            commands::save_ui_preferences,
            commands::save_repo_list
        ])
        .run(context)?;

    Ok(())
}

fn create_main_window(
    app: &mut tauri::App,
    paths: &portable::PortablePaths,
) -> Result<(), Box<dyn Error>> {
    let window_config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .cloned()
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "tauri.conf.json 缺少 label 为 main 的窗口配置。",
            )
        })?;

    tauri::WebviewWindowBuilder::from_config(app.handle(), &window_config)?
        .data_directory(paths.webview_data_dir().to_path_buf())
        .build()?;

    Ok(())
}
