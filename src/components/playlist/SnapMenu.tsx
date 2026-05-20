import React, { useState } from 'react';
import type { PlaylistSnapMode } from '../../types/playlist';
import { useProjectStore } from '../../store/projectStore';
import { SNAP_SHORTCUT_OPTIONS } from '../../utils/snapShortcuts';

const SNAP_MODE_OPTIONS: Array<{ mode: PlaylistSnapMode; label: string }> = [
  { mode: 'main', label: '현재 스냅 값' },
  { mode: 'line', label: '라인' },
  { mode: 'cell', label: '셀' },
  { mode: 'none', label: '스냅 끄기' },
  { mode: 'step_1_6', label: '스텝 1/6' },
  { mode: 'step_1_4', label: '스텝 1/4' },
  { mode: 'step_1_3', label: '스텝 1/3' },
  { mode: 'step_1_2', label: '스텝 1/2' },
  { mode: 'step_1', label: '스텝 1' },
  { mode: 'beat_1_6', label: '비트 1/6' },
  { mode: 'beat_1_4', label: '비트 1/4' },
  { mode: 'beat_1_3', label: '비트 1/3' },
  { mode: 'beat_1_2', label: '비트 1/2' },
  { mode: 'beat_1', label: '비트 1' },
  { mode: 'bar', label: '마디' },
  { mode: 'events', label: '이벤트' },
];

export const SnapMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const snapMode = useProjectStore((s) => s.playlistView.snapMode);
  const snapUnit = useProjectStore((s) => s.project.settings.snapUnit);
  const setPlaylistView = useProjectStore((s) => s.setPlaylistView);
  const setSnapUnit = useProjectStore((s) => s.setSnapUnit);

  const modeLabel = SNAP_MODE_OPTIONS.find((option) => option.mode === snapMode)?.label ?? snapMode;
  const buttonLabel = snapMode === 'main' ? snapUnit : modeLabel;

  return (
    <span className="arrangement-dropdown">
      <button
        className={`arrangement-icon-btn${open ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={`스냅: ${buttonLabel}`}
      >
        <span className="arrangement-icon-btn__ico" aria-hidden="true">#</span>
        <span className="arrangement-icon-btn__lbl">스냅: {buttonLabel}</span>
      </button>
      {open && (
        <div className="arrangement-menu arrangement-menu--inline arrangement-menu--compact">
          <span className="arrangement-menu__empty">스냅 값</span>
          {SNAP_SHORTCUT_OPTIONS.map(({ key, unit }) => (
            <button
              key={unit}
              className={snapMode === 'main' && snapUnit === unit ? 'active' : ''}
              onClick={() => {
                setSnapUnit(unit);
                setPlaylistView({ snapMode: 'main' });
                setOpen(false);
              }}
            >
              {key} = {unit}
            </button>
          ))}

          <div className="arrangement-menu__separator" />
          <span className="arrangement-menu__empty">스냅 모드</span>
          {SNAP_MODE_OPTIONS.map((option) => (
            <button
              key={option.mode}
              className={snapMode === option.mode ? 'active' : ''}
              onClick={() => {
                setPlaylistView({ snapMode: option.mode });
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
};
