import assert from "node:assert/strict";

import {
  dagGutterWidth,
  dagLaneSpacing,
  layoutDagBatch,
  type DagCommitLike,
} from "../src/lib/dag-layout.ts";

function ids(rows: { oid: string }[]): string[] {
  return rows.map((row) => row.oid);
}

// Linear history stays in one lane.
{
  const result = layoutDagBatch([
    { oid: "c", parents: ["b"] },
    { oid: "b", parents: ["a"] },
    { oid: "a", parents: [] },
  ]);
  assert.deepEqual(ids(result.rows), ["c", "b", "a"]);
  assert.deepEqual(result.rows.map((row) => row.lane), [0, 0, 0]);
  assert.deepEqual(result.state.lanes, []);
}

// A merge keeps the mainline lane and opens a second parent lane.
{
  const result = layoutDagBatch([
    { oid: "m", parents: ["a", "b"] },
    { oid: "a", parents: [] },
    { oid: "b", parents: [] },
  ]);
  assert.equal(result.rows[0].lane, 0);
  assert.deepEqual(result.rows[0].parentLanes, [0, 1]);
}

// Two children pointing at the same parent converge; the extra lane closes.
{
  const result = layoutDagBatch([
    { oid: "x", parents: ["p"] },
    { oid: "y", parents: ["p"] },
    { oid: "p", parents: [] },
  ]);
  assert.deepEqual(result.rows[0].parentLanes, [0]);
  assert.deepEqual(result.rows[1].parentLanes, [1]);
  assert.deepEqual(result.rows[2].incoming, [1]);
  assert.equal(result.rows[2].lane, 0);
}

// Appending a page must equal laying out the whole list at once.
{
  const commits: DagCommitLike[] = [
    { oid: "m", parents: ["a", "b"] },
    { oid: "a", parents: ["base"] },
    { oid: "b", parents: ["base"] },
    { oid: "base", parents: [] },
  ];
  const whole = layoutDagBatch(commits);
  const first = layoutDagBatch(commits.slice(0, 2));
  const second = layoutDagBatch(commits.slice(2), first.state);
  assert.deepEqual([...first.rows, ...second.rows], whole.rows);
  assert.deepEqual(second.state, whole.state);
}

// Octopus merges open one lane per extra parent.
{
  const result = layoutDagBatch([
    { oid: "m", parents: ["a", "b", "c"] },
    { oid: "a", parents: [] },
    { oid: "b", parents: [] },
    { oid: "c", parents: [] },
  ]);
  assert.deepEqual(result.rows[0].parentLanes, [0, 1, 2]);
  assert.equal(result.state.maxLane, 2);
}

// A closed middle lane is reused by a later branch instead of growing forever.
{
  const result = layoutDagBatch([
    { oid: "x", parents: ["p"] },
    { oid: "y", parents: ["q"] },
    { oid: "p", parents: [] },
    { oid: "z", parents: ["r"] },
  ]);
  assert.equal(result.rows[3].lane, 0);
  assert.equal(result.rows[3].started, true);
}

// A merge whose second parent is already awaited joins the existing lane.
{
  const result = layoutDagBatch([
    { oid: "y", parents: ["p"] },
    { oid: "m", parents: ["a", "p"] },
  ]);
  assert.deepEqual(result.rows[1].parentLanes, [1, 0]);
}

// The derived gutter/spacing must keep the right-most lane inside the canvas.
{
  for (let maxLane = 0; maxLane <= 500; maxLane += 1) {
    const gutter = dagGutterWidth(maxLane);
    const spacing = dagLaneSpacing(gutter, maxLane);
    const maxX = 10 + maxLane * spacing;
    assert.ok(
      maxX <= gutter - 2,
      `lane ${maxLane} at x=${maxX} escapes gutter ${gutter}`,
    );
  }
  assert.equal(dagGutterWidth(0), 140);
  assert.ok(dagGutterWidth(30) <= 220);
}

console.log("dag-layout: ok");
