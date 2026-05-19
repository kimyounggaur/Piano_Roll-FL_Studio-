# FL Studio Playlist 전체 기능 구현 가이드 — RollLab Audio Edit 패널

> **대상:** React 19 + TypeScript + Vite + Zustand v5 + Tone.js 기반 RollLab 프로젝트  
> **패널:** `AudioClipEditor` (Arrangement View / Playlist 동등 패널)  
> **구성:** Phase 0~8, 총 9단계

---

## 공통 규칙

- 모든 tick 연산은 `src/utils/time.ts`의 `snapTick`, `snapUnitToTicks`, `ticksPerBar` 사용
- 모든 픽셀↔틱 변환은 `src/utils/geometry.ts`의 `tickToX`, `xToTick` 사용
- 스토어 액션은 `addAutomationLane` 패턴과 동일하게 `set((s) => ...)` 불변 업데이트
- `beginTransaction` / `commitTransaction` / `cancelTransaction` 으로 드래그 전체를 단일 undo 항목으로 묶기
- CSS 클래스명은 BEM 스타일: `playlist__ruler`, `playlist__lane`, `clip-block--selected`
- 새 컴포넌트는 모두 `src/components/playlist/` 디렉토리에 생성

---

## Phase 0 — 타입 & 스토어 확장

### 목표
FL Studio Playlist 전 기능에 필요한 TypeScript 타입을 `src/types/music.ts`에 추가하고, `src/store/projectStore.ts`에 대응하는 Zustand 액션을 선언한다.

### 새 파일
- `src/types/playlist.ts` — Playlist 전용 타입 모음

### 수정 파일
- `src/types/music.ts`
- `src/store/projectStore.ts`

---

### 구체적 구현 지침

#### 1. `src/types/playlist.ts` 전체 작성

```typescript
import type { Tick } from './music';

// ── Arrangement 전용 스냅 모드 ─────────────────────────────────────
export type PlaylistSnapMode =
  | 'main'    // 프로젝트 snapUnit 따름
  | 'line'    // 최소 시각 라인(셀) 단위
  | 'cell'    // 1 셀 = 현재 그리드 1칸
  | 'none'    // 스냅 없음
  | 'step_1_6' | 'step_1_4' | 'step_1_3' | 'step_1_2' | 'step_1'
  | 'beat_1_6' | 'beat_1_4' | 'beat_1_3' | 'beat_1_2' | 'beat_1'
  | 'bar'
  | 'events'; // 클립 에지에 스냅

// ── 타임 세그먼트 표시 단위 ───────────────────────────────────────
export type TimeSegmentUnit = 'bars' | 'beats' | 'steps' | 'markers';

// ── 클립 배경 스타일 ─────────────────────────────────────────────
export type ClipBehindStyle = 'nothing' | 'plain' | 'cel' | 'glass' | 'aqua' | 'solid';

// ── 그리드 콘트라스트 ────────────────────────────────────────────
export type GridContrast = 'high' | 'medium' | 'low';

// ── 타임 마커 확장 타입 ──────────────────────────────────────────
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
  /** MarkerType === 'loop': 루프 구간 끝 틱 */
  loopEndTick?: Tick;
  /** MarkerType === 'time_signature': 박자표 */
  timeSignature?: { numerator: number; denominator: number };
  /** MIDI note / keyboard key for live song jump */
  triggerNote?: number;
}

// ── Arrangement 뷰 상태 ──────────────────────────────────────────
export interface PlaylistViewState {
  // 뷰 옵션
  gridColor: string;
  gridContrast: GridContrast;
  invertGrid: boolean;
  showTrackSeparators: boolean;
  timeSegmentUnit: TimeSegmentUnit;
  keepLabelsOnScreen: boolean;
  contentInTitleBars: boolean;
  clipBehindStyle: ClipBehindStyle;
  showShadow: boolean;
  trackHeightPercent: number;       // 33~200
  hideCollapsedGroups: boolean;
  showFadePreviews: boolean;
  showGainValue: boolean;
  showGainScale: boolean;
  showGainPreviews: boolean;
  incrementalScrolling: boolean;
  preciseTimeIndicator: boolean;
  performanceClipProgress: boolean;
  performanceTrackProgress: boolean;
  // Mini playlist preview
  miniPreviewEnabled: boolean;
  miniPreviewDoubleHeight: boolean;
  miniPreviewShowTimeMarkers: boolean;
  // Track controls
  showControlsOnAudioTracks: boolean;
  showLevelsOnAudioTracks: boolean;
  showLevelsOnInstrumentTracks: boolean;
  // 스냅
  snapMode: PlaylistSnapMode;
}

// ── 클립 클립보드 엔트리 ─────────────────────────────────────────
export type ClipKind = 'audio' | 'midi';

export interface ClipboardClip {
  kind: ClipKind;
  trackId: string;
  startOffset: Tick;   // 선택 박스 원점 기준 상대 틱
  durationTicks: Tick;
  /** AudioRegion | MidiClip 의 나머지 필드 스냅샷 */
  payload: Record<string, unknown>;
}

// ── 퍼포먼스 모드 ────────────────────────────────────────────────
export type PerformanceQuantize = 'off' | 'beat' | '1bar' | '2bar' | '4bar' | '8bar';

export interface PerformanceModeState {
  enabled: boolean;
  quantize: PerformanceQuantize;
  detached: boolean;
  /** 트리거 상태: clipId → 현재 재생 중인지 */
  activeClips: Record<string, boolean>;
}

// ── 트랙 그룹 ────────────────────────────────────────────────────
export interface TrackGroup {
  id: string;
  name: string;
  color?: string;
  trackIds: string[];
  collapsed: boolean;
}

// ── 피커 패널 ────────────────────────────────────────────────────
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

// ── 드롭 동작 ────────────────────────────────────────────────────
export type AudioDropBehavior = 'audio_clips' | 'audio_tracks' | 'instrument_tracks' | 'always_ask';
```

---

#### 2. `src/types/music.ts` 수정

기존 `AudioRegion` 인터페이스에 필드 추가:

```typescript
export interface AudioRegion {
  // ... 기존 필드 유지 ...
  /** 크로스페이드 상대 클립 id (자동 크로스페이드 시 설정됨) */
  crossfadeWithId?: string;
  crossfadeTicks?: number;
  /** 트리밍: 원본 오디오 내 시작 오프셋 틱 */
  clipStartOffsetTicks?: number;
  selected?: boolean;
  groupId?: string;
}

export interface MidiClip {
  // ... 기존 필드 유지 ...
  selected?: boolean;
  groupId?: string;
}
```

기존 `Project` 인터페이스에 필드 추가:

```typescript
export interface Project {
  // ... 기존 필드 유지 ...
  /** 플레이리스트 전용 마커 (MarkerType 확장) */
  playlistMarkers?: import('./playlist').PlaylistMarker[];
  /** 트랙 그룹 */
  trackGroups?: import('./playlist').TrackGroup[];
}
```

---

#### 3. `src/store/projectStore.ts` — `ProjectStore` 인터페이스에 추가

