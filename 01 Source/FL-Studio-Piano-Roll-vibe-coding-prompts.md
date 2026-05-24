# FL Studio Piano Roll Manual 기반 미구현 기능 추가용 바이브코딩 프롬프트

작성일: 2026-05-19

## 분석 메모

사용자가 지정한 로컬 파일 `C:\Users\kimyo\Downloads\FL-Studio PIANO ROLL Manual.pdf`는 현재 파일 시스템에서 찾을 수 없었다. 대신 Image-Line 공식 FL Studio Piano roll 온라인 매뉴얼의 동일 항목을 기준으로 분석했다.

참고한 공식 문서:

- Piano roll 개요: https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/pianoroll.htm
- Piano roll menu: https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/pianoroll_menu.htm
- Strum tool: https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/pianoroll_strum.htm
- Arpeggiator tool: https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/pianoroll_arpeggiate.htm
- Articulate tool: https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/pianoroll_articulate.htm
- Chord Progression tool: https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/pianoroll_chordprogression.htm
- Chopper tool: https://www.image-line.com/fl-studio-learning-content/fl-studio-online-manual/html/pianoroll_chp.htm
- Randomizer tool: https://www.image-line.com/fl-studio-learning-content/fl-studio-online-manual/html/pianoroll_random.htm
- Flam tool: https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/pianoroll_flam.htm
- Limit tool: https://www.image-line.com/support/flstudio_online_manual/html/pianoroll_limit.htm
- Claw Machine tool: https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/pianoroll_claw.htm

## 현재 웹앱에 이미 있는 주요 기능

코드 기준으로 확인한 구현 상태:

- 기본 피아노롤: 그리기, 페인트, 선택, 지우기, 자르기, 스탬프 일부
- 노트 이동, 우측/좌측 리사이즈, 선택 박스, 중복, 삭제
- 스냅 단위, 숫자 단축키 1-0 스냅 변경
- 스케일 선택, 스케일 보정, 스케일 하이라이트
- 고스트 노트 표시/일부 편집, 활성 트랙 전환
- 벨로시티 레인, Alt+휠 벨로시티 조절
- 퀀타이즈, 휴머니즈, 스트럼 기본, 아르페지오 기본
- 랜덤/스케일 벨로시티, 노트 음소거, 색상 그룹
- 슬라이드/포르타멘토 노트 시각화와 일부 재생 처리
- 마커 레인, 타임 시그니처 변경 데이터, 패턴 관리
- 드럼 시퀀서, 배경 오디오 웨이브폼, MIDI import/export, Web MIDI recording
- store에는 `glueSelectedNotes`, `legatoSelectedNotes`, `flipSelectedNotes`, `limitSelectedNotes`, `randomizeSelectedNotes`, `applyLfoToSelectedNotes`, `articulateSelectedNotes`, `generateChordProgression`, `generateRiff` 등이 있으나 UI 노출과 세부 옵션이 부족하다.

## 가장 큰 미구현/부족 영역

우선순위 높은 차이:

1. FL식 Tools 메뉴가 없다. 현재 기능이 흩어져 있고, store에 있어도 UI에서 못 쓰는 도구가 많다.
2. Event Editor가 velocity 중심이다. FL처럼 target을 Velocity, Pan, Fine pitch, Release, Mod X/Y, automation lane으로 바꾸는 구조가 없다.
3. Strum/Arpeggiator/Articulate가 간단 버전이다. FL의 tension, gate, range, sync, preserve end, chop chords 같은 옵션이 빠져 있다.
4. Chop/Chopper, Flam, Claw Machine, Scale Levels, LFO, advanced Randomizer가 UI 또는 알고리즘 수준에서 부족하다.
5. Chord Progression은 store 유틸이 있으나 FL식 카드형 진행 편집기, lock, alternatives, typed progression, bass/main toggles, analyze가 없다.
6. Selection Stretch Handle, play/scrub tool, middle-drag pan, magic lasso, ruler range selection, keyboard pitch range selection 등 조작감 기능이 없다.
7. View 메뉴의 grid contrast/color, invert grid, note shadow/rounded, keep labels on screen, custom note palette가 없다.
8. Stamp tool이 chord 몇 가지 중심이다. 자동 코드, scale/pattern/percussion stamp, Only one, stamp to scale 옵션이 부족하다.
9. Mute tool은 타입/캔버스 로직이 있지만 현재 `ToolBar.tsx`의 `TOOLS` 배열에는 빠져 있다.

---

# 프롬프트 0. 전체 작업 지시문

아래 프롬프트를 새 Codex 세션의 첫 메시지로 사용한다.

