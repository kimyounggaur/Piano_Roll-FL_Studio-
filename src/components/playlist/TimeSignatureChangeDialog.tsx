import React, { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';

interface TimeSignatureChangeDialogProps {
  markerId: string;
  onClose: () => void;
}

export const TimeSignatureChangeDialog: React.FC<TimeSignatureChangeDialogProps> = ({ markerId, onClose }) => {
  const marker = useProjectStore((s) => s.playlistMarkers.find((m) => m.id === markerId));
  const updatePlaylistMarker = useProjectStore((s) => s.updatePlaylistMarker);
  const [numerator, setNumerator] = useState(marker?.timeSignature?.numerator ?? 4);
  const [denominator, setDenominator] = useState(marker?.timeSignature?.denominator ?? 4);

  if (!marker) return null;

  return (
    <div className="drop-behavior-backdrop">
      <div className="drop-behavior-dialog">
        <h3>박자표 변경</h3>
        <div className="time-signature-dialog__row">
          <input type="number" min={1} max={16} value={numerator} onChange={(e) => setNumerator(Number(e.target.value))} />
          <span>/</span>
          <select value={denominator} onChange={(e) => setDenominator(Number(e.target.value))}>
            {[2, 4, 8, 16].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div className="drop-behavior-dialog__actions">
          <button onClick={() => {
            updatePlaylistMarker(markerId, { type: 'time_signature', timeSignature: { numerator, denominator } });
            onClose();
          }}>적용</button>
          <button onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  );
};
