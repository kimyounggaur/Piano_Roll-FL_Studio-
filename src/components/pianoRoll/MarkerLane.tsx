import React, { useCallback, useEffect, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { tickToX, xToTick } from '../../utils/geometry';

interface Props {
  width: number;
  height?: number;
}

// ═══════════════════════════════════════════════════════════════════
//  MarkerLane — Verse / Chorus etc. flags above the bar ruler (#44)
// ═══════════════════════════════════════════════════════════════════
export const MarkerLane: React.FC<Props> = ({ width, height = 18 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewport = useProjectStore((s) => s.viewport);
  const playheadTick = useProjectStore((s) => s.playheadTick);
  const markers = useProjectStore((s) => s.project.markers ?? []);
  const addMarker = useProjectStore((s) => s.addMarker);
  const removeMarker = useProjectStore((s) => s.removeMarker);
  const updateMarker = useProjectStore((s) => s.updateMarker);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0e0f0c';
    ctx.fillRect(0, 0, width, height);
    for (const m of markers) {
      const x = tickToX(m.tick, viewport);
      if (x < -100 || x > width) continue;
      ctx.fillStyle = m.color ?? '#ffd11a';
      ctx.fillRect(x, 0, 2, height);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 10, 0);
      ctx.lineTo(x + 10, 6);
      ctx.lineTo(x + 2, 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#163300';
      ctx.font = '600 9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(m.name, x + 13, 12);
    }
  }, [markers, viewport, width, height]);

  const onClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    // Find marker under cursor first.
    for (const m of markers) {
      const x = tickToX(m.tick, viewport);
      if (cx >= x && cx <= x + 12) {
        if (e.shiftKey) { removeMarker(m.id); return; }
        // Double-click handler renames; single click on marker jumps.
        useProjectStore.getState().jumpToMarker(m.id);
        return;
      }
    }
    // Empty lane click → create at click position.
    const tick = Math.max(0, Math.round(xToTick(cx, viewport)));
    const name = window.prompt('마커 이름', `Marker ${markers.length + 1}`);
    if (name === null) return;
    addMarker(tick, name);
  }, [markers, viewport, addMarker, removeMarker]);

  const onDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    for (const m of markers) {
      const x = tickToX(m.tick, viewport);
      if (cx >= x && cx <= x + 80) {
        const name = window.prompt('마커 이름 변경', m.name);
        if (name && name.trim()) updateMarker(m.id, { name: name.trim() });
        return;
      }
    }
  }, [markers, viewport, updateMarker]);

  // Suppress unused-var TS warning for playheadTick — referenced so we re-render
  // on transport changes (so existing-marker hit-tests use latest viewport).
  void playheadTick;

  return (
    <canvas
      ref={canvasRef}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{ display: 'block', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
    />
  );
};
