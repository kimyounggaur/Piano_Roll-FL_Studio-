import type { Tick } from './music';

export type PlaylistSnapMode =
  | 'main'
  | 'line'
  | 'cell'
  | 'none'
  | 'step_1_6' | 'step_1_4' | 'step_1_3' | 'step_1_2' | 'step_1'
  | 'beat_1_6' | 'beat_1_4' | 'beat_1_3' | 'beat_1_2' | 'beat_1'
  | 'bar'
  | 'events';

export type TimeSegmentUnit = 'bars' | 'beats' | 'steps' | 'markers';
export type ClipBehindStyle = 'nothing' | 'plain' | 'cel' | 'glass' | 'aqua' | 'solid';
export type GridContrast = 'high' | 'medium' | 'low';

export type MarkerType =
  | 'none'
  | 'start'
  | 'loop'
  | 'marker_loop'
  | 'marker_skip'
  | 'marker_pause'
  | 'time_signature'
  | 'start_recording'
  | 'stop_recording';

export interface PlaylistMarker {
  id: string;
  tick: Tick;
  name: string;
  color?: string;
  type: MarkerType;
  loopEndTick?: Tick;
  timeSignature?: { numerator: number; denominator: number };
  triggerNote?: number;
}

export interface PlaylistViewState {
  gridColor: string;
  gridContrast: GridContrast;
  invertGrid: boolean;
  showTrackSeparators: boolean;
  timeSegmentUnit: TimeSegmentUnit;
  keepLabelsOnScreen: boolean;
  contentInTitleBars: boolean;
  clipBehindStyle: ClipBehindStyle;
  showShadow: boolean;
  trackHeightPercent: number;
  hideCollapsedGroups: boolean;
  showFadePreviews: boolean;
  showGainValue: boolean;
  showGainScale: boolean;
  showGainPreviews: boolean;
  incrementalScrolling: boolean;
  preciseTimeIndicator: boolean;
  performanceClipProgress: boolean;
  performanceTrackProgress: boolean;
  miniPreviewEnabled: boolean;
  miniPreviewDoubleHeight: boolean;
  miniPreviewShowTimeMarkers: boolean;
  showControlsOnAudioTracks: boolean;
  showLevelsOnAudioTracks: boolean;
  showLevelsOnInstrumentTracks: boolean;
  snapMode: PlaylistSnapMode;
}

export type ClipKind = 'audio' | 'midi';

export interface ClipboardClip {
  kind: ClipKind;
  trackId: string;
  startOffset: Tick;
  durationTicks: Tick;
  payload: Record<string, unknown>;
}

export type PerformanceQuantize = 'off' | 'beat' | '1bar' | '2bar' | '4bar' | '8bar';

export interface PerformanceModeState {
  enabled: boolean;
  quantize: PerformanceQuantize;
  detached: boolean;
  activeClips: Record<string, boolean>;
}

export interface TrackGroup {
  id: string;
  name: string;
  color?: string;
  trackIds: string[];
  collapsed: boolean;
}

export type PickerSortMode = 'name' | 'color' | 'mixer_track';
export type PickerEditTarget = 'automatic' | 'channel_rack' | 'piano_roll' | 'piano_roll_or_event';

export interface PickerPanelState {
  visible: boolean;
  dockRight: boolean;
  width: number;
  showEmptyPatterns: boolean;
  autoGroupPatterns: boolean;
  sortMode: PickerSortMode;
  editTarget: PickerEditTarget;
  adjustStartTime: boolean;
}

export type AudioDropBehavior = 'audio_clips' | 'audio_tracks' | 'instrument_tracks' | 'always_ask';
