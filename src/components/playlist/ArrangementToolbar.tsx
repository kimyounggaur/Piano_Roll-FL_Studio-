import React from 'react';
import type { AudioDropBehavior, PerformanceQuantize } from '../../types/playlist';
import { useProjectStore } from '../../store/projectStore';
import { ArrangementEditMenu } from './ArrangementEditMenu';
import { GroupMenu } from './GroupMenu';
import { SelectMenu } from './SelectMenu';
import { SnapMenu } from './SnapMenu';
import { ViewOptionsMenu } from './ViewOptionsMenu';
import { ZoomMenu } from './ZoomMenu';

interface ArrangementToolbarProps {
  onImportAudio: () => void;
}

const PERFORMANCE_QUANTIZE: PerformanceQuantize[] = ['off', 'beat', '1bar', '2bar', '4bar', '8bar'];
const DROP_BEHAVIORS: AudioDropBehavior[] = ['always_ask', 'audio_clips', 'audio_tracks', 'instrument_tracks'];

export const ArrangementToolbar: React.FC<ArrangementToolbarProps> = ({ onImportAudio }) => {
  const activeTool = useProjectStore((s) => s.activeTool);
  const setActiveTool = useProjectStore((s) => s.setActiveTool);
  const project = useProjectStore((s) => s.project);
  const playheadTick = useProjectStore((s) => s.playheadTick);
  const addMidiClipFromTrack = useProjectStore((s) => s.addMidiClipFromTrack);
  const addPlaylistMarker = useProjectStore((s) => s.addPlaylistMarker);
  const addMarkersEvery = useProjectStore((s) => s.addMarkersEvery);
  const placeLoop = useProjectStore((s) => s.placeLoop);
  const pickerPanel = useProjectStore((s) => s.pickerPanel);
  const setPickerPanel = useProjectStore((s) => s.setPickerPanel);
  const performanceMode = useProjectStore((s) => s.performanceMode);
  const setPerformanceModeEnabled = useProjectStore((s) => s.setPerformanceModeEnabled);
  const setPerformanceQuantize = useProjectStore((s) => s.setPerformanceQuantize);
  const audioDropBehavior = useProjectStore((s) => s.audioDropBehavior);
  const setAudioDropBehavior = useProjectStore((s) => s.setAudioDropBehavior);

  const activeTrackId = project.activeTrackId ?? project.tracks[0]?.id;

  return (
    <div className="arrangement-view__toolbar">
      <button className={activeTool === 'select' ? 'active' : ''} onClick={() => setActiveTool('select')}>Select</button>
      <button className={activeTool === 'draw' ? 'active' : ''} onClick={() => setActiveTool('draw')}>Draw</button>
      <button className={activeTool === 'paint' ? 'active' : ''} onClick={() => setActiveTool('paint')}>Paint</button>
      <button className={activeTool === 'slice' ? 'active' : ''} onClick={() => setActiveTool('slice')}>Slice</button>
      <button className={activeTool === 'mute' ? 'active' : ''} onClick={() => setActiveTool('mute')}>Mute</button>
      <div className="arrangement-view__divider" />
      <ArrangementEditMenu />
      <SnapMenu />
      <SelectMenu />
      <GroupMenu />
      <ViewOptionsMenu />
      <ZoomMenu />
      <div className="arrangement-view__divider" />
      <button onClick={() => activeTrackId && addMidiClipFromTrack(activeTrackId, playheadTick)}>MIDI Clip</button>
      <button onClick={onImportAudio}>Audio Import</button>
      <button onClick={() => addPlaylistMarker(playheadTick, 'none')}>Marker</button>
      <button onClick={() => addMarkersEvery(4)}>Markers 4 bars</button>
      <button onClick={() => placeLoop(project.settings.loopStartTick, project.settings.loopEndTick || playheadTick)}>Loop Marker</button>
      <div className="arrangement-view__divider" />
      <button className={pickerPanel.visible ? 'active' : ''} onClick={() => setPickerPanel({ visible: !pickerPanel.visible })}>Picker</button>
      <button className={performanceMode.enabled ? 'active' : ''} onClick={() => setPerformanceModeEnabled(!performanceMode.enabled)}>Performance</button>
      <label>
        Quantize
        <select value={performanceMode.quantize} onChange={(e) => setPerformanceQuantize(e.target.value as PerformanceQuantize)}>
          {PERFORMANCE_QUANTIZE.map((q) => <option key={q} value={q}>{q}</option>)}
        </select>
      </label>
      <label>
        Drop
        <select value={audioDropBehavior} onChange={(e) => setAudioDropBehavior(e.target.value as AudioDropBehavior)}>
          {DROP_BEHAVIORS.map((behavior) => <option key={behavior} value={behavior}>{behavior}</option>)}
        </select>
      </label>
    </div>
  );
};