```typescript
// Phase 0에서 추가할 스토어 인터페이스 항목

import type {
  PlaylistViewState, PlaylistSnapMode, PlaylistMarker, MarkerType,
  ClipboardClip, PerformanceModeState, PerformanceQuantize,
  TrackGroup, PickerPanelState, AudioDropBehavior,
} from '../types/playlist';

interface ProjectStore {
  // ... 기존 필드 유지 ...

  // ── Playlist 뷰 상태 ────────────────────────────────────────────
  playlistView: PlaylistViewState;
  setPlaylistView: (partial: Partial<PlaylistViewState>) => void;

  // ── Arrangement 뷰포트 (Audio Edit 전용, PianoRollViewport와 독립) ──
  arrangementScrollX: number;
  arrangementScrollY: number;
  arrangementZoomX: number;
  setArrangementScroll: (x: number, y: number) => void;
  setArrangementZoomX: (z: number) => void;
  /** pixelsPerTick for the arrangement canvas */
  arrangementPixelsPerTick: () => number;

  // ── 클립 다중 선택 ──────────────────────────────────────────────
  selectedClipIds: Set<string>;
  selectClip: (id: string, additive: boolean) => void;
  deselectAllClips: () => void;
  selectAllClips: () => void;
  selectClipsInRect: (startTick: number, endTick: number, trackIds: string[]) => void;
  selectMutedClips: () => void;
  selectOverlappingClips: () => void;
  selectStackedClips: () => void;
  invertClipSelection: () => void;
  /** 선택 구간 기준 시간 선택 (Ctrl+Enter) */
  selectTimeAroundSelection: () => void;
  selectTimeRange: (startTick: number, endTick: number) => void;
  /** Ctrl+Left/Right — 이전/다음 클립 경계로 시간 이동 */
  selectAdjacentTime: (dir: 'prev' | 'next') => void;
  /** 선택된 소스 기준 클립 선택 (Shift+C) */
  selectBySource: (sourceClipId: string) => void;

  // ── 클립 편집 ────────────────────────────────────────────────────
  /** 선택 클립을 deltaTick만큼 이동 */
  moveSelectedClips: (deltaTick: number, deltaTrackIndex: number) => void;
  /** 선택 클립을 왼쪽/오른쪽/위/아래로 nudge */
  shiftSelectedClips: (dir: 'left' | 'right' | 'up' | 'down', amount?: number) => void;
  /** 마우스 휠로 nudge (amount = ±1 snap unit) */
  nudgeSelectedClipsWithWheel: (deltaTick: number) => void;
  /** 선택 클립 복제 (현재 위치에서 한 bar 뒤) */
  duplicateSelectedClips: () => void;
  /** 선택 클립 삭제 */
  deleteSelectedClips: () => void;
  /** 선택 클립 음소거 토글 */
  toggleSelectedClipsMute: () => void;
  /** 공백 삽입 (Ctrl+Ins): playhead tick 이후 모든 클립을 insertTicks만큼 뒤로 */
  insertSpace: (atTick: number, insertTicks: number) => void;
  /** 슬라이스 후 공백 삽입 (Ctrl+Alt+Ins) */
  sliceAndInsertSpace: (atTick: number, insertTicks: number) => void;
  /** 공백 삭제 (Ctrl+Del): startTick~endTick 사이 클립 삭제 후 당기기 */
  deleteSpace: (startTick: number, endTick: number) => void;
  /** 패턴 클립 병합 (Ctrl+G) */
  mergePatternClips: () => void;
  /** 동일 패턴 클립 병합 (Shift+Ctrl+G) */
  mergeSimilarPatternClips: () => void;
  /** 오토메이션 클립 병합 (Ctrl+Alt+G) */
  mergeAutomationClips: () => void;
  /** 선택된 오디오 클립 피치 ±1 반음 */
  pitchSelectedAudioClips: (semitones: number) => void;
  /** 선택된 오디오 클립 리버스 */
  reverseSelectedAudioClips: () => void;
  /** 자동 크로스페이드 토글 */
  autoFadesEnabled: boolean;
  setAutoFades: (v: boolean) => void;
  /** 수동 페이드로 새 클립 생성 */
  manualFadesEnabled: boolean;
  setManualFades: (v: boolean) => void;
  snapFadeHandles: boolean;
  setSnapFadeHandles: (v: boolean) => void;
  /** Ctrl+Q — 선택 클립의 시작 시간 퀵 퀀타이즈 */
  quantizeSelectedClipStartTimes: () => void;
  /** Consolidate: 선택 영역 → 단일 클립 */
  consolidateSelection: (mode: 'from_selection' | 'from_song_start') => void;
  /** Export all playlist tracks */
  exportAllPlaylistTracks: (mode: 'from_song_start' | 'from_track_start' | 'time_selection') => Promise<void>;
  /** Clone selected playlist track (Shift/Cmd+B) */
  cloneSelectedPlaylistTrack: () => void;

  // ── 클립 클립보드 ────────────────────────────────────────────────
  clipClipboard: ClipboardClip[];
  copySelectedClips: () => void;
  cutSelectedClips: () => void;
  pasteClips: (atTick?: number) => void;

  // ── 타임 마커 (확장) ─────────────────────────────────────────────
  playlistMarkers: PlaylistMarker[];
  addPlaylistMarker: (tick: number, type?: MarkerType, name?: string) => string;
  removePlaylistMarker: (id: string) => void;
  updatePlaylistMarker: (id: string, partial: Partial<PlaylistMarker>) => void;
  addMarkerAtSelectionBoundary: (boundary: 'start' | 'end') => void;
  addMarkersEvery: (bars: number) => void;
  addJumpToNextBarMarker: () => void;
  changeMarkerType: (id: string, type: MarkerType) => void;
  placeLoop: (startTick: number, endTick: number) => void;
  startRecordingAtSelection: () => void;
  stopRecordingAtSelection: () => void;
  /** 마커 기준 콘텐츠 이동 */
  moveContentAroundMarker: (markerId: string, dir: 'left' | 'right') => void;

  // ── 트랙 그룹 ────────────────────────────────────────────────────
  trackGroups: TrackGroup[];
  groupSelectedTracks: (name?: string) => string;
  ungroupTracks: (groupId: string) => void;
  toggleGroupCollapse: (groupId: string) => void;

  // ── 줌 / 내비게이션 ─────────────────────────────────────────────
  setPlaylistZoomPreset: (preset: '1' | '2' | '3' | 'far' | 'selection' | 'performance') => void;
  zoomInPlaylist: () => void;
  zoomOutPlaylist: () => void;
  centerPlaylistView: () => void;

  // ── 피커 패널 ────────────────────────────────────────────────────
  pickerPanel: PickerPanelState;
  setPickerPanel: (partial: Partial<PickerPanelState>) => void;

  // ── 퍼포먼스 모드 ────────────────────────────────────────────────
  performanceMode: PerformanceModeState;
  setPerformanceModeEnabled: (v: boolean) => void;
  setPerformanceQuantize: (q: PerformanceQuantize) => void;
  triggerPerformanceClip: (clipId: string) => void;
  stopPerformanceClip: (clipId: string) => void;
  centerPerformanceView: () => void;

  // ── 오디오 드롭 동작 ─────────────────────────────────────────────
  audioDropBehavior: AudioDropBehavior;
  setAudioDropBehavior: (b: AudioDropBehavior) => void;
}
```

---

#### 4. `src/store/projectStore.ts` — 기본값 및 구현 추가

`createDefaultProject` 아래에 추가할 기본값:

```typescript
const DEFAULT_PLAYLIST_VIEW: PlaylistViewState = {
  gridColor: '#2a2e26',
  gridContrast: 'medium',
  invertGrid: false,
  showTrackSeparators: true,
  timeSegmentUnit: 'bars',
  keepLabelsOnScreen: true,
  contentInTitleBars: false,
  clipBehindStyle: 'plain',
  showShadow: true,
  trackHeightPercent: 100,
  hideCollapsedGroups: false,
  showFadePreviews: true,
  showGainValue: false,
  showGainScale: false,
  showGainPreviews: false,
  incrementalScrolling: false,
  preciseTimeIndicator: false,
  performanceClipProgress: true,
  performanceTrackProgress: true,
  miniPreviewEnabled: false,
  miniPreviewDoubleHeight: false,
  miniPreviewShowTimeMarkers: true,
  showControlsOnAudioTracks: true,
  showLevelsOnAudioTracks: false,
  showLevelsOnInstrumentTracks: false,
  snapMode: 'main',
};

const DEFAULT_PERFORMANCE_MODE: PerformanceModeState = {
  enabled: false,
  quantize: 'off',
  detached: false,
  activeClips: {},
};

const DEFAULT_PICKER_PANEL: PickerPanelState = {
  visible: false,
  dockRight: false,
  width: 200,
  showEmptyPatterns: false,
  autoGroupPatterns: false,
  sortMode: 'name',
  editTarget: 'automatic',
  adjustStartTime: false,
};
```

스토어 `create()` 구현부에 추가할 초기값:

```typescript
playlistView: DEFAULT_PLAYLIST_VIEW,
selectedClipIds: new Set<string>(),
clipClipboard: [],
playlistMarkers: [],
trackGroups: [],
arrangementScrollX: 0,
arrangementScrollY: 0,
arrangementZoomX: 1.0,
autoFadesEnabled: false,
manualFadesEnabled: false,
snapFadeHandles: true,
performanceMode: DEFAULT_PERFORMANCE_MODE,
pickerPanel: DEFAULT_PICKER_PANEL,
audioDropBehavior: 'always_ask' as AudioDropBehavior,
```

---

### 완료 기준
- `tsc --noEmit` 에러 0개
- `playlistView`, `selectedClipIds`, `playlistMarkers`, `trackGroups`, `performanceMode`, `pickerPanel` 가 스토어에서 `useProjectStore((s) => s.XXX)` 로 구독 가능
- `setPlaylistView({ gridContrast: 'high' })` 호출 후 상태 업데이트 확인

---

## Phase 1 — Arrangement Canvas (핵심 타임라인 렌더링)

### 목표
`AudioClipEditor` 를 `ArrangementView` 로 리팩토링하여 FL Studio Playlist 수준의 캔버스 기반 타임라인을 구현한다: 눈금자(Ruler), 그리드, 시간 세그먼트 표시, 정밀 시간 표시기, 재생헤드.

### 새 파일
- `src/components/playlist/ArrangementRuler.tsx`
- `src/components/playlist/ArrangementCanvas.tsx`
- `src/components/playlist/PlayheadLine.tsx`
- `src/components/playlist/ArrangementView.tsx`
- `src/components/playlist/ArrangementView.css`

### 수정 파일
- `src/components/audioEdit/AudioClipEditor.tsx` → `ArrangementView` 로 교체하거나 래퍼로 전환
- `src/components/layout/AppShell.tsx` — `AudioClipEditor` → `ArrangementView` import 교체

---

### 구체적 구현 지침

#### 1. `ArrangementRuler.tsx`

```typescript
interface ArrangementRulerProps {
  width: number;        // 캔버스 전체 픽셀 너비
  height?: number;      // 기본 28px
}
```

캔버스 `useEffect` 내부 렌더링 로직:
- `timeSegmentUnit === 'bars'`: 매 Bar 마다 굵은 선 + 번호, 매 Beat 마다 얇은 선
- `timeSegmentUnit === 'beats'`: 매 Beat 마다 굵은 선 + 번호, 매 1/4beat 마다 얇은 선
- `timeSegmentUnit === 'steps'`: 16th note 단위 눈금
- `timeSegmentUnit === 'markers'`: `playlistMarkers` 에서 type이 `'marker_loop'` 또는 `'none'` 인 것을 이름으로 표시

```typescript
// 렌더링 핵심 루프
const ppq = project.settings.ppq;
const ts  = project.settings.timeSignature;
const tpBar  = ticksPerBar(ppq, ts);
const tpBeat = ticksPerBeat(ppq, ts);
const px = arrangementPixelsPerTick();

// preciseTimeIndicator 가 true이면 "bar:beat:step" 형식
// false이면 bar 번호만
```

클릭 핸들러: `setPlayheadTick(xToTick(clientX - rect.left, arrangementViewport))`

루프 구간 드래그: mousedown → mousemove → mouseup 으로 `loopStartTick`, `loopEndTick` 업데이트 (기존 `PianoRollCanvas` 의 루프 핸들러와 동일 패턴)

#### 2. `ArrangementCanvas.tsx`

```typescript
interface ArrangementCanvasProps {
  width: number;
  height: number;
}
```

내부 `useRef<HTMLCanvasElement>` + `useEffect` 패턴 (기존 `PianoRollCanvas` 와 동일).

그리드 렌더링:
```typescript
// playlistView.gridContrast → 선 알파값 결정
const contrastAlpha = { high: 0.4, medium: 0.2, low: 0.08 }[gridContrast];
// playlistView.invertGrid → 짝수/홀수 bar 음영 색 반전
// 짝수 bar: rgba(255,255,255, invertGrid ? contrastAlpha : 0)
// 홀수 bar: rgba(0,0,0, invertGrid ? 0 : contrastAlpha)
```

트랙 레인 렌더링:
- 각 트랙마다 `y = trackIndex * LANE_H * (trackHeightPercent / 100)` 위치에 선 그리기
- `showTrackSeparators` 가 true이면 레인 사이 경계선(1px, `#3a3e38`)

클립 렌더링은 Phase 2에서 추가. 이 단계는 배경 그리드만.

#### 3. `PlayheadLine.tsx`

```typescript
// 절대 position: absolute 오버레이
// left = playheadTick * arrangementPixelsPerTick() - arrangementScrollX
// 높이 = 전체 레인 높이
// z-index: 10, pointer-events: none
```

