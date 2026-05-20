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

// ── Tiny inline icon+label button — reused by every action button on the
// arrangement toolbar. Icon glyph stacks above, Korean caption below.
interface IconButtonProps {
  icon: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}
const IconButton: React.FC<IconButtonProps> = ({ icon, label, active, disabled, title, onClick }) => (
  <button
    className={`arrangement-icon-btn${active ? ' active' : ''}`}
    onClick={onClick}
    disabled={disabled}
    title={title ?? label}
  >
    <span className="arrangement-icon-btn__ico" aria-hidden="true">{icon}</span>
    <span className="arrangement-icon-btn__lbl">{label}</span>
  </button>
);

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
      {/* ── Tools (mutually exclusive) ──────────────────────────────── */}
      <IconButton icon="▣" label="선택"   active={activeTool === 'select'} title="Select 도구 (S)"
        onClick={() => setActiveTool('select')} />
      <IconButton icon="✎" label="그리기" active={activeTool === 'draw'}   title="Draw — 한 번 클릭으로 클립 생성"
        onClick={() => setActiveTool('draw')} />
      <IconButton icon="🖌" label="페인트" active={activeTool === 'paint'}  title="Paint — 드래그로 여러 클립 생성"
        onClick={() => setActiveTool('paint')} />
      <IconButton icon="✂" label="자르기" active={activeTool === 'slice'}  title="Slice — 오디오 클립을 자르기"
        onClick={() => setActiveTool('slice')} />
      <IconButton icon="🚫" label="음소거" active={activeTool === 'mute'}   title="Mute — 클릭으로 클립 음소거 토글"
        onClick={() => setActiveTool('mute')} />

      <div className="arrangement-view__divider" />

      {/* ── Menus (dropdowns rendered by their own components) ─────── */}
      <ArrangementEditMenu />
      <SnapMenu />
      <SelectMenu />
      <GroupMenu />
      <ViewOptionsMenu />
      <ZoomMenu />

      <div className="arrangement-view__divider" />

      {/* ── Insertion actions ───────────────────────────────────────── */}
      <IconButton icon="♪" label="MIDI 클립"
        title="현재 트랙에 빈 MIDI 클립 삽입"
        disabled={!activeTrackId}
        onClick={() => activeTrackId && addMidiClipFromTrack(activeTrackId, playheadTick)} />
      <IconButton icon="🔊" label="오디오"
        title="오디오 파일 불러오기"
        onClick={onImportAudio} />
      <IconButton icon="🚩" label="마커"
        title="현재 위치에 마커 추가"
        onClick={() => addPlaylistMarker(playheadTick, 'none')} />
      <IconButton icon="📍" label="4마디 마커"
        title="4마디마다 마커 일괄 생성"
        onClick={() => addMarkersEvery(4)} />
      <IconButton icon="🔁" label="루프"
        title="루프 영역 표시"
        onClick={() => placeLoop(project.settings.loopStartTick, project.settings.loopEndTick || playheadTick)} />

      <div className="arrangement-view__divider" />

      {/* ── Toggles ─────────────────────────────────────────────────── */}
      <IconButton icon="🎯" label="피커" active={pickerPanel.visible}
        title="피커 패널 열기/닫기"
        onClick={() => setPickerPanel({ visible: !pickerPanel.visible })} />
      <IconButton icon="▶" label="퍼포먼스" active={performanceMode.enabled}
        title="퍼포먼스 모드 on/off"
        onClick={() => setPerformanceModeEnabled(!performanceMode.enabled)} />

      {/* ── Configuration selects ───────────────────────────────────── */}
      <label className="arrangement-toolbar-select">
        <span className="arrangement-toolbar-select__lbl">Quantize</span>
        <select
          value={performanceMode.quantize}
          onChange={(e) => setPerformanceQuantize(e.target.value as PerformanceQuantize)}
        >
          {PERFORMANCE_QUANTIZE.map((q) => <option key={q} value={q}>{q}</option>)}
        </select>
      </label>
      <label className="arrangement-toolbar-select">
        <span className="arrangement-toolbar-select__lbl">Drop</span>
        <select
          value={audioDropBehavior}
          onChange={(e) => setAudioDropBehavior(e.target.value as AudioDropBehavior)}
        >
          {DROP_BEHAVIORS.map((behavior) => <option key={behavior} value={behavior}>{behavior}</option>)}
        </select>
      </label>
    </div>
  );
};
