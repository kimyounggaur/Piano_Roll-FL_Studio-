import React from 'react';
import { useProjectStore } from '../../store/projectStore';
import './TrackPanel.css';

export const TrackPanel: React.FC = () => {
  const {
    project, addTrack, removeTrack, setActiveTrack,
    toggleTrackMute, toggleTrackSolo,
  } = useProjectStore();
  const { tracks, activeTrackId } = project;

  return (
    <div className="track-panel">
      <div className="track-panel-header">
        <span className="track-panel-title">Tracks</span>
        <button className="track-add-btn" onClick={addTrack} title="Add track">+</button>
      </div>
      <div className="track-list">
        {tracks.map((track) => (
          <div
            key={track.id}
            className={`track-item${track.id === activeTrackId ? ' active' : ''}`}
            onClick={() => setActiveTrack(track.id)}
          >
            <div className="track-color-bar" style={{ background: track.color }} />
            <span className="track-name">{track.name}</span>
            <div className="track-actions">
              <button
                className={`track-btn${track.muted ? ' dim' : ''}`}
                title="Mute"
                onClick={(e) => { e.stopPropagation(); toggleTrackMute(track.id); }}
              >M</button>
              <button
                className={`track-btn${track.solo ? ' solo' : ''}`}
                title="Solo"
                onClick={(e) => { e.stopPropagation(); toggleTrackSolo(track.id); }}
              >S</button>
              {tracks.length > 1 && (
                <button
                  className="track-btn danger"
                  title="Delete"
                  onClick={(e) => { e.stopPropagation(); removeTrack(track.id); }}
                >×</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
