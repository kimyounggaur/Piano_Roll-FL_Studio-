import React, { useRef, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { MidiClip } from '../../types/music';

interface Props {
  clip: MidiClip;
  pixelsPerTick: number;
  laneHeight: number;
  tool: string;
  selected: boolean;
  onSelect: (id: string | null) => void;
  snapEnabled: boolean;
  snapTicks: number;
}

export const MidiClipBlock: React.FC<Props> = ({
  clip, pixelsPerTick, laneHeight, tool, selected, onSelect, snapEnabled, snapTicks,
}) => {
  const updateMidiClip = useProjectStore((s) => s.updateMidiClip);
  const removeMidiClip = useProjectStore((s) => s.removeMidiClip);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef   = useRef<{ startX: number; startTick: number } | null>(null);

  const blockW = Math.max(8, clip.durationTicks * pixelsPerTick);
  const blockH = laneHeight - 4;

  // ── Mini piano roll canvas ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = Math.ceil(blockW);
    canvas.height = blockH - 16; // leave room for name bar
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const notes = clip.notes;
    if (notes.length === 0) {
      ctx.fillStyle = 'rgba(159,232,112,0.12)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('노트 없음', canvas.width / 2, canvas.height / 2 + 4);
      return;
    }

    const pitches = notes.map((n) => n.pitch);
    const minP = Math.min(...pitches);
    const maxP = Math.max(...pitches);
    const pitchRange = Math.max(maxP - minP + 1, 12);
    const alpha = clip.muted ? 0.25 : 0.85;

    for (const note of notes) {
      const x = (note.startTick / clip.durationTicks) * canvas.width;
      const w = Math.max(1.5, (note.durationTicks / clip.durationTicks) * canvas.width - 0.5);
      const y = ((maxP - note.pitch) / pitchRange) * (canvas.height - 2) + 1;
      const h = Math.max(1.5, (canvas.height - 2) / pitchRange - 0.5);
      ctx.fillStyle = `rgba(159,232,112,${alpha})`;
      ctx.fillRect(x, y, w, h);
    }
  }, [clip.notes, clip.durationTicks, clip.muted, blockW, blockH]);

  // ── Drag to move ───────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (tool === 'scissors') {
      removeMidiClip(clip.id);
      return;
    }
    e.stopPropagation();
    onSelect(clip.id);
    dragRef.current = { startX: e.clientX, startTick: clip.startTick };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      let newTick = dragRef.current.startTick + Math.round(dx / pixelsPerTick);
      if (snapEnabled) newTick = Math.round(newTick / snapTicks) * snapTicks;
      updateMidiClip(clip.id, { startTick: Math.max(0, newTick) });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [clip, tool, onSelect, removeMidiClip, updateMidiClip, pixelsPerTick, snapEnabled, snapTicks]);

  return (
    <div
      className={`midi-clip-block${selected ? ' selected' : ''}${clip.muted ? ' muted' : ''}`}
      style={{ left: clip.startTick * pixelsPerTick, width: blockW, height: blockH }}
      onMouseDown={handleMouseDown}
    >
      {/* color bar + name */}
      <div className="midi-clip-header" style={{ background: clip.color }}>
        <span className="midi-clip-name">{clip.name}</span>
        <button
          className="midi-clip-mute-btn"
          title={clip.muted ? '음소거 해제' : '음소거'}
          onClick={(e) => { e.stopPropagation(); updateMidiClip(clip.id, { muted: !clip.muted }); }}
        >
          {clip.muted ? '🔇' : '🎹'}
        </button>
      </div>
      {/* mini piano roll */}
      <canvas ref={canvasRef} className="midi-clip-canvas" />
    </div>
  );
};
