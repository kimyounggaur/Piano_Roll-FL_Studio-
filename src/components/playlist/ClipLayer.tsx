import React from 'react';
import { useProjectStore } from '../../store/projectStore';
import { ArrangementClipBlock } from './ArrangementClipBlock';

interface Props {
  laneHeight: number;
  onOpenContextMenu: (x: number, y: number, clipId: string, atTick: number) => void;
}

export const ClipLayer: React.FC<Props> = ({ laneHeight, onOpenContextMenu }) => {
  const tracks = useProjectStore((s) => s.project.tracks);
  const audioRegions = useProjectStore((s) => s.audioRegions);
  const midiClips = useProjectStore((s) => s.midiClips);
  const groups = useProjectStore((s) => s.trackGroups);
  const view = useProjectStore((s) => s.playlistView);

  const hiddenTrackIds = new Set(
    view.hideCollapsedGroups
      ? groups.filter((g) => g.collapsed).flatMap((g) => g.trackIds)
      : [],
  );

  const trackIndex = (trackId: string) =>
    tracks.filter((t) => !hiddenTrackIds.has(t.id)).findIndex((t) => t.id === trackId);

  return (
    <>
      {audioRegions.map((region) => {
        const idx = trackIndex(region.trackId);
        if (idx < 0) return null;
        return <ArrangementClipBlock key={region.id} clip={region} kind="audio" trackIndex={idx} laneHeight={laneHeight} onOpenContextMenu={onOpenContextMenu} />;
      })}
      {midiClips.map((clip) => {
        const idx = trackIndex(clip.trackId);
        if (idx < 0) return null;
        return <ArrangementClipBlock key={clip.id} clip={clip} kind="midi" trackIndex={idx} laneHeight={laneHeight} onOpenContextMenu={onOpenContextMenu} />;
      })}
    </>
  );
};
