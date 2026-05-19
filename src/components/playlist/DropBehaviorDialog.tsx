import React from 'react';
import type { AudioDropBehavior } from '../../types/playlist';

interface DropBehaviorDialogProps {
  onChoose: (behavior: Exclude<AudioDropBehavior, 'always_ask'> | null) => void;
}

const CHOICES: Array<{ behavior: Exclude<AudioDropBehavior, 'always_ask'>; label: string }> = [
  { behavior: 'audio_clips', label: '오디오 클립으로 배치' },
  { behavior: 'audio_tracks', label: '새 오디오 트랙으로 배치' },
  { behavior: 'instrument_tracks', label: '샘플러 악기 트랙으로 배치' },
];

export const DropBehaviorDialog: React.FC<DropBehaviorDialogProps> = ({ onChoose }) => (
  <div className="drop-behavior-backdrop">
    <div className="drop-behavior-dialog">
      <h3>오디오 파일 드롭 방식</h3>
      <div className="drop-behavior-dialog__actions">
        {CHOICES.map((choice) => (
          <button key={choice.behavior} onClick={() => onChoose(choice.behavior)}>{choice.label}</button>
        ))}
        <button onClick={() => onChoose(null)}>취소</button>
      </div>
    </div>
  </div>
);
