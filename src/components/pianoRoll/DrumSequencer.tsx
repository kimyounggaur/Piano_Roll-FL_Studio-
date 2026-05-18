import React, { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { Track } from '../../types/music';
import { snapUnitToTicks } from '../../utils/time';
import { getPianoKeyLabel } from '../../utils/geometry';

// ═══════════════════════════════════════════════════════════════════
//  DrumSequencer (#62)
//  Step-grid view for drum-kind tracks. Rows = kit slots, cols = steps.
//  Left-click toggles on/off. Right-click on an active step opens an
//  inline velocity slider that commits on close.
// ═══════════════════════════════════════════════════════════════════
interface Props {
  track: Track;
  bars?: number;
}

const DEFAULT_KIT: Array<{ pitch: number; name: string }> = [
  { pitch: 36, name: 'Kick' },
  { pitch: 38, name: 'Snare' },
  { pitch: 42, name: 'HH Closed' },
  { pitch: 46, name: 'HH Open' },
  { pitch: 49, name: 'Crash' },
  { pitch: 51, name: 'Ride' },
  { pitch: 41, name: 'Tom Low' },
  { pitch: 45, name: 'Tom Mid' },
];

interface VelocityPopup { pitch: number; stepIdx: number; noteId: string; x: number; y: number; }

export const DrumSequencer: React.FC<Props> = ({ track, bars = 1 }) => {
  const project = useProjectStore((s) => s.project);
  const toggleDrumStep = useProjectStore((s) => s.toggleDrumStep);
  const updateNote = useProjectStore((s) => s.updateNote);

  const kit = track.drumKit && track.drumKit.length > 0 ? track.drumKit : DEFAULT_KIT;
  const stepTicks = snapUnitToTicks('1/16', project.settings.ppq);
  const stepsPerBar = Math.round(project.settings.ppq * 4 / stepTicks);
  const totalSteps = stepsPerBar * bars;

  const findStepNote = (pitch: number, stepIdx: number) => {
    const tick = stepIdx * stepTicks;
    return track.notes.find((n) =>
      n.pitch === pitch &&
      n.startTick === tick &&
      n.durationTicks === stepTicks);
  };

  const [velPopup, setVelPopup] = useState<VelocityPopup | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Close popup on outside click / ESC
  useEffect(() => {
    if (!velPopup) return;
    const onDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setVelPopup(null);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setVelPopup(null); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [velPopup]);

  // The note used by the popup needs to be looked up fresh on every render
  // (velocity may have just changed).
  const popupNote = velPopup ? track.notes.find((n) => n.id === velPopup.noteId) : null;

  return (
    <div style={{ background: '#0a0b08', padding: 8, color: '#e8ebe6', overflow: 'auto', position: 'relative' }}>
      <table style={{ borderCollapse: 'collapse' }}>
        <tbody>
          {kit.map((slot) => (
            <tr key={slot.pitch}>
              <th style={cellLabel}>{slot.name} <span style={{ opacity: 0.5 }}>{getPianoKeyLabel(slot.pitch)}</span></th>
              {Array.from({ length: totalSteps }).map((_, i) => {
                const note = findStepNote(slot.pitch, i);
                const on   = !!note;
                const isBeat = i % 4 === 0;
                // Visualise velocity through cell opacity for active steps.
                const cellBg = on
                  ? `rgba(159,232,112,${0.35 + ((note!.velocity ?? 100) / 127) * 0.65})`
                  : (isBeat ? '#1a1b18' : '#0e0f0c');
                return (
                  <td
                    key={i}
                    onClick={() => toggleDrumStep(track.id, slot.pitch, i * stepTicks, stepTicks)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (!on) return;
                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                      setVelPopup({ pitch: slot.pitch, stepIdx: i, noteId: note!.id, x: rect.left, y: rect.bottom + 4 });
                    }}
                    style={{
                      width: 22, height: 22, cursor: 'pointer',
                      background: cellBg,
                      border: '1px solid #2b2c28',
                      borderLeftWidth: isBeat ? 2 : 1,
                    }}
                    title={on ? `${slot.name} · step ${i + 1} · vel ${note!.velocity}` : `${slot.name} · step ${i + 1}`}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {velPopup && popupNote && (
        <div
          ref={popupRef}
          style={{
            position: 'fixed', left: velPopup.x, top: velPopup.y,
            padding: 8, background: '#15170f', color: '#e8ebe6',
            border: '1px solid #2b3322', borderRadius: 4, zIndex: 9999,
            display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160,
            boxShadow: '0 6px 16px rgba(0,0,0,0.45)',
          }}
        >
          <div style={{ fontSize: 11, color: '#9aa399' }}>
            세기: <span style={{ color: '#9fe870' }}>{popupNote.velocity}</span>
          </div>
          <input
            type="range" min={1} max={127} value={popupNote.velocity}
            onChange={(e) => updateNote(track.id, popupNote.id, { velocity: Number(e.target.value) })}
          />
          <button
            onClick={() => setVelPopup(null)}
            style={{ background: '#9fe870', color: '#163300', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}
          >
            닫기
          </button>
        </div>
      )}
    </div>
  );
};

const cellLabel: React.CSSProperties = {
  padding: '4px 8px', textAlign: 'right', fontSize: 11, color: '#bdbfb9', whiteSpace: 'nowrap',
};
