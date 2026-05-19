import type { AudioRegion, MidiClip, Project } from '../types/music';
import type { PlaylistSnapMode } from '../types/playlist';
import { snapTick, snapUnitToTicks, ticksPerBar, ticksPerBeat } from './time';

export function playlistSnapTicks(mode: PlaylistSnapMode, project: Project): number {
  const { ppq, timeSignature, snapUnit } = project.settings;
  switch (mode) {
    case 'none': return 0;
    case 'main': return snapUnitToTicks(snapUnit, ppq);
    case 'line':
    case 'cell': return snapUnitToTicks(snapUnit, ppq);
    case 'bar': return ticksPerBar(ppq, timeSignature);
    case 'beat_1': return ticksPerBeat(ppq, timeSignature);
    case 'beat_1_2': return ticksPerBeat(ppq, timeSignature) / 2;
    case 'beat_1_3': return ticksPerBeat(ppq, timeSignature) / 3;
    case 'beat_1_4': return ticksPerBeat(ppq, timeSignature) / 4;
    case 'beat_1_6': return ticksPerBeat(ppq, timeSignature) / 6;
    case 'step_1': return ppq / 4;
    case 'step_1_2': return ppq / 8;
    case 'step_1_3': return ppq / 12;
    case 'step_1_4': return ppq / 16;
    case 'step_1_6': return ppq / 24;
    case 'events': return 0;
    default: return snapUnitToTicks(snapUnit, ppq);
  }
}

export function snapPlaylistTick(
  tick: number,
  mode: PlaylistSnapMode,
  project: Project,
  clips: Array<AudioRegion | MidiClip> = [],
): number {
  if (mode === 'events') {
    const edges = clips.flatMap((clip) => [clip.startTick, clip.startTick + clip.durationTicks]);
    if (!edges.length) return tick;
    return edges.reduce((best, edge) => Math.abs(edge - tick) < Math.abs(best - tick) ? edge : best, edges[0]);
  }
  const step = playlistSnapTicks(mode, project);
  return snapTick(tick, Math.round(step));
}
