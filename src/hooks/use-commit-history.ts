import { useCallback, useEffect, useRef, useState } from "react";

import { listCommits, searchCommits, toGitError } from "@/lib/git-api";
import type { CommitSummary, GitError } from "@/types/git";

export const COMMIT_PAGE_SIZE = 300;

export interface CommitHistoryController {
  commits: CommitSummary[];
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: GitError | null;
  loadMore: () => Promise<void>;
  retry: () => void;
}

export function useCommitHistory(
  repoPath: string,
  refreshToken: number,
  searchPattern = "",
): CommitHistoryController {
  const [commits, setCommits] = useState<CommitSummary[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<GitError | null>(null);

  const requestSequence = useRef(0);
  const loadingRef = useRef(false);
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) {
      return;
    }

    const requestId = requestSequence.current;
    const firstPage = offsetRef.current === 0;
    loadingRef.current = true;
    setError(null);
    if (firstPage) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const page = searchPattern
        ? await searchCommits(
            repoPath,
            searchPattern,
            Math.floor(offsetRef.current / COMMIT_PAGE_SIZE),
            COMMIT_PAGE_SIZE,
          )
        : await listCommits(
            repoPath,
            offsetRef.current,
            COMMIT_PAGE_SIZE,
          );
      if (requestId !== requestSequence.current) {
        return;
      }
      setCommits((current) => {
        // Offset pagination can repeat a commit when refs move while the user
        // scrolls; duplicate oids would break both virtualizer keys and DAG
        // lanes, so keep the first occurrence only.
        const seen = new Set(current.map((commit) => commit.oid));
        const fresh = page.commits.filter((commit) => !seen.has(commit.oid));
        return fresh.length > 0 ? [...current, ...fresh] : current;
      });
      offsetRef.current += page.commits.length;
      const nextHasMore = page.hasMore && page.commits.length > 0;
      hasMoreRef.current = nextHasMore;
      setHasMore(nextHasMore);
    } catch (rawError) {
      if (requestId !== requestSequence.current) {
        return;
      }
      hasMoreRef.current = false;
      setError(toGitError(rawError));
    } finally {
      if (requestId === requestSequence.current) {
        loadingRef.current = false;
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [repoPath, searchPattern]);

  useEffect(() => {
    requestSequence.current += 1;
    loadingRef.current = false;
    offsetRef.current = 0;
    hasMoreRef.current = true;
    setCommits([]);
    setHasMore(true);
    setError(null);
    setIsLoading(true);
    setIsLoadingMore(false);
    void loadMore();

    return () => {
      requestSequence.current += 1;
    };
  }, [loadMore, refreshToken, searchPattern]);

  const retry = useCallback(() => {
    if (loadingRef.current) {
      return;
    }
    hasMoreRef.current = true;
    setError(null);
    void loadMore();
  }, [loadMore]);

  return {
    commits,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    loadMore,
    retry,
  };
}
