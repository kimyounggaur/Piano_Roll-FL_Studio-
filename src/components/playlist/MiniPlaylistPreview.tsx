import React, { useEffect, useMemo, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';

interface MiniPlaylistPreviewProps {
  timelineWidth: number;
  viewportWidth: number;
}

export const MiniPlaylistPreview: React.FC<MiniPlaylistPreviewProps> = ({ timelineWidth, viewportWidth }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRegions = useProjectStore((s) => s.audioRegions);
  const midiClips = useProjectStore((s) => s.midiClips);
  const markers = useProjectStore((s) => s.playlistMarkers);
  const view = useProjectStore((s) => s.playlistView);
  const scrollX = useProjectStore((s) => s.arrangementScrollX);
  const scrollY = useProjectStore((s) => s.arrangementScrollY);
  const setArrangementScroll = useProjectStore((s) => s.setArrangementScroll);
  const height = view.miniPreviewDoubleHeight ? 88 : 44;

  const maxTick = useMemo(() => Math.max(1, ...audioRegions.map((r) => r.startTick + r.durationTicks), ...midiClips.map((c) => c.startTick + c.durationTicks)), [audioRegions, midiClips]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const canvasWidth = Math.max(1, viewportWidth);
    canvas.width = canvasWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasWidth, height);
    ctx.fillStyle = '#090a07';
    ctx.fillRect(0, 0, canvasWidth, height);
    const scale = canvasWidth / maxTick;
    const clips = [...audioRegions, ...midiClips];
    clips.forEach((clip, index) => {
      ctx.fillStyle = clip.color;
      const x = clip.startTick * scale;
      const w = Math.max(2, clip.durationTicks * scale);
      const y = 5 + (index % 5) * ((height - 10) / 5);
      ctx.globalAlpha = clip.muted ? 0.35 : 0.88;
      ctx.fillRect(x, y, w, Math.max(3, (height - 14) / 7));
    });
    ctx.globalAlpha = 1;
    if (view.miniPreviewShowTimeMarkers) {
      for (const marker of markers) {
        const x = marker.tick * scale;
        ctx.fillStyle = marker.color ?? '#ffd11a';
        ctx.fillRect(x, 0, 2, height);
      }
    }
  }, [audioRegions, height, markers, maxTick, midiClips, view.miniPreviewShowTimeMarkers, viewportWidth]);

  const canvasWidth = Math.max(1, viewportWidth);
  const viewportLeft = Math.max(0, Math.min(canvasWidth, (scrollX / Math.max(1, timelineWidth)) * canvasWidth));
  const viewportBoxWidth = Math.max(10, Math.min(canvasWidth, (viewportWidth / Math.max(1, timelineWidth)) * canvasWidth));

  const moveToClientX = (clientX: number, rect: DOMRect) => {
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setArrangementScroll(Math.max(0, ratio * timelineWidth - viewportWidth / 2), scrollY);
  };

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    moveToClientX(e.clientX, rect);
    const onMove = (ev: MouseEvent) => moveToClientX(ev.clientX, rect);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="mini-playlist-preview" style={{ height }} onMouseDown={onMouseDown}>
      <canvas ref={canvasRef} />
      <div className="mini-preview-viewport-box" style={{ left: viewportLeft, width: viewportBoxWidth }} />
    </div>
  );
};
