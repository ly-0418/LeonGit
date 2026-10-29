import { useCallback, useEffect, useRef, useState } from "react";

import { toGitError } from "@/lib/git-api";
import { loadUiState, saveRepoList, saveUiPreferences } from "@/lib/ui-api";
import {
  DEFAULT_FONT_SCALE,
  FONT_SCALE_STORAGE_KEY,
  MAX_REPOS,
  THEME_STORAGE_KEY,
  normalizeFontScale,
  type FontScale,
  type RepoEntry,
  type RepoEntryInput,
  type ThemeMode,
} from "@/types/ui";
import type { GitError, RepositorySnapshot } from "@/types/git";

export interface UiStateController {
  theme: ThemeMode;
  fontScale: FontScale;
  repos: RepoEntry[];
  isLoading: boolean;
  error: GitError | null;
  setTheme: (theme: ThemeMode) => void;
  setFontScale: (scale: FontScale) => void;
  addRepository: (snapshot: RepositorySnapshot) => void;
  addRepositoryPath: (path: string, name: string) => void;
  removeRepository: (path: string) => void;
  dismissError: () => void;
}

function readInitialTheme(): ThemeMode {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
    return "dark";
  }
  return "light";
}

function readInitialFontScale(): FontScale {
  if (typeof window === "undefined") {
    return DEFAULT_FONT_SCALE;
  }
  const raw = window.localStorage.getItem(FONT_SCALE_STORAGE_KEY);
  const parsed = raw ? Number(raw) : DEFAULT_FONT_SCALE;
  return normalizeFontScale(parsed);
}

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute("content", theme);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#090b0e" : "#f7f5f0");
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The Rust-side preference remains the authoritative source.
  }
}

function applyFontScale(scale: FontScale) {
  document.documentElement.style.setProperty("--display-scale", String(scale));
  document.documentElement.dataset.fontScale = String(scale);
  try {
    window.localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(scale));
  } catch {
    // The Rust-side preference remains the authoritative source.
  }
}

export function useUiState(): UiStateController {
  const [theme, setThemeState] = useState<ThemeMode>(readInitialTheme);
  const [fontScale, setFontScaleState] = useState<FontScale>(readInitialFontScale);
  const [repos, setRepos] = useState<RepoEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<GitError | null>(null);

  const themeRef = useRef(theme);
  const fontScaleRef = useRef(fontScale);
  const reposRef = useRef<RepoEntry[]>([]);
  const prefsQueue = useRef<Promise<void>>(Promise.resolve());
  const repoQueue = useRef<Promise<void>>(Promise.resolve());
  const repoRevision = useRef(0);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    fontScaleRef.current = fontScale;
  }, [fontScale]);

  useEffect(() => {
    reposRef.current = repos;
  }, [repos]);

  const queuePreferences = useCallback((nextTheme: ThemeMode, nextScale: FontScale) => {
    prefsQueue.current = prefsQueue.current
      .then(() => saveUiPreferences(nextTheme, nextScale))
      .catch((rawError: unknown) => {
        setError(toGitError(rawError));
      });
  }, []);

  const setTheme = useCallback(
    (nextTheme: ThemeMode) => {
      themeRef.current = nextTheme;
      setThemeState(nextTheme);
      applyTheme(nextTheme);
      queuePreferences(nextTheme, fontScaleRef.current);
    },
    [queuePreferences],
  );

  const setFontScale = useCallback(
    (nextScale: FontScale) => {
      const normalized = normalizeFontScale(nextScale);
      fontScaleRef.current = normalized;
      setFontScaleState(normalized);
      applyFontScale(normalized);
      queuePreferences(themeRef.current, normalized);
    },
    [queuePreferences],
  );

  const persistRepos = useCallback(
    (nextRepos: RepoEntry[]) => {
      const revision = ++repoRevision.current;
      reposRef.current = nextRepos;
      setRepos(nextRepos);
      const input: RepoEntryInput[] = nextRepos.map((repo) => ({
        path: repo.path,
        name: repo.name,
        openedAt: repo.openedAt,
      }));
      repoQueue.current = repoQueue.current
        .then(async () => {
          const saved = await saveRepoList(input);
          if (revision === repoRevision.current) {
            reposRef.current = saved;
            setRepos(saved);
          }
        })
        .catch((rawError: unknown) => {
          setError(toGitError(rawError));
        });
    },
    [],
  );

  const addRepositoryPath = useCallback(
    (path: string, name: string) => {
      const now = Date.now();
      const key = path.toLocaleLowerCase();
      const next: RepoEntry[] = [
        {
          id: "",
          path,
          name,
          openedAt: now,
        },
        ...reposRef.current
          .filter((repo) => repo.path.toLocaleLowerCase() !== key)
          .map((repo) => ({ ...repo })),
      ].slice(0, MAX_REPOS);
      persistRepos(next);
    },
    [persistRepos],
  );

  const addRepository = useCallback(
    (snapshot: RepositorySnapshot) => {
      addRepositoryPath(snapshot.path, snapshot.name);
    },
    [addRepositoryPath],
  );

  const removeRepository = useCallback(
    (path: string) => {
      const key = path.toLocaleLowerCase();
      persistRepos(
        reposRef.current.filter(
          (repo) => repo.path.toLocaleLowerCase() !== key,
        ),
      );
    },
    [persistRepos],
  );

  useEffect(() => {
    let cancelled = false;
    void loadUiState()
      .then((state) => {
        if (cancelled) {
          return;
        }
        themeRef.current = state.theme;
        fontScaleRef.current = state.fontScale;
        reposRef.current = state.repos;
        setThemeState(state.theme);
        setFontScaleState(state.fontScale);
        setRepos(state.repos);
        applyTheme(state.theme);
        applyFontScale(state.fontScale);
      })
      .catch((rawError: unknown) => {
        if (!cancelled) {
          setError(toGitError(rawError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    theme,
    fontScale,
    repos,
    isLoading,
    error,
    setTheme,
    setFontScale,
    addRepository,
    addRepositoryPath,
    removeRepository,
    dismissError: () => setError(null),
  };
}
