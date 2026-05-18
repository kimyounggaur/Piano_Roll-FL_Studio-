import React, { useCallback, useEffect, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { PianoRollViewport } from '../../types/music';

interface Props {
  width: number;
  height: number;
}

const TOTAL_KEYS = 128;
const MIN_PIXELS_PER_TICK = 0.0001;
interface MapPoint {
  x: number;
  y: number;
  tick: number;
  pitch: number;
}

interface ViewportRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DragState {
  active: boolean;
  offsetX: number;
  offsetY: number;
}

interface MiniMapMetrics {
  viewport: PianoRollViewport;
  total: number;
  xScale: number;
  yScale: number;
}

// ═══════════════════════════════════════════════════════════════════
//  MiniMap — bird's-eye view of every track's notes.
//  Dragging the viewport rect moves scrollX (and scrollY when dragging
//  near the vertical edges).  Click-to-jump centers the viewport on
//  the clicked tick.
// ═══════════════════════════════════════════════════════════════════
export const MiniMap: React.FC<Props> = ({ width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const project    = useProjectStore((s) => s.project);
  const viewport   = useProjectStore((s) => s.viewport);
  const totalTicks = useProjectStore((s) => s.totalTicks);
  const setViewport = useProjectStore((s) => s.setViewport);

  const total = totalTicks();
  const xScale = width  / Math.max(1, total);
  const yScale = height / TOTAL_KEYS;
  const metricsRef = useRef<MiniMapMetrics>({ viewport, total, xScale, yScale });
  metricsRef.current = { viewport, total, xScale, yScale };

  // ── render ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width  = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#0a0b08';
    ctx.fillRect(0, 0, width, height);

    // Notes — all tracks, with active track in accent colour
    for (const t of project.tracks) {
      const isActive = t.id === project.activeTrackId;
      ctx.fillStyle = isActive ? t.color : 'rgba(255,255,255,0.18)';
      for (const n of t.notes) {
        const x = n.startTick * xScale;
        const w = Math.max(1, n.durationTicks * xScale);
        const y = (TOTAL_KEYS - 1 - n.pitch) * yScale;
        ctx.fillRect(x, y, w, Math.max(1, yScale));
      }
    }

    // Viewport rectangle
    const pixelsPerTick = Math.max(MIN_PIXELS_PER_TICK, viewport.pixelsPerTick);
    const vx = viewport.scrollX / pixelsPerTick * xScale;
    const vw = viewport.width  / pixelsPerTick * xScale;
    const vy = viewport.scrollY / viewport.keyHeight * yScale;
    const vh = viewport.height / viewport.keyHeight * yScale;
    ctx.strokeStyle = '#9fe870';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, Math.max(2, vw), Math.max(2, vh));
    ctx.fillStyle = 'rgba(159,232,112,0.10)';
    ctx.fillRect(vx, vy, Math.max(2, vw), Math.max(2, vh));
  }, [project, viewport, width, height, xScale, yScale]);

  // ── drag / click to scroll ────────────────────────────────────
  const drag = useRef<DragState>({ active: false, offsetX: 0, offsetY: 0 });

  const pointFromEvent = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | MouseEvent): MapPoint => {
      const { total, xScale, yScale } = metricsRef.current;
      const rect = canvasRef.current!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const tick = Math.max(0, Math.min(total, cx / xScale));
      const pitch = Math.max(0, Math.min(TOTAL_KEYS - 1, TOTAL_KEYS - 1 - cy / yScale));
      return { x: cx, y: cy, tick, pitch };
    },
    [],
  );

  const viewportRect = useCallback((): ViewportRect => {
    const { viewport, xScale, yScale } = metricsRef.current;
    const pixelsPerTick = Math.max(MIN_PIXELS_PER_TICK, viewport.pixelsPerTick);
    return {
      x: viewport.scrollX / pixelsPerTick * xScale,
      y: viewport.scrollY / viewport.keyHeight * yScale,
      w: Math.max(2, viewport.width / pixelsPerTick * xScale),
      h: Math.max(2, viewport.height / viewport.keyHeight * yScale),
    };
  }, []);

  const center = useCallback((tick: number, pitch: number) => {
    const { viewport, total } = metricsRef.current;
    const pixelsPerTick = Math.max(MIN_PIXELS_PER_TICK, viewport.pixelsPerTick);
    const maxScrollX = Math.max(0, total * pixelsPerTick - viewport.width);
    const scrollX = Math.max(0, Math.min(maxScrollX, tick * pixelsPerTick - viewport.width / 2));
    const targetRowFromTop = (TOTAL_KEYS - 1 - pitch);
    const scrollY = Math.max(0, targetRowFromTop * viewport.keyHeight - viewport.height / 2);
    setViewport({ scrollX, scrollY });
  }, [setViewport]);

  const moveViewportFromPoint = useCallback((point: MapPoint, offsetX: number, offsetY: number) => {
    const { viewport, total, xScale, yScale } = metricsRef.current;
    const pixelsPerTick = Math.max(MIN_PIXELS_PER_TICK, viewport.pixelsPerTick);
    const targetTick = Math.max(0, (point.x - offsetX) / xScale);
    const targetRowFromTop = Math.max(0, (point.y - offsetY) / yScale);
    const maxScrollX = Math.max(0, total * pixelsPerTick - viewport.width);
    const maxScrollY = Math.max(0, TOTAL_KEYS * viewport.keyHeight - viewport.height);
    setViewport({
      scrollX: Math.max(0, Math.min(maxScrollX, targetTick * pixelsPerTick)),
      scrollY: Math.max(0, Math.min(maxScrollY, targetRowFromTop * viewport.keyHeight)),
    });
  }, [setViewport]);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(e);
    const rect = viewportRect();
    const insideViewport =
      point.x >= rect.x && point.x <= rect.x + rect.w &&
      point.y >= rect.y && point.y <= rect.y + rect.h;

    if (insideViewport) {
      drag.current = {
        active: true,
        offsetX: point.x - rect.x,
        offsetY: point.y - rect.y,
      };
      return;
    }

    center(point.tick, point.pitch);
    drag.current = {
      active: true,
      offsetX: rect.w / 2,
      offsetY: rect.h / 2,
    };
  }, [pointFromEvent, viewportRect, center]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current.active || !canvasRef.current) return;
      moveViewportFromPoint(pointFromEvent(e), drag.current.offsetX, drag.current.offsetY);
    };
    const onUp = () => {
      drag.current = { active: false, offsetX: 0, offsetY: 0 };
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [pointFromEvent, moveViewportFromPoint]);

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={onMouseDown}
      style={{ display: 'block', cursor: 'crosshair', borderRadius: 4 }}
    />
  );
};
