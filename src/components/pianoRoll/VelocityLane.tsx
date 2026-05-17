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

    // Wise near-black velocity panel
    ctx.fillStyle = '#0a0b09';
    ctx.fillRect(0, 0, width, height);

    // Guide lines — Wise subtle green tint
    ctx.lineWidth = 1;
    for (const frac of [0.25, 0.5, 0.75, 1.0]) {
      const y = height - frac * (height - 4);
      ctx.strokeStyle = frac === 1.0
        ? 'rgba(159,232,112,0.15)'    // Wise Green top line
        : 'rgba(232,235,230,0.05)';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    const activeTrack = project.tracks.find((t) => t.id === project.activeTrackId);
    if (!activeTrack) return;

    for (const note of activeTrack.notes) {
      const x = tickToX(note.startTick, vp);
      if (x < 0 || x > width) continue;
      const barH = Math.max(2, (note.velocity / 127) * (height - 4));
      const y = height - barH;

      // Wise Green gradient for normal, Warning Yellow for selected
      const topColor = note.selected ? '#ffd11a' : activeTrack.color;
      const grad = ctx.createLinearGradient(0, y, 0, height);
      grad.addColorStop(0, topColor);
      grad.addColorStop(1, 'rgba(14,15,12,0.5)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, 3, barH);

      // Handle dot — Wise ring style
      ctx.fillStyle = note.selected ? '#163300' : topColor;
      ctx.beginPath();
      ctx.arc(x + 1.5, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      // White inner dot
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(x + 1.5, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Label — Wise weight-900 style
    ctx.fillStyle = 'rgba(159,232,112,0.35)';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('VELOCITY', 5, 12);
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
