import { useCallback, useEffect, useRef, useState } from "react";

import { openRepository, toGitError } from "@/lib/git-api";
import type { GitError, RepositorySnapshot } from "@/types/git";

export interface RepositoryController {
  snapshot: RepositorySnapshot | null;
  error: GitError | null;
  isOpening: boolean;
  isRefreshing: boolean;
  openPath: (path: string) => Promise<RepositorySnapshot | null>;
  adopt: (snapshot: RepositorySnapshot, force?: boolean) => void;
  refresh: () => Promise<void>;
  clear: () => void;
  reportError: (error: unknown) => void;
  dismissError: () => void;
}

export function useRepository(): RepositoryController {
  const [snapshot, setSnapshot] = useState<RepositorySnapshot | null>(null);
  const snapshotRef = useRef<RepositorySnapshot | null>(null);
  const [error, setError] = useState<GitError | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const requestSequence = useRef(0);

  useEffect(
    () => () => {
      requestSequence.current += 1;
    },
    [],
  );

  const commitSnapshot = useCallback((next: RepositorySnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const openPath = useCallback(async (path: string) => {
    const requestId = ++requestSequence.current;
    setIsOpening(true);
    setError(null);

    try {
      const next = await openRepository(path);
      if (requestId !== requestSequence.current) {
        return null;
      }
      commitSnapshot(next);
      return next;
    } catch (rawError) {
      if (requestId === requestSequence.current) {
        setError(toGitError(rawError));
      }
      return null;
    } finally {
      if (requestId === requestSequence.current) {
        setIsOpening(false);
      }
    }
  }, [commitSnapshot]);

  const adopt = useCallback((next: RepositorySnapshot, force = false) => {
    // A slow action from an old repository must not replace the new active
    // repository's snapshot after a switch.
    if (
      !force &&
      snapshotRef.current &&
      snapshotRef.current.path !== next.path
    ) {
      return;
    }
    requestSequence.current += 1;
    commitSnapshot(next);
    setError(null);
    setIsOpening(false);
    setIsRefreshing(false);
  }, [commitSnapshot]);

  const refresh = useCallback(async () => {
    if (!snapshot || isOpening || isRefreshing) {
      return;
    }

    const requestId = ++requestSequence.current;
    setIsRefreshing(true);
    setError(null);
    try {
      const next = await openRepository(snapshot.path);
      if (requestId === requestSequence.current) {
        commitSnapshot(next);
      }
    } catch (rawError) {
      if (requestId === requestSequence.current) {
        setError(toGitError(rawError));
      }
    } finally {
      if (requestId === requestSequence.current) {
        setIsRefreshing(false);
      }
    }
  }, [commitSnapshot, isOpening, isRefreshing, snapshot]);

  const reportError = useCallback((rawError: unknown) => {
    setError(toGitError(rawError));
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  const clear = useCallback(() => {
    requestSequence.current += 1;
    snapshotRef.current = null;
    setSnapshot(null);
    setError(null);
    setIsOpening(false);
    setIsRefreshing(false);
  }, []);

  return {
    snapshot,
    error,
    isOpening,
    isRefreshing,
    openPath,
    adopt,
    refresh,
    clear,
    reportError,
    dismissError,
  };
}
