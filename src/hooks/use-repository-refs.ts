import { useCallback, useEffect, useRef, useState } from "react";

import { listBranches, listRemotes, toGitError } from "@/lib/git-api";
import type { BranchInfo, GitError, RemoteInfo } from "@/types/git";

export interface RepositoryRefsController {
  branches: BranchInfo[];
  remotes: RemoteInfo[];
  isLoading: boolean;
  error: GitError | null;
  reload: () => void;
}

export function useRepositoryRefs(
  repoPath: string | null,
  refreshToken: number,
): RepositoryRefsController {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<GitError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const requestSequence = useRef(0);
  const activePath = useRef(repoPath);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    if (!repoPath) {
      activePath.current = null;
      setBranches([]);
      setRemotes([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    if (activePath.current !== repoPath) {
      activePath.current = repoPath;
      setBranches([]);
      setRemotes([]);
      setError(null);
    }
    setIsLoading(true);
    setError(null);

    void Promise.all([listBranches(repoPath), listRemotes(repoPath)])
      .then(([nextBranches, nextRemotes]) => {
        if (requestId === requestSequence.current) {
          setBranches(nextBranches);
          setRemotes(nextRemotes);
        }
      })
      .catch((rawError: unknown) => {
        if (requestId === requestSequence.current) {
          setError(toGitError(rawError));
        }
      })
      .finally(() => {
        if (requestId === requestSequence.current) {
          setIsLoading(false);
        }
      });

    return () => {
      requestSequence.current += 1;
    };
  }, [refreshToken, reloadToken, repoPath]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { branches, remotes, isLoading, error, reload };
}
