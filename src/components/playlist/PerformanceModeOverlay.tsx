import React, { useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';

interface PerformanceModeOverlayProps {
  laneHeight: number;
}

export const PerformanceModeOverlay: React.FC<PerformanceModeOverlayProps> = ({ laneHeight }) => {
  const performanceMode = useProjectStore((s) => s.performanceMode);
  const audioRegions = useProjectStore((s) => s.audioRegions);
  const midiClips = useProjectStore((s) => s.midiClips);
  const tracks = useProjectStore((s) => s.project.tracks);
  const groups = useProjectStore((s) => s.trackGroups);
  const view = useProjectStore((s) => s.playlistView);
  const ppt = useProjectStore((s) => s.arrangementPixelsPerTick());
  const triggerPerformanceClip = useProjectStore((s) => s.triggerPerformanceClip);
  const stopPerformanceClip = useProjectStore((s) => s.stopPerformanceClip);

  const hiddenTrackIds = useMemo(() => new Set(
    view.hideCollapsedGroups
      ? groups.filter((g) => g.collapsed).flatMap((g) => g.trackIds)
      : [],
  ), [groups, view.hideCollapsedGroups]);
  const visibleTracks = tracks.filter((track) => !hiddenTrackIds.has(track.id));

  if (!performanceMode.enabled) return null;

  return (
    <div className="performance-overlay">
      {[...audioRegions, ...midiClips].map((clip) => {
        const trackIndex = visibleTracks.findIndex((track) => track.id === clip.trackId);
        if (trackIndex < 0) return null;
        const active = performanceMode.activeClips[clip.id] === true;
        return (
          <button
            key={clip.id}
            className={`perf-trigger${active ? ' perf-trigger--active' : ''}`}
            style={{ left: clip.startTick * ppt + 6, top: trackIndex * laneHeight + 8 }}
            onMouseDown={(e) => {
              e.preventDefault();
              triggerPerformanceClip(clip.id);
            }}
            onMouseUp={() => {
              if (performanceMode.quantize === 'off') stopPerformanceClip(clip.id);
            }}
            title={`${clip.name} trigger`}
          >
            ▶
          </button>
        );
      })}
    </div>
  );
};
