import React from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { PianoRollTool, ScaleType, ChordType } from '../../types/music';
import { CHORD_LABELS } from '../../utils/musicTheory';
import { snapUnitToTicks } from '../../utils/time';
import { PianoRollToolsMenu } from './PianoRollToolsMenu';
import './ToolBar.css';

const TOOLS: { id: PianoRollTool; label: string; icon: string; title: string }[] = [
  { id: 'draw',   label: '그리기', icon: '✏️', title: '노트 그리기 (D)' },
  { id: 'paint',  label: '페인트', icon: '🖌',  title: '연속 노트 그리기 (P)' },
  { id: 'select', label: '선택',   icon: '▣',  title: '노트 선택 (S)' },
  { id: 'erase',  label: '지우기', icon: '⌫',  title: '노트 지우기 (E)' },
  { id: 'slice',  label: '자르기', icon: '✂',  title: '노트 자르기 (X)' },
  { id: 'stamp',  label: '스탬프', icon: '♪',  title: '코드 스탬프 (C)' },
];

const SCALE_OPTIONS: { value: ScaleType; label: string }[] = [
  { value: 'none',            label: '스케일 없음' },
  { value: 'major',           label: '메이저' },
  { value: 'minor',           label: '마이너' },
  { value: 'dorian',          label: '도리안' },
  { value: 'phrygian',        label: '프리지안' },
  { value: 'lydian',          label: '리디안' },
  { value: 'mixolydian',      label: '믹솔리디안' },
  { value: 'locrian',         label: '로크리안' },
  { value: 'harmonicMinor',   label: '하모닉 마이너' },
  { value: 'pentatonicMajor', label: '메이저 펜타토닉' },
  { value: 'pentatonicMinor', label: '마이너 펜타토닉' },
  { value: 'blues',           label: '블루스' },
];

const CHORD_OPTIONS: ChordType[] = [
  'major', 'minor', 'diminished', 'augmented',
  'sus2', 'sus4',
  'major7', 'minor7', 'dominant7', 'diminished7', 'halfDiminished7',
  'add9', 'minorAdd9', 'powerChord',
];

export const ToolBar: React.FC = () => {
  const {
    activeTool, setActiveTool,
    project, updateSettings,
    quantizeSelectedNotes, humanizeSelectedNotes,
  } = useProjectStore();
  const { settings } = project;
  const scaleActive = settings.scaleName !== 'none';
  const isStamp     = activeTool === 'stamp';

  const handleQuantize = () => {
    const grid = snapUnitToTicks(settings.snapUnit, settings.ppq);
    quantizeSelectedNotes(grid, settings.quantizeStrength, settings.quantizeDuration);
  };
  const handleHumanize = () => {
    humanizeSelectedNotes(settings.humanizeTimingTicks, settings.humanizeVelocity);
  };

  return (
    <div className="toolbar">
      {/* ── Tools ─────────────────────────────────────────────────────── */}
      <div className="toolbar-group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tool-btn${activeTool === t.id ? ' active' : ''}`}
            onClick={() => setActiveTool(t.id)}
            title={t.title}
          >
            <span className="tool-icon">{t.icon}</span>
            <span className="tool-label">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />
      <div className="toolbar-group">
        <PianoRollToolsMenu />
      </div>

      <div className="toolbar-divider" />

      {/* ── Scale + Scale Snap ─────────────────────────────────────────── */}
      <div className="toolbar-group">
        <span className="toolbar-label">스케일</span>
        <select
          value={settings.scaleName}
          onChange={(e) => updateSettings({ scaleName: e.target.value as ScaleType })}
          className="toolbar-select"
        >
          {SCALE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          value={settings.scaleRoot}
          onChange={(e) => updateSettings({ scaleRoot: Number(e.target.value) })}
          className="toolbar-select"
          disabled={!scaleActive}
        >
          {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map((n, i) => (
            <option key={i} value={i}>{n}</option>
          ))}
        </select>
        <label
          className="toolbar-label"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, opacity: scaleActive ? 1 : 0.5 }}
          title="새 노트 / 이동 시 스케일에 자동 보정"
        >
          <input
            type="checkbox"
            checked={settings.scaleSnapEnabled}
            disabled={!scaleActive}
            onChange={(e) => updateSettings({ scaleSnapEnabled: e.target.checked })}
          />
          보정
        </label>
      </div>

      {/* ── Chord Stamp (visible only when Stamp tool is active) ─────── */}
      {isStamp && (
        <>
          <div className="toolbar-divider" />
          <div className="toolbar-group">
            <span className="toolbar-label">코드</span>
            <select
              value={settings.stampChordType}
              onChange={(e) => updateSettings({ stampChordType: e.target.value as ChordType })}
              className="toolbar-select"
            >
              {CHORD_OPTIONS.map((c) => (
                <option key={c} value={c}>{CHORD_LABELS[c]}</option>
              ))}
            </select>
            <label
              className="toolbar-label"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              title="찍은 뒤에도 스탬프 도구 유지"
            >
              <input
                type="checkbox"
                checked={settings.stampHoldTool}
                onChange={(e) => updateSettings({ stampHoldTool: e.target.checked })}
              />
              유지
            </label>
          </div>
        </>
      )}

      {/* ── Quantize / Humanize ────────────────────────────────────────── */}
      <div className="toolbar-divider" />
      <div className="toolbar-group">
        <button className="tool-btn" onClick={handleQuantize} title="선택 노트를 그리드에 맞춤">
          <span className="tool-label">퀀타이즈</span>
        </button>
        <input
          type="number"
          min={0} max={1} step={0.1}
          value={settings.quantizeStrength}
          onChange={(e) => updateSettings({ quantizeStrength: Math.max(0, Math.min(1, Number(e.target.value))) })}
          className="toolbar-select"
          style={{ width: 56 }}
          title="강도 0–1"
        />
        <label
          className="toolbar-label"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <input
            type="checkbox"
            checked={settings.quantizeDuration}
            onChange={(e) => updateSettings({ quantizeDuration: e.target.checked })}
          />
          길이
        </label>
      </div>

      <div className="toolbar-group">
        <button className="tool-btn" onClick={handleHumanize} title="선택 노트에 미세한 랜덤 변동 적용">
          <span className="tool-label">휴머니즈</span>
        </button>
        <input
          type="number"
          min={0} step={1}
          value={settings.humanizeTimingTicks}
          onChange={(e) => updateSettings({ humanizeTimingTicks: Math.max(0, Number(e.target.value)) })}
          className="toolbar-select"
          style={{ width: 56 }}
          title="타이밍 ± ticks"
        />
        <input
          type="number"
          min={0} max={127} step={1}
          value={settings.humanizeVelocity}
          onChange={(e) => updateSettings({ humanizeVelocity: Math.max(0, Math.min(127, Number(e.target.value))) })}
          className="toolbar-select"
          style={{ width: 56 }}
          title="세기 ± 값"
        />
      </div>
    </div>
  );
};
