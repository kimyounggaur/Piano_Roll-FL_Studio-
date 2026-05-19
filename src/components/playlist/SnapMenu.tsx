import React, { useState } from 'react';
import type { PlaylistSnapMode } from '../../types/playlist';
import { useProjectStore } from '../../store/projectStore';

const SNAP_OPTIONS: Array<{ mode: PlaylistSnapMode; label: string }> = [
  { mode: 'main', label: 'Main' },
  { mode: 'line', label: 'Line' },
  { mode: 'cell', label: 'Cell' },
  { mode: 'none', label: 'None' },
  { mode: 'step_1_6', label: 'Step 1/6' },
  { mode: 'step_1_4', label: 'Step 1/4' },
  { mode: 'step_1_3', label: 'Step 1/3' },
  { mode: 'step_1_2', label: 'Step 1/2' },
  { mode: 'step_1', label: 'Step 1' },
  { mode: 'beat_1_6', label: 'Beat 1/6' },
  { mode: 'beat_1_4', label: 'Beat 1/4' },
  { mode: 'beat_1_3', label: 'Beat 1/3' },
  { mode: 'beat_1_2', label: 'Beat 1/2' },
  { mode: 'beat_1', label: 'Beat 1' },
  { mode: 'bar', label: 'Bar' },
  { mode: 'events', label: 'Events' },
];

export const SnapMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const snapMode = useProjectStore((s) => s.playlistView.snapMode);
  const setPlaylistView = useProjectStore((s) => s.setPlaylistView);

  return (
    <span className="arrangement-dropdown">
      <button className={open ? 'active' : ''} onClick={() => setOpen((v) => !v)}>Snap: {snapMode}</button>
      {open && (
        <div className="arrangement-menu arrangement-menu--inline arrangement-menu--compact">
          {SNAP_OPTIONS.map((option) => (
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
