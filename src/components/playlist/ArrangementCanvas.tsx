import React, { useEffect, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { ticksPerBar, ticksPerBeat } from '../../utils/time';

interface ArrangementCanvasProps {
  width: number;
  height: number;
}

export const ArrangementCanvas: React.FC<ArrangementCanvasProps> = ({ width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const project = useProjectStore((s) => s.project);
  const playlistView = useProjectStore((s) => s.playlistView);
  const ppt = useProjectStore((s) => s.arrangementPixelsPerTick());

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
    ctx.clearRect(0, 0, width, height);

    const alpha = playlistView.gridContrast === 'high' ? 0.28 : playlistView.gridContrast === 'low' ? 0.07 : 0.15;
    const { ppq, timeSignature } = project.settings;
    const barTicks = ticksPerBar(ppq, timeSignature);
    const beatTicks = ticksPerBeat(ppq, timeSignature);
    const leftTick = 0;
    const rightTick = Math.ceil(width / ppt);
    const startTick = Math.floor(leftTick / beatTicks) * beatTicks;

    for (let t = startTick; t <= rightTick; t += beatTicks) {
      const x = t * ppt;
      const isBar = t % barTicks === 0;
      ctx.strokeStyle = isBar
        ? `rgba(159,232,112,${Math.min(0.55, alpha + 0.22)})`
        : `rgba(232,235,230,${alpha})`;
      ctx.lineWidth = isBar ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    if (playlistView.showTrackSeparators) {
      const laneH = 72 * playlistView.trackHeightPercent / 100;
      ctx.strokeStyle = 'rgba(232,235,230,0.08)';
      for (let y = 0; y <= height; y += laneH) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }
  }, [project, playlistView, ppt, width, height]);

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }} />;
};
