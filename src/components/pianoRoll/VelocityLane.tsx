import React, { useRef, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { tickToX } from '../../utils/geometry';
import { clamp } from '../../utils/geometry';

interface Props {
  width: number;
  height: number;
}

export const VelocityLane: React.FC<Props> = ({ width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { project, viewport, updateNote } = useProjectStore();
  const vp = viewport;
  const isDragging = useRef(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = width  * dpr;
    canvas.height = height * dpr;
    canvas.style.width  = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0e0e1c';
    ctx.fillRect(0, 0, width, height);

    // Guide lines at 25%, 50%, 75%, 100%
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (const frac of [0.25, 0.5, 0.75]) {
      const y = height - frac * height;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    const activeTrack = project.tracks.find((t) => t.id === project.activeTrackId);
    if (!activeTrack) return;

    for (const note of activeTrack.notes) {
      const x = tickToX(note.startTick, vp);
      if (x < 0 || x > width) continue;
      const barH = Math.max(2, (note.velocity / 127) * (height - 4));
      const y = height - barH;

      const grad = ctx.createLinearGradient(0, y, 0, height);
      grad.addColorStop(0, note.selected ? '#ffd93d' : activeTrack.color);
      grad.addColorStop(1, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, 3, barH);

      // Handle dot
      ctx.fillStyle = note.selected ? '#fff' : 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(x + 1.5, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '10px sans-serif';
    ctx.fillText('VELOCITY', 4, 12);
  }, [width, height, vp, project]);

  useEffect(() => { draw(); });

  const editVelocity = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const vel = clamp(Math.round(((height - cy) / height) * 127), 1, 127);
      const activeTrack = project.tracks.find((t) => t.id === project.activeTrackId);
      if (!activeTrack) return;
      // Find nearest note within 10px
      let best: string | null = null;
      let bestDist = Infinity;
      for (const note of activeTrack.notes) {
        const nx = tickToX(note.startTick, vp);
        const dist = Math.abs(nx - cx);
        if (dist < 10 && dist < bestDist) { best = note.id; bestDist = dist; }
      }
      if (best) updateNote(activeTrack.id, best, { velocity: vel });
    },
    [vp, height, project, updateNote]
  );

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', cursor: 'ns-resize' }}
      onMouseDown={(e) => { isDragging.current = true; editVelocity(e); }}
      onMouseMove={(e) => { if (isDragging.current) editVelocity(e); }}
      onMouseUp={() => { isDragging.current = false; }}
      onMouseLeave={() => { isDragging.current = false; }}
    />
  );
};
