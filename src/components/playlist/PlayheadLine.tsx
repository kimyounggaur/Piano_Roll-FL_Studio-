import React from 'react';
import { useProjectStore } from '../../store/projectStore';
import { formatTickFull } from '../../utils/time';

interface Props {
  height: number;
}

export const PlayheadLine: React.FC<Props> = ({ height }) => {
  const tick = useProjectStore((s) => s.playheadTick);
  const project = useProjectStore((s) => s.project);
  const ppt = useProjectStore((s) => s.arrangementPixelsPerTick());
  const precise = useProjectStore((s) => s.playlistView.preciseTimeIndicator);
  const x = tick * ppt;
  const label = formatTickFull(tick, project.settings.timeSignature, project.settings.ppq);
  return (
    <div className="playhead-line" style={{ left: x, height }}>
      {precise && <div className="playhead-line__time-display">{label}</div>}
    </div>
  );
};
