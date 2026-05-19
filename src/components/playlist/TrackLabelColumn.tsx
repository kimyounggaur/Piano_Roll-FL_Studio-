import React, { useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { TrackResizeHandle } from './TrackResizeHandle';

interface TrackLabelColumnProps {
  laneHeight: number;
}

export const TrackLabelColumn: React.FC<TrackLabelColumnProps> = ({ laneHeight }) => {
  const tracks = useProjectStore((s) => s.project.tracks);
  const groups = useProjectStore((s) => s.trackGroups);
  const playlistView = useProjectStore((s) => s.playlistView);
  const scrollY = useProjectStore((s) => s.arrangementScrollY);
  const toggleTrackMute = useProjectStore((s) => s.toggleTrackMute);
  const toggleTrackSolo = useProjectStore((s) => s.toggleTrackSolo);
  const setActiveTrack = useProjectStore((s) => s.setActiveTrack);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const activeTrackId = useProjectStore((s) => s.project.activeTrackId);

  const hiddenTrackIds = useMemo(() => new Set(
    playlistView.hideCollapsedGroups
      ? groups.filter((g) => g.collapsed).flatMap((g) => g.trackIds)
      : [],
  ), [groups, playlistView.hideCollapsedGroups]);

  const visibleTracks = tracks.filter((track) => !hiddenTrackIds.has(track.id));

  return (
    <div className="arrangement-view__track-labels">
      <div className="arrangement-view__label-spacer" />
      <div className="track-label-column__scroller" style={{ transform: `translateY(${-scrollY}px)` }}>
        {visibleTracks.map((track) => (
          <div
            key={track.id}
            className={`playlist-track-label${activeTrackId === track.id ? ' playlist-track-label--active' : ''}`}
            style={{ height: laneHeight }}
            onMouseDown={() => setActiveTrack(track.id)}
          >
            <span className="playlist-track-label__color" style={{ backgroundColor: track.color }} />
            <span className="playlist-track-label__name" title={track.name}>{track.name}</span>
            {playlistView.showControlsOnAudioTracks && (
              <span className="playlist-track-label__controls">
                <button className={track.muted ? 'active' : ''} onClick={(e) => { e.stopPropagation(); toggleTrackMute(track.id); }}>M</button>
                <button className={track.solo ? 'active' : ''} onClick={(e) => { e.stopPropagation(); toggleTrackSolo(track.id); }}>S</button>
              </span>
            )}
            {playlistView.showControlsOnAudioTracks && (
              <input
                className="playlist-track-label__volume"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={track.volume}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })}
                title="Volume"
              />
            )}
            {playlistView.showLevelsOnAudioTracks && (
              <span className="playlist-track-label__meter" style={{ ['--meter-value' as string]: `${Math.round(track.volume * 100)}%` }} />
            )}
            <TrackResizeHandle />
          </div>
        ))}
      </div>
    </div>
  );
};
