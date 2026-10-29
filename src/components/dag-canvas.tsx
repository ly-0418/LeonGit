import { useEffect, useRef, useState, type RefObject } from "react";

import { dagLaneSpacing, type DagRow } from "@/lib/dag-layout";

const FALLBACK_LANES = [
  "#d5a84f",
  "#5aa9a0",
  "#cb7f6b",
  "#7c9fd0",
  "#a58bc4",
  "#8ea95c",
  "#d08cae",
  "#b08a5b",
];
const FALLBACK_SELECTED = "#f2d18c";
const LANE_COUNT = FALLBACK_LANES.length;

interface DagPalette {
  lanes: string[];
  selected: string;
}

interface DagCanvasProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  rows: DagRow[];
  maxLane: number;
  rowHeight: number;
  gutterWidth: number;
  selectedOid: string | null;
}

function laneX(lane: number, spacing: number): number {
  return 10 + lane * spacing;
}

function readPalette(): DagPalette {
  const styles = getComputedStyle(document.documentElement);
  return {
    lanes: FALLBACK_LANES.map(
      (fallback, index) =>
        styles.getPropertyValue(`--dag-${index + 1}`).trim() || fallback,
    ),
    selected:
      styles.getPropertyValue("--dag-selected").trim() || FALLBACK_SELECTED,
  };
}

export function DagCanvas({
  scrollRef,
  rows,
  maxLane,
  rowHeight,
  gutterWidth,
  selectedOid,
}: DagCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const drawRef = useRef<() => void>(() => {});
  const [palette, setPalette] = useState<DagPalette>(readPalette);
  const spacing = dagLaneSpacing(gutterWidth, maxLane);

  const draw = () => {
    const canvas = canvasRef.current;
    const scroll = scrollRef.current;
    if (!canvas || !scroll) return;

    const rect = scroll.getBoundingClientRect();
    const width = gutterWidth;
    const height = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.floor(width * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.style.width = `${width}px`;
    }
    if (canvas.height !== Math.floor(height * dpr)) {
      canvas.height = Math.floor(height * dpr);
      canvas.style.height = `${height}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const laneColor = (lane: number) =>
      palette.lanes[Math.abs(lane) % LANE_COUNT];

    const scrollTop = scroll.scrollTop;
    const first = Math.max(0, Math.floor(scrollTop / rowHeight) - 2);
    const last = Math.min(
      rows.length - 1,
      Math.ceil((scrollTop + height) / rowHeight) + 2,
    );
    const nodeRadius = Math.max(1.5, Math.min(4, spacing * 0.32));
    const laneWidth = Math.max(0.8, Math.min(1.4, spacing * 0.22));

    for (let index = first; index <= last; index += 1) {
      const row = rows[index];
      if (!row) continue;
      const top = index * rowHeight - scrollTop;
      const nodeY = top + rowHeight / 2;
      const commitX = laneX(row.lane, spacing);

      // Lanes that simply pass through this row.
      ctx.lineWidth = laneWidth;
      for (const lane of row.continuing) {
        ctx.strokeStyle = laneColor(lane);
        ctx.beginPath();
        ctx.moveTo(laneX(lane, spacing), top);
        ctx.lineTo(laneX(lane, spacing), top + rowHeight);
        ctx.stroke();
      }

      // Lanes merging into this commit from above.
      for (const lane of row.incoming) {
        ctx.strokeStyle = laneColor(lane);
        ctx.beginPath();
        ctx.moveTo(laneX(lane, spacing), top);
        ctx.bezierCurveTo(
          laneX(lane, spacing),
          top + rowHeight * 0.35,
          commitX,
          nodeY - rowHeight * 0.2,
          commitX,
          nodeY,
        );
        ctx.stroke();
      }

      // Node's own lane down to the node.
      if (!row.started) {
        ctx.strokeStyle = laneColor(row.lane);
        ctx.beginPath();
        ctx.moveTo(commitX, top);
        ctx.lineTo(commitX, nodeY);
        ctx.stroke();
      }

      // Parent lanes fan out below the node.
      for (const lane of row.parentLanes) {
        const x = laneX(lane, spacing);
        ctx.strokeStyle = laneColor(lane);
        ctx.beginPath();
        if (lane === row.lane) {
          ctx.moveTo(commitX, nodeY);
          ctx.lineTo(x, top + rowHeight);
        } else {
          ctx.moveTo(commitX, nodeY);
          ctx.bezierCurveTo(
            commitX,
            nodeY + rowHeight * 0.2,
            x,
            top + rowHeight * 0.65,
            x,
            top + rowHeight,
          );
        }
        ctx.stroke();
      }

      ctx.fillStyle = laneColor(row.lane);
      ctx.beginPath();
      ctx.arc(commitX, nodeY, nodeRadius, 0, Math.PI * 2);
      ctx.fill();
      if (row.oid === selectedOid) {
        ctx.strokeStyle = palette.selected;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(commitX, nodeY, nodeRadius + 2.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  };
  drawRef.current = draw;

  // The palette comes from CSS variables so lanes follow light/dark tokens.
  useEffect(() => {
    const root = document.documentElement;
    const refresh = () => setPalette(readPalette());
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Subscribe once; prop changes only trigger a redraw, not re-subscription.
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return undefined;
    const schedule = () => {
      if (animationRef.current !== null) return;
      animationRef.current = window.requestAnimationFrame(() => {
        animationRef.current = null;
        drawRef.current();
      });
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(scroll);
    scroll.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      scroll.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [scrollRef]);

  useEffect(() => {
    drawRef.current();
  }, [
    gutterWidth,
    maxLane,
    palette,
    rowHeight,
    rows,
    rows.length,
    selectedOid,
  ]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-10"
    />
  );
}