```text
너는 이 repo의 피아노롤 웹앱을 FL Studio Piano Roll에 가깝게 확장하는 senior frontend/audio engineer다.

작업 전 반드시 다음 파일을 읽어라.
- src/types/music.ts
- src/store/projectStore.ts
- src/components/pianoRoll/PianoRollCanvas.tsx
- src/components/pianoRoll/ToolBar.tsx
- src/components/pianoRoll/VelocityLane.tsx
- src/components/panels/InspectorPanel.tsx
- src/hooks/usePianoRollShortcuts.ts
- src/utils/noteTransforms.ts
- src/utils/musicTheory.ts

원칙:
1. 기존 Zustand store 패턴과 undo/redo 트랜잭션을 유지한다.
2. 선택 노트가 있으면 선택 노트만 처리하고, 선택이 없으면 활성 트랙 전체를 처리하는 FL식 동작은 도구별로 명시적으로 구현한다.
3. 모든 파괴적 변환은 `pushHistory` 또는 `beginTransaction/commitTransaction`을 통해 undo 가능해야 한다.
4. UI는 기존 Wise/near-black 스타일을 따르고, 카드 중첩을 피하며, 작은 작업 패널과 모달 중심으로 만든다.
5. 기능마다 `npm test`, `npm run build`를 통과시킨다.
6. 가능하면 핵심 변환 로직은 `src/utils/*`에 순수 함수로 만들고 Vitest를 추가한다.
7. GitHub Pages 배포 경로 `/Piano_Roll-FL_Studio-/`를 깨지 말라.
8. 기존 untracked `.claude/`와 `.docx` 파일은 건드리지 말라.

목표:
FL Studio Piano Roll Manual의 Tools, View, Event Editor, Selection/Edit 기능 중 이 앱에 없는 기능을 단계적으로 추가하라. 한 번에 전부 하지 말고 아래 단계별 프롬프트 순서대로 작게 커밋 가능한 단위로 구현한다.
```

---

# 프롬프트 1. FL식 Tools 메뉴와 도구 모달 프레임 만들기

```text
현재 앱에 흩어진 피아노롤 도구를 FL Studio의 Tools 메뉴처럼 한 곳에 모으는 UI 프레임을 구현해줘.

목표:
- `ToolBar.tsx` 또는 별도 `PianoRollToolsMenu.tsx`에 "Tools" 버튼을 추가한다.
- 클릭하면 compact menu/popover가 열리고 다음 항목을 보여준다.
  - Quick legato
  - Articulate...
  - Quick quantize
  - Quantize...
  - Quick chop
  - Chopper...
  - Glue
  - Arpeggiate...
  - Strum...
  - Flam...
  - Claw machine...
  - Limit...
  - Flip...
  - Randomize...
  - Scale levels...
  - LFO...
  - Riff machine...
  - Chord progression...
- store에 이미 있는 액션은 즉시 연결한다.
  - `legatoSelectedNotes`
  - `glueSelectedNotes`
  - `quantizeSelectedNotes`
  - `flipSelectedNotes`
  - `limitSelectedNotes`
  - `randomizeSelectedNotes`
  - `applyLfoToSelectedNotes`
  - `articulateSelectedNotes`
  - `generateChordProgression`
  - `generateRiff`
- 아직 옵션 UI가 필요한 도구는 공통 `ToolDialog` 컴포넌트로 연다.

구현 파일:
- 새 파일: `src/components/pianoRoll/PianoRollToolsMenu.tsx`
- 새 파일: `src/components/pianoRoll/ToolDialog.tsx`
- 수정: `src/components/pianoRoll/ToolBar.tsx`
- 수정: `src/hooks/usePianoRollShortcuts.ts`

세부 요구:
1. 메뉴는 버튼 아래에 absolute popover로 뜨고, Escape/outside click으로 닫힌다.
2. 각 메뉴 항목에는 단축키 힌트를 표시한다.
3. disabled 조건:
   - 선택 노트가 필요한 도구는 선택이 없으면 disabled.
   - generate류는 활성 트랙이 없으면 disabled.
4. 단축키 추가:
   - Ctrl+L: quick legato
   - Ctrl+G: glue
   - Ctrl+U: quick chop
   - Alt+Q: Quantize dialog
   - Alt+S: Strum dialog
   - Alt+A: Arpeggiate dialog
   - Alt+R: Randomize dialog
   - Alt+O: LFO dialog
5. 기존 `SHORTCUT_CATALOG`에도 반영한다.

수용 기준:
- 메뉴에서 Quick legato, Glue, Flip pitch/time, Limit 기본값 실행이 동작한다.
- 아직 미구현 옵션 도구는 빈 모달이 아니라 최소 옵션과 적용 버튼을 가진다.
- `npm test`, `npm run build` 통과.
```

---

# 프롬프트 2. Mute 도구 툴바 노출과 FL식 mouse behavior 정리

```text
현재 `PianoRollTool`과 `PianoRollCanvas`에는 `mute` 도구 로직이 있으나 `ToolBar.tsx`의 `TOOLS` 배열에는 빠져 있다. FL Studio Manual의 Mute Tool처럼 툴바에 노출하고 동작을 정리해줘.

구현 요구:
1. `ToolBar.tsx`의 `TOOLS`에 `{ id: 'mute', label: '음소거', icon: '⨯', title: '노트 음소거 (T)' }`를 추가한다.
2. `usePianoRollShortcuts.ts`에서 T 단축키가 activeTool `mute`로 정확히 전환되는지 확인한다.
3. `PianoRollCanvas.tsx`에서 mute tool:
   - left click on note: muted toggle
   - left drag over notes: 첫 노트의 target muted value를 나머지에도 적용
   - right click on note: 삭제
   - Ctrl drag: selection box로 동작
4. muted note는 현재보다 더 명확히 보이도록 opacity만 낮추지 말고 diagonal hatch 또는 작은 mute icon 표시를 추가한다.
5. ShortcutsHelp에 "T: 음소거"가 보이게 한다.

수용 기준:
- 툴바에서 음소거 버튼이 보인다.
- T를 누르면 버튼 active 상태와 커서가 바뀐다.
- 드래그로 여러 노트 mute/unmute가 된다.
- `npm test`, `npm run build` 통과.
```

---

# 프롬프트 3. Event Editor target lane 확장

```text
FL Studio Piano Roll은 하단 Event Editor target을 바꿔 Velocity, Pan, Pitch/Fine pitch, Release, Mod X/Y 같은 note property를 편집한다. 현재 앱은 VelocityLane 중심이다. 이를 target 기반 Event Editor로 확장해줘.

데이터 모델:
- `Note`에 이미 있는 필드 활용:
  - `velocity`
  - `pan`
  - `finePitch`
  - `releaseVelocity`
- 새 optional 필드 추가:
  - `modX?: number` 0..127
  - `modY?: number` 0..127
  - `cutoff?: number` 0..127
  - `resonance?: number` 0..127

구현 파일:
- `src/types/music.ts`
- `src/components/pianoRoll/EventEditorLane.tsx` 새로 만들기
- 기존 `VelocityLane.tsx`는 EventEditorLane 내부 target `velocity` 구현으로 흡수하거나 wrapper로 유지
- `src/components/pianoRoll/PianoRoll.tsx`
- `src/store/projectStore.ts`
- `src/audio/toneEngine.ts`

UI 요구:
1. 하단 lane 왼쪽에 target selector를 둔다.
   - Velocity
   - Pan
   - Fine pitch
   - Release
   - Mod X
   - Mod Y
   - Cutoff
   - Resonance
2. target마다 range와 default:
   - velocity: 1..127 default 100
   - pan: -1..1 default 0
   - finePitch: -100..100 cents default 0
   - releaseVelocity: 1..127 default 64
   - modX/modY/cutoff/resonance: 0..127 default 64
3. note property 막대는 노트 startTick에 붙어 움직인다.
4. 같은 startTick에 여러 노트가 있으면 작은 horizontal offset/tail을 줘서 겹쳐 보이지 않게 한다.
5. Shift+drag는 지나가는 노트 값을 동일하게 설정한다.
6. Alt+click은 해당 target 값을 default로 reset한다.
7. Ctrl+Alt+mouse wheel은 더 작은 step으로 fine adjust한다.

오디오 요구:
1. `pan`은 Tone Panner나 현재 synth routing에 실제 반영한다.
2. `finePitch`는 재생 pitch에 cents 보정으로 반영한다.
3. releaseVelocity/mod/cutoff/resonance는 synth가 직접 지원하지 않더라도 export JSON과 UI 편집은 보존한다.

테스트:
- `src/utils/noteProperties.test.ts`를 추가해 target별 clamp/default를 검증한다.
- `npm test`, `npm run build` 통과.
```

---

# 프롬프트 4. Advanced Strum Tool 구현

```text
현재 앱의 스트럼은 amount와 direction 정도만 있다. FL Studio Strum Tool처럼 start time, velocity, end time, tension, preserve end, trigger ahead, chop chords, alternate direction을 가진 고급 스트럼 도구를 구현해줘.

새 타입:
```ts
export interface StrumOptions {
  startEnabled: boolean;
  startTimeTicks: number;
  startTension: number; // -1..1
  velocityEnabled: boolean;
  velocityDelta: number; // -127..127 across chord
  velocityTension: number; // -1..1
  endEnabled: boolean;
  endTimeTicks: number;
  endTension: number; // -1..1
  preserveEnd: boolean;
  triggerAhead: boolean;
  chopChords: boolean;
  alternateDirection: boolean;
  direction: 'lowToHigh' | 'highToLow';
}
```

구현:
- `src/utils/strumTool.ts`에 순수 함수 `applyStrum(notes, opts, ppq): Note[]` 작성.
- 같은 startTick 또는 겹치는 notes를 chord group으로 묶는다.
- direction은 pitch 순서 기준.
- tension은 0이면 linear, 양수면 뒤로 갈수록 빨라짐/강해짐, 음수면 앞쪽 변화가 큼.
- triggerAhead가 true면 chord group 중심을 유지하도록 일부 노트를 원래 start보다 앞에 둔다. 단 startTick < 0 금지.
- preserveEnd가 true면 start를 밀 때 duration을 줄여 endTick을 유지한다.
- endEnabled면 endTime도 pitch 순서대로 이동한다.
- chopChords가 true면 다음 chord와 겹치는 이전 chord를 자동 분할/trim한다.
- alternateDirection은 chord group마다 방향을 번갈아 적용한다.

UI:
- Tools > Strum... 모달에 토글/슬라이더/숫자 입력을 배치한다.
- Apply는 선택 노트가 있으면 선택 노트만, 없으면 active track 전체에 적용한다.
- Preview checkbox를 두고, 켜면 캔버스에서 임시 preview를 보여준다. 어렵다면 1차에서는 Apply만 구현.

테스트:
- 같은 startTick 4음 chord에 lowToHigh strum이 pitch 오름차순으로 startTick을 증가시키는지.
- preserveEnd true일 때 endTick이 유지되는지.
- triggerAhead true일 때 group center가 유지되는지.
- alternateDirection이 chord group마다 반전되는지.
```

---

# 프롬프트 5. Chopper와 Quick Chop 구현

```text
FL Studio의 Quick chop과 Chopper Tool을 구현해줘. 현재 slice tool은 마우스 cut 중심이고, 선택 노트를 grid/pattern으로 자동 chopping하는 도구가 부족하다.

목표:
- Quick chop: 선택 노트를 현재 snap 단위로 잘라 같은 pitch의 여러 note로 분할.
- Chopper dialog: grid/pattern 기반으로 note를 분할하고 velocity/pan 등 level을 섞는 도구.

새 타입:
```ts
export interface ChopOptions {
  mode: 'quick' | 'grid' | 'pattern';
  stepTicks: number;
  gate: number; // 0.05..1
  absolutePattern: boolean;
  groupNotes: boolean;
  preserveVelocity: boolean;
  velocityPattern?: number[]; // 1..127 multipliers or absolute values
  pattern?: Array<{ offsetTicks: number; durationTicks: number; velocityScale?: number }>;
}
```

구현:
- `src/utils/chopper.ts`
- `chopNotes(notes, options): Note[]`
- source note 범위 안에서만 조각 생성.
- gate가 1보다 작으면 각 조각 duration을 줄인다.
- absolutePattern true면 project grid 기준 offset을 맞추고, false면 각 note start 기준으로 패턴 반복.
- groupNotes true면 같은 원본에서 나온 조각에 groupId를 부여.

UI:
- Tools > Quick chop: 즉시 현재 snap으로 적용.
- Tools > Chopper...:
  - step: snap selector
  - gate slider
  - absolute pattern toggle
  - group notes toggle
  - preset buttons: 1/8, 1/16, 1/32, stutter, dotted, offbeat

수용 기준:
- 긴 1마디 노트를 1/16 chop하면 16개 조각으로 나뉜다.
- undo 한번으로 원래 상태로 돌아간다.
- `npm test`, `npm run build` 통과.
```

---

# 프롬프트 6. Flam Tool 구현

```text
FL Studio Flam Tool처럼 선택 노트 앞/뒤에 짧은 grace hit를 추가하는 기능을 구현해줘.

새 타입:
```ts
export interface FlamOptions {
  strokes: number; // 1..4
  timeTicks: number;
  before: boolean;
  velocity: number; // 1..127
  velocityMode: 'fixed' | 'relative';
  groupNotes: boolean;
}
```

구현:
- `src/utils/flam.ts`에 `applyFlam(notes, opts): Note[]`.
- 각 source note에 대해 stroke 수만큼 짧은 note를 추가한다.
- before true면 source startTick 이전에 배치하되 0 미만 금지.
- before false면 source startTick 이후, 원본보다 앞에 들리는 짧은 note로 배치.
- grace note duration은 `Math.max(1, Math.min(timeTicks / strokes, source.durationTicks / 4))`.
- groupNotes true면 원본과 flam notes에 같은 groupId를 부여.

UI:
- Tools > Flam...
- strokes stepper, time input, before toggle, velocity input, relative/fixed segmented control.

테스트:
- stroke 2, before true면 원본 앞에 2개 노트 생성.
- velocity fixed/relative clamp 검증.
```

---

# 프롬프트 7. Claw Machine 구현

```text
FL Studio Claw Machine처럼 주기 안의 특정 slice를 제거하거나 note boundary를 재정의해 리듬 변형을 만드는 도구를 구현해줘.

새 타입:
```ts
export interface ClawOptions {
  periodTicks: number;
  slices: number;
  trashEvery: number;
  timeDistortion: number; // -1..1
  removeShortNotes: boolean;
  minDurationTicks: number;
  stretchToCompensate: boolean;
}
```

구현:
- `src/utils/clawMachine.ts`에 `applyClaw(notes, opts): Note[]`.
- 선택 범위 또는 선택 notes bounding range를 periodTicks 단위로 나눈다.
- period를 slices로 나누고 trashEvery번째 slice에 해당하는 note/chop segment를 제거한다.
- timeDistortion은 slice boundary를 period 앞/뒤로 곡선 왜곡한다.
- stretchToCompensate true면 남은 조각들이 원래 period 길이를 채우도록 duration을 늘린다.
- removeShortNotes true면 minDurationTicks 미만 note 제거.

UI:
- Tools > Claw machine...
- period selector: 1/4, 1/2, 1 bar, 2 bars
- slices, trashEvery, distortion slider, remove short, stretch toggle.

수용 기준:
- 16분음표 16개 패턴에서 trashEvery 2는 절반을 제거한다.
- stretchToCompensate가 켜지면 남은 notes가 빈 공간 일부를 메운다.
```

---

# 프롬프트 8. Advanced Arpeggiator 구현

```text
현재 arpeggiateSelectedNotes는 up/down/upDown/random과 간격/반복 정도만 지원한다. FL Studio Arpeggiator처럼 range, range pattern, gate, sync, pattern transpose, group notes를 지원하게 확장해줘.

새 타입:
```ts
export interface ArpToolOptions {
  pattern: 'up' | 'down' | 'upDown' | 'random' | 'asPlayed' | 'custom';
  customSteps?: Array<{ degree: number; octave: number; velocityScale?: number; gate?: number }>;
  stepTicks: number;
  rangeOctaves: number;
  rangePattern: 'normal' | 'flip' | 'alternate';
  repetitions: number;
  sync: 'time' | 'block' | 'chord';
  gate: number; // 0.05..1
  levelsMix: number; // 0..1
  groupNotes: boolean;
  replaceOriginals: boolean;
}
```

구현:
- `src/utils/arpeggiator.ts`.
- chord group은 같은 startTick 또는 overlapping notes 기준.
- rangeOctaves만큼 pitch 후보를 확장한다.
- gate는 generated note duration에 적용한다.
- sync:
  - time: repetitions/step 기준으로만 종료
  - block: 모든 source note end 중 최대까지 반복
  - chord: chord group 내 가장 짧은 note end까지 반복
- groupNotes true면 생성된 note에 groupId를 부여.

UI:
- Tools > Arpeggiate...
- 기존 InspectorPanel의 간단 arp는 유지하되, 고급 설정은 모달로 이동/연동.

테스트:
- C-E-G chord + rangeOctaves 2 + up 패턴이 C,E,G,C+12,E+12,G+12 순서를 만든다.
- gate 0.5가 duration을 절반으로 줄인다.
```

---

# 프롬프트 9. Articulate Tool 완성

```text
FL Studio Articulate Tool의 Legato, Portato, Staccato, small gap, chop chords, multiply, variation, seed, use lengths, only with selection을 구현해줘.

새 타입:
```ts
export type ArticulatePreset = 'legato' | 'portato' | 'staccato' | 'smallGap' | 'justChopChords';
export interface ArticulateOptions {
  preset: ArticulatePreset;
  multiply: number; // 0.1..1
  variation: number; // 0..1
  seed?: number;
  chopChords: boolean;
  useLengths: boolean;
  onlyWithSelection: boolean;
  gapTicks: number;
}
```

구현:
- 기존 `articulateSelectedNotes(pattern, intensity)`를 유지하되, 새 `articulateNotesAdvanced(opts)`를 추가하거나 시그니처 확장.
- `src/utils/articulate.ts`에 순수 함수 작성.
- legato: 같은 pitch 또는 같은 voice의 다음 note start까지 duration 확장.
- portato: legato 길이의 80-90%.
- staccato: 원래 길이의 multiply 적용.
- smallGap: 인접 note 사이 gapTicks 보장.
- variation/seed: deterministic random으로 duration에 변동.
- chopChords: chord overlap이 있으면 이전 chord를 다음 chord start에 맞춰 trim.

UI:
- Tools > Articulate...
- preset dropdown, multiply slider, variation slider, seed reroll button, toggles.

테스트:
- legato가 다음 note 시작 전까지 길이를 늘리는지.
- staccato가 길이를 줄이는지.
- seed가 같은 결과를 재현하는지.
```

---

# 프롬프트 10. Advanced Randomizer와 Riff Machine UI

```text
FL Studio Randomizer는 notes 생성과 note property randomization을 함께 제공한다. 현재 앱은 velocity randomize와 `generateRiff` 유틸이 있으나 FL식 Randomizer/Riff Machine UI가 부족하다. 이를 구현해줘.

Randomizer 요구:
- Pattern section:
  - octave
  - octave range
  - key/root
  - scale
  - density
  - length
  - length variation
  - stack/chord chance
- Levels section:
  - velocity min/max
  - pan min/max
  - pitch/finePitch min/max
  - release min/max
- Target:
  - 선택 notes 변형
  - 빈 선택이면 time selection 또는 현재 1-4 bars에 새 notes 생성

Riff Machine 요구:
- 단계별 탭:
  1. Generate: scale/root, bars, density, seed
  2. Shape: contour up/down/wave/random
  3. Rhythm: straight/syncopated/dotted/rest chance
  4. Levels: velocity curve, humanize
  5. Fit: key/scale snap, min/max pitch
- `src/utils/riffMachine.ts`가 이미 있으므로 UI와 옵션 확장 중심으로 구현.

파일:
- `src/components/pianoRoll/tools/RandomizerDialog.tsx`
- `src/components/pianoRoll/tools/RiffMachineDialog.tsx`
- `src/utils/randomizer.ts`

수용 기준:
- 같은 seed는 같은 riff/random 결과를 만든다.
- 선택 notes가 있으면 생성 대신 변형 모드가 동작한다.
- undo 한 번에 적용 전으로 돌아간다.
```

---

# 프롬프트 11. Chord Progression Tool 고도화

```text
현재 `generateChordProgression` 유틸은 있지만 FL Studio Chord Progression Tool의 카드형 진행 편집, lock, alternatives, typed progression, bass/main toggle, analyze 기능이 부족하다. 우선 1차 버전으로 카드형 진행 편집기를 구현해줘.

UI:
- Tools > Chord progression...
- 모달 안에 chord cards를 가로로 표시.
- 상단 옵션:
  - root
  - scale
  - count
  - octave
  - lengthBars
  - conventional/adventurous slider
  - generate / analyze / accept / reset
- 각 chord card:
  - chord name
  - roman numeral toggle
  - lock button
  - inversion up/down
  - bass on/off
  - main notes on/off
  - alternatives dropdown
  - delete
  - drag reorder 또는 left/right swap buttons
- typed progression input:
  - 예: `I V vi IV`, `C G Am F`, `I-V-vi-IV`
  - separators: comma, space, dash, pipe
  - `.` repeats previous, `?` regenerate, `=` keep current

데이터:
```ts
interface ChordProgressionDraft {
  id: string;
  root: number;
  scale: ScaleType;
  chords: ChordDraft[];
}
interface ChordDraft {
  id: string;
  symbol: string;
  roman: string;
  startTick: number;
  durationTicks: number;
  octave: number;
  inversion: number;
  locked: boolean;
  includeMain: boolean;
  includeBass: boolean;
  voicing: 'block' | 'open' | 'octave' | 'stacked';
}
```

구현:
- 새 util `src/utils/chordProgressionAdvanced.ts`.
- 기존 `generateProgression`과 호환하되 draft 편집 가능하게 분리.
- Accept 시 selected track에 notes를 렌더링하고, generated notes는 groupId와 colorGroup을 부여.
- Analyze는 기존 notes의 pitch classes를 보고 가장 가까운 scale/root와 roman 후보를 추정하는 간단 버전부터 구현.

수용 기준:
- `I V vi IV` 입력 후 Accept하면 4개 코드가 생성된다.
- lock된 chord는 Generate에서 바뀌지 않는다.
- inversion up/down이 실제 pitch를 octave 이동한다.
- `npm test`, `npm run build` 통과.
```

---

# 프롬프트 12. Scale Levels와 LFO Tool

```text
FL Studio의 Scale Levels와 LFO Tool을 EventEditorLane에 연결해 구현해줘.

Scale Levels:
```ts
interface ScaleLevelsOptions {
  target: EventTargetKey;
  center: number; // target별 normalized -1..1 또는 actual value
  tension: number; // -1..1 logarithmic curve
  multiply: number; // 0..2
  offset: number; // target units
}
```
- 선택 notes의 target property를 normalized 0..1로 바꾼 뒤 center/tension/multiply/offset 적용.
- target별 clamp로 되돌린다.

LFO:
```ts
interface LfoOptions {
  target: EventTargetKey;
  shape: 'sine' | 'triangle' | 'square' | 'saw' | 'random';
  startValue: number;
  startRange: number;
  startSpeed: number;
  endEnabled: boolean;
  endValue?: number;
  endRange?: number;
  endSpeed?: number;
  phase: number;
  selectionStartTick?: number;
  selectionEndTick?: number;
}
```
- 선택 notes 또는 time selection 내 notes에 target 값을 LFO curve로 적용.
- time selection이 없고 선택도 없으면 현재 첫 1 bar 범위로 자동 선택하지 말고 사용자에게 disabled 안내를 표시한다.

UI:
- Tools > Scale levels...
- Tools > LFO...
- target selector는 EventEditorLane target과 공유한다.

테스트:
- multiply 2가 velocity 차이를 키우되 127을 넘지 않는다.
- sine LFO가 중간 tick에서 expected target value를 만든다.
```

---

# 프롬프트 13. Limit, Flip, Selection Stretch Handle

```text
FL Studio Piano Roll의 Limit Tool, Flip Tool, Selection Stretch Handle을 UI까지 완성해줘.

Limit:
- 기존 `limitSelectedNotes(minPitch, maxPitch, mode)`를 UI에 연결.
- 모달에서 min/max pitch를 미니 키보드 range selector로 설정.
- mode:
  - clamp: 범위 밖 note를 가장 가까운 경계로 이동
  - wrap: octave 단위로 범위 안에 감기
- scale snap 옵션:
  - off
  - nearest
  - above
  - below
  - alternate

Flip:
- 기존 `flipSelectedNotes('pitch'|'time')` 연결.
- 추가 옵션:
  - pivot: selection center / root note / custom pitch
  - time pivot: selection center / playhead / custom tick

Selection Stretch Handle:
- 선택 notes가 2개 이상이면 선택 bounding box 우측 상단에 작은 stretch handle을 렌더링.
- handle drag 시:
  - note startTick과 durationTicks를 선택 범위 시작 기준으로 비율 확대/축소
  - Alt 누르면 25% increment snap
  - Shift 누르면 duration은 유지하고 start만 stretch
- preview를 표시하고 mouseup에 한 번 커밋.

테스트:
- pitch flip이 selection min/max 중심으로 반전된다.
- time stretch 2x가 시작 간격과 duration을 2배로 만든다.
```

---

# 프롬프트 14. Selection/Menu 고급 기능

```text
FL Studio의 Select/Edit 메뉴에 가까운 고급 선택 기능을 추가해줘.

구현할 선택 명령:
- Select all
- Deselect all
- Invert selection
- Select muted notes
- Select notes by color group
- Select notes in time range
- Select notes by pitch range
- Select overlapping notes
- Select shortest/longest notes
- Select random percentage
- Magic lasso 1차 버전: 마우스 이동 궤적이 닫힌 루프를 만들면 내부 note 선택

UI:
- Tools 옆에 "Select" menu 추가 또는 Tools menu 안에 Select submenu.
- PianoKeyboard에서 Ctrl+drag pitch range selection.
- ruler에서 Ctrl+drag time range selection.
- canvas에서 magic lasso toggle.

스토어:
- `selectNotesWhere(predicate, additive?)` 유틸성 액션 추가.
- time/pitch range는 기존 `selectNotesInRect`와 별도 tick/pitch 기반으로 처리.

수용 기준:
- colorGroup 3 선택 명령이 group 3 notes만 선택한다.
- overlapping notes 선택이 같은 tick 범위에서 겹치는 노트를 잡는다.
- ruler range 선택과 keyboard range 선택이 각각 동작한다.
```

---

# 프롬프트 15. Play/Scrub Tool과 중클릭 pan

```text
FL Studio Piano Roll의 Play selected/scrub tool과 middle mouse pan을 구현해줘.

Play/Scrub:
- 새 tool `play`를 `PianoRollTool`에 추가.
- 툴바에 "재생/스크럽" 버튼 추가. 단축키 Y.
- canvas에서 mouse down/drag하면 cursor x 위치의 tick에 걸친 notes를 preview 재생.
- drag 속도에 따라 빠르게 훑어도 너무 많은 note가 중복 재생되지 않도록 tick debounce.
- Ctrl drag는 selection box로 동작.

Middle mouse pan:
- canvas에서 auxclick/mousedown button 1을 잡아 pan 모드 시작.
- drag dx/dy만큼 viewport scrollX/scrollY 업데이트.
- cursor는 grabbing.
- wheel click이 브라우저 autoscroll로 빠지지 않게 preventDefault.

테스트/검증:
- Playwright로 middle drag 후 scrollX/scrollY가 변하는지 검사.
- scrub drag 시 `previewNote`가 호출되는 경로를 unit-test 가능한 wrapper로 분리.
```

---

# 프롬프트 16. View 메뉴와 시각 옵션

```text
FL Studio Piano Roll View 메뉴의 시각 옵션을 구현해줘.

새 settings:
```ts
interface ProjectSettings {
  gridContrast?: 'low' | 'medium' | 'high';
  gridColor?: string;
  invertGrid?: boolean;
  timeSegmentBars?: 1 | 2 | 4 | 8;
  noteGridHighlights?: boolean;
  keepLabelsOnScreen?: boolean;
  noteShadow?: boolean;
  noteRounded?: boolean;
  notePalette?: string[];
}
```

UI:
- Tools 근처에 View menu 추가.
- Grid:
  - color picker
  - contrast segmented control
  - invert grid toggle
  - time segments dropdown
- Content:
  - keep labels on screen
  - shadow
  - rounded
  - edit note palette
- Helpers:
  - note grid highlights
  - scale highlighting already exists, but automatic scale detection prompt는 별도 단계에서 구현.

Canvas:
- `PianoRollCanvas.tsx` grid rendering이 settings를 사용하도록 변경.
- note render가 `noteRounded`, `noteShadow`, `notePalette`를 반영.
- keepLabelsOnScreen은 note label x를 `Math.max(noteX + 3, 3)`로 clamp해서 재생/스크롤 중에도 보이게 한다.

수용 기준:
- contrast low/high가 grid line alpha를 바꾼다.
- rounded off면 직사각형, on이면 roundRect.
- palette 변경이 colorGroup notes에 반영된다.
```

---

# 프롬프트 17. 자동 스케일 감지와 Key/Scale Marker

```text
FL Studio는 scale highlighting automatic과 key/scale marker 개념이 있다. 현재 앱은 수동 root/scale만 있다. 자동 스케일 감지와 마커 기반 scale 변경을 추가해줘.

구현:
- `src/utils/keyDetection.ts`
- 선택 notes가 있으면 선택 notes, 없으면 active track 전체 notes를 사용.
- pitch class histogram을 만들고 scale 후보를 점수화한다.
- 후보:
  - major, minor, dorian, phrygian, lydian, mixolydian, locrian, harmonicMinor, pentatonic, blues
- 반환:
```ts
interface KeyDetectionResult {
  root: number;
  scale: ScaleType;
  confidence: number;
  alternatives: Array<{ root: number; scale: ScaleType; confidence: number }>;
}
```

UI:
- Scale selector 옆에 "자동 감지" 버튼.
- 클릭 시 best result를 settings에 적용하고 alternatives를 dropdown으로 보여준다.
- MarkerLane에서 marker type 추가:
  - normal
  - loop
  - patternLength
  - timeSignature
  - keyScale
- keyScale marker는 tick 이후의 scale highlighting/snap 기준이 된다.

수용 기준:
- C major 음들로 테스트하면 C major가 1순위.
- A natural minor 음들로 테스트하면 A minor가 상위권.
- marker 이후 구간의 scale shading이 바뀐다.
```

---

# 프롬프트 18. Stamp Tool 고도화

```text
FL Studio Stamp Tool처럼 chord, scale, pattern, percussion stamp를 확장해줘.

현재:
- `stamp` tool은 chord type 하나를 선택해 클릭 위치에 chord를 만든다.

추가 요구:
- Stamp menu categories:
  - Chords: triads, sevenths, ninths, sus, add, power, borrowed chords
  - Scales: major, minor, modes, pentatonic, blues as ascending note pattern
  - Patterns: octave, fifth+octave, Alberti bass, broken chord, pedal bass
  - Drums: kick/snare/hat simple patterns for drum tracks
- Options:
  - Only one: 찍은 뒤 draw로 복귀
  - Hold tool: 계속 stamp
  - Stamp to scale: 현재 scale에 맞춰 chord quality/notes 보정
  - Auto chord: 주변 chord와 melody를 보고 chord 후보 생성
  - Duration: snap/current last note/custom
  - Inversion: root/1st/2nd/auto closest

구현:
- `src/utils/stampLibrary.ts`
- `getStampNotes(stampId, rootPitch, tick, options): Omit<Note,'id'>[]`
- auto closest inversion은 클릭 pitch 이상에서 가장 가까운 voicing을 선택.

UI:
- Stamp tool active 시 toolbar에 compact stamp dropdown.
- 상세 선택은 modal 또는 popover.

수용 기준:
- Major scale stamp는 한 옥타브 scale notes를 만든다.
- Alberti bass pattern은 4개 이상의 broken notes를 만든다.
- Auto closest inversion이 이전 chord와 voice-leading 거리를 줄인다.
```

---

# 프롬프트 19. Score preset 포맷과 Script Tool

```text
FL Studio는 Chopper/Arpeggiator에서 score preset을 쓰고, Piano roll Script를 실행할 수 있다. 브라우저 앱에서 FL의 `.fsc`를 완벽히 읽기는 어렵기 때문에, 1차로 앱 자체 JSON preset과 안전한 JS script API를 구현해줘.

Score preset:
- 파일 확장자: `.rollscore.json`
- schema:
```ts
interface RollScorePreset {
  version: 1;
  name: string;
  type: 'chop' | 'arp' | 'stamp' | 'riff';
  ppq: number;
  lengthTicks: number;
  notes: Array<{
    pitch: number;
    startTick: number;
    durationTicks: number;
    velocity?: number;
    colorGroup?: number;
  }>;
}
```
- import/export UI를 Tools menu에 추가.
- Chopper/Arpeggiator/Stamp에서 preset을 선택 가능하게 한다.

Script Tool:
- 브라우저에서 임의 JS 실행은 위험하므로 sandboxed function으로 제한한다.
- 제공 API:
  - getSelectedNotes()
  - getActiveTrackNotes()
  - replaceSelectedNotes(notes)
  - addNotes(notes)
  - transpose(semitones)
  - scaleVelocity(multiplier)
  - quantize(gridTicks)
- 사용자는 textarea에 script를 입력하고 preview/apply.
- 기본 script templates:
  - select C notes and boost velocity
  - humanize starts
  - make echo repeats
  - octave double

수용 기준:
- rollscore export/import roundtrip 테스트.
- script template 하나가 선택 notes를 변형한다.
- script 실행 실패 시 앱이 죽지 않고 error panel에 메시지를 표시한다.
```

---

# 프롬프트 20. 최종 통합 검증

```text
지금까지 추가한 FL Studio Piano Roll 기반 기능을 통합 검증해줘.

필수 확인:
1. `npm test` 통과.
2. `npm run build` 통과.
3. Playwright로 로컬 dev 서버 실행 후 다음 smoke test:
   - 앱 첫 화면이 blank가 아님.
   - 툴바 버튼들이 overflow 없이 보임.
   - Tools menu가 열림.
   - Strum dialog가 열리고 닫힘.
   - Event target을 Velocity에서 Pan으로 바꾸면 하단 lane label이 바뀜.
   - Draw tool로 note 추가 가능.
   - Select tool로 note 선택 가능.
   - Undo/redo가 동작.
4. GitHub Pages 배포 경로 `/Piano_Roll-FL_Studio-/`에서 base asset path가 깨지지 않음.
5. 변경 전부터 있던 untracked `.claude/`와 `.docx` 파일은 커밋하지 않음.

최종 산출:
- 구현 요약
- 남은 known limitation
- 테스트 결과
- 커밋 메시지 제안
```

---

## 추천 구현 순서

1. 프롬프트 1: Tools 메뉴/모달 프레임
2. 프롬프트 2: Mute 도구 노출
3. 프롬프트 3: Event Editor target 확장
4. 프롬프트 4: Advanced Strum
5. 프롬프트 5: Chopper/Quick Chop
6. 프롬프트 6: Flam
7. 프롬프트 7: Claw Machine
8. 프롬프트 8: Advanced Arpeggiator
9. 프롬프트 9: Articulate
10. 프롬프트 10: Randomizer/Riff Machine UI
11. 프롬프트 11: Chord Progression Tool
12. 프롬프트 12: Scale Levels/LFO
13. 프롬프트 13: Limit/Flip/Stretch Handle
14. 프롬프트 14: 고급 Selection
15. 프롬프트 15: Play/Scrub, middle pan
16. 프롬프트 16: View 메뉴
17. 프롬프트 17: 자동 스케일 감지와 Key/Scale Marker
18. 프롬프트 18: Stamp Tool 고도화
19. 프롬프트 19: Score preset/Script Tool
20. 프롬프트 20: 통합 검증

## 가장 먼저 시킬 만한 짧은 프롬프트

```text
이 repo의 피아노롤 앱에서 FL Studio Piano Roll에 가까운 Tools 메뉴를 먼저 구현해줘. `projectStore.ts`에 이미 있는 변환 액션들을 UI에 노출하고, 없는 고급 도구는 재사용 가능한 `ToolDialog` 프레임으로 만든 뒤 Strum/Arpeggiate/Randomize/LFO/Chord progression 모달까지 열리게 해줘. 기능 적용은 선택 노트 우선, 선택이 없으면 active track 전체 적용 방식으로 하고, 모든 변환은 undo/redo 가능해야 해. 작업 후 `npm test`, `npm run build`를 통과시켜줘. 기존 untracked `.claude/`와 `.docx`는 절대 건드리지 마.
```