`preciseTimeIndicator` 가 true이면 상단에 `formatTickFull(playheadTick, ts, ppq)` 텍스트 표시.

#### 4. `ArrangementView.tsx` 구조

```typescript
export const ArrangementView: React.FC = () => {
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  // ResizeObserver 로 containerSize 업데이트

  return (
    <div className="arrangement-view" ref={containerRef}>
      {/* Toolbar — Phase 2, 3, 4, 5 에서 채움 */}
      <ArrangementToolbar />
      
      <div className="arrangement-body">
        {/* 왼쪽: 트랙 레이블 열 */}
        <TrackLabelColumn />
        
        {/* 오른쪽: 스크롤 가능 타임라인 */}
        <div
          className="arrangement-scroll-area"
          onScroll={handleScroll}
          ref={scrollRef}
        >
          <div style={{ width: totalWidth, position: 'relative' }}>
            {/* 눈금자 */}
            <ArrangementRuler width={totalWidth} />
            
            {/* 플레이리스트 마커 레인 */}
            <PlaylistMarkerLane width={totalWidth} />
            
            {/* 캔버스 레이어: 그리드 배경 */}
            <ArrangementCanvas width={totalWidth} height={lanesHeight} />
            
            {/* 클립 레이어 (Phase 2) */}
            <ClipLayer />
            
            {/* 재생헤드 */}
            <PlayheadLine height={lanesHeight} />
          </div>
        </div>
        
        {/* 피커 패널 (Phase 8) */}
        {pickerPanel.visible && <PickerPanel />}
      </div>
      
      {/* 미니 프리뷰 (Phase 7) */}
      {miniPreviewEnabled && <MiniPlaylistPreview />}
    </div>
  );
};
```

`arrangementScrollX` / `arrangementScrollY` 동기화:
```typescript
const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
  setArrangementScroll(e.currentTarget.scrollLeft, e.currentTarget.scrollTop);
}, [setArrangementScroll]);
```

`totalWidth` 계산:
```typescript
const ppt = arrangementPixelsPerTick();
const allEndTicks = [
  ...audioRegions.map(r => r.startTick + r.durationTicks),
  ...midiClips.map(c => c.startTick + c.durationTicks),
];
const maxTick = allEndTicks.length ? Math.max(...allEndTicks) : 0;
const totalWidth = Math.max(containerSize.w * 2, maxTick * ppt + 500);
```

---

### 완료 기준
- Ruler 가 현재 BPM/박자표에 맞게 Bar 번호를 렌더링
- 그리드 콘트라스트 설정(`high`/`medium`/`low`) 적용 시 시각적으로 변화
- 클릭으로 재생헤드 이동
- 스크롤 시 `arrangementScrollX` 스토어 동기화
- `preciseTimeIndicator` 토글 시 재생헤드 위 시간 표시 전환

---

## Phase 2 — 클립 편집 도구

### 목표
Arrangement View 위의 클립(AudioRegion, MidiClip)에 대해 FL Studio 수준의 인터랙션 구현: select(rubber-band), move, resize(left/right), scissors/slice, nudge, crossfade handle, 마우스 휠 nudge.

### 새 파일
- `src/components/playlist/ClipLayer.tsx`
- `src/components/playlist/ArrangementClipBlock.tsx`
- `src/components/playlist/RubberBandSelect.tsx`
- `src/hooks/useArrangementDrag.ts`
- `src/hooks/useArrangementShortcuts.ts`

### 수정 파일
- `src/components/audioEdit/AudioRegionBlock.tsx` — props 인터페이스 확장
- `src/components/audioEdit/MidiClipBlock.tsx` — props 인터페이스 확장

---

### 구체적 구현 지침

#### 1. Arrangement 툴 타입 확장

`ArrangementView` 내부 state에 추가:

```typescript
type ArrangementTool =
  | 'pointer'    // 선택 + 이동 + 크기조절
  | 'draw'       // 빈 공간 클릭 → 새 클립 생성
  | 'scissors'   // 클립 슬라이스
  | 'fade'       // 페이드 핸들 편집
  | 'loop'       // 루프 마킹
  | 'mute'       // 클립 음소거 토글
  | 'zoom';      // 영역 줌인

const [arrangementTool, setArrangementTool] = useState<ArrangementTool>('pointer');
```

#### 2. `ArrangementClipBlock.tsx`

기존 `AudioRegionBlock` 과 `MidiClipBlock` 을 통합한 단일 컴포넌트. Props:

```typescript
interface ArrangementClipBlockProps {
  clipId: string;
  kind: 'audio' | 'midi';
  startTick: number;
  durationTicks: number;
  trackIndex: number;
  name: string;
  color: string;
  muted: boolean;
  selected: boolean;
  // 뷰 설정
  laneHeight: number;
  pixelsPerTick: number;
  scrollX: number;
  tool: ArrangementTool;
  snapTicks: number;
  snapEnabled: boolean;
  // 콜백
  onSelect: (id: string, additive: boolean) => void;
  onDragStart: (id: string, e: React.MouseEvent) => void;
  onResizeLeftStart: (id: string, e: React.MouseEvent) => void;
  onResizeRightStart: (id: string, e: React.MouseEvent) => void;
  onFadeInStart?: (id: string, e: React.MouseEvent) => void;
  onFadeOutStart?: (id: string, e: React.MouseEvent) => void;
  onCrossfadeStart?: (id: string, side: 'left' | 'right', e: React.MouseEvent) => void;
  // 추가 데이터
  fadeInTicks?: number;
  fadeOutTicks?: number;
  waveformPeaks?: Float32Array;
  notes?: Note[];    // midi 클립용
  gain?: number;
  // 뷰 옵션
  showGainValue: boolean;
  showGainScale: boolean;
  showFadePreview: boolean;
  clipBehindStyle: ClipBehindStyle;
  showShadow: boolean;
  keepLabelOnScreen: boolean;
}
```

`left` = `startTick * pixelsPerTick - scrollX` 로 절대위치 계산.

크기조절 영역:
- 오른쪽 끝 8px: `resize-right` 핸들 (`cursor: e-resize`)
- 왼쪽 끝 8px: `resize-left` 핸들 (`cursor: w-resize`) — `allowResizingFromLeft` 가 true 일 때만
- 왼쪽 상단 16px 삼각형: 크로스페이드 핸들 (옵션)

`showGainValue` 가 true이면 클립 상단 오른쪽에 `(20*log10(gain)).toFixed(1) dB` 텍스트.

`keepLabelOnScreen` 이 true이면 scrollX 고려하여 이름 레이블이 항상 화면에 보이도록:
```typescript
const labelLeft = Math.max(4, scrollX - left + 4);
```

`clipBehindStyle` 별 배경:
```typescript
const bgMap: Record<ClipBehindStyle, string> = {
  nothing: 'transparent',
  plain:   'rgba(0,0,0,0.7)',
  cel:     `repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.15) 4px, rgba(0,0,0,0.15) 8px)`,
  glass:   'rgba(255,255,255,0.08)',
  aqua:    'rgba(56,200,255,0.12)',
  solid:   color,
};
```

#### 3. `useArrangementDrag.ts`

```typescript
export function useArrangementDrag(opts: {
  pixelsPerTick: number;
  snapTicks: number;
  snapEnabled: boolean;
  onCommit: () => void;
}) {
  // dragState ref
  const dragRef = useRef<{
    type: 'move' | 'resize-r' | 'resize-l' | 'fade-in' | 'fade-out' | 'crossfade';
    clipIds: string[];      // 다중 선택 이동 시 모두 포함
    startX: number;
    origValues: Map<string, { startTick: number; durationTicks: number; fadeInTicks?: number; fadeOutTicks?: number }>;
  } | null>(null);

  const startDrag = useCallback((
    type: typeof dragRef.current['type'],
    clipIds: string[],
    e: MouseEvent | React.MouseEvent,
    origValues: typeof dragRef.current['origValues'],
  ) => {
    // beginTransaction() 호출
    // window.addEventListener('mousemove', onDragMove)
    // window.addEventListener('mouseup', onDragEnd, { once: true })
  }, [...]);

  // onDragMove: deltaPx → deltaTick → snap → updateAudioRegion / updateMidiClip
  // onDragEnd: commitTransaction() → opts.onCommit()

  return { startDrag };
}
```

#### 4. `RubberBandSelect.tsx`

```typescript
// SVG rect 또는 div 오버레이
// 빈 레인 mousedown → mousemove 로 선택 박스 그리기
// mouseup 시 selectClipsInRect(startTick, endTick, trackIds) 호출

interface RubberBandSelectProps {
  containerRef: React.RefObject<HTMLDivElement>;
  pixelsPerTick: number;
  scrollX: number;
  scrollY: number;
  laneHeight: number;
  tracks: Track[];
  onSelect: (startTick: number, endTick: number, trackIds: string[], additive: boolean) => void;
}
```

#### 5. 마우스 휠 Nudge

`ArrangementClipBlock` 의 `onWheel` 핸들러:
```typescript
onWheel={(e) => {
  if (!selected) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? snapTicks : -snapTicks;
  nudgeSelectedClipsWithWheel(delta);
}}
```

#### 6. 자동 크로스페이드

`autoFadesEnabled` 가 true일 때, `updateAudioRegion` 이 호출될 때마다 (또는 `commitTransaction` 직후) 다음 로직 실행:

```typescript
function computeAutoCrossfades(regions: AudioRegion[]): Partial<AudioRegion>[] {
  // 같은 트랙 내 겹치는 두 region 감지
  // 겹치는 구간 길이 = crossfadeTicks
  // 앞 region: fadeOutTicks = crossfadeTicks
  // 뒤 region: fadeInTicks = crossfadeTicks, crossfadeWithId = 앞 id
}
```

---

### 완료 기준
- pointer 툴: 클립 클릭 → 선택(파란 테두리), Shift+클릭 → 다중 선택
- 선택 클립 드래그 → 이동, undo 단일 항목
- 오른쪽 핸들 드래그 → 우측 크기조절
- 왼쪽 핸들 드래그 → 좌측 크기조절 (시작점 이동, 오른쪽 끝 고정)
- scissors 툴: 클릭 위치에서 `splitAudioRegion` / 새 MidiClip 2개 생성
- 마우스 휠 → 선택 클립 nudge
- 빈 영역 drag → rubber-band 선택

