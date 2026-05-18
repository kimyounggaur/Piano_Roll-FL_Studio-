import React, { useCallback, useEffect, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';

interface Props {
  width: number;
  height: number;
}

const TOTAL_KEYS = 128;

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
    const vx = viewport.scrollX / Math.max(1, viewport.pixelsPerTick) * xScale;
    const vw = viewport.width  / Math.max(1, viewport.pixelsPerTick) * xScale;
    const vy = viewport.scrollY / viewport.keyHeight * yScale;
    const vh = viewport.height / viewport.keyHeight * yScale;
    ctx.strokeStyle = '#9fe870';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, Math.max(2, vw), Math.max(2, vh));
    ctx.fillStyle = 'rgba(159,232,112,0.10)';
    ctx.fillRect(vx, vy, Math.max(2, vw), Math.max(2, vh));
  }, [project, viewport, width, height, xScale, yScale]);

  // ── drag / click to scroll ────────────────────────────────────
  const dragging = useRef(false);

  const positionFromEvent = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | MouseEvent): { tick: number; pitch: number } => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const tick = Math.max(0, Math.min(total, cx / xScale));
      const pitch = Math.max(0, Math.min(TOTAL_KEYS - 1, TOTAL_KEYS - 1 - cy / yScale));
      return { tick, pitch };
    },
    [total, xScale, yScale],
  );

  const center = useCallback((tick: number, pitch: number) => {
    const scrollX = Math.max(0, tick * viewport.pixelsPerTick - viewport.width / 2);
    const targetRowFromTop = (TOTAL_KEYS - 1 - pitch);
    const scrollY = Math.max(0, targetRowFromTop * viewport.keyHeight - viewport.height / 2);
    setViewport({ scrollX, scrollY });
  }, [viewport, setViewport]);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    dragging.current = true;
    const { tick, pitch } = positionFromEvent(e);
    center(tick, pitch);
  }, [positionFromEvent, center]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !canvasRef.current) return;
      const { tick, pitch } = positionFromEvent(e);
      center(tick, pitch);
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [positionFromEvent, center]);

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={onMouseDown}
      style={{ display: 'block', cursor: 'crosshair', borderRadius: 4 }}
    />
  );
};
