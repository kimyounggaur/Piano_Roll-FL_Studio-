import React, { useCallback, useEffect, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';

interface Props {
  width: number;
  height?: number;
  onOpenContextMenu?: (x: number, y: number, markerId: string) => void;
}

export const PlaylistMarkerLane: React.FC<Props> = ({ width, height = 22, onOpenContextMenu }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markers = useProjectStore((s) => s.playlistMarkers);
  const ppt = useProjectStore((s) => s.arrangementPixelsPerTick());
  const addMarker = useProjectStore((s) => s.addPlaylistMarker);
  const removeMarker = useProjectStore((s) => s.removePlaylistMarker);
  const setPlayheadTick = useProjectStore((s) => s.setPlayheadTick);
  const updatePlaylistMarker = useProjectStore((s) => s.updatePlaylistMarker);

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
    ctx.font = '700 10px Inter, sans-serif';

    for (const marker of markers) {
      const x = marker.tick * ppt;
      if (x < -80 || x > width + 80) continue;
      const color = marker.color ?? (marker.type === 'time_signature' ? '#38c8ff' : '#ffd11a');
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, 2);
      ctx.lineTo(x + 11, 2);
      ctx.lineTo(x + 11, 12);
      ctx.lineTo(x + 3, 12);
      ctx.lineTo(x + 3, height - 2);
      ctx.lineTo(x, height - 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#163300';
      ctx.fillText(marker.name, x + 15, 14);
      if (marker.loopEndTick && marker.loopEndTick > marker.tick) {
        const x2 = marker.loopEndTick * ppt;
        ctx.fillStyle = 'rgba(159,232,112,0.10)';
        ctx.fillRect(x, 0, x2 - x, height);
      }
    }
  }, [markers, ppt, width, height]);

  const hitMarkerAtClientX = useCallback((clientX: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const tick = Math.max(0, Math.round((clientX - rect.left) / ppt));
    return markers.find((m) => Math.abs(m.tick - tick) * ppt < 10) ?? null;
  }, [markers, ppt]);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const tick = Math.max(0, Math.round((e.clientX - rect.left) / ppt));
    const hit = hitMarkerAtClientX(e.clientX, e.currentTarget);
    if (hit && (e.altKey || e.shiftKey)) removeMarker(hit.id);
    else if (hit) setPlayheadTick(hit.tick);
    else addMarker(tick, 'none');
  }, [addMarker, hitMarkerAtClientX, ppt, removeMarker, setPlayheadTick]);

  const onContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitMarkerAtClientX(e.clientX, e.currentTarget);
    if (!hit) return;
    e.preventDefault();
    onOpenContextMenu?.(e.clientX, e.clientY, hit.id);
  }, [hitMarkerAtClientX, onOpenContextMenu]);

  const onDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitMarkerAtClientX(e.clientX, e.currentTarget);
    if (!hit) return;
    const nextName = window.prompt('마커 이름', hit.name);
    if (nextName) updatePlaylistMarker(hit.id, { name: nextName });
  }, [hitMarkerAtClientX, updatePlaylistMarker]);

  return <canvas ref={canvasRef} className="playlist-marker-lane" onMouseDown={onMouseDown} onContextMenu={onContextMenu} onDoubleClick={onDoubleClick} />;
};