---

## Phase 3 — 편집 메뉴

### 목표
FL Studio Playlist Edit 메뉴의 모든 기능을 컨텍스트 메뉴 + 단축키로 구현한다.

### 새 파일
- `src/components/playlist/ArrangementContextMenu.tsx`
- `src/components/playlist/ArrangementEditMenu.tsx`
- `src/hooks/useArrangementShortcuts.ts`

### 수정 파일
- `src/store/projectStore.ts` — Phase 0에서 선언한 액션 구현 추가
- `src/components/playlist/ArrangementView.tsx` — 컨텍스트 메뉴 연결

---

### 구체적 구현 지침

#### 1. 스토어 액션 구현 (projectStore.ts 내부)

**`copySelectedClips`:**
```typescript
copySelectedClips: () => {
  const { selectedClipIds, audioRegions, midiClips } = get();
  // 선택된 클립 수집, 최소 startTick 계산 (origin)
  const clips: ClipboardClip[] = [];
  const origin = Math.min(...[...selectedClipIds].map(id => {
    const r = audioRegions.find(r => r.id === id);
    const m = midiClips.find(m => m.id === id);
    return (r ?? m)?.startTick ?? Infinity;
  }));
  for (const id of selectedClipIds) {
    const r = audioRegions.find(r => r.id === id);
    if (r) clips.push({ kind: 'audio', trackId: r.trackId, startOffset: r.startTick - origin, durationTicks: r.durationTicks, payload: { ...r } });
    const m = midiClips.find(m => m.id === id);
    if (m) clips.push({ kind: 'midi',  trackId: m.trackId, startOffset: m.startTick - origin, durationTicks: m.durationTicks, payload: { ...m } });
  }
  set({ clipClipboard: clips });
},
```

**`pasteClips`:**
```typescript
pasteClips: (atTick) => {
  const { clipClipboard, playheadTick } = get();
  const pasteAt = atTick ?? playheadTick;
  pushHistory(get, set);
  // nanoid() 로 새 id, startTick = pasteAt + startOffset
  // addAudioRegion / addMidiClipFromTrack 대신 직접 set로 push
},
```

**`insertSpace`:**
```typescript
insertSpace: (atTick, insertTicks) => {
  pushHistory(get, set);
  set((s) => ({
    audioRegions: s.audioRegions.map(r =>
      r.startTick >= atTick ? { ...r, startTick: r.startTick + insertTicks } : r
    ),
    midiClips: s.midiClips.map(c =>
      c.startTick >= atTick ? { ...c, startTick: c.startTick + insertTicks } : c
    ),
  }));
},
```

**`sliceAndInsertSpace`:**
먼저 `atTick` 에서 겹치는 모든 클립을 슬라이스(`splitAudioRegion` 재사용), 그 다음 `insertSpace` 호출.

**`deleteSpace`:**
```typescript
deleteSpace: (startTick, endTick) => {
  pushHistory(get, set);
  const gap = endTick - startTick;
  set((s) => ({
    audioRegions: s.audioRegions
      .filter(r => !(r.startTick >= startTick && r.startTick + r.durationTicks <= endTick))
      .map(r => r.startTick >= endTick ? { ...r, startTick: r.startTick - gap } : r),
    midiClips: s.midiClips
      .filter(c => !(c.startTick >= startTick && c.startTick + c.durationTicks <= endTick))
      .map(c => c.startTick >= endTick ? { ...c, startTick: c.startTick - gap } : c),
  }));
},
```

**`pitchSelectedAudioClips`:**
```typescript
pitchSelectedAudioClips: (semitones) => {
  const { selectedClipIds } = get();
  pushHistory(get, set);
  set((s) => ({
    audioRegions: s.audioRegions.map(r =>
      selectedClipIds.has(r.id)
        ? { ...r, pitchSemitones: Math.max(-24, Math.min(24, r.pitchSemitones + semitones)) }
        : r
    ),
  }));
},
```

**`reverseSelectedAudioClips`:** `AudioRegion` 에 `reversed?: boolean` 플래그 추가. Tone.js 재생 시 해당 플래그 체크하여 AudioBuffer.reverse() 또는 역방향 스케줄링.

**`mergePatternClips`:** 선택된 MidiClip 들 중 겹치거나 인접한 것을 단일 MidiClip 으로 병합. notes 배열을 합치고 startTick = min, durationTicks = max_end - min_start.

**`quantizeSelectedClipStartTimes`:**
```typescript
quantizeSelectedClipStartTimes: () => {
  const snapT = get().snapTicks();
  pushHistory(get, set);
  set((s) => ({
    audioRegions: s.audioRegions.map(r =>
      s.selectedClipIds.has(r.id)
        ? { ...r, startTick: Math.round(r.startTick / snapT) * snapT }
        : r
    ),
    midiClips: s.midiClips.map(c =>
      s.selectedClipIds.has(c.id)
        ? { ...c, startTick: Math.round(c.startTick / snapT) * snapT }
        : c
    ),
  }));
},
```

#### 2. `ArrangementContextMenu.tsx`

```typescript
interface ArrangementContextMenuProps {
  x: number;
  y: number;
  clipId: string | null;   // null이면 빈 레인 우클릭
  onClose: () => void;
}

export const ArrangementContextMenu: React.FC<ArrangementContextMenuProps> = ({ x, y, clipId, onClose }) => {
  // useProjectStore 에서 필요한 액션 구독
  // 메뉴 항목 구조:
  const menuItems = clipId ? [
    { label: '잘라내기 (Ctrl+X)',        action: () => { cutSelectedClips(); onClose(); } },
    { label: '복사 (Ctrl+C)',            action: () => { copySelectedClips(); onClose(); } },
    { label: '붙여넣기 (Ctrl+V)',        action: () => { pasteClips(); onClose(); } },
    { label: '복제 (Ctrl+D)',            action: () => { duplicateSelectedClips(); onClose(); } },
    { label: '삭제 (Del)',               action: () => { deleteSelectedClips(); onClose(); } },
    'separator',
    { label: '왼쪽으로 이동',            action: () => shiftSelectedClips('left') },
    { label: '오른쪽으로 이동',          action: () => shiftSelectedClips('right') },
    'separator',
    { label: '음소거 / 해제 (Alt+M)',    action: () => toggleSelectedClipsMute() },
    { label: '피치 +1 반음 (키 7)',      action: () => pitchSelectedAudioClips(1) },
    { label: '피치 −1 반음 (키 8)',      action: () => pitchSelectedAudioClips(-1) },
    { label: '오디오 리버스 (키 9)',     action: () => reverseSelectedAudioClips() },
    'separator',
    { label: '퀵 퀀타이즈 (Ctrl+Q)',     action: () => quantizeSelectedClipStartTimes() },
    { label: '패턴 클립 병합 (Ctrl+G)', action: () => mergePatternClips() },
  ] : [
    { label: '붙여넣기',                 action: () => pasteClips(atTick) },
    { label: '공백 삽입 (Ctrl+Ins)',     action: () => setShowInsertSpaceDialog(true) },
    { label: '공백 삭제 (Ctrl+Del)',     action: () => setShowDeleteSpaceDialog(true) },
  ];
};
```

#### 3. `useArrangementShortcuts.ts`

기존 `usePianoRollShortcuts.ts` 와 동일한 패턴. `useEffect` 안에 `keydown` 이벤트 리스너:

```typescript
export function useArrangementShortcuts() {
  const store = useProjectStore.getState;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      if (ctrl && e.key === 'c') { store().copySelectedClips(); return; }
      if (ctrl && e.key === 'x') { store().cutSelectedClips(); return; }
      if (ctrl && e.key === 'v') { store().pasteClips(); return; }
      if (ctrl && e.key === 'd') { e.preventDefault(); store().duplicateSelectedClips(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { store().deleteSelectedClips(); return; }
      if (ctrl && e.key === 'Insert') { /* insertSpace 다이얼로그 */ return; }
      if (ctrl && e.key === 'Delete') { /* deleteSpace 다이얼로그 */ return; }
      if (ctrl && e.key === 'g' && !shift) { store().mergePatternClips(); return; }
      if (ctrl && e.key === 'g' && shift) { store().mergeSimilarPatternClips(); return; }
      if (ctrl && e.key === 'q') { store().quantizeSelectedClipStartTimes(); return; }
      if (e.key === '7') { store().pitchSelectedAudioClips(1); return; }
      if (e.key === '8') { store().pitchSelectedAudioClips(-1); return; }
      if (e.key === '9') { store().reverseSelectedAudioClips(); return; }
      // 방향키 nudge
      if (e.key === 'ArrowLeft')  { store().shiftSelectedClips('left'); return; }
      if (e.key === 'ArrowRight') { store().shiftSelectedClips('right'); return; }
      if (e.key === 'ArrowUp')    { store().shiftSelectedClips('up'); return; }
      if (e.key === 'ArrowDown')  { store().shiftSelectedClips('down'); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
```

---

### 완료 기준
- Ctrl+C/V/X/D 로 클립 복사/붙여넣기/잘라내기/복제 동작
- Del 키 → 선택 클립 삭제 + undo 가능
- 방향키 → 선택 클립 snap unit 단위 이동
- 키 7/8/9 → 오디오 클립 피치 ±1 / 리버스 플래그
- Ctrl+G → 인접 MIDI 클립 병합
- Ctrl+Ins 다이얼로그 → 공백 삽입 후 클립 일괄 뒤로 밀림

---

## Phase 4 — 뷰 옵션

### 목표
FL Studio View 메뉴의 모든 옵션을 `playlistView` 상태와 연결하고 UI 컨트롤을 제공한다.

### 새 파일
- `src/components/playlist/ViewOptionsMenu.tsx`
- `src/components/playlist/TrackLabelColumn.tsx`
- `src/components/playlist/TrackResizeHandle.tsx`

### 수정 파일
- `src/components/playlist/ArrangementClipBlock.tsx` — 뷰 옵션 prop 반영
- `src/components/playlist/ArrangementCanvas.tsx` — 그리드 스타일 반영
- `src/components/playlist/ArrangementView.tsx` — ViewOptionsMenu 연결

---

### 구체적 구현 지침

#### 1. `ViewOptionsMenu.tsx`

드롭다운 메뉴로 구현. `setPlaylistView(partial)` 를 사용하는 토글/선택 항목들:

