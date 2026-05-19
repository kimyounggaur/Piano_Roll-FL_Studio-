import React, { useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';

function clampTrackHeight(value: number): number {
  return Math.max(33, Math.min(200, Math.round(value)));
}

export const TrackResizeHandle: React.FC = () => {
  const setPlaylistView = useProjectStore((s) => s.setPlaylistView);
  const trackHeightPercent = useProjectStore((s) => s.playlistView.trackHeightPercent);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startPercent = trackHeightPercent;
    const onMove = (ev: MouseEvent) => {
      const deltaPercent = ((ev.clientY - startY) / 72) * 100;
      setPlaylistView({ trackHeightPercent: clampTrackHeight(startPercent + deltaPercent) });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [setPlaylistView, trackHeightPercent]);

  return <div className="track-resize-handle" onMouseDown={onMouseDown} title="트랙 높이 조절" />;
};
