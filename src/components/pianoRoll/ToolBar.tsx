import React from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { PianoRollTool, ScaleType } from '../../types/music';
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

export const ToolBar: React.FC = () => {
  const { activeTool, setActiveTool, project, updateSettings } = useProjectStore();
  const { settings } = project;

  return (
    <div className="toolbar">
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
          disabled={settings.scaleName === 'none'}
        >
          {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map((n, i) => (
            <option key={i} value={i}>{n}</option>
          ))}
        </select>
      </div>
    </div>
  );
};