```typescript
// 그리드 색상 선택기
<input type="color" value={playlistView.gridColor}
  onChange={(e) => setPlaylistView({ gridColor: e.target.value })} />

// 콘트라스트 라디오
{(['high','medium','low'] as GridContrast[]).map(c => (
  <label key={c}>
    <input type="radio" name="contrast" value={c}
      checked={playlistView.gridContrast === c}
      onChange={() => setPlaylistView({ gridContrast: c })} />
    {c}
  </label>
))}

// 그리드 반전
<input type="checkbox" checked={playlistView.invertGrid}
  onChange={(e) => setPlaylistView({ invertGrid: e.target.checked })} />

// 트랙 구분선
<input type="checkbox" checked={playlistView.showTrackSeparators}
  onChange={(e) => setPlaylistView({ showTrackSeparators: e.target.checked })} />

// 시간 세그먼트 단위 (select)
<select value={playlistView.timeSegmentUnit}
  onChange={(e) => setPlaylistView({ timeSegmentUnit: e.target.value as TimeSegmentUnit })}>
  <option value="bars">Bars</option>
  <option value="beats">Beats</option>
  <option value="steps">Steps</option>
  <option value="markers">Markers</option>
</select>

// 클립 배경 스타일 (select)
<select value={playlistView.clipBehindStyle}
  onChange={(e) => setPlaylistView({ clipBehindStyle: e.target.value as ClipBehindStyle })}>
  {(['nothing','plain','cel','glass','aqua','solid'] as ClipBehindStyle[]).map(s =>
    <option key={s} value={s}>{s}</option>
  )}
</select>

// 트랙 높이 (33~200%)
<input type="range" min={33} max={200} value={playlistView.trackHeightPercent}
  onChange={(e) => setPlaylistView({ trackHeightPercent: Number(e.target.value) })} />
<span>{playlistView.trackHeightPercent}%</span>
```

#### 2. `TrackLabelColumn.tsx`

기존 `audio-track-labels` 를 독립 컴포넌트로 분리. 각 트랙 행:
```typescript
// 높이 = LANE_H * (trackHeightPercent / 100)
// 색상 바, 이름, 음소거/솔로 버튼, 볼륨 노브(showControlsOnAudioTracks)
// 레벨 미터(showLevelsOnAudioTracks)
// 아래쪽 TrackResizeHandle
```

`showControlsOnAudioTracks` 가 true이면:
- 음소거 버튼 (`track.muted` ↔ `toggleTrackMute`)
- 솔로 버튼 (`track.solo` ↔ `toggleTrackSolo`)
- 볼륨 슬라이더 (`track.volume` ↔ `updateTrack`)

`showLevelsOnAudioTracks` 가 true이면:
- 작은 VU 미터(RMS 레벨 표시) — `requestAnimationFrame` 루프로 `AnalyserNode` 에서 읽기

#### 3. `TrackResizeHandle.tsx`

레인 사이 경계에 있는 드래그 핸들. mousedown → mousemove → `setPlaylistView({ trackHeightPercent: ... })`.

#### 4. `Resize all tracks` 메뉴 항목

```typescript
// "33% / 50% / 75% / 100% / 150% / 200%" 프리셋
const RESIZE_PRESETS = [33, 50, 75, 100, 150, 200];
RESIZE_PRESETS.map(p =>
  <button onClick={() => setPlaylistView({ trackHeightPercent: p })}>{p}%</button>
)
```

#### 5. 미니 플레이리스트 프리뷰

`miniPreviewEnabled` 가 true이면 하단에 고정 높이(44px 또는 `miniPreviewDoubleHeight` 시 88px) 의 전체 배치 미니맵 표시.

```typescript
// 전체 배치를 1/N 비율로 canvas에 렌더링
// miniPreviewShowTimeMarkers가 true이면 마커 깃발 포함
// 드래그 → arrangementScrollX 이동
```

---

### 완료 기준
- 그리드 콘트라스트 3단계 시각 변화 확인
- 트랙 높이 슬라이더 드래그 → 레인 높이 실시간 변경
- `showControlsOnAudioTracks` 켜면 레인 레이블에 Mute/Solo/Volume 표시
- `clipBehindStyle` 변경 시 클립 배경 즉시 반영
- `keepLabelsOnScreen` 켜면 클립 이름이 스크롤해도 화면 안에 유지

---

## Phase 5 — 스냅 & 선택

### 목표
Playlist Snap 메뉴 전체 모드 구현, Select 메뉴 전체 선택 모드 구현, 트랙 그룹 기능 구현.

### 새 파일
- `src/components/playlist/SnapMenu.tsx`
- `src/components/playlist/SelectMenu.tsx`
- `src/components/playlist/GroupMenu.tsx`

### 수정 파일
- `src/store/projectStore.ts` — Phase 0 액션 구현 추가
- `src/components/playlist/ArrangementView.tsx` — 스냅 계산 로직 연결

---

### 구체적 구현 지침

#### 1. `SnapMenu.tsx`

```typescript
const SNAP_OPTIONS: { mode: PlaylistSnapMode; label: string; shortcut?: string }[] = [
  { mode: 'main',      label: 'Main (프로젝트 스냅)' },
  { mode: 'line',      label: 'Line' },
  { mode: 'cell',      label: 'Cell' },
  { mode: 'none',      label: 'None' },
  { mode: 'step_1_6',  label: 'Step 1/6' },
  { mode: 'step_1_4',  label: 'Step 1/4' },
  { mode: 'step_1_3',  label: 'Step 1/3' },
  { mode: 'step_1_2',  label: 'Step 1/2' },
  { mode: 'step_1',    label: 'Step 1' },
  { mode: 'beat_1_6',  label: 'Beat 1/6' },
  { mode: 'beat_1_4',  label: 'Beat 1/4' },
  { mode: 'beat_1_3',  label: 'Beat 1/3' },
  { mode: 'beat_1_2',  label: 'Beat 1/2' },
  { mode: 'beat_1',    label: 'Beat 1' },
  { mode: 'bar',       label: 'Bar' },
  { mode: 'events',    label: 'Events (클립 에지 스냅)' },
];
```

`snapModeToTicks(mode: PlaylistSnapMode, ppq: number, ts: TimeSignature): number | 'events'` 순수 함수 (`src/utils/playlistSnap.ts` 에 추가):

```typescript
export function snapModeToTicks(
  mode: PlaylistSnapMode,
  ppq: number,
  ts: TimeSignature,
): number {
  const tpBar  = ticksPerBar(ppq, ts);
  const tpBeat = ticksPerBeat(ppq, ts);
  const map: Record<PlaylistSnapMode, number> = {
    main:      snapUnitToTicks(mainSnapUnit, ppq),  // 호출부에서 주입
    line:      ppq / 16,
    cell:      ppq / 4,
    none:      1,
    step_1_6:  Math.round(tpBeat / 6),
    step_1_4:  Math.round(tpBeat / 4),
    step_1_3:  Math.round(tpBeat / 3),
    step_1_2:  Math.round(tpBeat / 2),
    step_1:    tpBeat,
    beat_1_6:  Math.round(tpBar / (ts.numerator * 6)),
    beat_1_4:  Math.round(tpBar / (ts.numerator * 4)),
    beat_1_3:  Math.round(tpBar / (ts.numerator * 3)),
    beat_1_2:  Math.round(tpBar / (ts.numerator * 2)),
    beat_1:    Math.round(tpBar / ts.numerator),
    bar:       tpBar,
    events:    1, // 'events' 모드는 별도 처리
  };
  return map[mode];
}
```

`events` 스냅: 드래그 중 `deltaTick` 계산 시 가장 가까운 다른 클립의 startTick 또는 endTick에 스냅.

#### 2. 선택 액션 구현

**`selectAllClips`:**
```typescript
selectAllClips: () => {
  const { audioRegions, midiClips } = get();
  set({ selectedClipIds: new Set([
    ...audioRegions.map(r => r.id),
    ...midiClips.map(c => c.id),
  ]) });
},
```

**`selectMutedClips`:**
```typescript
selectMutedClips: () => {
  const { audioRegions, midiClips } = get();
  set({ selectedClipIds: new Set([
    ...audioRegions.filter(r => r.muted).map(r => r.id),
    ...midiClips.filter(c => c.muted).map(c => c.id),
  ]) });
},
```

**`selectOverlappingClips`:** 같은 트랙 내에서 시간적으로 겹치는 클립 쌍을 찾아 선택.

**`selectStackedClips`:** 같은 시작 틱을 공유하는 클립 선택.

**`invertClipSelection`:**
```typescript
invertClipSelection: () => {
  const { selectedClipIds, audioRegions, midiClips } = get();
  const allIds = new Set([...audioRegions.map(r => r.id), ...midiClips.map(c => c.id)]);
  set({ selectedClipIds: new Set([...allIds].filter(id => !selectedClipIds.has(id))) });
},
```

**`selectTimeAroundSelection`:** 선택된 클립의 min startTick ~ max endTick 을 루프 구간으로 설정:
```typescript
selectTimeAroundSelection: () => {
  const { selectedClipIds, audioRegions, midiClips } = get();
  const clips = [...audioRegions, ...midiClips].filter(c => selectedClipIds.has(c.id));
  if (!clips.length) return;
  const start = Math.min(...clips.map(c => c.startTick));
  const end   = Math.max(...clips.map(c => c.startTick + c.durationTicks));
  set(s => ({ project: { ...s.project, settings: { ...s.project.settings, loopStartTick: start, loopEndTick: end } } }));
},
```

**`selectAdjacentTime`:** 현재 재생헤드 위치에서 가장 가까운 클립 경계로 이동 후 선택.

#### 3. 그룹 액션 구현

```typescript
groupSelectedTracks: (name) => {
  const { project, selectedClipIds, audioRegions, midiClips } = get();
  // 선택된 클립들이 속한 trackId 수집
  const trackIds = new Set<string>();
  [...audioRegions, ...midiClips]
    .filter(c => selectedClipIds.has(c.id))
    .forEach(c => trackIds.add(c.trackId));
  
  const group: TrackGroup = {
    id: nanoid(),
    name: name ?? `그룹 ${(get().trackGroups.length + 1)}`,
    trackIds: [...trackIds],
    collapsed: false,
  };
  set(s => ({ trackGroups: [...s.trackGroups, group] }));
  return group.id;
},

ungroupTracks: (groupId) => {
  set(s => ({ trackGroups: s.trackGroups.filter(g => g.id !== groupId) }));
},

toggleGroupCollapse: (groupId) => {
  set(s => ({
    trackGroups: s.trackGroups.map(g =>
      g.id === groupId ? { ...g, collapsed: !g.collapsed } : g
    ),
  }));
},
```

