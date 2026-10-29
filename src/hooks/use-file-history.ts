import { useCallback, useEffect, useRef, useState } from "react";

import { fileHistory, toGitError } from "@/lib/git-api";
import type { CommitSummary, GitError } from "@/types/git";

export const FILE_HISTORY_PAGE_SIZE = 100;

export interface FileHistoryController {
  commits: CommitSummary[];
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: GitError | null;
  loadMore: () => Promise<void>;
  retry: () => void;
}

export function useFileHistory(
  repoPath: string,
  filePath: string | null,
): FileHistoryController {
  const [commits, setCommits] = useState<CommitSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<GitError | null>(null);
  const requestSequence = useRef(0);
  const loadingRef = useRef(false);
  const nextPageRef = useRef(0);
  const hasMoreRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (!filePath || loadingRef.current || !hasMoreRef.current) {
      return;
    }
    const requestId = requestSequence.current;
    const firstPage = nextPageRef.current === 0;
    loadingRef.current = true;
    setError(null);
    if (firstPage) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const page = await fileHistory(
        repoPath,
        filePath,
        nextPageRef.current,
        FILE_HISTORY_PAGE_SIZE,
      );
      if (requestId !== requestSequence.current) {
        return;
      }
      setCommits((current) => [...current, ...page.commits]);
      nextPageRef.current += 1;
      hasMoreRef.current = page.hasMore && page.commits.length > 0;
      setHasMore(hasMoreRef.current);
    } catch (rawError) {
      if (requestId === requestSequence.current) {
        setError(toGitError(rawError));
        hasMoreRef.current = false;
      }
    } finally {
      if (requestId === requestSequence.current) {
        loadingRef.current = false;
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [filePath, repoPath]);

  useEffect(() => {
    requestSequence.current += 1;
    loadingRef.current = false;
    nextPageRef.current = 0;
    hasMoreRef.current = Boolean(filePath);
    setCommits([]);
    setHasMore(Boolean(filePath));
    setError(null);
    setIsLoading(Boolean(filePath));
    setIsLoadingMore(false);
    if (filePath) {
      void loadMore();
    }
    return () => {
      requestSequence.current += 1;
    };
  }, [filePath, loadMore]);

  const retry = useCallback(() => {
    if (loadingRef.current) return;
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
