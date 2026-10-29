import { useCallback, useEffect, useRef, useState } from "react";

import { getFileDiff, toGitError } from "@/lib/git-api";
import type { DiffScope, FileDiff, GitError, StatusFile } from "@/types/git";

export interface SelectedFile {
  file: StatusFile;
  defaultScope: DiffScope;
}

export interface FileDiffController {
  diff: FileDiff | null;
  isLoading: boolean;
  error: GitError | null;
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
  const [reloadToken, setReloadToken] = useState(0);
  const requestSequence = useRef(0);

  useEffect(() => {
    requestSequence.current += 1;
    const requestId = requestSequence.current;

    if (!selected) {
      setDiff(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setDiff(null);
    setIsLoading(true);
    setError(null);

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

  return { diff, isLoading, error, reload };
}
