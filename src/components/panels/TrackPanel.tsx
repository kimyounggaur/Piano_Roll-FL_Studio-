import React, { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import './TrackPanel.css';

export const TrackPanel: React.FC = () => {
  const {
    project, addTrack, removeTrack, setActiveTrack,
    toggleTrackMute, toggleTrackSolo, updateTrack, updateSettings,
  } = useProjectStore();
  const { tracks, activeTrackId, settings } = project;
  const [renamingId, setRenamingId] = useState<string | null>(null);

  return (
    <div className="track-panel">
      <div className="track-panel-header">
        <span className="track-panel-title">트랙</span>
        <button className="track-add-btn" onClick={addTrack} title="트랙 추가">+</button>
      </div>

      {/* Ghost-notes options */}
      <div className="track-panel-options" style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        padding: '6px 10px', fontSize: 11, color: 'var(--text-muted)',
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={settings.ghostNotesVisible}
            onChange={(e) => updateSettings({ ghostNotesVisible: e.target.checked })}
          />
          고스트 노트 표시
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: settings.ghostNotesVisible ? 1 : 0.5 }}>
          <input
            type="checkbox"
            checked={settings.ghostDoubleClickActivates}
            disabled={!settings.ghostNotesVisible}
            onChange={(e) => updateSettings({ ghostDoubleClickActivates: e.target.checked })}
          />
          더블클릭으로 트랙 전환
        </label>
      </div>

      <div className="track-list">
        {tracks.map((track) => (
          <div
            key={track.id}
            className={`track-item${track.id === activeTrackId ? ' active' : ''}`}
            onClick={() => setActiveTrack(track.id)}
          >
            <div className="track-color-bar" style={{ background: track.color }} />

            {/* Name (click to rename) */}
            {renamingId === track.id ? (
              <input
                autoFocus
                defaultValue={track.name}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v) updateTrack(track.id, { name: v });
                  setRenamingId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                style={{ flex: 1, minWidth: 0, padding: '2px 4px', fontSize: 12 }}
              />
            ) : (
              <span
                className="track-name"
                onDoubleClick={(e) => { e.stopPropagation(); setRenamingId(track.id); }}
                title="더블클릭하여 이름 변경"
              >
                {track.name}
              </span>
            )}

            <div className="track-actions">
              <button
                className={`track-btn${track.muted ? ' dim' : ''}`}
                title="음소거"
                onClick={(e) => { e.stopPropagation(); toggleTrackMute(track.id); }}
              >M</button>
              <button
                className={`track-btn${track.solo ? ' solo' : ''}`}
                title="솔로"
                onClick={(e) => { e.stopPropagation(); toggleTrackSolo(track.id); }}
              >S</button>
              {tracks.length > 1 && (
                <button
                  className="track-btn danger"
                  title="삭제"
                  onClick={(e) => { e.stopPropagation(); removeTrack(track.id); }}
                >×</button>
              )}
            </div>

            {/* Volume + Pan — only on the active track to keep the panel tidy */}
            {track.id === activeTrackId && (
              <div
                className="track-mix-controls"
                onClick={(e) => e.stopPropagation()}
              >
                <span>볼륨</span>
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={track.volume}
                  onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })}
                />
                <span style={{ textAlign: 'right' }}>{Math.round(track.volume * 100)}</span>
                <span>패닝</span>
                <input
                  type="range" min={-1} max={1} step={0.01}
                  value={track.pan}
                  onChange={(e) => updateTrack(track.id, { pan: Number(e.target.value) })}
                />
                <span style={{ textAlign: 'right' }}>{track.pan.toFixed(2)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
