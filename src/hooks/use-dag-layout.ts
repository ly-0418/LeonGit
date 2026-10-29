import { useEffect, useMemo, useRef, useState } from "react";

import {
  layoutDagBatch,
  type DagRow,
  type DagState,
} from "@/lib/dag-layout";
import type { CommitSummary } from "@/types/git";

interface Cache {
  key: string;
  length: number;
  firstOid: string | null;
  lastOid: string | null;
  rows: DagRow[];
  state?: DagState;
  maxLane: number;
}

export interface DagLayoutController {
  rows: DagRow[];
  maxLane: number;
}

/**
 * Appends layout rows page by page. A full re-layout is only performed when the
 * first/last commit identity, repository, search, or refresh token changes.
 */
export function useDagLayout(
  commits: CommitSummary[],
  repoPath: string,
  refreshToken: number,
  searchPattern: string,
  enabled: boolean,
): DagLayoutController {
  const cacheRef = useRef<Cache | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    // The list view does not need graph rows; building them for every page
    // would add CPU and memory for users who never open DAG.
    if (!enabled) {
      return;
    }

    const key = `${repoPath}\u0000${refreshToken}\u0000${searchPattern}`;
    const cache = cacheRef.current;
    const firstOid = commits[0]?.oid ?? null;
    const lastOid =
      commits.length > 0 ? commits[commits.length - 1].oid : null;
    const prefixChanged =
      !cache ||
      cache.key !== key ||
      commits.length < cache.length ||
      (cache.length > 0 &&
        (cache.firstOid !== firstOid ||
          cache.rows[cache.length - 1]?.oid !== commits[cache.length - 1]?.oid));

    const nextCache: Cache = prefixChanged
      ? {
          key,
          length: 0,
          firstOid,
          lastOid,
          rows: [],
          state: undefined,
          maxLane: 0,
        }
      : cache;

    if (commits.length > nextCache.length) {
      const batch = commits.slice(nextCache.length);
      const result = layoutDagBatch(batch, nextCache.state);
      nextCache.rows.push(...result.rows);
      nextCache.state = result.state;
      nextCache.maxLane = result.state.maxLane;
      nextCache.length = commits.length;
      nextCache.lastOid = lastOid;
      cacheRef.current = nextCache;
      setRevision((value) => value + 1);
    } else if (prefixChanged) {
      nextCache.firstOid = firstOid;
      nextCache.lastOid = lastOid;
      cacheRef.current = nextCache;
      setRevision((value) => value + 1);
    }
  }, [commits, enabled, refreshToken, repoPath, searchPattern]);

  return useMemo(() => {
    const cache = cacheRef.current;
    return {
      rows: cache?.rows ?? [],
      maxLane: cache?.maxLane ?? 0,
    };
  }, [revision]);
}