`hideCollapsedGroups` 가 true이면 `collapsed === true` 인 그룹의 트랙들을 레인에서 숨김.

#### 4. `SelectMenu.tsx`

```typescript
const SELECT_MENU_ITEMS = [
  { label: '선택 해제 (Ctrl+D)',                    action: () => deselectAllClips() },
  { label: '전체 선택 (Ctrl+A)',                    action: () => selectAllClips() },
  { label: '소스로 선택 (Shift+C)',                 action: () => selectBySource(activeClipId) },
  { label: '음소거된 클립 선택',                    action: () => selectMutedClips() },
  { label: '겹치는 클립 선택',                      action: () => selectOverlappingClips() },
  { label: '쌓인 클립 선택',                        action: () => selectStackedClips() },
  { label: '선택 반전 (Shift+I)',                   action: () => invertClipSelection() },
  { label: '선택 주변 시간 선택 (Ctrl+Enter)',      action: () => selectTimeAroundSelection() },
  { label: '이전 시간으로 (Ctrl+Left)',              action: () => selectAdjacentTime('prev') },
  { label: '다음 시간으로 (Ctrl+Right)',             action: () => selectAdjacentTime('next') },
];
```

단축키는 `useArrangementShortcuts.ts` 에 추가:
```typescript
if (ctrl && e.key === 'd') { deselectAllClips(); return; }
if (ctrl && e.key === 'a') { selectAllClips(); return; }
if (shift && e.key === 'I') { invertClipSelection(); return; }
if (ctrl && e.key === 'Enter') { selectTimeAroundSelection(); return; }
if (shift && e.key === 'G') { groupSelectedTracks(); return; }
```

---

### 완료 기준
- Snap 메뉴에서 모드 선택 → 드래그 스냅 단위 즉시 변경
- Ctrl+A → 모든 클립 선택, Ctrl+D → 전체 해제
- 음소거 클립 선택, 겹치는 클립 선택 동작 확인
- Shift+G → 선택 트랙 그룹화, 그룹 컬랩스 시 해당 트랙 행 숨김

---

## Phase 6 — 타임 마커

### 목표
FL Studio Playlist Time Markers 메뉴의 모든 마커 타입과 액션을 완전 구현한다.

### 새 파일
- `src/components/playlist/PlaylistMarkerLane.tsx`
- `src/components/playlist/MarkerContextMenu.tsx`
- `src/components/playlist/TimeSignatureChangeDialog.tsx`

### 수정 파일
- `src/store/projectStore.ts` — Phase 0 마커 액션 구현
- `src/hooks/useArrangementShortcuts.ts` — 마커 단축키 추가

---

### 구체적 구현 지침

#### 1. `PlaylistMarkerLane.tsx`

기존 `MarkerLane.tsx` 를 확장. Canvas-based 렌더링:

```typescript
// 마커 타입별 시각 스타일
const MARKER_COLORS: Record<MarkerType, string> = {
  none:             '#ffd11a',
  start:            '#9fe870',
  loop:             '#38c8ff',
  marker_loop:      '#bb8df0',
  marker_skip:      '#ff8ad6',
  marker_pause:     '#ffc091',
  time_signature:   '#e8ebe6',
  start_recording:  '#d03238',
  stop_recording:   '#868685',
};

// 마커 렌더링:
// 1. 세로선 (2px)
// 2. 상단 삼각 깃발 + 타입 아이콘
// 3. 이름 텍스트 (keepLabelsOnScreen 적용)
// 4. loop 타입: loopEndTick 까지 반투명 band 채우기
```

클릭:
- 빈 영역 클릭 → `addPlaylistMarker(tick)` (기본 type: 'none')
- 마커 클릭 → 재생헤드 이동 / 우클릭 → `MarkerContextMenu`
- Alt+클릭 → 마커 삭제

더블클릭 → 마커 이름 인라인 편집

#### 2. 마커 액션 구현

**`addPlaylistMarker`:**
```typescript
addPlaylistMarker: (tick, type = 'none', name) => {
  const id = nanoid();
  const label = name ?? `마커 ${get().playlistMarkers.length + 1}`;
  pushHistory(get, set);
  set(s => ({ playlistMarkers: [...s.playlistMarkers, { id, tick, name: label, type }] }));
  return id;
},
```

**`addMarkersEvery`:**
```typescript
addMarkersEvery: (bars) => {
  const { project } = get();
  const tpBar = ticksPerBar(project.settings.ppq, project.settings.timeSignature);
  const totalBars = project.settings.bars;
  pushHistory(get, set);
  const newMarkers: PlaylistMarker[] = [];
  for (let b = 0; b <= totalBars; b += bars) {
    newMarkers.push({ id: nanoid(), tick: b * tpBar, name: `Bar ${b + 1}`, type: 'none' });
  }
  set(s => ({ playlistMarkers: [...s.playlistMarkers, ...newMarkers] }));
},
```

**`addJumpToNextBarMarker`:**
```typescript
addJumpToNextBarMarker: () => {
  const { playheadTick, project } = get();
  const tpBar = ticksPerBar(project.settings.ppq, project.settings.timeSignature);
  const nextBarTick = Math.ceil(playheadTick / tpBar) * tpBar;
  get().addPlaylistMarker(nextBarTick, 'marker_loop', '다음 bar로');
},
```

**`placeLoop`:**
```typescript
placeLoop: (startTick, endTick) => {
  pushHistory(get, set);
  set(s => ({ project: { ...s.project, settings: { ...s.project.settings, loopStartTick: startTick, loopEndTick: endTick } } }));
  get().addPlaylistMarker(startTick, 'loop', '루프');
},
```

**`moveContentAroundMarker`:**
```typescript
moveContentAroundMarker: (markerId, dir) => {
  const marker = get().playlistMarkers.find(m => m.id === markerId);
  if (!marker) return;
  const snapT = get().snapTicks();
  const delta = dir === 'right' ? snapT : -snapT;
  // marker tick 이후 모든 클립 이동
  get().insertSpace(marker.tick, delta);
},
```

#### 3. `MarkerContextMenu.tsx`

```typescript
const MARKER_CONTEXT_ITEMS = [
  { label: '이름 바꾸기',                  action: () => onRename(markerId) },
  { label: '마커 타입 →', submenu: [
    { label: '기본 (None)',               action: () => changeMarkerType(markerId, 'none') },
    { label: '시작 (Start)',              action: () => changeMarkerType(markerId, 'start') },
    { label: '루프 (Loop)',               action: () => changeMarkerType(markerId, 'loop') },
    { label: '마커 루프',                 action: () => changeMarkerType(markerId, 'marker_loop') },
    { label: '마커 스킵',                 action: () => changeMarkerType(markerId, 'marker_skip') },
    { label: '마커 일시정지',             action: () => changeMarkerType(markerId, 'marker_pause') },
    { label: '박자표 변경',               action: () => changeMarkerType(markerId, 'time_signature') },
    { label: '녹음 시작',                 action: () => changeMarkerType(markerId, 'start_recording') },
    { label: '녹음 중지',                 action: () => changeMarkerType(markerId, 'stop_recording') },
  ]},
  { label: '콘텐츠 왼쪽으로 이동',        action: () => moveContentAroundMarker(markerId, 'left') },
  { label: '콘텐츠 오른쪽으로 이동',      action: () => moveContentAroundMarker(markerId, 'right') },
  { label: '루프로 변경',                 action: () => changeMarkerType(markerId, 'loop') },
  { label: '선택에서 녹음 시작',          action: () => startRecordingAtSelection() },
  { label: '선택에서 녹음 중지',          action: () => stopRecordingAtSelection() },
  { label: '삭제',                        action: () => removePlaylistMarker(markerId) },
];
```

#### 4. 단축키 (useArrangementShortcuts.ts 추가)

```typescript
if (e.altKey && e.key === 't') { addPlaylistMarker(playheadTick, 'none'); return; }         // Alt+T
if (ctrl && e.key === 't') { addPlaylistMarker(playheadTick, 'loop', 'Auto'); return; }     // Ctrl+T
if (shift && e.altKey && e.key === 'T') { /* TimeSignatureChangeDialog 열기 */ return; }    // Shift+Alt+T
if (shift && e.key === 'T') { placeLoop(loopStartTick, loopEndTick); return; }              // Shift+T
```

#### 5. MIDI/키보드로 라이브 곡 점프

`performanceMode.enabled` 가 true일 때, 트리거 노트가 설정된 마커로 점프:
```typescript
// webMidi.ts 의 noteOn 핸들러에서
const marker = playlistMarkers.find(m => m.triggerNote === midiNote);
if (marker && performanceMode.enabled) {
  jumpToMarker(marker.id);  // 기존 액션 재사용
}
```

---

### 완료 기준
- Alt+T → 재생헤드 위치에 마커 생성
- 마커 타입별 색상 구분 시각화
- loop 타입 마커 → 구간 band 표시 + loopStartTick/loopEndTick 연동
- 마커 우클릭 → 컨텍스트 메뉴로 이름 변경 / 타입 변경
- `addMarkersEvery(4)` → 4마다 마커 자동 추가

---

## Phase 7 — 줌 & 내비게이션

### 목표
FL Studio Playlist Zoom 메뉴의 모든 줌 프리셋, Quick-zoom, 미니 프리뷰 스크롤바, 중앙 맞춤 기능을 구현한다.

### 새 파일
- `src/components/playlist/ZoomMenu.tsx`
- `src/components/playlist/MiniPlaylistPreview.tsx`

### 수정 파일
- `src/store/projectStore.ts` — 줌 액션 구현
- `src/hooks/useArrangementShortcuts.ts` — 줌 단축키 추가

---

### 구체적 구현 지침

#### 1. 줌 액션 구현

