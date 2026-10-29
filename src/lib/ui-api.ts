import { invoke } from "@tauri-apps/api/core";

import type {
  FontScale,
  RepoEntry,
  RepoEntryInput,
  ThemeMode,
  UiState,
} from "@/types/ui";

export function loadUiState(): Promise<UiState> {
  return invoke<UiState>("load_ui_state");
}

export function saveUiPreferences(
  theme: ThemeMode,
  fontScale: FontScale,
): Promise<void> {
  return invoke<void>("save_ui_preferences", { theme, fontScale });
}

export function saveRepoList(repos: RepoEntryInput[]): Promise<RepoEntry[]> {
  return invoke<RepoEntry[]>("save_repo_list", { repos });
}
