import { useCallback, useEffect, useRef, useState } from "react";

import { getFileDiff, getFileDiffWindow, toGitError } from "@/lib/git-api";
import type { DiffScope, FileDiff, GitError, StatusFile } from "@/types/git";

const FULL_DIFF_PAGE_SIZE = 5_000;
/** Hard ceiling for the explicit "load full diff" path. Rendering more rows
 * than this in the webview freezes the app, so the rest stays in Git. */
const MAX_FULL_DIFF_LINES = 50_000;

export interface SelectedFile {
  file: StatusFile;
  defaultScope: DiffScope;
}

export interface FileDiffController {
  diff: FileDiff | null;
  isLoading: boolean;
  error: GitError | null;
  isLoadingFull: boolean;
  fullLimitReached: boolean;
  loadFull: () => void;
  reload: () => void;
}

export function useFileDiff(
  repoPath: string,
  selected: SelectedFile | null,
  scope: DiffScope,
  revision?: unknown,
): FileDiffController {
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<GitError | null>(null);
  const [isLoadingFull, setIsLoadingFull] = useState(false);
  const [fullLimitReached, setFullLimitReached] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const requestSequence = useRef(0);

  useEffect(() => {
    requestSequence.current += 1;
    const requestId = requestSequence.current;

    if (!selected) {
      setDiff(null);
      setIsLoading(false);
      setError(null);
      setIsLoadingFull(false);
      setFullLimitReached(false);
      return;
    }

    setDiff(null);
    setIsLoading(true);
    setError(null);
    setIsLoadingFull(false);
    setFullLimitReached(false);

    // Always refresh both sides of the index together. Hunk staging changes
    // the ownership of hunks between worktree and index; fetching only the
    // visible side can leave the other side stale until the user switches tabs.
    const scopes: DiffScope[] =
      scope === "head" ? ["worktree", "staged", "head"] : ["worktree", "staged"];

    void Promise.all(
      scopes.map((requestedScope) =>
        getFileDiff(
          repoPath,
          selected.file.path,
          selected.file.originalPath,
          requestedScope,
        ),
      ),
    )
      .then((results) => {
        if (requestId === requestSequence.current) {
          const index = scopes.indexOf(scope);
          setDiff(results[index] ?? null);
        }
      })
      .catch((rawError: unknown) => {
        if (requestId === requestSequence.current) {
          setDiff(null);
          setError(toGitError(rawError));
        }
      })
      .finally(() => {
        if (requestId === requestSequence.current) {
          setIsLoading(false);
        }
      });
  }, [repoPath, revision, scope, selected, reloadToken]);

  useEffect(
    () => () => {
      requestSequence.current += 1;
    },
    [],
  );

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const loadFull = useCallback(() => {
    if (
      !selected ||
      !diff ||
      !diff.truncated ||
      isLoadingFull ||
      fullLimitReached
    ) {
      return;
    }
    const requestId = requestSequence.current;
    setIsLoadingFull(true);
    setError(null);

    void (async () => {
      let merged = diff.lines;
      let total = diff.totalLines;
      try {
        while (merged.length < total && merged.length < MAX_FULL_DIFF_LINES) {
          const page = await getFileDiffWindow(
            repoPath,
            selected.file.path,
            selected.file.originalPath,
            scope,
            merged.length,
            FULL_DIFF_PAGE_SIZE,
          );
          if (requestId !== requestSequence.current) {
            return;
          }
          total = page.totalLines;
          if (page.lines.length === 0) {
            break;
          }
          merged = [...merged, ...page.lines];
          if (merged.length < total) {
            setDiff({ ...page, lines: merged, totalLines: total });
          }
        }
        if (merged.length < total) {
          // Stop at the render ceiling and keep the truncated banner, but only
          // claim "limit reached" when the ceiling is what stopped us.
          if (merged.length >= MAX_FULL_DIFF_LINES) {
            setFullLimitReached(true);
          }
          setDiff({ ...diff, lines: merged, totalLines: total, truncated: true });
        } else {
          setDiff({ ...diff, lines: merged, totalLines: total, truncated: false });
        }
      } catch (rawError: unknown) {
        if (requestId === requestSequence.current) {
          setError(toGitError(rawError));
        }
      } finally {
        if (requestId === requestSequence.current) {
          setIsLoadingFull(false);
        }
      }
    })();
  }, [diff, fullLimitReached, isLoadingFull, repoPath, scope, selected]);

  return {
    diff,
    isLoading,
    error,
    isLoadingFull,
    fullLimitReached,
    loadFull,
    reload,
  };
}