```typescript
// arrangementPixelsPerTick: 스냅된 계산값 반환
arrangementPixelsPerTick: () => {
  const { project, arrangementZoomX } = get();
  const ppq = project.settings.ppq;
  // 기본: 96px per beat / ppq * zoomX
  return (96 / ppq) * arrangementZoomX;
},

zoomInPlaylist: () => {
  set(s => ({ arrangementZoomX: Math.min(32, s.arrangementZoomX * 1.25) }));
},

zoomOutPlaylist: () => {
  set(s => ({ arrangementZoomX: Math.max(0.1, s.arrangementZoomX / 1.25) }));
},

setPlaylistZoomPreset: (preset) => {
  const presetMap = {
    '1': 1.0,
    '2': 0.5,
    '3': 0.25,
    'far': 0.1,
    'selection': null,        // 아래에서 별도 처리
    'performance': null,
  };
  if (preset === 'selection') {
    // 선택된 클립의 bounding box에 맞게 줌
    const { selectedClipIds, audioRegions, midiClips } = get();
    const clips = [...audioRegions, ...midiClips].filter(c => selectedClipIds.has(c.id));
    if (!clips.length) return;
    const start = Math.min(...clips.map(c => c.startTick));
    const end   = Math.max(...clips.map(c => c.startTick + c.durationTicks));
    // viewport.width / (end - start) 로 zoomX 계산
    // arrangementScrollX = start * newPpt
    return;
  }
  if (preset === 'performance') {
    // 퍼포먼스 클립이 있는 범위에 맞게 줌
    return;
  }
  const z = presetMap[preset] as number;
  set({ arrangementZoomX: z });
},

centerPlaylistView: () => {
  // 재생헤드를 화면 중앙에 배치
  const { playheadTick, arrangementPixelsPerTick } = get();
  // scrollRef.current.scrollLeft = playheadTick * ppt - containerWidth / 2
  // 이는 컴포넌트에서 처리. 스토어에서는 scrollX 업데이트만
},
```

#### 2. 단축키 연결

```typescript
// useArrangementShortcuts.ts 추가
if (e.key === 'PageUp')          { zoomInPlaylist(); return; }
if (e.key === 'PageDown')        { zoomOutPlaylist(); return; }
if (shift && e.key === '1')      { setPlaylistZoomPreset('1'); return; }
if (shift && e.key === '2')      { setPlaylistZoomPreset('2'); return; }
if (shift && e.key === '3')      { setPlaylistZoomPreset('3'); return; }
if (shift && e.key === '4')      { setPlaylistZoomPreset('far'); return; }
if (shift && e.key === '5')      { setPlaylistZoomPreset('selection'); return; }
if (shift && e.key === '6')      { setPlaylistZoomPreset('performance'); return; }
if (shift && e.key === '0')      { centerPlaylistView(); return; }
```

#### 3. 마우스 휠 줌

`ArrangementView` 의 스크롤 영역에서:
```typescript
onWheel={(e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    if (e.deltaY < 0) zoomInPlaylist();
    else zoomOutPlaylist();
  }
}}
```

#### 4. `MiniPlaylistPreview.tsx`

```typescript
export const MiniPlaylistPreview: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniHeight = miniPreviewDoubleHeight ? 88 : 44;
  
  useEffect(() => {
    // 전체 배치를 축소 렌더링
    // 각 클립을 색상 블록으로 표현
    // miniPreviewShowTimeMarkers가 true면 마커 깃발 포함
  }, [audioRegions, midiClips, playlistMarkers]);

  // 뷰포트 박스 (현재 보이는 영역 표시)
  const viewBoxLeft  = arrangementScrollX / totalWidth * canvasWidth;
  const viewBoxWidth = (containerWidth / totalWidth) * canvasWidth;

  // 드래그 → arrangementScrollX 이동
  const handleMouseDown = (e: React.MouseEvent) => {
    const clickRatio = (e.clientX - rect.left) / canvasWidth;
    setArrangementScroll(clickRatio * totalWidth - containerWidth / 2, arrangementScrollY);
  };

  return (
    <div className="mini-playlist-preview" style={{ height: miniHeight }}>
      <canvas ref={canvasRef} />
      <div className="mini-preview-viewport-box" style={{ left: viewBoxLeft, width: viewBoxWidth }} />
    </div>
  );
};
```

#### 5. `ZoomMenu.tsx`

```typescript
const ZOOM_ITEMS = [
  { label: '줌 인 (PageUp)',                 action: zoomInPlaylist },
  { label: '줌 아웃 (PageDown)',             action: zoomOutPlaylist },
  'separator',
  { label: '퀵 줌 1 (Shift+1)',              action: () => setPlaylistZoomPreset('1') },
  { label: '퀵 줌 2 (Shift+2)',              action: () => setPlaylistZoomPreset('2') },
  { label: '퀵 줌 3 (Shift+3)',              action: () => setPlaylistZoomPreset('3') },
  { label: '멀리 줌 (Shift+4)',              action: () => setPlaylistZoomPreset('far') },
  { label: '선택 영역에 줌 (Shift+5)',       action: () => setPlaylistZoomPreset('selection') },
  { label: '퍼포먼스 클립에 줌 (Shift+6)',  action: () => setPlaylistZoomPreset('performance') },
];
```

---

### 완료 기준
- PageUp/Down → 줌 인/아웃
- Shift+1~6 → 줌 프리셋 적용
- 미니 프리뷰 클릭/드래그 → 메인 뷰 스크롤
- Ctrl+휠 → 줌 조절
- Shift+0 → 재생헤드 화면 중앙

---

## Phase 8 — 피커 패널 & 퍼포먼스 모드

### 목표
FL Studio Picker Panel 과 Performance Mode 전체 기능 구현, 오디오 드롭 동작 설정 구현.

### 새 파일
- `src/components/playlist/PickerPanel.tsx`
- `src/components/playlist/PerformanceModeOverlay.tsx`
- `src/components/playlist/DropBehaviorDialog.tsx`

### 수정 파일
- `src/store/projectStore.ts` — Phase 0 퍼포먼스 / 피커 액션 구현
- `src/components/playlist/ArrangementView.tsx` — 피커/퍼포먼스 연결
- `src/hooks/useArrangementShortcuts.ts` — Ctrl+P 단축키

---

### 구체적 구현 지침

#### 1. `PickerPanel.tsx`

```typescript
export const PickerPanel: React.FC = () => {
  const { midiClips, audioRegions, project } = useProjectStore(s => ({
    midiClips: s.midiClips,
    audioRegions: s.audioRegions,
    project: s.project,
  }));
  const pickerPanel = useProjectStore(s => s.pickerPanel);
  const setPickerPanel = useProjectStore(s => s.setPickerPanel);

  // 고유한 소스 목록 수집
  const sources = useMemo(() => {
    const names = new Set<string>();
    midiClips.forEach(c => names.add(c.name));
    audioRegions.forEach(r => names.add(r.name));
    // showEmptyPatterns가 false이면 notes 없는 패턴 제외
    return [...names].filter(n => pickerPanel.showEmptyPatterns || /* 필터 */true);
  }, [midiClips, audioRegions, pickerPanel.showEmptyPatterns]);

  // 정렬
  const sorted = useMemo(() => {
    if (pickerPanel.sortMode === 'name')  return [...sources].sort();
    if (pickerPanel.sortMode === 'color') return [...sources]; // color 기준 정렬
    return [...sources];
  }, [sources, pickerPanel.sortMode]);

  return (
    <div
      className={`picker-panel ${pickerPanel.dockRight ? 'dock-right' : 'dock-left'}`}
      style={{ width: pickerPanel.width }}
    >
      {/* 헤더 */}
      <div className="picker-panel__header">
        <span>피커 패널</span>
        <button onClick={() => setPickerPanel({ visible: false })}>×</button>
      </div>

      {/* 소스 목록 */}
      <div className="picker-panel__list">
        {sorted.map(name => (
          <div
            key={name}
            className="picker-panel__item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/rolllab-clip', name);
            }}
          >
            {name}
          </div>
        ))}
      </div>

      {/* 옵션 */}
      <div className="picker-panel__options">
        <label>
          <input type="checkbox"
            checked={pickerPanel.showEmptyPatterns}
            onChange={e => setPickerPanel({ showEmptyPatterns: e.target.checked })} />
          빈 패턴 표시
        </label>
        <label>
          <input type="checkbox"
            checked={pickerPanel.autoGroupPatterns}
            onChange={e => setPickerPanel({ autoGroupPatterns: e.target.checked })} />
          패턴 자동 그룹
        </label>
        <select
          value={pickerPanel.sortMode}
          onChange={e => setPickerPanel({ sortMode: e.target.value as PickerSortMode })}>
          <option value="name">이름순</option>
          <option value="color">색상순</option>
          <option value="mixer_track">믹서 트랙순</option>
        </select>
        <select
          value={pickerPanel.editTarget}
          onChange={e => setPickerPanel({ editTarget: e.target.value as PickerEditTarget })}>
          <option value="automatic">자동</option>
          <option value="channel_rack">채널 랙</option>
          <option value="piano_roll">피아노 롤</option>
          <option value="piano_roll_or_event">피아노 롤 또는 이벤트 에디터</option>
        </select>
        <label>
          <input type="checkbox"
            checked={pickerPanel.adjustStartTime}
            onChange={e => setPickerPanel({ adjustStartTime: e.target.checked })} />
          시작 시간 조정
        </label>
      </div>

      {/* 너비 조절 핸들 */}
      <div
        className="picker-panel__resize-handle"
        onMouseDown={(e) => {
          const startX = e.clientX;
          const startW = pickerPanel.width;
          const onMove = (ev: MouseEvent) => {
            const delta = pickerPanel.dockRight ? startX - ev.clientX : ev.clientX - startX;
            setPickerPanel({ width: Math.max(120, Math.min(400, startW + delta)) });
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', () => window.removeEventListener('mousemove', onMove), { once: true });
        }}
      />
    </div>
  );
};
```

피커 패널에서 레인으로 드래그 드롭:
```typescript
// ArrangementView 의 레인 onDrop 핸들러에서
const clipName = e.dataTransfer.getData('application/rolllab-clip');
if (clipName) {
  // pickerPanel.adjustStartTime이 true이면 드롭 위치를 snap으로 조정
  const dropTick = snap(xToTick(dropX));
  // clipName 과 일치하는 기존 MidiClip 을 복제하여 새 위치에 추가
}
```

#### 2. `PerformanceModeOverlay.tsx`

