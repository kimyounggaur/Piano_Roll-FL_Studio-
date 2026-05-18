import React from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { Track } from '../../types/music';
import { snapUnitToTicks } from '../../utils/time';
import { getPianoKeyLabel } from '../../utils/geometry';

// ═══════════════════════════════════════════════════════════════════
//  DrumSequencer (#62)
//  Step-grid view for drum-kind tracks. Rows = kit slots, cols = steps.
//  Click toggles on/off; right-click adjusts velocity inline.
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

export const DrumSequencer: React.FC<Props> = ({ track, bars = 1 }) => {
  const project = useProjectStore((s) => s.project);
  const toggleDrumStep = useProjectStore((s) => s.toggleDrumStep);

  const kit = track.drumKit && track.drumKit.length > 0 ? track.drumKit : DEFAULT_KIT;
  const stepTicks = snapUnitToTicks('1/16', project.settings.ppq);
  const stepsPerBar = Math.round(project.settings.ppq * 4 / stepTicks);
  const totalSteps = stepsPerBar * bars;

  const isActive = (pitch: number, stepIdx: number) => {
    const tick = stepIdx * stepTicks;
    return track.notes.some((n) =>
      n.pitch === pitch &&
      n.startTick === tick &&
      n.durationTicks === stepTicks);
  };

  return (
    <div style={{ background: '#0a0b08', padding: 8, color: '#e8ebe6', overflow: 'auto' }}>
      <table style={{ borderCollapse: 'collapse' }}>
        <tbody>
          {kit.map((slot) => (
            <tr key={slot.pitch}>
              <th style={cellLabel}>{slot.name} <span style={{ opacity: 0.5 }}>{getPianoKeyLabel(slot.pitch)}</span></th>
              {Array.from({ length: totalSteps }).map((_, i) => {
                const on  = isActive(slot.pitch, i);
                const isBeat = i % 4 === 0;
                return (
                  <td
                    key={i}
                    onClick={() => toggleDrumStep(track.id, slot.pitch, i * stepTicks, stepTicks)}
                    style={{
                      width: 22, height: 22, cursor: 'pointer',
                      background: on ? '#9fe870' : (isBeat ? '#1a1b18' : '#0e0f0c'),
                      border: '1px solid #2b2c28',
                      borderLeftWidth: isBeat ? 2 : 1,
                    }}
                    title={`${slot.name} · step ${i + 1}`}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const cellLabel: React.CSSProperties = {
  padding: '4px 8px', textAlign: 'right', fontSize: 11, color: '#bdbfb9', whiteSpace: 'nowrap',
};
