import React, { useRef, useState } from 'react';
import type { AudioRegion } from '../../types/music';
import { WaveformCanvas } from './WaveformCanvas';
import { FadeHandle } from './FadeHandle';
import { useProjectStore } from '../../store/projectStore';

interface AudioRegionBlockProps {
  region: AudioRegion;
  pixelsPerTick: number;
  laneHeight: number;
  tool: 'pointer' | 'scissors' | 'fade' | 'loop';
  selected: boolean;
  onSelect: (id: string) => void;
  snapEnabled: boolean;
  snapTicks: number;
}

export const AudioRegionBlock: React.FC<AudioRegionBlockProps> = ({
  region, pixelsPerTick, laneHeight, tool, selected, onSelect, snapEnabled, snapTicks,
}) => {
  const updateAudioRegion  = useProjectStore((s) => s.updateAudioRegion);
  const splitAudioRegion   = useProjectStore((s) => s.splitAudioRegion);

  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(region.name);
  const dragRef = useRef<{ type: 'move' | 'resize-r' | 'resize-l' | 'fade-in' | 'fade-out'; startX: number; startTick: number; startDur: number; startFade: number } | null>(null);

  const left  = region.startTick * pixelsPerTick;
  const width = Math.max(8, region.durationTicks * pixelsPerTick);
  const height = laneHeight - 4;

  const snap = (tick: number) =>
    snapEnabled ? Math.round(tick / snapTicks) * snapTicks : tick;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tool === 'scissors') {
      const clickX  = e.nativeEvent.offsetX;
      const clickTick = region.startTick + clickX / pixelsPerTick;
      splitAudioRegion(region.id, snap(clickTick));
      return;
    }
    onSelect(region.id);
    dragRef.current = {
      type: 'move', startX: e.clientX,
      startTick: region.startTick, startDur: region.durationTicks, startFade: 0,
    };
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd, { once: true });
  };

  const handleResizeRight = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(region.id);
    dragRef.current = { type: 'resize-r', startX: e.clientX, startTick: region.startTick, startDur: region.durationTicks, startFade: 0 };
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd, { once: true });
  };

  const handleResizeLeft = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(region.id);
    dragRef.current = { type: 'resize-l', startX: e.clientX, startTick: region.startTick, startDur: region.durationTicks, startFade: 0 };
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd, { once: true });
  };

  const handleFadeIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    dragRef.current = { type: 'fade-in', startX: e.clientX, startTick: region.startTick, startDur: region.durationTicks, startFade: region.fadeInTicks };
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd, { once: true });
  };

  const handleFadeOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    dragRef.current = { type: 'fade-out', startX: e.clientX, startTick: region.startTick, startDur: region.durationTicks, startFade: region.fadeOutTicks };
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd, { once: true });
  };

  const handleDragMove = (e: MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const deltaPx   = e.clientX - d.startX;
    const deltaTick = deltaPx / pixelsPerTick;
    if (d.type === 'move') {
      updateAudioRegion(region.id, { startTick: Math.max(0, snap(d.startTick + deltaTick)) });
    } else if (d.type === 'resize-r') {
      updateAudioRegion(region.id, { durationTicks: Math.max(snapTicks, snap(d.startDur + deltaTick)) });
    } else if (d.type === 'resize-l') {
      const newStart = Math.max(0, snap(d.startTick + deltaTick));
      const diff     = newStart - d.startTick;
      updateAudioRegion(region.id, { startTick: newStart, durationTicks: Math.max(snapTicks, d.startDur - diff) });
    } else if (d.type === 'fade-in') {
      updateAudioRegion(region.id, { fadeInTicks: Math.max(0, Math.round(d.startFade + deltaTick)) });
    } else if (d.type === 'fade-out') {
      updateAudioRegion(region.id, { fadeOutTicks: Math.max(0, Math.round(d.startFade - deltaTick)) });
    }
  };

  const handleDragEnd = () => {
    dragRef.current = null;
    window.removeEventListener('mousemove', handleDragMove);
  };

  const fadeInW  = Math.min(width * 0.5, region.fadeInTicks  * pixelsPerTick);
  const fadeOutW = Math.min(width * 0.5, region.fadeOutTicks * pixelsPerTick);

  return (
    <div
      className={`audio-region-block${selected ? ' selected' : ''}${region.muted ? ' muted' : ''}`}
      style={{ left, width, height, bottom: 2, background: 'rgba(30,34,28,0.95)' }}
      onMouseDown={handleMouseDown}
      onDoubleClick={() => setEditing(true)}
    >
      <div className="audio-region-color-bar" style={{ background: region.color }} />

      {/* Fade overlays */}
      {fadeInW > 0 && (
        <div style={{
          position: 'absolute', left: 0, top: 4, width: fadeInW, bottom: 0,
          background: `linear-gradient(to right, rgba(0,0,0,0.5), transparent)`,
          pointerEvents: 'none',
        }} />
      )}
      {fadeOutW > 0 && (
        <div style={{
          position: 'absolute', right: 0, top: 4, width: fadeOutW, bottom: 0,
          background: `linear-gradient(to left, rgba(0,0,0,0.5), transparent)`,
          pointerEvents: 'none',
        }} />
      )}

      {editing ? (
        <input
          className="audio-region-name-input"
          value={nameVal}
          autoFocus
          onChange={(e) => setNameVal(e.target.value)}
          onBlur={() => { updateAudioRegion(region.id, { name: nameVal }); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { updateAudioRegion(region.id, { name: nameVal }); setEditing(false); } }}
        />
      ) : (
        <div className="audio-region-name" style={{ maxWidth: width - 12 }}>{region.name}</div>
      )}

      <WaveformCanvas
        peaks={region.waveformPeaks}
        gain={region.gain}
        muted={region.muted}
        width={width}
        height={height - 16}
      />

      {tool === 'fade' && (
        <>
          <FadeHandle type="in"  onDragStart={handleFadeIn} />
          <FadeHandle type="out" onDragStart={handleFadeOut} />
        </>
      )}

      <div className="audio-region-resize-left"  onMouseDown={handleResizeLeft} />
      <div className="audio-region-resize-right" onMouseDown={handleResizeRight} />
    </div>
  );
};