```typescript
export const PerformanceModeOverlay: React.FC = () => {
  const performanceMode = useProjectStore(s => s.performanceMode);
  const audioRegions    = useProjectStore(s => s.audioRegions);
  const midiClips       = useProjectStore(s => s.midiClips);
  const triggerClip     = useProjectStore(s => s.triggerPerformanceClip);
  const stopClip        = useProjectStore(s => s.stopPerformanceClip);

  if (!performanceMode.enabled) return null;

  return (
    <div className="performance-overlay">
      {/* 각 클립 위에 퍼포먼스 트리거 버튼 오버레이 */}
      {[...audioRegions, ...midiClips].map(clip => (
        <button
          key={clip.id}
          className={`perf-trigger ${performanceMode.activeClips[clip.id] ? 'active' : ''}`}
          style={{
            left: clip.startTick * ppt,
            // top: trackIndex * laneHeight
          }}
          onMouseDown={() => triggerClip(clip.id)}
          onMouseUp={() => {
            if (performanceMode.quantize === 'off') stopClip(clip.id);
          }}
        >
          ▶
        </button>
      ))}
    </div>
  );
};
```

#### 3. 퍼포먼스 모드 스토어 구현

```typescript
setPerformanceModeEnabled: (v) => {
  set(s => ({ performanceMode: { ...s.performanceMode, enabled: v } }));
},

setPerformanceQuantize: (q) => {
  set(s => ({ performanceMode: { ...s.performanceMode, quantize: q } }));
},

triggerPerformanceClip: (clipId) => {
  const { performanceMode, project } = get();
  // quantize에 따라 다음 경계에서 트리거 예약
  const quantizeTicks: Record<PerformanceQuantize, number> = {
    off:   0,
    beat:  get().snapTicks(),
    '1bar': ticksPerBar(project.settings.ppq, project.settings.timeSignature),
    '2bar': ticksPerBar(project.settings.ppq, project.settings.timeSignature) * 2,
    '4bar': ticksPerBar(project.settings.ppq, project.settings.timeSignature) * 4,
    '8bar': ticksPerBar(project.settings.ppq, project.settings.timeSignature) * 8,
  };
  const qt = quantizeTicks[performanceMode.quantize];
  if (qt === 0) {
    // 즉시 트리거
    set(s => ({ performanceMode: { ...s.performanceMode, activeClips: { ...s.performanceMode.activeClips, [clipId]: true } } }));
  } else {
    // qt 틱 정렬 후 트리거 (Tone.js Transport.schedule 사용)
    // import { toneEngine } from '../../audio/toneEngine'
  }
},

stopPerformanceClip: (clipId) => {
  set(s => ({
    performanceMode: {
      ...s.performanceMode,
      activeClips: { ...s.performanceMode.activeClips, [clipId]: false },
    },
  }));
},
```

#### 4. 오디오 드롭 동작

`AudioClipEditor` / `ArrangementView` 의 드롭 핸들러 수정:

```typescript
const handleDrop = useCallback(async (trackId: string, e: React.DragEvent) => {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
  if (!files.length) return;

  let behavior = audioDropBehavior;
  if (behavior === 'always_ask') {
    // DropBehaviorDialog 열기
    const choice = await showDropBehaviorDialog();
    if (!choice) return;
    behavior = choice;
  }

  if (behavior === 'audio_clips') {
    await processAudioFiles(files, trackId, dropTick);
  } else if (behavior === 'audio_tracks') {
    // 새 트랙 추가 후 오디오 클립 배치
    addTrack();
    const newTrackId = get().project.tracks.at(-1)!.id;
    await processAudioFiles(files, newTrackId, dropTick);
  } else if (behavior === 'instrument_tracks') {
    // 샘플러 인스트루먼트 트랙으로 추가
    addTrack();
    const newTrackId = get().project.tracks.at(-1)!.id;
    updateTrack(newTrackId, { instrument: { type: 'sampler', preset: URL.createObjectURL(files[0]) } });
  }
}, [audioDropBehavior, ...]);
```

`DropBehaviorDialog.tsx`:
```typescript
// 모달 다이얼로그
// "오디오 클립으로", "오디오 트랙으로", "인스트루먼트 트랙으로", "취소"
// Promise 기반: showDropBehaviorDialog() → Promise<AudioDropBehavior | null>
```

#### 5. 단축키 완성

```typescript
// useArrangementShortcuts.ts 최종 추가
if (ctrl && e.key === 'p') {
  e.preventDefault();
  setPerformanceModeEnabled(!performanceMode.enabled);
  return;
}
// 피커 패널 토글 (FL Studio: PP 없음, 메뉴로만)
// 퍼포먼스 퀀타이즈 선택은 UI 메뉴로
```

---

### 완료 기준
- Ctrl+P → 퍼포먼스 모드 진입/해제
- 퍼포먼스 모드에서 클립 클릭 → 해당 클립 재생 트리거
- 퀀타이즈 설정에 따라 트리거가 다음 bar/beat 경계에서 실행
- 피커 패널 열기/닫기, 항목 드래그 → 레인으로 드롭 가능
- 오디오 드롭 시 `always_ask` 설정이면 선택 다이얼로그 표시
- 피커 패널 너비 드래그 조절, 좌/우 도킹 전환

---

## 전체 구현 체크리스트

| Phase | 핵심 파일 | 완료 기준 |
|-------|-----------|----------|
| 0 | `playlist.ts`, `projectStore.ts` | `tsc --noEmit` 통과 |
| 1 | `ArrangementRuler`, `ArrangementCanvas`, `PlayheadLine` | 눈금자 + 그리드 + 재생헤드 렌더링 |
| 2 | `ArrangementClipBlock`, `useArrangementDrag` | 이동/크기조절/슬라이스/rubber-band |
| 3 | `ArrangementContextMenu`, `useArrangementShortcuts` | 모든 Edit 메뉴 단축키 동작 |
| 4 | `ViewOptionsMenu`, `TrackLabelColumn` | 뷰 옵션 실시간 반영 |
| 5 | `SnapMenu`, `SelectMenu`, `GroupMenu` | 스냅 모드 전환, 선택 모드 전체 동작 |
| 6 | `PlaylistMarkerLane`, `MarkerContextMenu` | 마커 9종 생성/편집/삭제 |
| 7 | `ZoomMenu`, `MiniPlaylistPreview` | 줌 프리셋 + 미니맵 스크롤 |
| 8 | `PickerPanel`, `PerformanceModeOverlay` | 퍼포먼스 트리거 + 피커 드래그 |

---

## 부록 — CSS 클래스명 규약

```
.arrangement-view                    // 최상위 래퍼
.arrangement-view__toolbar           // 툴바 행
.arrangement-view__body              // 트랙 레이블 + 스크롤 영역 수평 flex
.arrangement-view__track-labels      // 고정 왼쪽 열
.arrangement-view__scroll-area       // overflow-x: auto
.arrangement-view__timeline          // 가상 넓이를 가진 타임라인 컨테이너

.arrangement-ruler                   // 눈금자 canvas
.arrangement-ruler--precise          // preciseTimeIndicator 활성 시

.playlist-marker-lane                // 마커 레인 canvas
.playlist-marker--loop               // 루프 마커 band
.playlist-marker--recording          // 녹음 마커

.arrangement-track-lane              // 단일 트랙 레인
.arrangement-track-lane--even        // 짝수 트랙 배경
.arrangement-track-lane--collapsed   // 그룹 접힘

.clip-block                          // 공통 클립 블록
.clip-block--selected                // 선택됨
.clip-block--muted                   // 음소거
.clip-block--audio                   // 오디오 리전
.clip-block--midi                    // MIDI 클립
.clip-block__resize-left             // 왼쪽 크기조절 핸들
.clip-block__resize-right            // 오른쪽 크기조절 핸들
.clip-block__crossfade-handle        // 크로스페이드 삼각형
.clip-block__label                   // 클립 이름

.playhead-line                       // 재생헤드 세로선
.playhead-line__time-display         // 정밀 시간 표시

.picker-panel                        // 피커 패널
.picker-panel--dock-right            // 우측 도킹
.picker-panel__resize-handle         // 너비 조절 핸들
.picker-panel__item                  // 소스 항목
.picker-panel__item--dragging        // 드래그 중

.performance-overlay                 // 퍼포먼스 모드 오버레이
.perf-trigger                        // 클립 트리거 버튼
.perf-trigger--active                // 재생 중

.mini-playlist-preview               // 미니 프리뷰 바
.mini-preview-viewport-box           // 현재 뷰포트 표시 박스

.rubber-band-select                  // 러버밴드 선택 박스
```

---

## 부록 — 파일 구조 최종

```
src/
  types/
    music.ts          (수정)
    playlist.ts       (신규)
  store/
    projectStore.ts   (수정)
  utils/
    playlistSnap.ts   (신규)
    time.ts           (기존 유지)
    geometry.ts       (기존 유지)
  hooks/
    useArrangementDrag.ts       (신규)
    useArrangementShortcuts.ts  (신규)
  components/
    playlist/
      ArrangementView.tsx       (신규 — AudioClipEditor 대체)
      ArrangementView.css       (신규)
      ArrangementToolbar.tsx    (신규)
      ArrangementRuler.tsx      (신규)
      ArrangementCanvas.tsx     (신규)
      PlayheadLine.tsx          (신규)
      ClipLayer.tsx             (신규)
      ArrangementClipBlock.tsx  (신규)
      RubberBandSelect.tsx      (신규)
      TrackLabelColumn.tsx      (신규)
      TrackResizeHandle.tsx     (신규)
      ArrangementContextMenu.tsx (신규)
      ArrangementEditMenu.tsx   (신규)
      SnapMenu.tsx              (신규)
      SelectMenu.tsx            (신규)
      GroupMenu.tsx             (신규)
      ViewOptionsMenu.tsx       (신규)
      ZoomMenu.tsx              (신규)
      PlaylistMarkerLane.tsx    (신규)
      MarkerContextMenu.tsx     (신규)
      TimeSignatureChangeDialog.tsx (신규)
      MiniPlaylistPreview.tsx   (신규)
      PickerPanel.tsx           (신규)
      PerformanceModeOverlay.tsx (신규)
      DropBehaviorDialog.tsx    (신규)
    audioEdit/
      AudioClipEditor.tsx       (기존 유지 또는 ArrangementView 로 교체)
      AudioRegionBlock.tsx      (기존 유지)
      MidiClipBlock.tsx         (기존 유지)
      ...
```
