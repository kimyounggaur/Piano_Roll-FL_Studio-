import React, { useMemo, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { AudioRegion, MidiClip } from '../../types/music';
import { snapPlaylistTick } from '../../utils/playlistSnap';

type Clip = AudioRegion | MidiClip;

interface Props {
  clip: Clip;
  kind: 'audio' | 'midi';
  trackIndex: number;
  laneHeight: number;
  onOpenContextMenu: (x: number, y: number, clipId: string, atTick: number) => void;
}

function isMidiClip(clip: Clip): clip is MidiClip {
  return 'notes' in clip;
}

export const ArrangementClipBlock: React.FC<Props> = ({ clip, kind, trackIndex, laneHeight, onOpenContextMenu }) => {
  const selected = useProjectStore((s) => s.selectedClipIds.has(clip.id));
  const selectClip = useProjectStore((s) => s.selectClip);
  const selectedClipIds = useProjectStore((s) => s.selectedClipIds);
  const updateAudioRegion = useProjectStore((s) => s.updateAudioRegion);
  const updateMidiClip = useProjectStore((s) => s.updateMidiClip);
  const moveSelectedClips = useProjectStore((s) => s.moveSelectedClips);
  const toggleSelectedClipsMute = useProjectStore((s) => s.toggleSelectedClipsMute);
  const beginTransaction = useProjectStore((s) => s.beginTransaction);
  const commitTransaction = useProjectStore((s) => s.commitTransaction);
  const project = useProjectStore((s) => s.project);
  const playlistView = useProjectStore((s) => s.playlistView);
  const ppt = useProjectStore((s) => s.arrangementPixelsPerTick());
  const audioRegions = useProjectStore((s) => s.audioRegions);
  const midiClips = useProjectStore((s) => s.midiClips);
  const activeTool = useProjectStore((s) => s.activeTool);
  const dragRef = useRef<{ x: number; startTick: number; startDuration: number; lastDelta: number; mode: 'move' | 'left' | 'right' } | null>(null);

  const left = clip.startTick * ppt;
  const width = Math.max(14, clip.durationTicks * ppt);
  const color = clip.color;

  const notes = isMidiClip(clip) ? clip.notes : [];
  const notePreview = useMemo(() => {
    if (!notes.length) return null;
    const minPitch = Math.min(...notes.map((n) => n.pitch));
    const maxPitch = Math.max(...notes.map((n) => n.pitch));
    const range = Math.max(1, maxPitch - minPitch + 1);
    return notes.slice(0, 120).map((note) => ({
      id: note.id,
      left: `${(note.startTick / Math.max(1, clip.durationTicks)) * 100}%`,
      width: `${Math.max(1, (note.durationTicks / Math.max(1, clip.durationTicks)) * 100)}%`,
      top: `${((maxPitch - note.pitch) / range) * 88 + 4}%`,
    }));
  }, [clip.durationTicks, notes]);

  const commit = (patch: Partial<AudioRegion | MidiClip>) => {
    if (kind === 'audio') updateAudioRegion(clip.id, patch as Partial<AudioRegion>);
    else updateMidiClip(clip.id, patch as Partial<MidiClip>);
  };

  const onMouseDown = (e: React.MouseEvent, mode: 'move' | 'left' | 'right' = 'move') => {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (activeTool === 'mute' && mode === 'move') {
      if (!selectedClipIds.has(clip.id)) selectClip(clip.id, false);
      toggleSelectedClipsMute();
      return;
    }
    if (activeTool === 'slice' && kind === 'audio' && mode === 'move') {
      const rect = e.currentTarget.getBoundingClientRect();
      const atTick = Math.max(clip.startTick + 1, Math.round((e.clientX - rect.left) / ppt) + clip.startTick);
      useProjectStore.getState().splitAudioRegion(clip.id, Math.min(clip.startTick + clip.durationTicks - 1, atTick));
      return;
    }
    selectClip(clip.id, e.shiftKey || e.metaKey || e.ctrlKey);
    beginTransaction();
    dragRef.current = { x: e.clientX, startTick: clip.startTick, startDuration: clip.durationTicks, lastDelta: 0, mode };
    const startDuration = clip.durationTicks;
    const onMove = (ev: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaTicks = Math.round((ev.clientX - drag.x) / ppt);
      const snap = (t: number) => Math.max(0, snapPlaylistTick(t, playlistView.snapMode, project, [...audioRegions, ...midiClips]));
      if (drag.mode === 'move') {
        const nextStart = snap(drag.startTick + deltaTicks);
        const nextDelta = nextStart - drag.startTick;
        moveSelectedClips(nextDelta - drag.lastDelta, 0);
        drag.lastDelta = nextDelta;
      } else if (drag.mode === 'left') {
        const nextStart = Math.min(drag.startTick + startDuration - 1, snap(drag.startTick + deltaTicks));
        commit({ startTick: nextStart, durationTicks: Math.max(1, drag.startTick + startDuration - nextStart) });
      } else {
        commit({ durationTicks: Math.max(1, snap(startDuration + deltaTicks)) });
      }
    };
    const onUp = () => {
      dragRef.current = null;
      commitTransaction();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      className={`clip-block clip-block--${kind}${selected ? ' clip-block--selected' : ''}${clip.muted ? ' clip-block--muted' : ''}`}
      style={{
        left,
        top: trackIndex * laneHeight + 5,
        width,
        height: laneHeight - 10,
        backgroundColor: color,
        boxShadow: playlistView.showShadow ? undefined : 'inset 0 0 0 1px rgba(255,255,255,0.12)',
      }}
      onMouseDown={(e) => onMouseDown(e)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!selected) selectClip(clip.id, false);
        const atTick = Math.max(0, Math.round((e.clientX - e.currentTarget.getBoundingClientRect().left) / ppt) + clip.startTick);
        onOpenContextMenu(e.clientX, e.clientY, clip.id, atTick);
      }}
    >
      <div className="clip-block__resize-left" onMouseDown={(e) => onMouseDown(e, 'left')} />
      <div className="clip-block__resize-right" onMouseDown={(e) => onMouseDown(e, 'right')} />
      <div className="clip-block__title" style={{ backgroundColor: color }}>
        {kind === 'audio' ? 'A' : 'M'} · {clip.name}
      </div>
      <div className="clip-block__body">
        {kind === 'audio' && <div className="clip-block__wave" />}
        {notePreview?.map((note) => (
          <span
            key={note.id}
            className="clip-block__note"
            style={{ left: note.left, width: note.width, top: note.top }}
          />
        ))}
      </div>
      <span className="clip-block__crossfade-handle left" />
      <span className="clip-block__crossfade-handle right" />
    </div>
  );
};
