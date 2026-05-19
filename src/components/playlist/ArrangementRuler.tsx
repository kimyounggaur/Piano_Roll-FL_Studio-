import React, { useCallback, useEffect, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { formatTickAsBarBeat, formatTickFull, ticksPerBar, ticksPerBeat } from '../../utils/time';

interface ArrangementRulerProps {
  width: number;
  height?: number;
}

export const ArrangementRuler: React.FC<ArrangementRulerProps> = ({ width, height = 30 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const project = useProjectStore((s) => s.project);
  const playlistView = useProjectStore((s) => s.playlistView);
  const ppt = useProjectStore((s) => s.arrangementPixelsPerTick());
  const setPlayheadTick = useProjectStore((s) => s.setPlayheadTick);
  const selectTimeRange = useProjectStore((s) => s.selectTimeRange);

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
    ctx.fillStyle = playlistView.invertGrid ? '#e8ebe6' : '#111310';
    ctx.fillRect(0, 0, width, height);

    const { ppq, timeSignature } = project.settings;
    const barTicks = ticksPerBar(ppq, timeSignature);
    const beatTicks = ticksPerBeat(ppq, timeSignature);
    const leftTick = 0;
    const rightTick = Math.ceil(width / ppt);
    const major = playlistView.timeSegmentUnit === 'beats' ? beatTicks : playlistView.timeSegmentUnit === 'steps' ? ppq / 4 : barTicks;
    const minor = playlistView.timeSegmentUnit === 'beats' ? beatTicks / 4 : playlistView.timeSegmentUnit === 'steps' ? ppq / 16 : beatTicks;
    const start = Math.floor(leftTick / minor) * minor;

    ctx.font = '700 10px Inter, sans-serif';
    ctx.textAlign = 'left';
    for (let t = start; t <= rightTick; t += minor) {
      const x = t * ppt;
      const isMajor = Math.abs(t % major) < 0.0001;
      ctx.strokeStyle = isMajor ? 'rgba(159,232,112,0.45)' : 'rgba(232,235,230,0.12)';
      ctx.lineWidth = isMajor ? 1.4 : 1;
      ctx.beginPath();
      ctx.moveTo(x, isMajor ? 0 : height * 0.48);
      ctx.lineTo(x, height);
      ctx.stroke();
      if (isMajor) {
        ctx.fillStyle = playlistView.invertGrid ? '#163300' : '#9fe870';
        const label = playlistView.preciseTimeIndicator
          ? formatTickFull(t, timeSignature, ppq)
          : formatTickAsBarBeat(t, timeSignature, ppq).split(':')[0];
        ctx.fillText(label, x + 4, 12);
      }
    }
  }, [project, playlistView, ppt, width, height]);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const tick = Math.max(0, Math.round((e.clientX - rect.left) / ppt));
    if (e.shiftKey) {
      const start = useProjectStore.getState().project.settings.loopStartTick || tick;
      selectTimeRange(start, tick);
    } else {
      setPlayheadTick(tick);
    }
  }, [ppt, selectTimeRange, setPlayheadTick]);

  return <canvas ref={canvasRef} className="arrangement-ruler" onMouseDown={onMouseDown} />;
};
