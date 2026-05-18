import React, { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { Note, NoteId, TrackId } from '../../types/music';
import { NOTE_COLOR_GROUPS } from '../../types/music';
import { tickToBarString, barStringToTick } from '../../utils/notes';
import { getPianoKeyLabel } from '../../utils/geometry';

interface Props {
  trackId: TrackId;
  noteId: NoteId;
  x: number;       // anchor pixel-x on the page
  y: number;       // anchor pixel-y on the page
  onClose: () => void;
}

const POPUP_W = 240;

export const NotePropertiesPopup: React.FC<Props> = ({ trackId, noteId, x, y, onClose }) => {
  const project = useProjectStore((s) => s.project);
  const updateNote = useProjectStore((s) => s.updateNote);

  const track = project.tracks.find((t) => t.id === trackId);
  const note  = track?.notes.find((n) => n.id === noteId);

  // Local editable string state for tick fields so users can type partial values
  const ppq   = project.settings.ppq;
  const tsNum = project.settings.timeSignature.numerator;

  const [startText, setStartText] = useState(() => note ? tickToBarString(note.startTick, ppq, tsNum) : '');
  const [durText,   setDurText]   = useState(() => note ? tickToBarString(note.durationTicks, ppq, tsNum) : '');

  useEffect(() => {
    if (!note) return;
    setStartText(tickToBarString(note.startTick, ppq, tsNum));
    setDurText(tickToBarString(note.durationTicks, ppq, tsNum));
  }, [note?.id, note?.startTick, note?.durationTicks, ppq, tsNum]);

  // Close on outside click / ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!note || !track) return null;

  const set = (patch: Partial<Note>) => updateNote(trackId, noteId, patch);

  const commitStart = () => {
    const t = barStringToTick(startText, ppq, tsNum);
    if (t !== null) set({ startTick: t });
    else setStartText(tickToBarString(note.startTick, ppq, tsNum));
  };
  const commitDur = () => {
    const t = barStringToTick(durText, ppq, tsNum);
    if (t !== null && t >= 1) set({ durationTicks: t });
    else setDurText(tickToBarString(note.durationTicks, ppq, tsNum));
  };

  const clampedX = Math.min(window.innerWidth - POPUP_W - 12, Math.max(12, x));
  const clampedY = Math.min(window.innerHeight - 320, Math.max(12, y));

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', left: clampedX, top: clampedY,
        width: POPUP_W, padding: 12,
        background: '#15170f', color: '#e8ebe6',
        border: '1px solid var(--border-accent, #2b3322)',
        borderRadius: 6, fontSize: 12, zIndex: 9999,
        boxShadow: '0 8px 20px rgba(0,0,0,0.45)',
      }}
    >
      <div style={headerStyle}>
        <span style={{ color: '#9fe870', fontWeight: 700 }}>{getPianoKeyLabel(note.pitch)}</span>
        <button onClick={onClose} style={closeBtn} aria-label="닫기">×</button>
      </div>

      <Row label="Pitch">
        <input type="number" min={0} max={127} value={note.pitch}
          onChange={(e) => set({ pitch: Math.max(0, Math.min(127, Number(e.target.value))) })}
          style={inputStyle}
        />
      </Row>

      <Row label="Start (B.B.S)">
        <input type="text" value={startText}
          onChange={(e) => setStartText(e.target.value)}
          onBlur={commitStart}
          onKeyDown={(e) => { if (e.key === 'Enter') { commitStart(); onClose(); } }}
          style={inputStyle}
        />
      </Row>

      <Row label="Length (B.B.S)">
        <input type="text" value={durText}
          onChange={(e) => setDurText(e.target.value)}
          onBlur={commitDur}
          onKeyDown={(e) => { if (e.key === 'Enter') { commitDur(); onClose(); } }}
          style={inputStyle}
        />
      </Row>

      <Row label="Velocity">
        <input type="range" min={1} max={127} value={note.velocity}
          onChange={(e) => set({ velocity: Number(e.target.value) })}
          style={{ flex: 1 }}
        />
        <span style={{ width: 28, textAlign: 'right' }}>{note.velocity}</span>
      </Row>

      <Row label="Color">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <button onClick={() => set({ colorGroup: undefined })}
            style={{ ...swatchStyle, background: track.color, outline: !note.colorGroup ? '2px solid #fff' : undefined }}
            title="트랙 색"
          />
          {NOTE_COLOR_GROUPS.slice(1).map((c, i) => (
            <button key={i+1} onClick={() => set({ colorGroup: String(i+1) })}
              style={{ ...swatchStyle, background: c, outline: note.colorGroup === String(i+1) ? '2px solid #fff' : undefined }}
            />
          ))}
        </div>
      </Row>

      <Row label="Muted">
        <input type="checkbox" checked={!!note.muted}
          onChange={(e) => set({ muted: e.target.checked })}
        />
      </Row>
    </div>
  );
};

// ── helpers ──────────────────────────────────────────────────────────
const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
    <label style={{ width: 90, color: '#9aa399' }}>{label}</label>
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>{children}</div>
  </div>
);

const headerStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
};
const closeBtn: React.CSSProperties = {
  background: 'transparent', color: '#9aa399', border: 'none',
  cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0,
};
const inputStyle: React.CSSProperties = {
  flex: 1, padding: '3px 6px', background: '#0e0f0c', color: '#e8ebe6',
  border: '1px solid #2b2c28', borderRadius: 4, fontSize: 12,
};
const swatchStyle: React.CSSProperties = {
  width: 18, height: 18, border: 'none', borderRadius: 3, cursor: 'pointer',
};
