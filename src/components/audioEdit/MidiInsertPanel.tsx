import React, { useRef, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';

interface Props { onClose: () => void }

export const MidiInsertPanel: React.FC<Props> = ({ onClose }) => {
  const tracks            = useProjectStore((s) => s.project.tracks);
  const midiClips         = useProjectStore((s) => s.midiClips);
  const addMidiClipFromTrack = useProjectStore((s) => s.addMidiClipFromTrack);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const insertClip = (trackId: string) => {
    // Place after the last existing clip for this track
    const existing = midiClips.filter((c) => c.trackId === trackId);
    const startTick = existing.length > 0
      ? Math.max(...existing.map((c) => c.startTick + c.durationTicks))
      : 0;
    addMidiClipFromTrack(trackId, startTick);
    onClose();
  };

  return (
    <div className="midi-insert-panel" ref={ref}>
      <div className="midi-insert-header">트랙에서 MIDI 클립 삽입</div>
      {tracks.length === 0 && (
        <div className="midi-insert-empty">트랙이 없습니다</div>
      )}
      {tracks.map((track) => {
        const noteCount = track.notes.length;
        return (
          <div key={track.id} className="midi-insert-row">
            <span className="midi-insert-dot" style={{ background: track.color }} />
            <span className="midi-insert-name">{track.name}</span>
            <span className="midi-insert-count">{noteCount}음</span>
            <button
              className="midi-insert-btn"
              disabled={noteCount === 0}
              onClick={() => insertClip(track.id)}
            >
              삽입
            </button>
          </div>
        );
      })}
    </div>
  );
};
