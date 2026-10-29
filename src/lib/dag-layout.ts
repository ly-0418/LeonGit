/**
 * Incremental DAG lane assignment.
 *
 * This module is intentionally renderer-agnostic and has no React or Tauri
 * imports. The Canvas renderer consumes only the compact row metadata, so the
 * lane algorithm can be tested independently from the UI.
 */export interface DagCommitLike {
  oid: string;
  parents: string[];
}

export interface DagRow {
  oid: string;
  lane: number;
  /** True when this commit begins a new lane instead of continuing one. */
  started: boolean;
  /** Lanes merging into this commit from above (closed on this row). */
  incoming: number[];
  /** Lanes that continue straight through the row unchanged. */
  continuing: number[];
  /** Lanes waiting for parent commits below this row. */
  parentLanes: number[];
}

export interface DagState {
  lanes: Array<string | null>;
  maxLane: number;
}

export interface DagBatchResult {
  rows: DagRow[];
  state: DagState;
}

const MIN_GUTTER = 140;
const MAX_GUTTER = 220;
const LANE_STEP = 14;

/**
 * The gutter grows with the widest lane count so nodes are never clipped. The
 * cap keeps the commit summary readable on narrow windows; beyond it the lane
 * spacing compresses instead.
 */
export function dagGutterWidth(maxLane: number): number {
  const lanes = Math.max(1, maxLane + 1);
  return Math.min(MAX_GUTTER, Math.max(MIN_GUTTER, 20 + lanes * LANE_STEP));
}

/**
 * Distance between lanes for a given gutter. The result is derived from the
 * gutter so the right-most lane always stays inside the canvas.
 */
export function dagLaneSpacing(gutterWidth: number, maxLane: number): number {
  const lanes = Math.max(1, maxLane + 1);
  return Math.min(16, (gutterWidth - 20) / lanes);
}

function firstFree(lanes: Array<string | null>): number {
  return lanes.findIndex((lane) => lane === null);
}

/**
 * Appends rows for a new page of commits. Pass the previous state to preserve
 * lanes across pages. The returned rows are immutable metadata and contain no
 * per-row parent lane arrays larger than the active lane count.
 */
export function layoutDagBatch(
  commits: readonly DagCommitLike[],
  previous?: DagState,
): DagBatchResult {
  const lanes: Array<string | null> = previous
    ? [...previous.lanes]
    : [];
  let maxLane = previous?.maxLane ?? 0;
  const rows: DagRow[] = [];

  for (const commit of commits) {
    const top = [...lanes];
    const matches: number[] = [];
    lanes.forEach((waiting, index) => {
      if (waiting === commit.oid) matches.push(index);
    });

    let lane = matches[0] ?? firstFree(lanes);
    if (lane < 0) {
      lane = lanes.length;
      lanes.push(null);
    }
    const incoming = matches.slice(1);
    for (const index of incoming) {
      lanes[index] = null;
    }

    const parents = commit.parents.filter((parent) => parent.length > 0);
    const parentLanes: number[] = [];
    if (parents.length === 0) {
      lanes[lane] = null;
    } else {
      lanes[lane] = parents[0];
      parentLanes.push(lane);
      for (const parent of parents.slice(1)) {
        const existing = lanes.findIndex(
          (waiting, index) => waiting === parent && index !== lane,
        );
        if (existing >= 0) {
          parentLanes.push(existing);
        } else {
          let next = firstFree(lanes);
          if (next < 0) {
            next = lanes.length;
            lanes.push(parent);
          } else {
            lanes[next] = parent;
          }
          parentLanes.push(next);
        }
      }
    }

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop();
    }
    maxLane = Math.max(maxLane, lanes.length - 1, lane);

    const incomingSet = new Set(incoming);
    const continuing: number[] = [];
    for (let index = 0; index < top.length; index += 1) {
      if (
        top[index] !== null &&
        index !== lane &&
        !incomingSet.has(index) &&
        lanes[index] === top[index]
      ) {
        continuing.push(index);
      }
    }

    rows.push({
      oid: commit.oid,
      lane,
      started: matches.length === 0,
      incoming,
      continuing,
      parentLanes,
    });
  }

  return { rows, state: { lanes, maxLane } };
}
